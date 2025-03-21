// exportGraphML.js

import { exportForTesting } from './graphNode.js';
const { colorForNodeType } = exportForTesting;

/**
 * Escapes XML special characters.
 */
function escapeXml(str) {
  return str.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

/**
 * Build a simplified GraphML that yEd/yEd Live will interpret.
 * Nodes are rendered using a <y:ShapeNode>.
 */
function exportGraphML(nodes, links) {
  // Define layer ordering based on ArchiMate element types.
  // Lower number = higher layer.
  const layerMapping = {
    // Strategy
    "Capability": 1,
    "CourseOfAction": 1,
    "Resource": 1,
    "ValueStream": 1,

    // Business
    "BusinessActor": 2,
    "BusinessCollaboration": 2,
    "BusinessEvent": 2,
    "BusinessFunction": 2,
    "BusinessInteraction": 2,
    "BusinessInterface": 2,
    "BusinessObject": 2,
    "BusinessProcess": 2,
    "BusinessRole": 2,
    "BusinessService": 2,
    "Contract": 2,
    "Product": 2,
    "Representation": 2,

    // Application
    "ApplicationComponent": 3,
    "ApplicationCollaboration": 3,
    "ApplicationEvent": 3,
    "ApplicationFunction": 3,
    "ApplicationInteraction": 3,
    "ApplicationInterface": 3,
    "ApplicationProcess": 3,
    "ApplicationService": 3,
    "DataObject": 3,

    // Technology
    "Artifact": 4,
    "CommunicationNetwork": 4,
    "Device": 4,
    "Node": 4,
    "Path": 4,
    "SystemSoftware": 4,
    "TechnologyCollaboration": 4,
    "TechnologyEvent": 4,
    "TechnologyFunction": 4,
    "TechnologyInteraction": 4,
    "TechnologyInterface": 4,
    "TechnologyProcess": 4,
    "TechnologyService": 4,

    // Physical
    "Distribution Network": 5,
    "Equipment": 5,
    "Facility": 5,
    "Material": 5
  };

  // Build a mapping from node id to node type.
  const nodeTypeMapping = {};
  nodes.forEach(n => {
    nodeTypeMapping[n.id] = n.type;
  });

  let gml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  gml += `<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:y="http://www.yworks.com/xml/graphml"
    xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns
      http://www.yworks.com/xml/schema/graphml/1.0/ygraphml.xsd">\n`;

  // Define keys for node graphics and edge graphics.
  gml += `  <key for="node" id="d0" yfiles.type="nodegraphics"/>\n`;
  gml += `  <key attr.name="description" attr.type="string" for="node" id="d1"/>\n`;
  gml += `  <key for="edge" id="d2" yfiles.type="edgegraphics"/>\n`;
  gml += `  <key attr.name="description" attr.type="string" for="edge" id="d3"/>\n`;

  // Start the graph.
  gml += `  <graph id="G" edgedefault="directed">\n`;

  // --- NODES ---
  nodes.forEach(n => {
    const nodeId = escapeXml(n.id);
    const labelText = (n.name || "") + (n.type ? ` (${n.type})` : "");
    const fillColor = colorForNodeType(n.type);
    // Use default geometry; adjust as needed.
    const x = (n.x !== undefined) ? parseFloat(n.x) : 0;
    const y = (n.y !== undefined) ? parseFloat(n.y) : 0;
    const w = 100;
    const h = 40;

    gml += `    <node id="${nodeId}">\n`;
    gml += `      <data key="d0">\n`;
    gml += `        <y:ShapeNode>\n`;
    gml += `          <y:Geometry x="${x}" y="${y}" width="${w}" height="${h}"/>\n`;
    gml += `          <y:Fill color="${fillColor}" transparent="false"/>\n`;
    gml += `          <y:BorderStyle color="#000000" type="line" width="1.0"/>\n`;
    gml += `          <y:NodeLabel alignment="center" autoSizePolicy="node_width" fontFamily="Dialog" fontSize="5" fontStyle="plain" textColor="#000000" visible="true" modelName="internal" modelPosition="c">\n`;
    gml += `            ${escapeXml(labelText)}\n`;
    gml += `          </y:NodeLabel>\n`;
    gml += `          <y:Shape type="rectangle"/>\n`;
    gml += `        </y:ShapeNode>\n`;
    gml += `      </data>\n`;
    gml += `    </node>\n`;
  });

  // --- EDGES ---
  links.forEach((l, index) => {
    let sourceId = typeof l.source === "object" ? l.source.id : l.source;
    let targetId = typeof l.target === "object" ? l.target.id : l.target;

    // If both nodes have known layer orders, ensure that the higher-layer element (lower number)
    // is set as the source. This will supply data so that yEd's hierarchical layout will place
    // nodes in the desired top-to-bottom order.
    const srcType = nodeTypeMapping[sourceId];
    const tgtType = nodeTypeMapping[targetId];
    if (layerMapping[srcType] && layerMapping[tgtType]) {
      if (layerMapping[srcType] > layerMapping[tgtType]) {
        [sourceId, targetId] = [targetId, sourceId];
      }
    } else {
      // Fallback: for relationships known to be inverted in Archimate (e.g. Realization or Serving),
      // you could still check the relationship type here.
      if (l.type === "Realization" || l.type === "Serving") {
        [sourceId, targetId] = [targetId, sourceId];
      }
    }

    const edgeId = `e${index}`;

    gml += `    <edge id="${escapeXml(edgeId)}" source="${escapeXml(sourceId)}" target="${escapeXml(targetId)}">\n`;
    gml += `      <data key="d2">\n`;
    gml += `        <y:PolyLineEdge>\n`;
    gml += `          <y:LineStyle color="#000000" type="line" width="1.0"/>\n`;
    gml += `          <y:Arrows source="none" target="standard"/>\n`;
    gml += `          <y:BendStyle smoothed="true"/>\n`;
    gml += `        </y:PolyLineEdge>\n`;
    gml += `      </data>\n`;
    gml += `    </edge>\n`;
  });

  // End graph.
  gml += `  </graph>\n`;
  gml += `</graphml>\n`;
  return gml;
}

/**
 * Triggers a download of the provided text as a file with the specified filename.
 */
function downloadTextAsFile(text, filename) {
  const blob = new Blob([text], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Main export function: reads graph data from sessionStorage, ensures all nodes referenced in links exist,
 * builds GraphML, and triggers download.
 */
function exportGraphMLFromSession() {
  const graphDataString = sessionStorage.getItem("archiGraphDataStore");
  if (!graphDataString) {
    alert("No graph data found in session storage.");
    return;
  }
  const graphData = JSON.parse(graphDataString);

  // Convert nodes to an array if necessary.
  let nodes = Array.isArray(graphData.nodes)
    ? graphData.nodes
    : Object.values(graphData.nodes || {});
  const links = graphData.links || [];

  // Ensure every link’s source and target exist as nodes.
  const nodeMap = {};
  nodes.forEach(n => {
    nodeMap[n.id] = n;
  });
  links.forEach(link => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;
    if (!nodeMap[sourceId]) {
      nodeMap[sourceId] = { id: sourceId, name: sourceId, type: "Undefined", x: 0, y: 0 };
    }
    if (!nodeMap[targetId]) {
      nodeMap[targetId] = { id: targetId, name: targetId, type: "Undefined", x: 0, y: 0 };
    }
  });
  nodes = Object.values(nodeMap);

  const graphmlText = exportGraphML(nodes, links);
  const fileName = (graphData.modelName || "graph") + ".graphml";
  downloadTextAsFile(graphmlText, fileName);
}

// Attach the export function to a button if desired.
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const exportBtn = document.getElementById("exportGraphMLButton");
    if (exportBtn) {
      exportBtn.addEventListener("click", exportGraphMLFromSession);
    }
  });
}

// Optionally export functions for use in other modules.
export {
  exportGraphML,
  downloadTextAsFile,
  exportGraphMLFromSession
};