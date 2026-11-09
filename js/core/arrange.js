// Where objects stand and whether they fit: plain geometry on the ground, in meters. An object is
// { x, z, w, d, r }: its centre, width, depth, and its turn in degrees (clockwise seen from above).

const rad = deg => (deg * Math.PI) / 180;

export const tidy = n => Number(n.toFixed(4)) + 0; // to a tenth of a millimeter; + 0 turns -0 into 0

// Half the width and depth of the upright box around a turned object.
export function footprint({ w, d, r = 0 }) {
  const [c, s] = [Math.abs(Math.cos(rad(r))), Math.abs(Math.sin(rad(r)))];
  return { hx: (c * w + s * d) / 2, hz: (s * w + c * d) / 2 };
}

export function corners({ x, z, w, d, r = 0 }) {
  const [c, s] = [Math.cos(rad(r)), Math.sin(rad(r))];
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => {
    const [px, pz] = [(a * w) / 2, (b * d) / 2];
    return [x + px * c - pz * s, z + px * s + pz * c];
  });
}

const axes = ({ r = 0 }) => {
  const [c, s] = [Math.cos(rad(r)), Math.sin(rad(r))];
  return [[c, s], [-s, c]];
};

const shadow = (points, [ax, az]) => {
  const along = points.map(([x, z]) => x * ax + z * az);
  return [Math.min(...along), Math.max(...along)];
};

// Whether two objects overlap (two turned rectangles; standing flush against each other is fine).
export function overlap(a, b) {
  const [pa, pb] = [corners(a), corners(b)];
  const margin = 1e-4 * Math.min(a.w, a.d, b.w, b.d);
  return [...axes(a), ...axes(b)].every(axis => {
    const [a0, a1] = shadow(pa, axis);
    const [b0, b1] = shadow(pb, axis);
    return Math.min(a1, b1) - Math.max(a0, b0) > margin;
  });
}

function insidePolygon(points, x, z) {
  let inside = false;
  points.forEach(([ax, az], i) => {
    const [bx, bz] = points[(i + 1) % points.length];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  });
  return inside;
}

function distanceToEdges(points, x, z) {
  return Math.min(...points.map(([ax, az], i) => {
    const [bx, bz] = points[(i + 1) % points.length];
    const [ex, ez] = [bx - ax, bz - az];
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    return Math.hypot(x - ax - t * ex, z - az - t * ez);
  }));
}

// How far a point lies inside an object (0 if it doesn't).
function depthInside({ x, z, w, d, r = 0 }, px, pz) {
  const [c, s] = [Math.cos(rad(r)), Math.sin(rad(r))];
  const [lx, lz] = [(px - x) * c + (pz - z) * s, -(px - x) * s + (pz - z) * c];
  return Math.max(0, Math.min(w / 2 - Math.abs(lx), d / 2 - Math.abs(lz)));
}

// A custom outline can also dent an object from inside, where one of its corners pokes in.
function overPolygon(object, points) {
  const outside = corners(object).filter(([x, z]) => !insidePolygon(points, x, z)).map(([x, z]) => distanceToEdges(points, x, z));
  return Math.max(0, ...outside, ...points.map(([x, z]) => depthInside(object, x, z)));
}

// How far an object pokes out past the edge of the area (0 when it's inside).
export function overEdge(object, shape) {
  if (shape.type === 'polygon') return overPolygon(object, shape.points);
  const past = corners(object).map(([x, z]) => (shape.type === 'circle'
    ? Math.hypot(x, z) - shape.radius
    : Math.max(Math.abs(x) - shape.width / 2, Math.abs(z) - shape.depth / 2)));
  return Math.max(0, ...past);
}

function touchesArea(object, shape) {
  if (shape.type === 'polygon') {
    return insidePolygon(shape.points, object.x, object.z) ||
      corners(object).some(([x, z]) => insidePolygon(shape.points, x, z)) ||
      shape.points.some(([x, z]) => depthInside(object, x, z) > 0);
  }
  if (shape.type !== 'circle') return overlap(object, { x: 0, z: 0, w: shape.width, d: shape.depth });
  // The area's centre, seen from the object: its distance to the object's nearest point.
  const [c, s] = [Math.cos(rad(object.r ?? 0)), Math.sin(rad(object.r ?? 0))];
  const lx = -object.x * c - object.z * s;
  const lz = object.x * s - object.z * c;
  return Math.hypot(Math.max(Math.abs(lx) - object.w / 2, 0), Math.max(Math.abs(lz) - object.d / 2, 0)) < shape.radius;
}

// { state: 'inside' | 'edge' (with `over`) | 'overlap' (with `with`) | 'outside' }.
export function fitStatus(object, shape, others = []) {
  if (!touchesArea(object, shape)) return { state: 'outside' };
  const hit = others.find(other => overlap(object, other));
  if (hit) return { state: 'overlap', with: hit };
  const over = overEdge(object, shape);
  return over > 1e-4 * Math.max(object.w, object.d) ? { state: 'edge', over } : { state: 'inside' };
}

// Pulls an object flush against the area's edges when it's within `tolerance` of them.
export function snapToEdges(object, shape, tolerance) {
  if (shape.type === 'circle' || shape.type === 'polygon') return { x: object.x, z: object.z };
  const { hx, hz } = footprint(object);
  const near = (value, half, own) => [half - own, own - half].find(edge => Math.abs(value - edge) < tolerance) ?? value;
  return { x: near(object.x, shape.width / 2, hx), z: near(object.z, shape.depth / 2, hz) };
}

export const tokenFields = token => (typeof token === 'string' ? { id: token } : { ...token });

// The list of objects with each pinned where it stands now, and `change` applied to one of them.
// Pinning them all means moving one never makes the others shuffle along.
export function arrangedTokens(references, index = -1, change = {}) {
  return references.map((ref, i) => ({
    ...tokenFields(ref.token), x: tidy(ref.x), z: tidy(ref.z), r: ref.r ?? 0, ...(i === index ? change : {}),
  }));
}
