//  src/components/dataAccess.js
//  — Kùzu-DB initialisation + data / query helpers —

import kuzu from "kuzu-wasm";
import { convertXmlToJson as convertArchiXmlToJson } from "./dataParserArchiFormat.js";
import { convertXmlToJson as convertExchangeXmlToJson } from "./dataParserExchangeFormat.js";
import { getState } from "./filterState.js";

const graphDataStoreKey = "archiGraphDataStore";

let db = null;
let conn = null;

/* ------------------------------------------------------------------ */
/* init in-memory DB and schema                                       */
/* ------------------------------------------------------------------ */

export const kuzuReadyPromise = (async () => {
  await kuzu.init();
  db = new kuzu.Database();           // in-memory
  conn = new kuzu.Connection(db);
  console.log("Kùzu in-memory DB created successfully.");

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Element(
      id    STRING PRIMARY KEY,
      layer STRING,
      type  STRING,
      name  STRING
    );
  `);
  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS Relationship(
      FROM Element TO Element,
      type STRING
    );
  `);
  console.log("Kùzu 'Element' & 'Relationship' tables ready.");
  return conn;
})();


/* ------------------------------------------------------------------ */
/* Filter Graph                                                            */
/* ------------------------------------------------------------------ */

function toCypherList(arr) {
  if (!arr?.length) return "[]";
  return `[${arr.map(v => `'${v}'`).join(",")}]`;
}

export async function globalFilterGraph(callback) {
  try {
    const conn = await kuzuReadyPromise;
    if (!conn) throw new Error("Kùzu DB not ready.");

    // 1) read the current facet state directly:
    const {
      layers,
      elementTypes,
      relationshipTypes
    } = getState();

    // 2) build Cypher WHERE clauses from those arrays:
    const layerClause = layers.length
      ? `a.layer IN ${toCypherList(layers)} AND b.layer IN ${toCypherList(layers)}`
      : "true";

    const elemClause = elementTypes.length
      ? `a.type IN ${toCypherList(elementTypes)} AND b.type IN ${toCypherList(elementTypes)}`
      : "true";

    const relClause = relationshipTypes.length
      ? `r.type IN ${toCypherList(relationshipTypes)}`
      : "true";

    const where = `${layerClause} AND ${elemClause} AND ${relClause}`;

    const query = `
      MATCH (a:Element)-[r:Relationship]->(b:Element)
      WHERE ${where}
      RETURN a, r, b
      LIMIT 1000
    `;
    console.log("Global Filter Query:", query);

    // 3) run it, rebuild subgraph and stash it in sessionStorage:
    const result = await conn.query(query);
    const subgraph = await buildSubgraphFromRecords(result);
    sessionStorage.setItem(
      graphDataStoreKey,
      JSON.stringify(subgraph, (k,v) => typeof v==="bigint" ? v.toString() : v)
    );

    // 4) invoke your callback so index.js can re-draw
    if (typeof callback === "function") callback(subgraph);
  } catch (err) {
    console.error("Error in global filtering:", err);
    alert("Error in global filtering: " + err.message);
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function detectAndConvertXmlToJson(xml) {
  if (
    xml.querySelector('folder[type="elements"]') ||
    xml.querySelector('folder[type="relations"]')
  ) {
    console.log("Detected Archi .archimate file → Archi parser.");
    return convertArchiXmlToJson(xml);
  }
  const hasElements      = xml.querySelector("model > elements");
  const hasRelationships = xml.querySelector("model > relationships");
  if (hasElements && hasRelationships) {
    console.log("Detected ArchiMate Exchange Format → Exchange parser.");
    return convertExchangeXmlToJson(xml);
  }
  throw new Error("Could not detect Archi/Exchange file format from XML.");
}

/* ------------------------------------------------------------------ */
/* model file load  ➜  populate DB                                    */
/* ------------------------------------------------------------------ */

export async function processModelFile(fileContent, callback) {
  try {
    const conn = await kuzuReadyPromise;
    if (!conn) throw new Error("Kùzu connection not established.");

    const xml           = new DOMParser().parseFromString(fileContent, "text/xml");
    const graphDataJson = detectAndConvertXmlToJson(xml);
    if (!graphDataJson.nodes?.length) {
      throw new Error("Parsed data is empty or missing relationships.");
    }

    sessionStorage.setItem(graphDataStoreKey, JSON.stringify(graphDataJson));

    /* wipe old tables */
    await conn.query("MATCH (n:Element) DELETE n;");
    await conn.query("MATCH ()-[r:Relationship]->() DELETE r;");

    /* insert nodes */
    for (const n of graphDataJson.nodes) {
      const safeId   = (n.id   || "").replace(/'/g, "\\'");
      const safeType = (n.type || "").replace(/'/g, "\\'");
      const safeName = (n.name || "").replace(/'/g, "\\'");

      // determine layer: explicit first, else classify by type keyword
      let layerGuess = n.layer?.trim() || "";
      if (!layerGuess && n.type) {
        const lt = n.type.toLowerCase();
        const strategy    = [ "capability", "courseofaction", "resource", "valuestream" ];
        const motivation  = [ "assessment", "constraint", "driver", "goal", "meaning", "outcome", "principle", "requirement", "stakeholder", "value" ];
        const migration   = [ "deliverable", "gap", "implementationevent", "plateau", "workpackage" ];
        const application = [ "applicationcomponent", "applicationcollaboration", "applicationevent", "applicationfunction", "applicationinteraction", "applicationinterface", "applicationprocess", "applicationservice", "dataobject" ];
        const technology  = [ "technology", "artifact", "communicationnetwork", "device", "node", "path", "systemsoftware", "technologycollaboration", "technologyevent", "technologyfunction", "technologyinteraction", "technologyinterface", "technologyprocess", "technologyservice" ];
        const other       = [ "grouping","location" ];

            if (strategy.some(k => lt.includes(k)))    layerGuess = "Strategy";
        else if (motivation.some(k => lt.includes(k)))  layerGuess = "Motivation";
        else if (migration.some(k => lt.includes(k)))   layerGuess = "Implementation & Migration";
        else if (lt.includes("business"))                layerGuess = "Business";
        else if (application.some(k => lt.includes(k))) layerGuess = "Application";
        else if (technology.some(k => lt.includes(k)))  layerGuess = "Technology";
        else if (other.some(k => lt.includes(k)))       layerGuess = "Other/Supporting";
      }

      // final fallback so no node is left without a layer
      if (!layerGuess) layerGuess = "Business";

      await conn.query(`
        CREATE (:Element {
          id:    '${safeId}',
          layer: '${layerGuess}',
          type:  '${safeType}',
          name:  '${safeName}'
        });
      `);
    }

    /* insert relationships */
    for (const rel of graphDataJson.links) {
      const src = (rel.source || "").replace(/'/g, "\\'");
      const tgt = (rel.target || "").replace(/'/g, "\\'");
      if (!src || !tgt) continue;

      const safeType = (rel.type?.trim() || "Unknown").replace(/'/g, "\\'");
      await conn.query(`
        MATCH (a:Element {id: '${src}'}), (b:Element {id: '${tgt}'})
        CREATE (a)-[:Relationship {type: '${safeType}'}]->(b);
      `);
    }

    console.log("Data inserted into Kùzu successfully.");
    if (typeof callback === "function") callback();
  } catch (err) {
    console.error("Error processing model file & inserting into Kùzu:", err);
    throw err;
  }
}

/* simple wrappers -------------------------------------------------- */

export async function requestDataFromServer(modelPath, cb) {
  try {
    await kuzuReadyPromise;
    const resp = await fetch(modelPath);
    if (!resp.ok) throw new Error(resp.statusText);
    await processModelFile(await resp.text(), cb);
  } catch (err) {
    console.error("Error retrieving model file:", err);
  }
}

export function dataExistsInStore() {
  return !!sessionStorage.getItem(graphDataStoreKey);
}
export function requestDataFromStore() {
  const d = sessionStorage.getItem(graphDataStoreKey);
  return d ? JSON.parse(d) : { nodes: [], links: [] };
}
export function deleteDataFromStore() {
  sessionStorage.removeItem(graphDataStoreKey);
}
export function modelOverview() {
  const g = requestDataFromStore();
  return { modelName: g.modelName || "No Model Name", modelDocumentation: g.modelDocumentation || "" };
}

/* ------------------------------------------------------------------ */
/* neighbourhood query  (facet-aware)                                 */
/* ------------------------------------------------------------------ */

export async function kuzuNeighborhoodGraph(
  rootNodeId,
  depth      = 1,
  facetState = getState(),
  callback
) {
  try {
    const conn = await kuzuReadyPromise;
    if (!conn) throw new Error("Kùzu DB not ready.");

    const safeId = (rootNodeId || "").replace(/'/g, "\\'");
    const query = `
      MATCH p = (:Element {id: '${safeId}'})-[:Relationship*1..${depth}]-(:Element)
      RETURN collect(p) AS paths;
    `;
    console.log("Select Node Neighborhood:", query);
    const result = await conn.query(query);
    if (!result?.getAllObjects) {
      console.error("Neighborhood query returned invalid result:", result);
      const empty = { nodes: [], links: [] };
      if (typeof callback === "function") callback(empty);
      return empty;
    }

    const rows     = await result.getAllObjects();
    const pathList = rows.length ? rows[0].paths || [] : [];
    const subgraph = buildSubgraphFromPaths(pathList);

    /* facet filtering (client side) */
    const {
      layers = [],
      relationshipTypes: relTypes = [],
      elementTypes = []
    } = facetState;

    const prunedLinks = subgraph.links.filter(
      l => !relTypes.length || relTypes.includes(l.type)
    );
    const prunedNodes = subgraph.nodes.filter(n => {
      const layerOK   = !layers.length    || layers.includes(n.layer)
      const typeOK    = !elementTypes.length || elementTypes.includes(n.type)
      const isLinked  = prunedLinks.some(link => link.source === n.id || link.target === n.id)
      return isLinked && layerOK && typeOK
    });    

    const filtered = { nodes: prunedNodes, links: prunedLinks };
    if (typeof callback === "function") callback(filtered);
    return filtered;
  } catch (err) {
    console.error("Error in neighborhood query:", err);
    alert("Error in neighborhood query: " + err.message);
    return { nodes: [], links: [] };
  }
}

export function buildSubgraphFromPaths(paths = []) {
  const nodesMap = new Map();
  const links    = [];
  paths.forEach(p => {
    const nodeArr = p._nodes ?? p._NODES ?? [];
    const relArr  = p._rels  ?? p._RELS  ?? [];
    nodeArr.forEach(n => {
      if (n?.id != null) nodesMap.set(n.id, n);
    });
    for (let i = 0; i < relArr.length; i++) {
      const src = nodeArr[i], tgt = nodeArr[i+1], r = relArr[i];
      if (src && tgt && r) {
        links.push({ source: src.id, target: tgt.id, type: r.type || "Relationship" });
      }
    }
  });
  return { nodes: Array.from(nodesMap.values()), links };
}

export async function buildSubgraphFromRecords(queryResult) {
  if (!queryResult?.getAllObjects) {
    console.error("buildSubgraphFromRecords: invalid queryResult");
    return { nodes: [], links: [] };
  }
  let rows = await queryResult.getAllObjects();
  if (!Array.isArray(rows)) rows = [];
  const nodesMap = new Map(), links = [];
  rows.forEach(row => {
    const a = row.a || row.A, b = row.b || row.B, r = row.r || row.R;
    if (a?.id) nodesMap.set(a.id, a);
    if (b?.id) nodesMap.set(b.id, b);
    if (r?.type && a?.id && b?.id) links.push({ source: a.id, target: b.id, type: r.type });
  });
  return { nodes: Array.from(nodesMap.values()), links };
}