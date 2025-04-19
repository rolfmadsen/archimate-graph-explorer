/*  src/components/filterBar.js
 *  — centralises all facet‑browser interactions —
 */

import { setState } from "./filterState.js";
import { globalFilterGraph } from "./dataAccess.js";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

/** read the current DOM selections and return { layers, elementTypes, relationshipTypes } */
function collectFacetState() {
  /* -------- layers (header check‑boxes) --------------------------- */
  const layerHeaders = [
    { id: "group-business",      layer: "Business"     },
    { id: "group-application",   layer: "Application"  },
    { id: "group-techinterface", layer: "Technology"   }, // tech interface ⟶ Technology
    { id: "group-physical",      layer: "Technology"   }  // physical      ⟶ Technology
  ];
  const layers = layerHeaders
    .filter(h => document.getElementById(h.id)?.checked)
    .map(h => h.layer);

  /* fallback – if user deselects every layer keep all, to avoid empty graph */
  if (!layers.length) layers.push("Business", "Application", "Technology");

  /* -------- element types ---------------------------------------- */
  const elementTypes = Array.from(
    document.querySelectorAll(".facet-value:not([data-group='relationships']):checked")
  ).map(cb => cb.value);

  /* -------- relationship types ----------------------------------- */
  const relationshipTypes = Array.from(
    document.querySelectorAll(".facet-value[data-group='relationships']:checked")
  ).map(cb => cb.value);

  return { layers, elementTypes, relationshipTypes };
}

/* push current selections into shared state & (optionally) run global query */
function pushFacetState(runGlobal = false) {
  const facets = collectFacetState();
  setState(facets);                       // ← notify subscribers
  if (runGlobal) {
    /* refresh session storage sub‑graph, then re‑draw happens in index.js */
    globalFilterGraph(() => {
      const evt = new Event("kuzuFiltersDone");
      document.dispatchEvent(evt);
    });
  }
}

/* ------------------------------------------------------------------ */
/* public API                                                         */
/* ------------------------------------------------------------------ */

export function setupFilters() {
  /* apply‑button */
  document.getElementById("applyFiltersBtn")
    ?.addEventListener("click", () => pushFacetState(true));

  /* any checkbox change triggers state update (no global query yet) */
  document.addEventListener("change", e => {
    if (e.target.matches(".facet-value") || e.target.id.startsWith("group-")) {
      pushFacetState(false);
    }
  });

  /* initial state */
  pushFacetState(false);
}

/* NOTE:  `selectedFilterValues()` is no longer needed — all code should use
          the reactive state from filterState.js via getState()/subscribe(). */