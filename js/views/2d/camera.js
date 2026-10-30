// 2D camera: world center (cx, cy) in meters and zoom as meters-per-pixel (mpp).
// Screen origin is the top-left of a viewport `vw` × `vh` pixels.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const toScreen = (cam, vw, vh, x, y) => [(x - cam.cx) / cam.mpp + vw / 2, (y - cam.cy) / cam.mpp + vh / 2];

export const toWorld = (cam, vw, vh, px, py) => [cam.cx + (px - vw / 2) * cam.mpp, cam.cy + (py - vh / 2) * cam.mpp];

// Frames `bounds` ({minX, maxX, minZ, maxZ}) inside the viewport minus per-side padding in pixels.
export function fitCamera(bounds, vw, vh, pad) {
  const bw = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const bh = Math.max(bounds.maxZ - bounds.minZ, 1e-9);
  const aw = Math.max(vw - pad.left - pad.right, 1);
  const ah = Math.max(vh - pad.top - pad.bottom, 1);
  const mpp = Math.max(bw / aw, bh / ah);
  return {
    cx: (bounds.minX + bounds.maxX) / 2 - ((pad.left - pad.right) / 2) * mpp,
    cy: (bounds.minZ + bounds.maxZ) / 2 - ((pad.top - pad.bottom) / 2) * mpp,
    mpp,
  };
}

export const panBy = (cam, dx, dy) => ({ ...cam, cx: cam.cx - dx * cam.mpp, cy: cam.cy - dy * cam.mpp });

// Zooms by `factor` (>1 = in) keeping the world point under pixel (px, py) fixed.
export function zoomAt(cam, factor, px, py, vw, vh, [minMpp, maxMpp] = [0, Infinity]) {
  const mpp = clamp(cam.mpp / factor, minMpp, maxMpp);
  const [wx, wy] = toWorld(cam, vw, vh, px, py);
  return { mpp, cx: wx - (px - vw / 2) * mpp, cy: wy - (py - vh / 2) * mpp };
}

// Stops the content from being dragged completely out of view.
export function clampPan(cam, bounds, vw, vh) {
  const hw = (vw / 2) * cam.mpp * 0.9;
  const hh = (vh / 2) * cam.mpp * 0.9;
  return {
    ...cam,
    cx: clamp(cam.cx, bounds.minX - hw, bounds.maxX + hw),
    cy: clamp(cam.cy, bounds.minZ - hh, bounds.maxZ + hh),
  };
}
