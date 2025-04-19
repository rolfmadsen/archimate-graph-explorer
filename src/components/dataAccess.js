//  src/components/dataAccess.js
//  — Kùzu‑DB initialisation + data / query helpers —

import kuzu from "kuzu-wasm";
import { convertXmlToJson as convertArchiXmlToJson } from "./dataParserArchiFormat.js";
import { convertXmlToJson as convertExchangeXmlToJson } from "./dataParserExchangeFormat.js";
import { getState } from "./filterState.js";           // ← NEW

const graphDataStoreKey = "archiGraphDataStore";

let db   = null;
let conn = null;

/* ------------------------------------------------------------------ */
/* init in‑memory DB and schema                                       */
/* ------------------------------------------------------------------ */

export const kuzuReadyPromise = (async () => {
  await kuzu.init();
  db   = new kuzu.Database();           // in‑memory
  conn = new kuzu.Connection(db);
  console.log("Kùzu in‑memory DB created successfully.");

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
  const hasElements       = xml.querySelector("model > elements");
  const hasRelationships  = xml.querySelector("model > relationships");
  if (hasElements && hasRelationships) {
    console.log("Detected ArchiMate Exchange Format → Exchange parser.");
    return convertExchangeXmlToJson(xml);
  }
  throw new Error("Could not detect Archi/Exchange file format from XML.");
}

function toCypherList(arr) {
  if (!arr?.length) return "[]";
  return `[${arr.map(v => `'${v}'`).join(",")}]`;
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

      let layerGuess = "Business";
      if (n.layer?.trim()) {
        layerGuess = n.layer;
      } else if (n.type) {
        const l = n.type.toLowerCase();
        if (l.includes("application")) layerGuess = "Application";
        else if (l.includes("technology")) layerGuess = "Technology";
      }

      await conn.query(`
        CREATE (:Element { id: '${safeId}', layer: '${layerGuess}', type: '${safeType}', name: '${safeName}' });
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
/* neighbourhood query  (facet‑aware)                                 */
/* ------------------------------------------------------------------ */

/**
 * rootNodeId :  element ID that was double‑clicked
 * depth      :  hop distance (1 → direct neighbours)
 * facetState :  { layers, relationshipTypes }, from filterState.js (optional; defaults=live state)
 */
export async function kuzuNeighborhoodGraph(
  rootNodeId,
  depth       = 1,
  facetState  = getState(),
  callback
) {
  try {
    const conn = await kuzuReadyPromise;
    if (!conn) throw new Error("Kùzu DB not ready.");

    const safeId = (rootNodeId || "").replace(/'/g, "\\'");

    /* build query (no facet filtering here – we’ll filter client‑side) */
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

    /* raw sub‑graph */
    const subgraph = buildSubgraphFromPaths(pathList);

    /* facet filtering (client side), now including element‑type */
    const {
      layers = [],
      relationshipTypes: relTypes = [],
      elementTypes = []
    } = facetState;

    // first prune links by relationship type
    const prunedLinks = subgraph.links.filter(
      l => !relTypes.length || relTypes.includes(l.type)
    );

    // then prune nodes by layer AND element type, and ensure they're connected
    const prunedNodes = subgraph.nodes.filter(n =>
      (!layers.length    || layers.includes(n.layer)) &&
      (!elementTypes.length || elementTypes.includes(n.type)) &&
      prunedLinks.some(link => link.source === n.id || link.target === n.id)
    );

    const filtered = { nodes: prunedNodes, links: prunedLinks };
    
    if (typeof callback === "function") callback(filtered);
    return filtered;
  } catch (err) {
    console.error("Error in neighborhood query:", err);
    alert("Error in neighborhood query: " + err.message);
    return { nodes: [], links: [] };
  }
}

/* ------------------------------------------------------------------ */
/* utilities                                                          */
/* ------------------------------------------------------------------ */

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
      const src = nodeArr[i];
      const tgt = nodeArr[i + 1];
      const r   = relArr[i];
      if (src && tgt && r) {
        links.push({ source: src.id, target: tgt.id, type: r.type || "Relationship" });
      }
    }
  });

  return { nodes: Array.from(nodesMap.values()), links };
}

/* ── GLOBAL FILTER QUERY ── */
export async function globalFilterGraph(callback) {
  try {
    const conn = await kuzuReadyPromise;
    if (!conn) throw new Error("Kùzu DB not ready.");
    
    const layerCheckboxes = document.querySelectorAll(".layerCheckbox:checked");
    const selectedLayers = layerCheckboxes.length ? Array.from(layerCheckboxes).map(cb => cb.value) : [];
    const layerClause = selectedLayers.length 
      ? "a.layer IN " + toCypherList(selectedLayers) + " AND b.layer IN " + toCypherList(selectedLayers)
      : "true";
    
    const elementTypeCheckboxes = document.querySelectorAll(".facet-value:not([data-group='relationships']):checked");
    const selectedElemTypes = elementTypeCheckboxes.length ? Array.from(elementTypeCheckboxes).map(cb => cb.value) : [];
    const elemClause = selectedElemTypes.length 
      ? "a.type IN " + toCypherList(selectedElemTypes) + " AND b.type IN " + toCypherList(selectedElemTypes)
      : "true";
    
    const relCheckboxes = document.querySelectorAll(".facet-value[data-group='relationships']:checked");
    const selectedRelTypes = relCheckboxes.length ? Array.from(relCheckboxes).map(cb => cb.value) : [];
    // Modification: if no relationship type is selected, set the clause to "false"
    const relClause = selectedRelTypes.length 
      ? "r.type IN " + toCypherList(selectedRelTypes)
      : "false";
    
    const whereClause = `${layerClause} AND ${elemClause} AND ${relClause}`;
    const query = `
      MATCH (a:Element)-[r:Relationship]->(b:Element)
      WHERE ${whereClause}
      RETURN a, r, b
      LIMIT 1000
    `;
    console.log("Global Filter Query:", query);
    const result = await conn.query(query);
    const subgraph = await buildSubgraphFromRecords(result);
    function bigintReplacer(key, value) {
      return typeof value === 'bigint' ? value.toString() : value;
    }
    sessionStorage.setItem(graphDataStoreKey, JSON.stringify(subgraph, bigintReplacer));
    if (typeof callback === "function") callback(subgraph);
  } catch (error) {
    console.error("Error in global filtering:", error);
    alert("Error in global filtering: " + error.message);
  }
}

export async function buildSubgraphFromRecords(queryResult) {
  if (!queryResult || typeof queryResult.getAllObjects !== 'function') {
    console.error("buildSubgraphFromRecords: queryResult.getAllObjects is not defined");
    return { nodes: [], links: [] };
  }
  let rows = await queryResult.getAllObjects();
  if (!rows || !Array.isArray(rows)) {
    console.error("buildSubgraphFromRecords: rows is not an array", rows);
    rows = [];
  }
  const nodesMap = new Map();
  const links = [];
  rows.forEach(row => {
    const a = row["a"] || row["A"];
    const b = row["b"] || row["B"];
    const r = row["r"] || row["R"];
    if (a && a.id) nodesMap.set(a.id, a);
    if (b && b.id) nodesMap.set(b.id, b);
    if (a && b && r && r.type) {
      links.push({ source: a.id, target: b.id, type: r.type });
    }
  });
  return { nodes: Array.from(nodesMap.values()), links };
}