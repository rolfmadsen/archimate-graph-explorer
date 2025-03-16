// index.js

import * as dataAccess from './components/dataAccess.js';
import * as graphExplorer from './components/graphExplorer.js';
import * as settings from './settings.js';
import * as userSettings from './components/userSettings.js';
import * as userModel from './components/userModel.js';
import './components/exportGraphML.js';
import { setupFilters } from './components/filterBar.js';

let querystringParameters = new URLSearchParams(window.location.search);

function reDrawFromSession() {
  const graphData = dataAccess.requestDataFromStore();
  document.getElementById('loading-message').style.display = 'none';
  console.log("Nodes:", graphData.nodes);
  console.log("Links:", graphData.links);
  // Render graph into the container with id "graph-container"
  graphExplorer.drawGraph(graphData.nodes, null, graphData.links, document.getElementById("graph-container"));
}

function modelLoaded() {
  reDrawFromSession();
}

function setupFeatures() {
  if (querystringParameters.get('showheader') === "true") {
    document.querySelector("header").style.display = "block";
  } else if (settings.header_Enabled) {
    document.querySelector("header").style.display = "block";
  }
  if (settings.userSettings_Enabled) {
    document.getElementById("action-userSettings").classList.remove('hidden');
  }
  if (settings.dragDropModel_Enabled) {
    document.getElementById("userSettings-userModelLoad").classList.remove('hidden');
  }
}

function debounce(callback, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
}

document.getElementById("action-reload").addEventListener("click", () => {
  dataAccess.requestDataFromServer(settings.modelPath, modelLoaded);
});
document.getElementById("action-model-overview").addEventListener("click", () => {
  const overview = dataAccess.modelOverview();
  document.getElementById("model-name").innerText = overview.modelName;
  document.getElementById("model-documentation").innerText = overview.modelDocumentation;
  document.getElementById("dialog-overview").showModal();
});
document.getElementById("dialog-overview-close").addEventListener("click", () => {
  document.getElementById("dialog-overview").close();
});
document.getElementById("dialog-overview-close-x").addEventListener("click", () => {
  document.getElementById("dialog-overview").close();
});
document.getElementById("action-userSettings").addEventListener("click", () => {
  userSettings.settingsDialogOpen();
});
document.getElementById("dialog-userSettings-close").addEventListener("click", () => {
  userSettings.settingsDialogClose();
});
document.getElementById("dialog-userSettings-close-x").addEventListener("click", () => {
  userSettings.settingsDialogClose();
});
document.getElementById("userModelLoad-dragDrop-zone").addEventListener("dragover", (e) => {
  e.preventDefault();
});
document.getElementById("userModelLoad-dragDrop-zone").addEventListener("drop", (e) => {
  e.preventDefault();
  userModel.modelFileLoad(e, modelLoaded);
});
document.getElementById("userModelLoad-delete").addEventListener("click", () => {
  userModel.modelFileDelete();
  dataAccess.requestDataFromServer(settings.modelPath, modelLoaded);
});
document.getElementById("stickyNodesOnDrag").addEventListener("change", function() {
  userSettings.updateSetting('stickyNodesOnDrag_Enabled', this.checked);
});

// Setup facet filters (facet browser)
setupFilters();

// When "Apply Global Filters" is clicked, call globalFilterGraph.
document.getElementById("applyFiltersBtn").addEventListener("click", async () => {
  document.getElementById("loading-message").style.display = "block";
  await dataAccess.globalFilterGraph((subgraph) => {
    document.getElementById("loading-message").style.display = "none";
    const evt = new Event("kuzuFiltersDone");
    document.dispatchEvent(evt);
  });
});

window.onload = async () => {
  setupFeatures();
  if (!dataAccess.dataExistsInStore()) {
    userSettings.updateSetting("userLoadedModel", false);
    userSettings.updateSetting("userLoadedModelFilename", "");
  }
  if (!userSettings.getSetting('userLoadedModel')) {
    await dataAccess.requestDataFromServer(settings.modelPath, modelLoaded);
  } else {
    modelLoaded();
  }
};

window.onresize = debounce(() => {
  reDrawFromSession();
}, 100);

window.onpopstate = () => {
  reDrawFromSession();
};

document.addEventListener("kuzuFiltersDone", () => {
  console.log("Global filter applied => re-draw from session");
  reDrawFromSession();
});