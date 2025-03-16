// graphExplorer.js

import * as nodeUtils from './graphNode.js';
import * as linkUtils from './graphLink.js';
import * as dataAccess from './dataAccess.js';

/**
 * Helper: Returns the ID of an endpoint.
 */
function getId(endpoint) {
  return typeof endpoint === 'object' && endpoint.id ? endpoint.id : endpoint;
}

/**
 * Runs a force–directed layout using D3’s forceSimulation.
 * Updates each node’s x and y properties.
 */
function runForceLayout(nodes, links, width, height) {
  const validLinks = links.filter(l => {
    const srcId = getId(l.source);
    const tgtId = getId(l.target);
    return nodes.find(n => n.id === srcId) && nodes.find(n => n.id === tgtId);
  });

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(validLinks)
      .id(d => d.id)
      .distance(100)
      .strength(0.5)
    )
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2));

  simulation.tick(300);
  simulation.stop();
}

/**
 * Draws the graph in the given container element.
 * On double‑clicking a node, it queries KùzuDB for its neighborhood
 * (using the slider for depth) and re‑renders the graph.
 *
 * The key update is using linkUtils.addLinks to render edges with proper markers.
 */
function drawGraph(nodes, pinnedNodeId, links, containerElement, callback) {
  // Remove any existing SVG.
  d3.selectAll("#graph-viewer").remove();

  const width = containerElement.clientWidth;
  const height = containerElement.clientHeight;

  const svg = d3.select(containerElement)
    .append("svg")
    .attr("id", "graph-viewer")
    .attr("width", width)
    .attr("height", height);

  runForceLayout(nodes, links, width, height);

  // Add arrowhead definitions for relationship markers.
  if (typeof linkUtils.addArrowHeadsDefinitions === 'function') {
    linkUtils.addArrowHeadsDefinitions(svg);
  }

  const viewer = svg.append("g").attr("id", "viewer");

  // Filter out any links whose endpoints are missing.
  const validLinks = links.filter(l =>
    nodes.find(n => n.id === getId(l.source)) &&
    nodes.find(n => n.id === getId(l.target))
  );

  // Instead of manually creating lines, use linkUtils.addLinks to add relationships
  // with markers based on their type.
  const renderedLinks = linkUtils.addLinks(viewer, validLinks);

  // Helper to get the node coordinate along the specified axis.
  function getNodeCoord(idOrObj, nodes, axis = 'x') {
    const id = typeof idOrObj === 'object' && idOrObj.id ? idOrObj.id : idOrObj;
    const node = nodes.find(n => n.id === id);
    return node ? (axis === 'x' ? node.x : node.y) : 0;
  }

  // Update link positions using the force layout coordinates.
  renderedLinks
    .attr("x1", d => getNodeCoord(d.source, nodes, 'x'))
    .attr("y1", d => getNodeCoord(d.source, nodes, 'y'))
    .attr("x2", d => getNodeCoord(d.target, nodes, 'x'))
    .attr("y2", d => getNodeCoord(d.target, nodes, 'y'));

  // Render nodes using the node utility.
  const renderedNodes = nodeUtils.addNodes(width, height, viewer, nodes, pinnedNodeId)
    .attr("transform", d => `translate(${d.x}, ${d.y})`);

  // On double-click a node, query its neighborhood and re-render the graph.
  renderedNodes.on("dblclick", function(event, d) {
    event.stopPropagation();
    const depth = parseInt(document.getElementById("depthSlider").value, 10);
    document.getElementById("loading-message").style.display = "block";
    dataAccess.kuzuNeighborhoodGraph(d.id, depth, (subgraph) => {
      document.getElementById("loading-message").style.display = "none";
      // Re-draw the graph with the new subgraph.
      drawGraph(subgraph.nodes, null, subgraph.links, containerElement);
    });
  });  

  // Enable dragging on nodes.
  const dragHandler = d3.drag()
    .on("start", function(event, d) {
      d3.select(this).classed("dragging-node", true);
    })
    .on("drag", function(event, d) {
      d.x = event.x;
      d.y = event.y;
      d3.select(this).attr("transform", `translate(${d.x}, ${d.y})`);
      renderedLinks
        .filter(link => getId(link.source) === d.id || getId(link.target) === d.id)
        .attr("x1", link => getNodeCoord(getId(link.source), nodes, 'x'))
        .attr("y1", link => getNodeCoord(getId(link.source), nodes, 'y'))
        .attr("x2", link => getNodeCoord(getId(link.target), nodes, 'x'))
        .attr("y2", link => getNodeCoord(getId(link.target), nodes, 'y'));
    })
    .on("end", function(event, d) {
      d3.select(this).classed("dragging-node", false);
    });
  renderedNodes.call(dragHandler);

  // Enable zoom and pan.
  const zoomHandler = d3.zoom()
    .on("zoom", event => {
      viewer.attr("transform", event.transform);
    });
  svg.call(zoomHandler).on("dblclick.zoom", null);

  // Background rectangle to clear highlights on click.
  svg.insert("rect", ":first-child")
    .attr("id", "canvas-bg")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent")
    .on("click", () => {
      renderedNodes.selectAll("*").classed("highlighted", false)
        .classed("neighbor-highlight", false);
      renderedLinks.classed("link-highlight", false);
    });

  centerGraphViewBox(nodes, svg);
  if (typeof callback === "function") callback();
}

/**
 * Centers the graph by computing a bounding box for nodes and setting the SVG's viewBox.
 */
function centerGraphViewBox(nodes, svg) {
  if (!nodes.length) {
    svg.attr("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(d => {
    if (d.x < minX) minX = d.x;
    if (d.y < minY) minY = d.y;
    if (d.x > maxX) maxX = d.x;
    if (d.y > maxY) maxY = d.y;
  });
  const padding = 20;
  svg.attr("viewBox", `${minX - padding} ${minY - padding} ${maxX - minX + 2 * padding} ${maxY - minY + 2 * padding}`);
}

export { drawGraph };