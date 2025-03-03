// graphExplorer.js

import * as nodeUtils from './graphNode.js';
import * as linkUtils from './graphLink.js';

// Use the global dagre from dagre.min.js (loaded via a <script> tag in index.html)
const dagreLib = window.dagre;

/**
 * Run a Dagre layout on the given nodes and links.
 * This assigns each node (d.x, d.y) coordinates for a top-down layered graph.
 */
function runDagreLayout(nodes, links) {
  const g = new dagreLib.graphlib.Graph({ directed: true, multigraph: true });
  g.setGraph({ rankdir: 'TB', ranksep: 20, nodesep: 10 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes
  nodes.forEach(n => {
    g.setNode(n.id, { label: n.name || n.id, width: 140, height: 40 });
  });

  // Add edges
  links.forEach(l => {
    g.setEdge(l.source, l.target, {}, l.id);
  });

  // Compute layout
  dagreLib.layout(g);

  // Copy Dagre’s x,y onto the node objects
  nodes.forEach(n => {
    const coord = g.node(n.id);
    n.x = coord.x;
    n.y = coord.y;
  });
}

/**
 * Centers the graph by setting the SVG's viewBox.
 */
function centerGraphViewBox(nodes, svg) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(d => {
    if (d.x < minX) minX = d.x;
    if (d.y < minY) minY = d.y;
    if (d.x > maxX) maxX = d.x;
    if (d.y > maxY) maxY = d.y;
  });
  
  const padding = 20;
  const viewBoxX = minX - padding;
  const viewBoxY = minY - padding;
  const viewBoxWidth = (maxX - minX) + 2 * padding;
  const viewBoxHeight = (maxY - minY) + 2 * padding;
  
  svg.attr("viewBox", `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
}

/**
 * Main function that draws the graph in an <svg> with ID "graph-viewer".
 * It uses Dagre layout, neighbor highlighting on node click, and centers the graph.
 */
function drawGraph(nodes, pinnedNodeId, links, callback) {
  // Remove any old SVG
  d3.selectAll("#graph-viewer").remove();

  const width = window.innerWidth - 4;
  const height = window.innerHeight - 33;

  // Insert the main SVG
  const svg = d3.select('body')
    .append('svg')
    .attr('id', "graph-viewer")
    .attr('width', width)
    .attr('height', height);

  // Run the Dagre layout
  runDagreLayout(nodes, links);

  // Add arrowhead definitions
  linkUtils.addArrowHeadsDefinitions(svg);

  // Create a <g> for zoom/pan
  const viewer = svg.append("g").attr("id", "viewer");

  // -- Draw links --
  const renderedLinks = linkUtils.addLinks(viewer, links)
    .attr("x1", d => getNodeCoord(d.source, nodes, 'x'))
    .attr("y1", d => getNodeCoord(d.source, nodes, 'y'))
    .attr("x2", d => getNodeCoord(d.target, nodes, 'x'))
    .attr("y2", d => getNodeCoord(d.target, nodes, 'y'));

  // -- Draw nodes --
  const renderedNodes = nodeUtils.addNodes(width, height, viewer, nodes, pinnedNodeId)
    .attr("transform", d => `translate(${d.x}, ${d.y})`);

  // Neighbor highlighting on node click
  renderedNodes.on("click", function (event, d) {
    // Prevent canvas click from triggering
    event.stopPropagation();

    // Clear existing highlights
    renderedNodes.selectAll("*").classed("highlighted", false)
                  .classed("neighbor-highlight", false);
    renderedLinks.classed("link-highlight", false);

    // Highlight the clicked node (entire group)
    d3.select(this).selectAll("*").classed("highlighted", true);

    // For each link connected to this node, highlight the link and its neighbor node
    renderedLinks.filter(linkData => 
      (linkData.source === d.id || linkData.target === d.id)
    )
    .classed("link-highlight", true)
    .each(function(linkData) {
      const neighborId = (linkData.source === d.id) ? linkData.target : linkData.source;
      renderedNodes.filter(nodeData => nodeData.id === neighborId)
                   .selectAll("*")
                   .classed("neighbor-highlight", true);
    });
    console.log("Node clicked and neighbors highlighted:", d);
  });

  // Enable dragging on nodes
  const dragHandler = d3.drag()
    .on("start", function (event, d) {
      d3.select(this).classed("dragging-node", true);
    })
    .on("drag", function (event, d) {
      d.x = event.x;
      d.y = event.y;
      d3.select(this).attr("transform", `translate(${d.x}, ${d.y})`);
      // Update links connected to this node
      renderedLinks
        .filter(link => link.source === d.id || link.target === d.id)
        .attr("x1", link => getNodeCoord(link.source, nodes, 'x'))
        .attr("y1", link => getNodeCoord(link.source, nodes, 'y'))
        .attr("x2", link => getNodeCoord(link.target, nodes, 'x'))
        .attr("y2", link => getNodeCoord(link.target, nodes, 'y'));
    })
    .on("end", function (event, d) {
      d3.select(this).classed("dragging-node", false);
    });
  renderedNodes.call(dragHandler);

  // Set up zoom & pan
  const zoomHandler = d3.zoom()
    .on("zoom", event => {
      viewer.attr("transform", event.transform);
    });
  svg.call(zoomHandler).on("dblclick.zoom", null);

  // Add a background rect to allow canvas clicks to clear selection
  svg.on("click", () => {
    renderedNodes.selectAll("*").classed("highlighted", false)
                  .classed("neighbor-highlight", false);
    renderedLinks.classed("link-highlight", false);
  });

  // Center the graph by setting the SVG viewBox
  centerGraphViewBox(nodes, svg);
}

/**
 * Helper: Returns a node's coordinate (x or y) given an id or node object.
 */
function getNodeCoord(idOrObj, nodes, axis='x') {
  if (typeof idOrObj === 'object' && idOrObj.id) {
    return axis === 'x' ? idOrObj.x : idOrObj.y;
  }
  const found = nodes.find(n => n.id === idOrObj);
  return found ? (axis === 'x' ? found.x : found.y) : 0;
}

export { drawGraph };