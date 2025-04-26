//  src/index.js
//  — application bootstrap + top‑level wiring —

import * as dataAccess    from "./components/dataAccess.js";
import * as graphExplorer from "./components/graphExplorer.js";
import * as settings      from "./settings.js";
import * as userSettings  from "./components/userSettings.js";
import { setupFilters }   from "./components/filterBar.js";
import Fuse from "fuse.js";
import { getState } from "./components/filterState.js";
import "./components/exportGraphML.js";
import { subscribe }      from "./components/filterState.js";   // ← NEW  (keep future‑proof)

// track which element (if any) is “focused” for neighborhood filtering
let selectedElementId = null;
// our Fuse.js index
let fuse = null;

/**
 * Build a Fuse index on all loaded elements, wire up
 * #element-search → #element-search-results → selection UI.
 */
function setupElementSearch() {
  // build a Fuse index over all nodes
  const raw = dataAccess.requestDataFromStore().nodes;
  const list = raw.map(n => ({ id: n.id, name: n.name, type: n.type }));
  fuse = new Fuse(list, { keys: ["name"], threshold: 0.3 });

  const searchInput      = document.getElementById("element-search");
  const resultsContainer = document.getElementById("element-search-results");
  const selectedContainer = document.getElementById("element-selected");
  const selectedName     = document.getElementById("selected-name");
  const selectedType     = document.getElementById("selected-type");
  const clearBtn         = document.getElementById("clear-selection");

  let activeIndex = -1;

  function updateActive(items) {
    items.forEach((item, idx) => {
      if (idx === activeIndex) {
        item.classList.add("highlighted");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("highlighted");
      }
    });
  }

  // handle up/down/enter
  searchInput.addEventListener("keydown", event => {
    const items = resultsContainer.querySelectorAll(".search-item");
    if (!items.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActive(items);
    }
    else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActive(items);
    }
    else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0) {
        items[activeIndex].click();
      }
    }
  });

  // on typing → show top-10 matches
  searchInput.addEventListener("input", () => {
    activeIndex = -1;
    const term = searchInput.value.trim();
    if (!term) {
      resultsContainer.innerHTML = "";
      return;
    }
    const matches = fuse.search(term).slice(0, 10);
    resultsContainer.innerHTML = matches.map(r => `
      <div
        class="search-item"
        data-id="${r.item.id}"
        data-name="${r.item.name}"
        data-type="${r.item.type}"
        style="padding:0.2em; cursor:pointer;"
      >
        ${r.item.name} (${r.item.type})
      </div>
    `).join("");
  });

  // click a result → select it
  resultsContainer.addEventListener("click", event => {
    const item = event.target.closest(".search-item");
    if (!item) return;
    selectedElementId       = item.dataset.id;
    selectedName.textContent = item.dataset.name;
    selectedType.textContent = item.dataset.type;
    selectedContainer.style.display = "block";
    searchInput.value = "";
    resultsContainer.innerHTML = "";
  });

  // clear selection
  clearBtn.addEventListener("click", () => {
    selectedElementId = null;
    selectedContainer.style.display = "none";
  });

  // also respond to dblclick‐from‐graph
  document.addEventListener("elementSelected", ev => {
    const d = ev.detail;
    selectedElementId       = d.id;
    selectedName.textContent = d.name;
    selectedType.textContent = d.type;
    selectedContainer.style.display = "block";
  });
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

let querystringParameters = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search)
  : new URLSearchParams();

function reDrawFromSession() {
  const g = dataAccess.requestDataFromStore();
  document.getElementById("loading-message").style.display = "none";
  graphExplorer.drawGraph(
    g.nodes,
    null,
    g.links,
    document.getElementById("graph-container")
  );
}

function modelLoaded() {
  reDrawFromSession();
  setupElementSearch();
  // show loading spinner
  document.getElementById("loading-message").style.display = "block";

  // run the exact same Kùzu filter you use on “Apply Global Filters”
  dataAccess.globalFilterGraph(subgraph => {
    document.getElementById("loading-message").style.display = "none";
    graphExplorer.drawGraph(
      subgraph.nodes,
      null,                       // no pinned node on initial load
      subgraph.links,
      document.getElementById("graph-container")
    );
  });
}

function setupFeatures() {
  const hdr = document.querySelector("header");
  if (querystringParameters.get("showheader") === "true" || settings.header_Enabled) {
    hdr.style.display = "block";
  }

  if (settings.userSettings_Enabled) {
    document.getElementById("action-userSettings").classList.remove("hidden");
  }
  if (settings.dragDropModel_Enabled) {
    document.getElementById("userSettings-userModelLoad").classList.remove("hidden");
  }
}

function debounce(cb, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => cb(...args), wait);
  };
}

/* ------------------------------------------------------------------ */
/* UI event wiring                                                    */
/* ------------------------------------------------------------------ */

document.getElementById("action-reload")
  .addEventListener("click", () => dataAccess.requestDataFromServer(settings.modelPath, modelLoaded));

document.getElementById("action-model-overview")
  .addEventListener("click", () => {
    const o = dataAccess.modelOverview();
    document.getElementById("model-name").innerText           = o.modelName;
    document.getElementById("model-documentation").innerText  = o.modelDocumentation;
    document.getElementById("dialog-overview").showModal();
  });

["dialog-overview-close", "dialog-overview-close-x"].forEach(id =>
  document.getElementById(id).addEventListener("click", () =>
    document.getElementById("dialog-overview").close())
);

document.getElementById("action-userSettings")
  .addEventListener("click", () => userSettings.settingsDialogOpen());

["dialog-userSettings-close", "dialog-userSettings-close-x"].forEach(id =>
  document.getElementById(id).addEventListener("click", () =>
    userSettings.settingsDialogClose())
);

const dz = document.getElementById("userModelLoad-dragDrop-zone");
dz.addEventListener("dragover", e => e.preventDefault());
dz.addEventListener("drop",     e => { e.preventDefault(); userModel.modelFileLoad(e, modelLoaded); });

document.getElementById("userModelLoad-delete")
  .addEventListener("click", () => {
    userModel.modelFileDelete();
    dataAccess.requestDataFromServer(settings.modelPath, modelLoaded);
  });

document.getElementById("stickyNodesOnDrag")
  .addEventListener("change", function () {
    userSettings.updateSetting("stickyNodesOnDrag_Enabled", this.checked);
  });

/* facet browser initialisation */
setupFilters();

document.getElementById("applyFiltersBtn").addEventListener("click", async () => {
  document.getElementById("loading-message").style.display = "block";
  const depth = +document.getElementById("depthInput").value || 1;
  const { layers, elementTypes, relationshipTypes } = getState();

  if (selectedElementId) {
    // neighborhood around selected element
    await dataAccess.kuzuNeighborhoodGraph(
      selectedElementId,
      depth,
      { layers, elementTypes, relationshipTypes },
      subgraph => {
        document.getElementById("loading-message").style.display = "none";
        graphExplorer.drawGraph(
          subgraph.nodes,
          selectedElementId,
          subgraph.links,
          document.getElementById("graph-container")
        );
      }
    );
  } else {
    // full global filter
    await dataAccess.globalFilterGraph(() => {
      document.getElementById("loading-message").style.display = "none";
      document.dispatchEvent(new Event("kuzuFiltersDone"));
    });
  }
});

/* react‑to‑filter‑state (optional future auto‑update) */
subscribe(() => {
  /* No automatic heavy query yet – keeping manual “Apply Filters” for now.
     Hook left in place for future UX refinements. */
});

/* ------------------------------------------------------------------ */
/* lifecycle                                                          */
/* ------------------------------------------------------------------ */

window.onload = async () => {
  setupFeatures();

  if (!dataAccess.dataExistsInStore()) {
    userSettings.updateSetting("userLoadedModel", false);
    userSettings.updateSetting("userLoadedModelFilename", "");
  }

  if (!userSettings.getSetting("userLoadedModel")) {
    await dataAccess.requestDataFromServer(settings.modelPath, modelLoaded);
  } else {
    modelLoaded();
  }
};

window.onresize   = debounce(reDrawFromSession, 100);
window.onpopstate = () => reDrawFromSession();

document.addEventListener("kuzuFiltersDone", () => {
  console.log("Global filter applied → re‑draw from session");
  reDrawFromSession();
});