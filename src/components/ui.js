import kuzu from 'kuzu-wasm';

// We'll assume you already have a D3-based function that draws the graph
// or you can place a quick D3 snippet here.
import { drawGraph } from './graphExplorer.js';

// 1) Initialize Kuzu (once). Then we can open or connect to an existing DB.
let db, conn;
(async () => {
  await kuzu.init();
  db = new kuzu.Database();    // Create an in-memory DB if needed
  conn = new kuzu.Connection(db);
  console.log("Kuzu in-memory DB created.");
})();

// 2) A function that populates the DB with data if needed (or if you already have it, skip)
async function insertArchiMateDataIfNeeded() {
  // Typically you'd create a Node table, a Relationship table, or if you already have them, skip:
  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Element(
      id STRING PRIMARY KEY,
      type STRING,
      layer STRING,
      name STRING
    );
  `);

  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS Relationship(
      FROM Element TO Element,
      type STRING
    );
  `);

  // Insert your nodes/links from an ArchiMate file if not inserted yet, etc.
  // For brevity, we skip. We'll assume the data is already in Kuzu.
}

// 3) BFS or Filter function that queries Kuzu
async function filterGraphData() {
  // Gather filter selections
  const selectedLayers = Array.from(document.querySelectorAll(".layerCheckbox:checked"))
    .map(cb => cb.value);

  const relTypesSelect = document.getElementById("relTypesSelect");
  const selectedRelTypes = Array.from(relTypesSelect.selectedOptions)
    .map(opt => opt.value);

  const depth = parseInt(document.getElementById("depthInput").value, 10);
  const rootNodeId = document.getElementById("rootNodeInput").value.trim();

  // If user specified BFS root, we do a variable-length path approach:
  if (rootNodeId) {
    // Example BFS-like query in Kuzu:
    // We'll find all nodes up to 'depth' away from root
    // that match selected layers, and only relationships in the selected types.
    const cypher = `
      MATCH p=(root:Element {id: '${rootNodeId}'})-[r:Relationship*..${depth}]-(other:Element)
      WHERE
        root.layer IN ${toCypherList(selectedLayers)}
        AND all(rr IN relationships(p) WHERE rr.type IN ${toCypherList(selectedRelTypes)})
        AND all(n IN nodes(p) WHERE n.layer IN ${toCypherList(selectedLayers)})
      RETURN p
    `;

    console.log("BFS Query:\n", cypher);

    const result = await conn.query(cypher);

    // We'll build a subgraph from the returned paths
    const subgraph = buildSubgraphFromPaths(result);
    drawResult(subgraph);
  } else {
    // If no root node, we just filter on layers & relationship types for the entire graph
    const cypher = `
      MATCH (a:Element)-[r:Relationship]->(b:Element)
      WHERE 
        a.layer IN ${toCypherList(selectedLayers)}
        AND b.layer IN ${toCypherList(selectedLayers)}
        AND r.type IN ${toCypherList(selectedRelTypes)}
      RETURN a, r, b
    `;

    console.log("Filter Query:\n", cypher);

    const result = await conn.query(cypher);
    const subgraph = buildSubgraphFromRecords(result);
    drawResult(subgraph);
  }
}

// Helper: Convert a JS array to a Cypher list e.g. ['Business','Application'] → "['Business','Application']"
function toCypherList(arr) {
  if (!arr?.length) return `[]`;
  const escaped = arr.map(v => `'${v}'`).join(",");
  return `[${escaped}]`;
}

// Build subgraph from BFS path results
function buildSubgraphFromPaths(queryResult) {
  // Kuzu's result usage:
  // We'll iterate while (result.hasNext()) ...
  const nodesMap = new Map();
  const links = [];
  
  while (queryResult.hasNext()) {
    const row = queryResult.getNext();
    // row is a single column 'p' => a Path
    const pathVal = row.getValue(0); // a path object
    // We'll iterate pathVal to gather nodes, edges
    for (let i = 0; i < pathVal.getSize(); i++) {
      const node = pathVal.getNode(i);
      nodesMap.set(node.getId(), {
        id: node.getString("id"),
        layer: node.getString("layer"),
        type: node.getString("type"),
        name: node.getString("name")
      });
    }
    for (let i = 0; i < pathVal.getSize()-1; i++) {
      const edge = pathVal.getRelationship(i);
      const srcNode = pathVal.getNode(i).getString("id");
      const tgtNode = pathVal.getNode(i+1).getString("id");
      links.push({
        source: srcNode,
        target: tgtNode,
        type: edge.getString("type")
      });
    }
  }

  const nodes = Array.from(nodesMap.values());
  return { nodes, links };
}

// Build subgraph from a direct MATCH result
function buildSubgraphFromRecords(queryResult) {
  const nodesMap = new Map();
  const links = [];

  while (queryResult.hasNext()) {
    const row = queryResult.getNext();
    // Suppose columns are [a, r, b]
    const a = row.getNode(0); // node
    const r = row.getRelationship(1); // rel
    const b = row.getNode(2); // node

    // Insert node a
    nodesMap.set(a.getId(), {
      id: a.getString("id"),
      layer: a.getString("layer"),
      type: a.getString("type"),
      name: a.getString("name")
    });

    // Insert node b
    nodesMap.set(b.getId(), {
      id: b.getString("id"),
      layer: b.getString("layer"),
      type: b.getString("type"),
      name: b.getString("name")
    });

    // Insert link
    links.push({
      source: a.getString("id"),
      target: b.getString("id"),
      type: r.getString("type")
    });
  }

  const nodes = Array.from(nodesMap.values());
  return { nodes, links };
}

// Final step: Draw result with your existing D3 logic
function drawResult({nodes, links}) {
  console.log("Final subgraph:", nodes, links);
  // For clarity, we call a separate function that uses D3 to draw the graph
  drawGraph(nodes, null, links);
}

// 4) Setup UI events
document.getElementById("applyFiltersBtn").addEventListener("click", async () => {
  await filterGraphData();
});

// (Optional) If you want to load data upon page load, do so here
(async () => {
  await insertArchiMateDataIfNeeded();
})();
