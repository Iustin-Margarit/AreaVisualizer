import { REFERENCES } from '../data/references.js';
import { objectName } from '../i18n/index.js';

const size = r => Math.max(r.w, r.d, r.h);

// Picks objects that read well next to an area whose longest side is `span` meters:
// not so small they vanish, not so big they dwarf it. Pinned objects (the person) come first.
export function pickReferences(span, { limit = 3, catalog = REFERENCES } = {}) {
  const visible = catalog.filter(r => size(r) >= span / 80 && size(r) <= span * 2);
  const target = span / 3;
  const closeness = r => Math.abs(Math.log(size(r) / target));
  const pinned = visible.filter(r => r.pinned);
  const rest = visible.filter(r => !r.pinned).sort((a, b) => closeness(a) - closeness(b));
  return [...pinned, ...rest].slice(0, limit);
}

export const isCatalogId = id => REFERENCES.some(r => r.id === id);

const positive = v => Number.isFinite(v) && v > 0 && v <= 1e7;

// Objects the visitor chose: catalog ids, or their own { name, w, d, h } (meters), drawn as boxes.
export const isObjectToken = t =>
  (typeof t === 'string' && isCatalogId(t)) ||
  (!!t && typeof t === 'object' && typeof t.name === 'string' && t.name.trim().length > 0 && t.name.length <= 40 &&
    [t.w, t.d, t.h].every(positive));

// A catalog object with its name in the visitor's language.
export const named = ref => ({ ...ref, name: objectName(ref.id) });

// Tokens → reference objects; each keeps its `token` so the list can be edited and saved again.
export const resolveObjects = tokens => tokens.map((token, i) =>
  typeof token === 'string'
    ? { ...named(REFERENCES.find(r => r.id === token)), token }
    : { id: `custom-${i}`, name: token.name.trim(), kind: 'box', w: token.w, d: token.d, h: token.h, custom: true, token });

// The one measurement worth printing beside an object: its height, or its length if it's long and
// low (unless the data asks for the height, as for a mountain).
export const keyDimension = ({ w, d, h, show }) =>
  show === 'height' || h >= Math.max(w, d) / 2 ? { symbol: '↕', value: h } : { symbol: '↔', value: Math.max(w, d) };
