// exportGraphML.js

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
 * Simple color assignment for ArchiMate types.
 */
function getFillColorForArchimateType(type) {
  switch (type) {
    case "ApplicationComponent":
    case "ApplicationCollaboration":
    case "ApplicationEvent":
    case "ApplicationFunction":
    case "ApplicationInteraction":
    case "ApplicationInterface":
    case "ApplicationProcess":
    case "ApplicationService":
    case "DataObject":
      return "#b6f4f6";
    case "BusinessActor":
    case "BusinessCollaboration":
    case "BusinessEvent":
    case "BusinessFunction":
    case "BusinessInteraction":
    case "BusinessInterface":
    case "BusinessObject":
    case "BusinessProcess":
    case "BusinessRole":
    case "BusinessService":
    case "Contract":
    case "Product":
    case "Representation":
    case "Location":
      return "#ffffb1";
    case "Assessment":
    case "Constraint":
    case "Driver":
    case "Goal":
    case "Meaning":
    case "Outcome":
    case "Principle":
    case "Requirement":
    case "Stakeholder":
    case "Value":
      return "#ccf";
    case "DistributionNetwork":
    case "Equipment":
    case "Facility":
    case "Material":
      return "#d1f6c5";
    case "Artifact":
    case "CommunicationNetwork":
    case "Device":
    case "Node":
    case "Path":
    case "SystemSoftware":
    case "TechnologyCollaboration":
    case "TechnologyEvent":
    case "TechnologyFunction":
    case "TechnologyInteraction":
    case "TechnologyInterface":
    case "TechnologyProcess":
    case "TechnologyService":
      return "#d1f6c5";
    case "Capability":
    case "CourseOfAction":
    case "Resource":
    case "ValueStream":
      return "#f5deaa";
    case "Deliverable":
    case "Gap":
    case "ImplementationEvent":
    case "Plateau":
    case "WorkPackage":
      return "#ffe0e0";
    default:
      return "#fefefe";
  }
}

/**
 * Build a simplified GraphML that yEd/yEd Live will interpret using
 * <y:ShapeNode> for nodes (no wrapping) and <y:PolyLineEdge> for edges.
 */
function exportGraphML(nodes, links) {
  let gml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  gml += `<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:y="http://www.yworks.com/xml/graphml"
    xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns
      http://www.yworks.com/xml/schema/graphml/1.0/ygraphml.xsd">\n`;

  // Define keys for node graphics, edge graphics, plus optional "description" keys.
  gml += `  <key for="node" id="d0" yfiles.type="nodegraphics"/>\n`;
  gml += `  <key attr.name="description" attr.type="string" for="node" id="d1"/>\n`;
  gml += `  <key for="edge" id="d2" yfiles.type="edgegraphics"/>\n`;
  gml += `  <key attr.name="description" attr.type="string" for="edge" id="d3"/>\n`;
  gml += `  <key for="graphml" id="d4" yfiles.type="resources"/>\n`;

  // Start the graph
  gml += `  <graph id="G" edgedefault="directed">\n`;

  // --- NODES ---
  nodes.forEach(n => {
    const nodeId = escapeXml(n.id);
    const labelText = (n.name || "") + (n.type ? ` (${n.type})` : "");
    const fillColor = getFillColorForArchimateType(n.type);

    // Use default geometry; if your node objects include positions, you can use them.
    const x = (n.x !== undefined) ? parseFloat(n.x) : 0;
    const y = (n.y !== undefined) ? parseFloat(n.y) : 0;
    const w = 100;
    const h = 40;

    gml += `    <node id="${nodeId}">\n`;
    gml += `      <data key="d0">\n`;
    gml += `        <y:ShapeNode>\n`;
    gml += `          <y:Geometry x="${x}" y="${y}" width="${w}" height="${h}"/>\n`;
    gml += `          <y:Fill color="${fillColor}" transparent="true"/>\n`;
    gml += `          <y:BorderStyle color="#000000" type="line" width="1.0"/>\n`;
    gml += `          <y:NodeLabel alignment="center" fontFamily="Dialog" fontSize="5" fontStyle="plain" textColor="#000000" visible="true" modelName="internal" modelPosition="c">\n`;
    gml += `            ${escapeXml(labelText)}\n`;
    gml += `          </y:NodeLabel>\n`;
    gml += `          <y:Shape type="rectangle"/>\n`;
    gml += `        </y:ShapeNode>\n`;
    gml += `      </data>\n`;
    gml += `    </node>\n`;
  });

  // --- EDGES ---
  links.forEach((l, index) => {
    // l.source and l.target may be objects or IDs; extract the id.
    const sourceId = typeof l.source === "object" ? l.source.id : l.source;
    const targetId = typeof l.target === "object" ? l.target.id : l.target;
    const edgeId = `e${index}`;

    gml += `    <edge id="${escapeXml(edgeId)}" source="${escapeXml(sourceId)}" target="${escapeXml(targetId)}">\n`;
    gml += `      <data key="d2">\n`;
    gml += `        <y:PolyLineEdge>\n`;
    gml += `          <y:LineStyle color="#000000" type="line" width="1.0"/>\n`;
    gml += `          <y:Arrows source="none" target="none"/>\n`;
    gml += `          <y:BendStyle smoothed="false"/>\n`;
    gml += `        </y:PolyLineEdge>\n`;
    gml += `      </data>\n`;
    gml += `    </edge>\n`;
  });

  // End graph + resources block
  gml += `  </graph>\n`;
  gml += `  <data key="d4">\n`;
  gml += `    <y:Resources/>\n`;
  gml += `  </data>\n`;
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
 * Main export function: read data from sessionStorage, ensure all nodes referenced in links exist,
 * build GraphML, and trigger download.
 */
function exportGraphMLFromSession() {
  const graphDataString = sessionStorage.getItem("archiGraphDataStore");
  if (!graphDataString) {
    alert("No graph data found in session storage.");
    return;
  }
  const graphData = JSON.parse(graphDataString);

  // If graphData.nodes is not an array (it could be an object), convert to an array.
  let nodes = Array.isArray(graphData.nodes)
    ? graphData.nodes
    : Object.values(graphData.nodes || {});
  const links = graphData.links || [];

  // Build a map of existing nodes by id.
  const nodeMap = {};
  nodes.forEach(n => {
    nodeMap[n.id] = n;
  });

  // For every link, if its source or target is not in nodeMap, add a default node.
  links.forEach(link => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;
    if (!nodeMap[sourceId]) {
      // Create a default node for the missing source
      nodeMap[sourceId] = {
        id: sourceId,
        name: sourceId,
        type: "Undefined",
        x: 0,
        y: 0
      };
    }
    if (!nodeMap[targetId]) {
      // Create a default node for the missing target
      nodeMap[targetId] = {
        id: targetId,
        name: targetId,
        type: "Undefined",
        x: 0,
        y: 0
      };
    }
  });

  // Rebuild the nodes array from the nodeMap.
  nodes = Object.values(nodeMap);

  const graphmlText = exportGraphML(nodes, links);
  const fileName = (graphData.modelName || "graph") + ".graphml";
  downloadTextAsFile(graphmlText, fileName);
}

// Attach the export function to a button if desired:
document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("exportGraphMLButton");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportGraphMLFromSession);
  }
});

// Optionally export these if needed in other modules
export {
  exportGraphML,
  downloadTextAsFile,
  exportGraphMLFromSession
};