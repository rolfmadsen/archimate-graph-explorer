// src/components/filterBar.js
/*  — centralises all facet-browser interactions — */

import { setState } from "./filterState.js";
import { globalFilterGraph } from "./dataAccess.js";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

/** Read the current DOM selections and return { layers, elementTypes, relationshipTypes } */
function collectFacetState() {
  /* -------- layers (header check-boxes) --------------------------- */
  // Exactly the eight ArchiMate layers from your table:
  const layerGroups = [
    { id: "group-strategy",   layer: "Strategy"                },
    { id: "group-business",   layer: "Business"                },
    { id: "group-application",layer: "Application"             },
    { id: "group-technology", layer: "Technology"              },
    { id: "group-physical",   layer: "Physical"                },
    { id: "group-impl",       layer: "Implementation & Migration" },
    { id: "group-motivation", layer: "Motivation"              },
    { id: "group-other",      layer: "Other/Supporting"        },
    { id: "group-composite",  layer: "Other/Supporting"        }
  ];

  const layers = layerGroups
    .filter(g => document.getElementById(g.id)?.checked)
    .map(g => g.layer);

  // Fallback: if user deselects every layer, re-enable all
  if (!layers.length) {
    layers.push(
      "Strategy",
      "Business",
      "Application",
      "Technology",
      "Physical",
      "Implementation & Migration",
      "Motivation",
      "Other/Supporting"
    );
  }

  /* -------- element types ---------------------------------------- */
  const elementTypes = Array.from(
    document.querySelectorAll(
      ".facet-value:not([data-group='relationships']):checked"
    )
  ).map(cb => cb.value);

  /* -------- relationship types ----------------------------------- */
  const relationshipTypes = Array.from(
    document.querySelectorAll(
      ".facet-value[data-group='relationships']:checked"
    )
  ).map(cb => cb.value);

  return { layers, elementTypes, relationshipTypes };
}

/** Push current selections into shared state & (optionally) run global query */
function pushFacetState(runGlobal = false) {
  const facets = collectFacetState();
  setState(facets);  // notify subscribers

  if (runGlobal) {
    globalFilterGraph(() => {
      document.dispatchEvent(new Event("kuzuFiltersDone"));
    });
  }
}

/* ------------------------------------------------------------------ */
/* public API                                                         */
/* ------------------------------------------------------------------ */

export function setupFilters() {
  // “Apply Global Filters” button
  document
    .getElementById("applyFiltersBtn")
    ?.addEventListener("click", () => pushFacetState(true));

  // Any change to a facet‐checkbox updates state immediately
  document.addEventListener("change", e => {
    if (
      e.target.matches(".facet-value") ||
      e.target.id.startsWith("group-")
    ) {
      pushFacetState(false);
    }
  });

  // Initialize on page load
  pushFacetState(false);
}

// Note: selectedFilterValues() is retired—use filterState.js (getState()/subscribe()) instead.