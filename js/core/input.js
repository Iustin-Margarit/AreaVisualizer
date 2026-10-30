import { UNITS, LENGTH_UNITS, COUNTERPART, toM2, fromM2 } from './units.js';
import { shapeDimensions } from './shapes.js';

// The size is entered either as sides (mode 'dims') or as an area (mode 'area'); whichever was
// typed last is the truth and the other is derived. With sides, a rectangle is `width` × `length`
// (equal sides make a square) and a circle uses `width` as its diameter. With an area, a
// rectangle keeps the proportions `ratio` = second side ÷ first.

export const systemOf = state =>
  state.mode === 'dims' ? LENGTH_UNITS[state.lengthUnit].system : UNITS[state.unit].system;

// Turns the form state into what the rest of the app works with: the area in m², the shape's
// dimensions in meters, and which unit / measuring system to label things in. An optional
// `height` turns the area into a box (or a cylinder): `height` in meters (0 without one) and its
// `volumeM3`.
export function resolveInput(state) {
  const flat = resolveArea(state);
  const height = state.height ? state.height * LENGTH_UNITS[state.heightUnit].toM : 0;
  return { ...flat, height, volumeM3: flat.areaM2 * height };
}

function resolveArea(state) {
  if (state.mode === 'dims') {
    const unit = LENGTH_UNITS[state.lengthUnit];
    const a = state.width * unit.toM;
    const b = state.shape === 'rectangle' ? state.length * unit.toM : a; // 'square' (old links) has one side
    // The longer side runs left–right, like area-mode rectangles.
    const dims = state.shape === 'circle'
      ? { type: 'circle', radius: a / 2, width: a, depth: a }
      : { type: a === b ? 'square' : 'rectangle', width: Math.max(a, b), depth: Math.min(a, b) };
    const areaM2 = dims.type === 'circle' ? Math.PI * dims.radius ** 2 : dims.width * dims.depth;
    return { areaM2, dims, areaUnit: state.unit, system: unit.system };
  }
  const areaM2 = toM2(state.value, state.unit);
  return {
    areaM2,
    dims: shapeDimensions(areaM2, state.shape, state.ratio),
    areaUnit: state.unit,
    system: UNITS[state.unit].system,
  };
}

// The two side fields for derived dims, in a length unit, in the order the visitor's proportions
// put them (`ratio` ≥ 1: shorter side first). A circle shows its diameter in both.
export function sidesOf(dims, lengthUnit, ratio = 1) {
  const toM = LENGTH_UNITS[lengthUnit].toM;
  const [short, long] = [dims.depth / toM, dims.width / toM];
  return ratio >= 1 ? [short, long] : [long, short];
}

// A state patch that puts the input into one measuring system, keeping the same physical size:
// each unit is swapped for its counterpart and the number the visitor typed is converted
// (to 4 significant digits, so 10 m reads 32.81 ft rather than 32.8083989…).
const tidy = n => Number(n.toPrecision(4));

export function inSystem(state, system) {
  const patch = {};
  if (UNITS[state.unit].system !== system) {
    patch.unit = COUNTERPART[state.unit];
    if (state.mode === 'area') patch.value = tidy(fromM2(toM2(state.value, state.unit), patch.unit));
  }
  if (LENGTH_UNITS[state.lengthUnit].system !== system) {
    patch.lengthUnit = COUNTERPART[state.lengthUnit];
    if (state.mode === 'dims') {
      const k = LENGTH_UNITS[state.lengthUnit].toM / LENGTH_UNITS[patch.lengthUnit].toM;
      Object.assign(patch, { width: tidy(state.width * k), length: tidy(state.length * k) });
    }
  }
  if (LENGTH_UNITS[state.heightUnit].system !== system) {
    patch.heightUnit = COUNTERPART[state.heightUnit];
    if (state.height) patch.height = tidy(state.height * LENGTH_UNITS[state.heightUnit].toM / LENGTH_UNITS[patch.heightUnit].toM);
  }
  return patch;
}

// Where a newly added height starts: a room's (2.5 m, 8 ft), or less on a small area so that
// 1 m² becomes a cubic meter and 1 ft² a cubic foot. In `heightUnit`, to 2 significant digits.
export function startHeight(areaM2, heightUnit) {
  const { toM, system } = LENGTH_UNITS[heightUnit];
  const room = system === 'imperial' ? 8 * LENGTH_UNITS.ft.toM : 2.5;
  return Number((Math.min(Math.sqrt(areaM2), room) / toM).toPrecision(2));
}
