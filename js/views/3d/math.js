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

export const MIN_CELL_PX = 12;

// Mirrors the ground shader: where the ground shows `unitsPerPx` grid units per pixel, the grid
// draws lines every `fine` units (fading in by `fade`, 0–1) and every `coarse` = 10 × fine.
export function gridLevels(unitsPerPx, minCellPx = MIN_CELL_PX) {
  const lod = Math.log10(unitsPerPx * minCellPx);
  const level = Math.ceil(lod);
  return { fine: 10 ** level, coarse: 10 ** (level + 1), fade: level - lod };
}
