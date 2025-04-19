// src/settings.js

/*
  modelPath is the file path to the ArchiMate model.
  IMPORTANT: must be in the ArchiMate Model Exchange File Format:
    https://www.opengroup.org/open-group-archimate-model-exchange-file-format
    (in Archi: File → Export → Model to Open Exchange File…)
*/
export const modelPath = "/data/ArchiSurance.archimate";

/*
  Show or hide the header bar
*/
export const header_Enabled = true;

/*
  Feature switches
*/
export const userSettings_Enabled     = true;
export const dragDropModel_Enabled    = true;

/* ── DEPRECATED (required by graphNode.js until it’s cleaned up) ── */
export const nodeProperty_StereotypeLabel_Enabled             = false;
export const nodeProperty_DataClassificationLevelStyling_Enabled = false;
export const nodeProperty_DataClassificationLevelStyling_ColourMap = {};