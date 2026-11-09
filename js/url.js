import { sanitize } from './state.js';

// Short query keys keep shared links tidy:
//   ?m=area&a=50&s=square&u=m2&lu=m&v=2d
//   ?m=dims&w=4&l=5&s=rectangle&u=m2&lu=m&h=2.5&hu=m&v=3d&c=tennis&o=person,car,~Sofa:2:0.9:0.8
const KEYS = {
  mode: 'm', value: 'a', width: 'w', length: 'l', shape: 's', ratio: 'r',
  unit: 'u', lengthUnit: 'lu', height: 'h', heightUnit: 'hu', view: 'v', compare: 'c', objects: 'o',
};
const NUMERIC = new Set(['value', 'ratio', 'width', 'length', 'height']);

// Objects: catalog ids ("car"), with sizes of their own ("car=4:1.8:1.4"), or "~name:w:d:h" for the
// visitor's own (meters); any of them can end with where it stands ("@x:z" or "@x:z:turn").
// "none" for an empty list.
function encodeObject(t) {
  if (typeof t === 'string') return t;
  const head = t.id
    ? `${t.id}${t.w === undefined ? '' : `=${t.w}:${t.d}:${t.h}`}`
    : `~${encodeURIComponent(t.name)}:${t.w}:${t.d}:${t.h}`;
  return `${head}${t.x === undefined ? '' : `@${t.x}:${t.z}${t.r ? `:${t.r}` : ''}`}`;
}

function decodeObject(text) {
  const [head, place] = text.split('@');
  let token = head;
  if (head.startsWith('~')) {
    const [name, w, d, h] = head.slice(1).split(':');
    token = { name: decodeURIComponent(name), w: Number(w), d: Number(d), h: Number(h) };
  } else if (head.includes('=')) {
    const [id, size] = head.split('=');
    const [w, d, h] = size.split(':').map(Number);
    token = { id, w, d, h };
  }
  if (!place) return token;
  const [x, z, r = 0] = place.split(':').map(Number);
  return { ...(typeof token === 'string' ? { id: token } : token), x, z, r };
}

const encodeObjects = list => (list.length ? list.map(encodeObject).join(',') : 'none');

function decodeObjects(text) {
  if (text === 'none') return [];
  try {
    return text.split(',').map(decodeObject);
  } catch {
    return undefined; // malformed — sanitize drops it
  }
}

// Returns only the valid fields found in the query string.
export function readUrl(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  const raw = {};
  for (const [field, key] of Object.entries(KEYS)) {
    if (!params.has(key)) continue;
    const text = params.get(key);
    raw[field] = field === 'objects' ? decodeObjects(text) : NUMERIC.has(field) ? Number(text) : text;
  }
  if (params.has('cp')) { // where the landmark in `c` was moved to: x:z:turn
    const [x, z, r = 0] = params.get('cp').split(':').map(Number);
    raw.comparePlace = { id: raw.compare, x, z, r };
  }
  if (params.has('p')) raw.points = params.get('p').split(';').map(p => p.split(',').map(Number)); // x,z;x,z…
  if (params.has('b')) { // second area: shape:width:length:unit, then :x:z:turn once moved
    const [shape, width, length, unit, x, z, r] = params.get('b').split(':');
    raw.second = { shape, width: Number(width), length: Number(length), unit, ...(x === undefined ? {} : { x: Number(x), z: Number(z), r: Number(r ?? 0) }) };
  }
  const out = sanitize(raw);
  // Older links: no `m` meant an area, and sides links without a shape were rectangles.
  if (!out.mode && 'value' in out) out.mode = 'area';
  if (out.mode === 'dims' && !out.shape && 'length' in out) out.shape = 'rectangle';
  return out;
}

export function toQuery(state) {
  const params = new URLSearchParams({ [KEYS.mode]: state.mode });
  const rectangle = state.shape === 'rectangle';
  if (state.mode === 'area') {
    params.set(KEYS.value, state.value);
  } else {
    params.set(KEYS.width, state.width);
    if (rectangle) params.set(KEYS.length, state.length);
  }
  params.set(KEYS.shape, state.shape);
  if (state.mode === 'area' && rectangle) params.set(KEYS.ratio, state.ratio);
  params.set(KEYS.unit, state.unit);
  params.set(KEYS.lengthUnit, state.lengthUnit);
  if (state.height) {
    params.set(KEYS.height, state.height);
    params.set(KEYS.heightUnit, state.heightUnit);
  }
  params.set(KEYS.view, state.view);
  if (state.compare !== 'none') params.set(KEYS.compare, state.compare);
  if (state.compare !== 'none' && state.comparePlace?.id === state.compare) {
    const { x, z, r } = state.comparePlace;
    params.set('cp', `${x}:${z}:${r}`);
  }
  if (state.objects) params.set(KEYS.objects, encodeObjects(state.objects));
  if (state.shape === 'custom' && state.points) params.set('p', state.points.map(p => p.join(',')).join(';'));
  if (state.second) {
    const { shape, width, length, unit, x, z, r } = state.second;
    params.set('b', [shape, width, length, unit, ...(x === undefined ? [] : [x, z, r])].join(':'));
  }
  return `?${params}`;
}

export function writeUrl(state) {
  history.replaceState(null, '', toQuery(state));
}
