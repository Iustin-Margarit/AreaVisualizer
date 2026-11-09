import { REFERENCES } from '../data/references.js';
import { objectName } from '../i18n/index.js';

const size = r => Math.max(r.w, r.d, r.h);

// Picks objects that read well next to an area whose longest side is `span` meters:
// not so small they vanish, not so big they dwarf it. Pinned objects (the person) come first.
export function pickReferences(span, { limit = 3, catalog = REFERENCES.filter(r => !r.manual) } = {}) {
  const visible = catalog.filter(r => size(r) >= span / 80 && size(r) <= span * 2);
  const target = span / 3;
  const closeness = r => Math.abs(Math.log(size(r) / target));
  const pinned = visible.filter(r => r.pinned);
  const rest = visible.filter(r => !r.pinned).sort((a, b) => closeness(a) - closeness(b));
  return [...pinned, ...rest].slice(0, limit);
}

export const isCatalogId = id => REFERENCES.some(r => r.id === id);

const positive = v => Number.isFinite(v) && v > 0 && v <= 1e7;

const isPlace = t => (t.x === undefined && t.z === undefined) || [t.x, t.z].every(v => Number.isFinite(v) && Math.abs(v) <= 1e9);
const isTurn = r => r === undefined || (Number.isFinite(r) && r >= 0 && r < 360);
const isName = name => typeof name === 'string' && name.trim().length > 0 && name.length <= 40;
const isOwnSize = t => (t.w === undefined && t.d === undefined && t.h === undefined) || [t.w, t.d, t.h].every(positive);

// Objects the visitor chose: catalog ids, or { id, w?, d?, h? } for a catalog object with sizes of
// its own, or { name, w, d, h } for their own (meters), drawn as boxes. The last two can also say
// where they stand and how they're turned: { x, z, r }.
export const isObjectToken = t =>
  (typeof t === 'string' && isCatalogId(t)) ||
  (!!t && typeof t === 'object' && isPlace(t) && isTurn(t.r) &&
    (typeof t.id === 'string' ? isCatalogId(t.id) && isOwnSize(t) : isName(t.name) && [t.w, t.d, t.h].every(positive)));

// A catalog object with its name in the visitor's language.
export const named = ref => ({ ...ref, name: objectName(ref.id) });

// Tokens → reference objects; each keeps its `token` so the list can be edited and saved again.
export const resolveObjects = tokens => tokens.map((token, i) => {
  const catalog = REFERENCES.find(r => r.id === (typeof token === 'string' ? token : token.id));
  if (typeof token === 'string') return { ...named(catalog), token };
  const place = token.x === undefined ? {} : { x: token.x, z: token.z, placed: true };
  if (!catalog) return { id: `custom-${i}`, name: token.name.trim(), kind: 'box', w: token.w, d: token.d, h: token.h, custom: true, r: token.r ?? 0, token, ...place };
  const resized = token.w === undefined ? {} : { w: token.w, d: token.d, h: token.h, resized: true };
  return { ...named(catalog), ...resized, r: token.r ?? 0, token, ...place };
});

// The one measurement worth printing beside an object: its height, or its length if it's long and
// low (unless the data asks for the height, as for a mountain).
export const keyDimension = ({ w, d, h, show }) =>
  show === 'height' || h >= Math.max(w, d) / 2 ? { symbol: '↕', value: h } : { symbol: '↔', value: Math.max(w, d) };
