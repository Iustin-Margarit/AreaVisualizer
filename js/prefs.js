// Per-visitor conveniences kept in this browser only: language, measuring system, units, view and
// display settings.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded.
const KEY = 'areavisualizer:prefs';
const REMEMBERED = ['lang', 'units', 'unit', 'shape', 'lengthUnit', 'view', 'theme', 'grid', 'labels', 'measures', 'shadows', 'color'];

// Regions whose everyday area units are square feet and acres.
const IMPERIAL_REGION = /-(US|LR|MM)\b/i;

export function prefersImperial(languages = globalThis.navigator?.languages ?? []) {
  return IMPERIAL_REGION.test(languages[0] ?? '');
}

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function savePrefs(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(REMEMBERED.map(k => [k, state[k]]))));
  } catch {
    // Not saving preferences is fine.
  }
}
