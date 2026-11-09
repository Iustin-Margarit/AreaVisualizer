// Squares are rectangles with equal sides; older links and settings may still say 'square'.
// 'custom' is an outline the visitor made: its corners are in `points`.
export const SHAPES = {
  rectangle: { label: 'Rectangle' },
  circle:    { label: 'Circle' },
  custom:    { label: 'Custom' },
};

export const isShape = id => id === 'square' || Object.hasOwn(SHAPES, id);

export const MAX_CORNERS = 48;

// Turns an area into concrete dimensions (meters). `width` is along x, `depth` along z, and the
// longer side always runs across. For rectangles, `ratio` is the second side ÷ the first.
export function shapeDimensions(areaM2, shape = 'rectangle', ratio = 1) {
  if (shape === 'circle') {
    const radius = Math.sqrt(areaM2 / Math.PI);
    return { type: 'circle', radius, width: 2 * radius, depth: 2 * radius };
  }
  const r = shape === 'rectangle' ? Math.max(ratio, 1 / ratio) : 1;
  const depth = Math.sqrt(areaM2 / r);
  return { type: r === 1 ? 'square' : 'rectangle', width: depth * r, depth };
}

const signedArea = points => points.reduce((sum, [x, z], i) => {
  const [nx, nz] = points[(i + 1) % points.length];
  return sum + x * nz - nx * z;
}, 0) / 2;

export const polygonArea = points => Math.abs(signedArea(points));

const round = v => Number(v.toFixed(4)) + 0;

const turn = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const between = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);

function sidesMeet(a, b, c, d) {
  const [t1, t2, t3, t4] = [turn(a, b, c), turn(a, b, d), turn(c, d, a), turn(c, d, b)];
  return (t1 !== t2 && t3 !== t4) || (!t1 && between(a, b, c)) || (!t2 && between(a, b, d)) || (!t3 && between(c, d, a)) || (!t4 && between(c, d, b));
}

// One side doubling back along the one before it, or a corner placed on top of the last.
const foldsBack = (a, b, c) => !turn(a, b, c) && (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]) >= 0;

// Whether an outline's sides cross or touch: such a shape has no meaningful inside or area.
// `closed` false: the outline isn't finished, so its last corner isn't joined to its first yet.
export function crosses(points, closed = true) {
  const n = points.length;
  const sides = closed ? n : n - 1;
  for (let i = 0; i < sides; i++) {
    if (i + 1 < sides || closed) {
      if (foldsBack(points[i], points[(i + 1) % n], points[(i + 2) % n])) return true;
    }
    for (let j = i + 2; j < sides; j++) {
      if (closed && i === 0 && j === n - 1) continue; // they share the first corner
      if (sidesMeet(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

// Whether one corner can go to `to` without the outline crossing itself. Only the two sides at that
// corner change, so this stays quick while a corner follows a finger round a complicated shape.
export function cornerFits(points, index, to) {
  const n = points.length;
  const at = i => points[(i + n) % n];
  const [before, after] = [at(index - 1), at(index + 1)];
  if (foldsBack(at(index - 2), before, to) || foldsBack(before, to, after) || foldsBack(to, after, at(index + 2))) return false;
  for (let k = index + 1; k < index + n - 1; k++) { // every side not touching this corner
    if (k !== index + n - 2 && sidesMeet(before, to, at(k), at(k + 1))) return false; // that one ends at `before`
    if (k !== index + 1 && sidesMeet(to, after, at(k), at(k + 1))) return false; // that one starts at `after`
  }
  return true;
}

// As far toward `target` as the corner can go: it slides along whatever is in the way instead of stopping.
export function reachableCorner(points, index, target) {
  if (cornerFits(points, index, target)) return target;
  let [free, blocked] = [points[index], target];
  for (let i = 0; i < 6; i++) {
    const middle = [(free[0] + blocked[0]) / 2, (free[1] + blocked[1]) / 2];
    if (cornerFits(points, index, middle)) free = middle;
    else blocked = middle;
  }
  return free;
}

const isInside = ([x, z], points) => points.reduce((inside, [ax, az], i) => {
  const [bx, bz] = points[(i + 1) % points.length];
  return (az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax) ? !inside : inside;
}, false);

function distanceToSide([x, z], [ax, az], [bx, bz]) {
  const [dx, dz] = [bx - ax, bz - az];
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - k * dx, z - az - k * dz);
}

// The roomiest spot inside an outline, for its label: the middle of a notched shape can be outside it.
export function innerPoint(points) {
  const [xs, zs] = [points.map(p => p[0]), points.map(p => p[1])];
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const [midX, midZ] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const STEPS = 25;
  let best = [midX, midZ], score = -Infinity;
  for (let i = 0; i < STEPS; i++) {
    for (let j = 0; j < STEPS; j++) {
      const spot = [minX + ((i + 0.5) / STEPS) * (maxX - minX), minZ + ((j + 0.5) / STEPS) * (maxZ - minZ)];
      if (!isInside(spot, points)) continue;
      let room = Infinity;
      for (let k = 0; k < points.length; k++) room = Math.min(room, distanceToSide(spot, points[k], points[(k + 1) % points.length]));
      const value = room - 0.02 * Math.hypot(spot[0] - midX, spot[1] - midZ); // of two equal spots, the more central
      if (value > score) [best, score] = [spot, value];
    }
  }
  return best;
}

// Moves an outline so the middle of its bounding box is at (0, 0); `cx`, `cz` is how far that was.
export function centerPolygon(points) {
  const [xs, zs] = [points.map(p => p[0]), points.map(p => p[1])];
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  return { points: points.map(([x, z]) => [round(x - cx), round(z - cz)]), cx, cz };
}

// A custom outline as the dimensions everything else works with.
export function polygonDimensions(raw) {
  const { points } = centerPolygon(raw);
  const [xs, zs] = [points.map(p => p[0]), points.map(p => p[1])];
  return { type: 'polygon', points, width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) };
}

// An L: this rectangle with a corner taken out.
export function lShape(width, depth, notch = 0.45) {
  const [hw, hd, nw, nd] = [width / 2, depth / 2, width * notch, depth * notch];
  return centerPolygon([[-hw, -hd], [hw - nw, -hd], [hw - nw, -hd + nd], [hw, -hd + nd], [hw, hd], [-hw, hd]]).points;
}

const TEMPLATES = {
  l: lShape,
  t: (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 10], [w / 5, -d / 10], [w / 5, d / 2], [-w / 5, d / 2], [-w / 5, -d / 10], [-w / 2, -d / 10]],
  u: (w, d) => [[-w / 2, -d / 2], [-w / 6, -d / 2], [-w / 6, d / 10], [w / 6, d / 10], [w / 6, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]],
  triangle: (w, d) => [[0, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]],
};

// A ready-made outline with these proportions and this area.
export function shapeTemplate(name, width, depth, areaM2) {
  const outline = TEMPLATES[name](width, depth);
  const scale = Math.sqrt(areaM2 / polygonArea(outline));
  return centerPolygon(outline.map(([x, z]) => [x * scale, z * scale])).points;
}

// The outline moved outward by `distance` (inward if negative), for the rim drawn along it.
export function offsetPolygon(points, distance) {
  const sign = signedArea(points) > 0 ? 1 : -1;
  const normal = ([ax, az], [bx, bz]) => {
    const length = Math.hypot(bx - ax, bz - az) || 1;
    return [(sign * (bz - az)) / length, (-sign * (bx - ax)) / length];
  };
  return points.map((point, i) => {
    const n1 = normal(points[(i + points.length - 1) % points.length], point);
    const n2 = normal(point, points[(i + 1) % points.length]);
    const [mx, mz] = [n1[0] + n2[0], n1[1] + n2[1]];
    const length = Math.hypot(mx, mz) || 1;
    const reach = Math.min(distance / Math.max((mx * n1[0] + mz * n1[1]) / length, 0.34), Math.abs(distance) * 3);
    return [point[0] + (mx / length) * reach, point[1] + (mz / length) * reach];
  });
}
