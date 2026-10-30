import { sanitize } from './state.js';

// Short query keys keep shared links tidy:
//   ?m=area&a=50&s=square&u=m2&lu=m&v=2d
//   ?m=dims&w=4&l=5&s=rectangle&u=m2&lu=m&h=2.5&hu=m&v=3d&c=tennis&o=person,car,~Sofa:2:0.9:0.8
const KEYS = {
  mode: 'm', value: 'a', width: 'w', length: 'l', shape: 's', ratio: 'r',
  unit: 'u', lengthUnit: 'lu', height: 'h', heightUnit: 'hu', view: 'v', compare: 'c', objects: 'o',
};
const NUMERIC = new Set(['value', 'ratio', 'width', 'length', 'height']);

// Objects: catalog ids, or "~name:w:d:h" for the visitor's own (meters); "none" for an empty list.
const encodeObjects = list => (list.length
  ? list.map(t => (typeof t === 'string' ? t : `~${encodeURIComponent(t.name)}:${t.w}:${t.d}:${t.h}`)).join(',')
  : 'none');

function decodeObjects(text) {
  if (text === 'none') return [];
  try {
    return text.split(',').map(t => {
      if (!t.startsWith('~')) return t;
      const [name, w, d, h] = t.slice(1).split(':');
      return { name: decodeURIComponent(name), w: Number(w), d: Number(d), h: Number(h) };
    });
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
  if (state.objects) params.set(KEYS.objects, encodeObjects(state.objects));
  return `?${params}`;
}

export function writeUrl(state) {
  history.replaceState(null, '', toQuery(state));
}
