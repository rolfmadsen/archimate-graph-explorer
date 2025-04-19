// src/components/filterState.js

// Central, reactive facet state
let state = {
  layers: ["Business", "Application", "Technology"], // defaults
  elementTypes: [],          // empty ⇒ no restriction
  relationshipTypes: [],     // empty ⇒ no edges
};

const subscribers = [];

/** deep‑copy read‑only snapshot */
export function getState() {
  return JSON.parse(JSON.stringify(state));
}

/** merge & notify */
export function setState(partial) {
  state = { ...state, ...partial };
  // —— DEBUG: log every state change
  console.log("Facet state updated:", state);
  subscribers.forEach(cb => cb(getState()));
}

/** register change listener */
export function subscribe(cb) {
  subscribers.push(cb);
}