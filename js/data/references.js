import { MODELS } from './models.js';

// Objects drawn next to the area, with real-world dimensions in meters (names in js/i18n/).
// w = width (x, the length for vehicles), d = depth (z), h = height (y). `kind` tells views how
// to draw an object without a downloaded model; unknown kinds fall back to a box. `pinned`
// objects are always shown when they're visible. `show: 'height'` prints the height in labels
// even for wide things (a mountain). Together they cover every scale from ~1 cm² to beyond
// Earth's surface.
//
// Objects with a downloaded model (data/models.js) give only the measurement the model is scaled
// to — height or length — and take the other two from the model's own proportions.
const RAW = [
  { id: 'coin',      kind: 'coin',     w: 0.024 },
  { id: 'phone',     kind: 'phone',    w: 0.15 },
  { id: 'chair',     kind: 'chair',    h: 0.9 },
  { id: 'dog',       kind: 'dog',      w: 0.8 },
  { id: 'person',    kind: 'person',   h: 1.75, w: 0.5, d: 0.3, pinned: true },
  { id: 'car',       kind: 'car',      w: 4.5 },
  { id: 'tree',      kind: 'tree',     h: 10 },
  { id: 'bus',       kind: 'bus',      w: 12 },
  { id: 'house',     kind: 'house',    h: 8 },
  { id: 'apartment', kind: 'building', h: 30 },
  { id: 'airliner',  kind: 'plane',    w: 73.9 },     // Boeing 777 length
  { id: 'stadium',   kind: 'stadium',  w: 230,   d: 190,  h: 50 },
  { id: 'eiffel',    kind: 'tower',    w: 125,   d: 125,  h: 330 },
  { id: 'ship',      kind: 'ship',     w: 365,   d: 48,   h: 70 },
  { id: 'burj',      kind: 'spire',    w: 109,   d: 126,  h: 828 },
  { id: 'goldengate', kind: 'bridge', w: 2737, d: 27,   h: 227 },
  { id: 'fuji',      kind: 'mountain', w: 35000, d: 35000, h: 3776, show: 'height' },
  { id: 'moon',      kind: 'moon',     w: 3474800, d: 3474800, h: 3474800 },
];

// A model's size [x, y, z] once laid down and turned so its length runs along x.
export function orientedSize({ size: [x, y, z], lay, turn }) {
  const [a, b, c] = lay ? [x, z, y] : [x, y, z];
  return turn % 180 ? [c, b, a] : [a, b, c];
}

function withModelSize(ref) {
  const model = MODELS[ref.id];
  if (!model) return ref;
  const [x, y, z] = orientedSize(model);
  const scale = model.fit === 'h' ? ref.h / y : ref.w / x;
  return { w: x * scale, d: z * scale, h: y * scale, ...ref };
}

export const REFERENCES = RAW.map(withModelSize);
