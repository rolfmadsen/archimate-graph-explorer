import * as dataAccess from './dataAccess.js';
import * as userSettings from './userSettings.js';

const modelFileLoad = (e, callback) => {
    const droppedFiles = e.dataTransfer?.files || e.target.files;
    if (!droppedFiles || droppedFiles.length === 0) {
        alert("No files were detected. Please try again.");
        return;
    }

    const droppedFile = droppedFiles[0];
    if (!['.xml', '.archimate'].some(ext => droppedFile.name.endsWith(ext))) {
        alert("Oops, it must be an .xml or .archimate file! Please ensure it is an ArchiMate Exchange Format or Archi file.");
        return;
    }

    const msg = document.getElementById('userModelLoad-dragDrop-message');
    msg.innerText = `Loading: ${droppedFile.name}`;

    const reader = new FileReader();
    reader.onload = () => {
        dataAccess.processModelFile(reader.result, () => {
            userSettings.updateSetting("userLoadedModel", true);
            userSettings.updateSetting("userLoadedModelFilename", droppedFile.name);
            document.getElementById('userModelLoad-delete').classList.remove('hidden');
            msg.innerText = `The ${droppedFile.name} file has been loaded.`;
            if (typeof callback === "function") callback();
        });
    };
    reader.readAsText(droppedFile);
};

const modelFileDelete = () => {
    const userLoadedModelFilename = userSettings.getSetting('userLoadedModelFilename');

    dataAccess.deleteDataFromStore();
    
    const msg = document.getElementById('userModelLoad-dragDrop-message');
    msg.innerText = `${userLoadedModelFilename} has been deleted, the default model has been loaded`;

    userSettings.updateSetting("userLoadedModel", false);
    userSettings.updateSetting("userLoadedModelFilename", "");

    document.getElementById('userModelLoad-delete').classList.add('hidden');    
}

export { 
    modelFileLoad,
    modelFileDelete
}; 