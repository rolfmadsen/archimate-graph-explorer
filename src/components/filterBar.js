// filterBar.js

import { globalFilterGraph } from './dataAccess.js';

export function setupFilters() {
  const btn = document.getElementById("applyFiltersBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      globalFilterGraph((subgraph) => {
        // Dispatch event so index.js can re-draw the graph
        const evt = new Event("kuzuFiltersDone");
        document.dispatchEvent(evt);
      });
    });
  }
}

/**
 * Gather the user input from:
 *  - .layerCheckbox
 *  - #relTypesSelect
 *  - #depthInput
 *  - #rootNodeInput
 */
export function selectedFilterValues() {
  const layersChecked = Array.from(document.querySelectorAll(".layerCheckbox:checked"))
    .map(cb => cb.value);
  const layers = layersChecked.length ? layersChecked : ["Business", "Application", "Technology"];

  const relSelect = document.getElementById("relTypesSelect");
  let relationshipTypes = [];
  if (relSelect) {
    relationshipTypes = Array.from(relSelect.selectedOptions).map(o => o.value);
  }
  // Change default to include all relationship types from the UI.
  if (!relationshipTypes.length) {
    relationshipTypes = [
      "Composition",
      "Aggregation",
      "Realization",
      "Serving",
      "Assignment",
      "Flow",
      "Triggering",
      "Access"
    ];
  }

  const depthInput = document.getElementById("depthInput");
  const depthVal = parseInt(depthInput?.value || "2", 10);

  const rootNodeId = (document.getElementById("rootNodeInput")?.value || "").trim() || null;

  return { rootNodeId, depth: depthVal, layers, relationshipTypes };
}