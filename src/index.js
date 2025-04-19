//  src/index.js
//  — application bootstrap + top‑level wiring —

import * as dataAccess    from "./components/dataAccess.js";
import * as graphExplorer from "./components/graphExplorer.js";
import * as settings      from "./settings.js";
import * as userSettings  from "./components/userSettings.js";
import * as userModel     from "./components/userModel.js";
import { setupFilters }   from "./components/filterBar.js";
import "./components/exportGraphML.js";
import { subscribe }      from "./components/filterState.js";   // ← NEW  (keep future‑proof)

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

/* manual “Apply” still triggers global filter → session → redraw */
document.getElementById("applyFiltersBtn").addEventListener("click", async () => {
  document.getElementById("loading-message").style.display = "block";
  await dataAccess.globalFilterGraph(() => {
    document.getElementById("loading-message").style.display = "none";
    const evt = new Event("kuzuFiltersDone");
    document.dispatchEvent(evt);
  });
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