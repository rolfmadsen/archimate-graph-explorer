// src/components/graphExplorer.js

import * as nodeUtils from './graphNode.js';
import * as linkUtils from './graphLink.js';
import * as dataAccess from './dataAccess.js';
import * as d3 from 'd3';
import { getState } from './filterState.js';

/** Helper to extract an endpoint’s ID */
function getId(endpoint) {
  return typeof endpoint === 'object' && endpoint.id ? endpoint.id : endpoint;
}

/** Run a simple force simulation to set x,y on nodes */
function runForceLayout(nodes, links, width, height) {
  const validLinks = links.filter(l => {
    const s = getId(l.source), t = getId(l.target);
    return nodes.some(n => n.id === s) && nodes.some(n => n.id === t);
  });

  d3.forceSimulation(nodes)
    .force("link", d3.forceLink(validLinks).id(d => d.id).distance(100).strength(1.0))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width/2, height/2))
    .stop()
    .tick(300);
}

/** Draw or re‑draw the graph */
function drawGraph(nodes, pinnedNodeId, links, containerElement, callback) {
  // clear any existing SVG
  d3.selectAll("#graph-viewer").remove();

  const width  = containerElement.clientWidth;
  const height = containerElement.clientHeight;

  const svg = d3.select(containerElement)
    .append("svg")
      .attr("id", "graph-viewer")
      .attr("width",  width)
      .attr("height", height);

  runForceLayout(nodes, links, width, height);

  // arrowheads if provided
  if (linkUtils.addArrowHeadsDefinitions) linkUtils.addArrowHeadsDefinitions(svg);

  const viewer = svg.append("g").attr("id", "viewer");

  // draw links
  const validLinks = links.filter(l =>
    nodes.some(n => n.id === getId(l.source)) &&
    nodes.some(n => n.id === getId(l.target))
  );
  const renderedLinks = linkUtils.addLinks(viewer, validLinks)
    .attr("stroke-opacity", 0.6);

  // helper for node coordinates
  const coord = (idOrObj, axis) => {
    const id = getId(idOrObj);
    const n = nodes.find(x => x.id === id);
    return n ? n[axis] : 0;
  };

  renderedLinks
    .attr("x1", d => coord(d.source, 'x'))
    .attr("y1", d => coord(d.source, 'y'))
    .attr("x2", d => coord(d.target, 'x'))
    .attr("y2", d => coord(d.target, 'y'));

  // draw nodes
  const renderedNodes = nodeUtils.addNodes(width, height, viewer, nodes, pinnedNodeId)
    .attr("transform", d => `translate(${d.x},${d.y})`);

  // highlight pinned node
  renderedNodes.classed("pinned-node", d => d.id === pinnedNodeId)
    .select("text")
      .classed("pinned-node", d => d.id === pinnedNodeId);

  // double‑click → neighborhood
  renderedNodes.on("dblclick", function(event, d) {
    event.stopPropagation();
    const depth      = +(document.getElementById("depthInput").value) || 1;
    const facetState = getState();
    document.getElementById("loading-message").style.display = "block";
    dataAccess.kuzuNeighborhoodGraph(
      d.id, depth, facetState,
      subgraph => {
        document.getElementById("loading-message").style.display = "none";
        drawGraph(subgraph.nodes, d.id, subgraph.links, containerElement);
      }
    );
  });

  // -- Fixed drag handler: use `this`, not event.subject --
  const dragHandler = d3.drag()
    .on("start", function(event, d) {
      d3.select(this).classed("dragging-node", true);
    })
    .on("drag", function(event, d) {
      d.x = event.x;
      d.y = event.y;
      d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
      renderedLinks
        .filter(l => getId(l.source) === d.id || getId(l.target) === d.id)
        .attr("x1", l => coord(l.source, 'x'))
        .attr("y1", l => coord(l.source, 'y'))
        .attr("x2", l => coord(l.target, 'x'))
        .attr("y2", l => coord(l.target, 'y'));
    })
    .on("end", function(event, d) {
      d3.select(this).classed("dragging-node", false);
    });
  renderedNodes.call(dragHandler);

  // zoom & pan
  svg.call(d3.zoom().on("zoom", ev => viewer.attr("transform", ev.transform)))
     .on("dblclick.zoom", null);

  // clear pin when clicking background
  svg.insert("rect", ":first-child")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent")
    .on("click", () => {
      renderedNodes.classed("pinned-node", false)
                   .select("text").classed("pinned-node", false);
    });

  // center viewBox
  if (!nodes.length) {
    svg.attr("viewBox", `0 0 ${width} ${height}`);
  } else {
    let minX=1e9, minY=1e9, maxX=-1e9, maxY=-1e9;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });
    const pad = 20;
    svg.attr("viewBox", `${minX-pad} ${minY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}`);
  }

  if (callback) callback();
}

export { drawGraph };