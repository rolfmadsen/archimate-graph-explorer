// dataAccess.js

import kuzu from 'kuzu-wasm';
import { convertXmlToJson as convertArchiXmlToJson } from './dataParserArchiFormat.js';
import { convertXmlToJson as convertExchangeXmlToJson } from './dataParserExchangeFormat.js';

const graphDataStoreKey = "archiGraphDataStore";

let db = null;
let conn = null;

export const kuzuReadyPromise = (async () => {
  await kuzu.init();
  db = new kuzu.Database(); // in-memory
  conn = new kuzu.Connection(db);
  console.log("Kùzu in-memory DB created successfully.");

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Element(
      id STRING PRIMARY KEY,
      layer STRING,
      type STRING,
      name STRING
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

function detectAndConvertXmlToJson(xml) {
  if (xml.querySelector('folder[type="elements"]') || xml.querySelector('folder[type="relations"]')) {
    console.log("Detected Archi .archimate file -> Archi parser.");
    return convertArchiXmlToJson(xml);
  }
  const hasElements = xml.querySelector("model > elements");
  const hasRelationships = xml.querySelector("model > relationships");
  if (hasElements && hasRelationships) {
    console.log("Detected ArchiMate Exchange Format -> Exchange parser.");
    return convertExchangeXmlToJson(xml);
  }
  throw new Error("Could not detect Archi/Exchange file format from XML.");
}

export async function processModelFile(fileContent, callback) {
  try {
    const conn = await kuzuReadyPromise;
    if (!conn) throw new Error("Kùzu connection not established.");
    const xml = new DOMParser().parseFromString(fileContent, "text/xml");
    const graphDataJson = detectAndConvertXmlToJson(xml);
    if (!graphDataJson.nodes?.length) {
      throw new Error("Parsed data is empty or missing relationships.");
    }
    sessionStorage.setItem(graphDataStoreKey, JSON.stringify(graphDataJson));

    console.log("Clearing old data from Kùzu...");
    await conn.query("MATCH (n:Element) DELETE n;");
    await conn.query("MATCH ()-[r:Relationship]->() DELETE r;");

    console.log("Inserting new data into Kùzu...");
    for (const n of graphDataJson.nodes) {
      const safeId   = (n.id || "").replace(/'/g, "\\'");
      const safeType = (n.type || "").replace(/'/g, "\\'");
      const safeName = (n.name || "").replace(/'/g, "\\'");
      let guessLayer = "Business";
      if (n.layer && n.layer.trim().length > 0) {
        guessLayer = n.layer;
      } else if (n.type) {
        const lowerType = n.type.toLowerCase();
        if (lowerType.includes("business")) guessLayer = "Business";
        else if (lowerType.includes("application")) guessLayer = "Application";
        else if (lowerType.includes("technology")) guessLayer = "Technology";
      }
      const createNode = `
        CREATE (:Element {
          id: '${safeId}',
          layer: '${guessLayer}',
          type: '${safeType}',
          name: '${safeName}'
        });
      `;
      await conn.query(createNode);
    }
    for (const rel of graphDataJson.links) {
      const safeType = ((rel.type && rel.type.trim()) ? rel.type : "Unknown").replace(/'/g, "\\'");
      const src      = (rel.source || "").replace(/'/g, "\\'");
      const tgt      = (rel.target || "").replace(/'/g, "\\'");
      if (!src || !tgt) continue;
      const createRel = `
        MATCH (a:Element {id: '${src}'}), (b:Element {id: '${tgt}'})
        CREATE (a)-[:Relationship {type: '${safeType}'}]->(b);
      `;
      await conn.query(createRel);
    }
    console.log("Data inserted into Kùzu successfully.");
    if (typeof callback === 'function') callback();
  } catch (error) {
    console.error("Error processing model file & inserting into Kùzu:", error);
    throw error;
  }
}

export async function requestDataFromServer(modelPath, callback) {
  try {
    await kuzuReadyPromise;
    const resp = await fetch(modelPath);
    if (!resp.ok) throw new Error(resp.statusText);
    const fileContent = await resp.text();
    await processModelFile(fileContent, callback);
  } catch (err) {
    console.error("Error retrieving model file:", err);
  }
}

export function dataExistsInStore() {
  return !!sessionStorage.getItem(graphDataStoreKey);
}
export function requestDataFromStore() {
  const data = sessionStorage.getItem(graphDataStoreKey);
  return data ? JSON.parse(data) : { nodes: [], links: [] };
}
export function deleteDataFromStore() {
  sessionStorage.removeItem(graphDataStoreKey);
}
export function modelOverview() {
  const g = requestDataFromStore();
  return {
    modelName: g.modelName || "No Model Name",
    modelDocumentation: g.modelDocumentation || ""
  };
}

// Helper: Converts an array to a Cypher list string.
function toCypherList(arr) {
  if (!arr?.length) return "[]";
  const escaped = arr.map(v => `'${v}'`).join(",");
  return `[${escaped}]`;
}

// Neighborhood query: returns the subgraph around a clicked node.
export async function kuzuNeighborhoodGraph(rootNodeId, depth, callback) {
  try {
    const conn = await kuzuReadyPromise;
    if (!conn) throw new Error("Kùzu DB not ready.");
    
    // Here we ignore depth (or you could use it to change the MATCH pattern) and simply return one-hop neighbors.
    const query = `
      MATCH (n:Element {id: $rootNodeId})
      MATCH (n)-[r:Relationship]-(m:Element)
      RETURN collect(n) + collect(m) AS nodes, collect(r) AS links;
    `;
    console.log("Neighborhood Query:", query);
    
    // Execute the query with the parameter.
    const result = await conn.query(query, { rootNodeId });
    const rows = await result.getAllObjects();
    const subgraph = rows[0] || { nodes: [], links: [] };
    
    if (typeof callback === "function") callback(subgraph);
  } catch (error) {
    console.error("Error in neighborhood query:", error);
    alert("Error in neighborhood query: " + error.message);
  }
}

/**
 * Build subgraph from path results.
 * Each row is expected to return a path p with properties _NODES and _RELS.
 */
export async function buildSubgraphFromPaths(queryResult) {
  const rows = queryResult.getAllObjects ? await queryResult.getAllObjects() : queryResult;
  const nodesMap = new Map();
  const links = [];

  for (const row of rows) {
    let p = typeof row.getValue === "function" ? row.getValue(0) : row;
    if (p && p._NODES && p._RELS) {
      p._NODES.forEach(node => nodesMap.set(node.id, node));
      for (let i = 0; i < p._RELS.length; i++) {
        const srcNode = p._NODES[i];
        const tgtNode = p._NODES[i + 1];
        if (srcNode && tgtNode) {
          links.push({
            source: srcNode.id,
            target: tgtNode.id,
            type: p._RELS[i].type
          });
        }
      }
    } else {
      console.warn("Row does not contain a valid path object:", row);
    }
  }
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