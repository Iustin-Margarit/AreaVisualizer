// Plain-array vector math for framing the 3D camera and reading the ground grid (no three.js).

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => {
  const len = Math.hypot(...a) || 1;
  return a.map(v => v / len);
};

// Unit vectors for a camera orbiting `elevation` radians above the ground and `azimuth` radians
// around +y (0 = on the +z side, looking toward -z; positive swings it toward +x).
export function orbitBasis(elevation, azimuth) {
  const toCamera = [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ];
  const forward = toCamera.map(v => -v);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { toCamera, forward, right, up };
}

// Smallest distance from the look-at point, back along `forward`, at which every point (given
// relative to the look-at point) lies inside a frustum with half-angle tangents tanX / tanY.
export function fitDistance(points, { forward, right, up }, tanX, tanY) {
  let d = 0;
  for (const p of points) {
    const depth = dot(p, forward);
    d = Math.max(d, Math.abs(dot(p, right)) / tanX - depth, Math.abs(dot(p, up)) / tanY - depth);
  }
  return d;
}

// fitDistance, but also slides the look-at point (by `shift`) so the points sit centred on screen:
// around their middle in space, a tall object on one side leaves the other half of the view empty.
export function fitCentered(points, basis, tanX, tanY) {
  const { forward, right, up } = basis;
  let shift = [0, 0, 0];
  let distance = 0;
  for (let i = 0; i < 12; i++) {
    const moved = points.map(p => p.map((v, k) => v - shift[k]));
    distance = fitDistance(moved, basis, tanX, tanY);
    const extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const p of moved) {
      const w = distance + dot(p, forward);
      const x = w > 0 ? dot(p, right) / w : 0;
      const y = w > 0 ? dot(p, up) / w : 0;
      extent.minX = Math.min(extent.minX, x);
      extent.maxX = Math.max(extent.maxX, x);
      extent.minY = Math.min(extent.minY, y);
      extent.maxY = Math.max(extent.maxY, y);
    }
    const dx = (extent.minX + extent.maxX) / 2 * distance;
    const dy = (extent.minY + extent.maxY) / 2 * distance;
    shift = shift.map((v, k) => v + right[k] * dx + up[k] * dy);
  }
  return { distance, shift };
}

export const MIN_CELL_PX = 12;

// Mirrors the ground shader: where the ground shows `unitsPerPx` grid units per pixel, the grid
// draws lines every `fine` units (fading in by `fade`, 0–1) and every `coarse` = 10 × fine.
export function gridLevels(unitsPerPx, minCellPx = MIN_CELL_PX) {
  const lod = Math.log10(unitsPerPx * minCellPx);
  const level = Math.ceil(lod);
  return { fine: 10 ** level, coarse: 10 ** (level + 1), fade: level - lod };
}
