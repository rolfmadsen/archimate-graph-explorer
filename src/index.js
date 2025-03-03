// index.js

import * as dataAccess from './components/dataAccess.js';
import * as graphDataSearch from './components/graphDataSearch.js';
import * as filterBar from './components/filterBar.js';
import * as graphExplorer from './components/graphExplorer.js';
import * as settings from './settings.js';
import * as userSettings from './components/userSettings.js';
import * as userModel from './components/userModel.js';
import './components/exportGraphML.js';

let querystringParameters = new URLSearchParams(window.location.search);

/**
 * Called once the model is loaded (either from server or from a user’s file).
 */
const modelLoaded = () => {
  try {
    const graphData = dataAccess.requestDataFromStore();
    filterBar.setupRootNodeSearchFilter(graphData.nodes, filterSearch);

    document.getElementById('loading-message').style.display = 'none';

    filterSearch(); 
  } catch (error) {
    const msg = `Error loading model \r\n\r\n${error}`;
    console.error(msg);
    alert(msg);
  }
};

/**
 * Called when filters change or a root node is selected.
 * Gathers user-selected filter values, then draws the graph with Dagre.
 */
const filterSearch = (selectedNodeId) => {
  try {
    querystringParameters = new URLSearchParams(window.location.search);
    const filterValues = filterBar.selectedFilterValues();  
    const graphData = dataAccess.requestDataFromStore();

    // If there's a root node, do a breadth-first search; otherwise show a flat search.
    const rootNodeId = selectedNodeId ?? querystringParameters.get('elementid');
    let filteredData = null;
    if (rootNodeId !== null) {
      // BFS from the selected root node
      filteredData = graphDataSearch.breadthFirstSearch(
        graphData,
        rootNodeId,
        filterValues.selectedDepth,
        filterValues.selectedNodeTypes, 
        filterValues.selectedNodeStatuses, 
        filterValues.selectedLinkTypes
      );
      filterBar.setupBreadthFirstSearchFilters(filteredData.nodesFiltered[0]);
    } else {
      // Flat search over all nodes
      filteredData = graphDataSearch.flatGraphSearch(
        graphData,
        filterValues.selectedNodeTypes, 
        filterValues.selectedNodeStatuses, 
        filterValues.selectedLinkTypes, 
        filterValues.includeUnlinkedNodes
      );
      filterBar.setupFlatSearchFilters();
    }

    // Show a simple summary of how many elements/relationships were filtered
    const resultsSummary = `Elements: ${filteredData.nodesFiltered.length}, Relationships: ${filteredData.linksFiltered.length}`;
    document.getElementById('search-result-summary').innerText = resultsSummary;

    // Now actually draw the graph (Dagre layout is inside graphExplorer.drawGraph).
    graphExplorer.drawGraph(
      filteredData.nodesFiltered,
      rootNodeId,
      filteredData.linksFiltered,
      filterSearch
    );
  } catch (error) {
    const msg = `Error searching \r\n\r\n${error}`;
    console.error(msg);
    alert(msg);
  }
};

/**
 * Utility function to throttle calls.
 */
const debounce = (callback, wait) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback.apply(this, args), wait);
  };
};

/**
 * Helper to request the model file from server, then parse/store it.
 */
const requestModelData = (callback) => {
  dataAccess.requestDataFromServer(settings.modelPath, callback);
};

/**
 * Opens the Model Overview dialog, showing the model name and documentation.
 */
const modelOverviewOpen = () => {
  const overview = dataAccess.modelOverview();
  document.getElementById("model-name").innerText = overview.modelName;
  document.getElementById("model-documentation").innerText = overview.modelDocumentation;
  document.getElementById("dialog-overview").showModal();
};
const modelOverviewClose = () => {
  document.getElementById("dialog-overview").close();
};

/**
 * Show/hide UI features based on user settings or query parameters.
 */
const setupFeatures = () => {
  if (querystringParameters.get('showheader')) {
    if (querystringParameters.get('showheader') === "true") {
      document.querySelector("header").style.display = "block";
    }
  } else if (settings.header_Enabled) {
    document.querySelector("header").style.display = "block";
  }

  if (settings.userSettings_Enabled) {
    document.getElementById("action-userSettings").classList.remove('hidden');
  }
  if (settings.dragDropModel_Enabled) {
    document.getElementById("userSettings-userModelLoad").classList.remove('hidden');
  }
};

// Hook up UI event listeners
document.getElementById("action-reload").addEventListener("click", () => {
  requestModelData(modelLoaded);
});
document.getElementById("action-model-overview").addEventListener("click", () => {
  modelOverviewOpen();
});
document.getElementById("dialog-overview-close").addEventListener("click", () => {
  modelOverviewClose();
});
document.getElementById("dialog-overview-close-x").addEventListener("click", () => {
  modelOverviewClose();
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
  requestModelData(modelLoaded);
});
document.getElementById("stickyNodesOnDrag").addEventListener("change", function() {
  userSettings.updateSetting('stickyNodesOnDrag_Enabled', this.checked);
});

/**
 * Initialize the page on load: set up features, filters, and load the model data.
 */
window.onload = () => {
  setupFeatures();
  filterBar.setupFilters(filterSearch);

  // If there's no data in storage, we want to request the default model
  if (!dataAccess.dataExistsInStore()) {
    userSettings.updateSetting("userLoadedModel", false);
    userSettings.updateSetting("userLoadedModelFilename", "");
  }

  // If user didn't load a custom model, use the default model from server.
  if (!userSettings.getSetting('userLoadedModel')) {
    requestModelData(modelLoaded);
  } else {
    modelLoaded();
  }
};

// Re-draw whenever the window is resized (debounced).
window.onresize = debounce(() => {
  filterSearch();
}, 100);

// Re-draw if the browser's history changes (e.g. rootNode changed).
window.onpopstate = () => {
  filterSearch();
};