import { UNITS, LENGTH_UNITS, SYSTEM_UNITS, isUnit, isLengthUnit } from './core/units.js';
import { isShape } from './core/shapes.js';
import { isLandmarkChoice } from './core/landmarks.js';
import { isObjectToken } from './core/references.js';
import { inSystem } from './core/input.js';
import { VIEWS } from './views/registry.js';
import { isLanguage } from './i18n/index.js';

export const AREA_COLORS = ['blue', 'green', 'purple', 'pink', 'teal'];

export const UNIT_SYSTEMS = ['metric', 'imperial', 'both'];

export const DEFAULTS = {
  // The size: typed as sides ('dims') or as an area ('area') — see core/input.js.
  mode: 'dims',
  value: 1, unit: 'm2', shape: 'rectangle', ratio: 1,
  width: 1, length: 1, lengthUnit: 'm',
  height: null, heightUnit: 'm', // optional: how tall the area is (a room, a box); null when flat
  view: '3d',                 // falls back to 2D where 3D can't run (main.js)
  compare: 'none',            // landmark drawn next to the area: 'none' or the id the visitor picked
  objects: null,              // null: objects picked to suit the size; or the visitor's own list
  // Display settings (remembered per visitor, not part of links).
  lang: 'en',                 // interface language (js/i18n/)
  units: 'metric',            // measuring system everything is shown in; 'both' shows the two side by side
  theme: 'auto',              // 'auto' follows the system
  grid: true, labels: true, measures: true, shadows: true, glow: true,
  color: 'blue',
};

const positive = max => v => Number.isFinite(v) && v > 0 && v <= max;
const boolean = v => v === true || v === false;

export const VALIDATORS = {
  mode: v => v === 'area' || v === 'dims',
  value: positive(1e15),        // 1e15 m² is about twice the Earth's surface
  unit: isUnit,
  shape: isShape,
  ratio: v => Number.isFinite(v) && v >= 0.01 && v <= 100,
  width: positive(1e8),
  length: positive(1e8),
  lengthUnit: isLengthUnit,
  height: v => v === null || positive(1e8)(v),
  heightUnit: isLengthUnit,
  view: id => VIEWS.some(v => v.id === id),
  compare: isLandmarkChoice,
  objects: v => v === null || (Array.isArray(v) && v.length <= 12 && v.every(isObjectToken)),
  lang: isLanguage,
  units: v => UNIT_SYSTEMS.includes(v),
  theme: v => ['auto', 'light', 'dark'].includes(v),
  grid: boolean,
  labels: boolean,
  measures: boolean,
  shadows: boolean,
  glow: boolean,
  color: v => AREA_COLORS.includes(v),
};

// Keeps only known fields with valid values — for anything read from URLs or storage.
export function sanitize(partial) {
  const out = {};
  for (const [field, valid] of Object.entries(VALIDATORS)) {
    if (partial && field in partial && valid(partial[field])) out[field] = partial[field];
  }
  return out;
}

// Brings older links up to date ('square' became a rectangle with equal sides) and shows the size
// in the visitor's measuring system — a link made in feet opens in meters for a metric visitor.
export function normalize(state) {
  let s = state;
  if (s.shape === 'square') s = { ...s, shape: 'rectangle', ratio: 1, length: s.width };
  return s.units === 'both' ? s : { ...s, ...inSystem(s, s.units) };
}

// The first size someone sees, in meters or feet: a room on a phone (beside a person, a chair, a
// dog), a small house's floor on a wider screen (a person, a car, a tree).
const FIRST_SIDES = { phone: { m: [4, 5], ft: [12, 15] }, wide: { m: [10, 10], ft: [30, 30] } };

// Locale picks the measuring system and language, remembered preferences override them, a shared
// link sets the size. The starting numbers follow the units, so nobody lands on "1 ft²".
export function initialState({ imperial = false, lang = 'en', phone = false, prefs = {}, url = {} } = {}) {
  const system = imperial ? 'imperial' : 'metric';
  const base = { ...DEFAULTS, ...SYSTEM_UNITS[system], units: system, lang, ...sanitize(prefs) };
  const [width, length] = FIRST_SIDES[phone ? 'phone' : 'wide'][base.lengthUnit] ?? LENGTH_UNITS[base.lengthUnit].start;
  return normalize({ ...base, value: UNITS[base.unit].start, width, length, ...sanitize(url) });
}

// Minimal observable store. `set` merges a patch and notifies subscribers.
export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      listeners.forEach(fn => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
