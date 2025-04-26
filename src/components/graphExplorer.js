// src/components/graphExplorer.js

import * as nodeUtils from './graphNode.js';
import * as linkUtils from './graphLink.js';
import * as dataAccess from './dataAccess.js';
import * as d3 from 'd3';
import { getState } from './filterState.js';

function getId(endpoint) {
  return typeof endpoint === 'object' && endpoint.id ? endpoint.id : endpoint;
}

function runForceLayout(nodes, links, width, height) {
  if (!nodes.length) return;

  // 1) prune any links whose source/target is missing
  const idSet = new Set(nodes.map(n => n.id));
  const validLinks = links.filter(l => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    return idSet.has(s) && idSet.has(t);
  });

  // 2) collect distinct, truthy layers
  const layers = Array.from(new Set(nodes.map(d => d.layer).filter(Boolean)));

  // 3) fallback to plain force if ≤1 cluster
  if (layers.length <= 1) {
    const sim = d3.forceSimulation(nodes)
      .force("link",    d3.forceLink(validLinks).id(d=>d.id).distance(80).strength(0.2))
      .force("charge",  d3.forceManyBody().strength(-100))
      .force("collide", d3.forceCollide(25))
      .force("center",  d3.forceCenter(width/2, height/2));
    sim.stop();
    for (let i = 0; i < 300; ++i) sim.tick();
    return;
  }

  // 4) compute circular centroids around the canvas center
  const cx = width  * 0.5;
  const cy = height * 0.5;
  const R  = Math.min(width, height) * 0.35;
  const clusterMap = new Map();
  layers.forEach((layer, i) => {
    const θ = (2 * Math.PI * i) / layers.length;
    clusterMap.set(layer, {
      x: cx + Math.cos(θ) * R,
      y: cy + Math.sin(θ) * R
    });
  });

  // 5) run the clustered simulation
  const sim = d3.forceSimulation(nodes)
    .force("link",    d3.forceLink(validLinks).id(d=>d.id).distance(70).strength(0.08))
    .force("charge",  d3.forceManyBody().strength(-300))
    .force("collide", d3.forceCollide(30))
    .force("center",  d3.forceCenter(cx, cy))
    // pull each node into its layer’s circle wedge
    .force("clusterX", d3.forceX(d => {
      const c = clusterMap.get(d.layer);
      return c ? c.x : cx;
    }).strength(0.8))
    .force("clusterY", d3.forceY(d => {
      const c = clusterMap.get(d.layer);
      return c ? c.y : cy;
    }).strength(0.8));

  sim.stop();
  for (let i = 0; i < 300; ++i) sim.tick();
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