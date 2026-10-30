import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitCamera, zoomAt, panBy, clampPan, toScreen, toWorld } from '../js/views/2d/camera.js';
import { gridStep } from '../js/views/2d/grid.js';
import { layoutLabels } from '../js/views/labels.js';
import { KINDS, drawSilhouette } from '../js/views/2d/silhouettes.js';
import { REFERENCES } from '../js/data/references.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const PAD = { top: 50, right: 20, bottom: 70, left: 50 };

test('fitCamera frames the bounds inside the padded viewport', () => {
  const bounds = { minX: -5, maxX: 15, minZ: -5, maxZ: 8 };
  const cam = fitCamera(bounds, 400, 300, PAD);
  const [l, t] = toScreen(cam, 400, 300, bounds.minX, bounds.minZ);
  const [r, b] = toScreen(cam, 400, 300, bounds.maxX, bounds.maxZ);
  assert.ok(l >= PAD.left - 1e-6 && r <= 400 - PAD.right + 1e-6);
  assert.ok(t >= PAD.top - 1e-6 && b <= 300 - PAD.bottom + 1e-6);
  // Tight on the limiting axis: width here (20 m over 330 px vs 13 m over 180 px → height limits).
  close(b - t, 300 - PAD.top - PAD.bottom);
});

test('toWorld inverts toScreen', () => {
  const cam = { cx: 3, cy: -2, mpp: 0.05 };
  const [x, y] = toWorld(cam, 640, 480, ...toScreen(cam, 640, 480, 7.5, 1.25));
  close(x, 7.5);
  close(y, 1.25);
});

test('zoomAt keeps the point under the cursor fixed and respects limits', () => {
  const cam = { cx: 0, cy: 0, mpp: 0.1 };
  const before = toWorld(cam, 400, 400, 300, 100);
  const zoomed = zoomAt(cam, 2, 300, 100, 400, 400);
  close(zoomed.mpp, 0.05);
  const after = toWorld(zoomed, 400, 400, 300, 100);
  close(after[0], before[0]);
  close(after[1], before[1]);
  assert.equal(zoomAt(cam, 100, 0, 0, 400, 400, [0.01, 1]).mpp, 0.01);
  assert.equal(zoomAt(cam, 0.001, 0, 0, 400, 400, [0.01, 1]).mpp, 1);
});

test('panBy moves content with the pointer; clampPan keeps it reachable', () => {
  const cam = { cx: 0, cy: 0, mpp: 0.1 };
  const moved = panBy(cam, 10, -20);
  const [sx, sy] = toScreen(moved, 400, 400, 0, 0);
  close(sx, 210);
  close(sy, 180);
  const far = clampPan({ cx: 1e6, cy: -1e6, mpp: 0.1 }, { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, 400, 400);
  assert.ok(far.cx <= 1 + 200 * 0.1 && far.cy >= -1 - 200 * 0.1);
});

test('gridStep picks round spacings in the right system', () => {
  assert.deepEqual(gridStep(0.8), { step: 1, label: '1 m' });
  assert.equal(gridStep(1.2).label, '2 m');
  assert.equal(gridStep(3).label, '5 m');
  assert.equal(gridStep(0.004).label, '5 mm');
  assert.equal(gridStep(0.02).label, '2 cm');
  assert.equal(gridStep(1500).label, '2 km');
  assert.equal(gridStep(0.2, 'imperial').label, '1 ft');
  assert.equal(gridStep(0.06, 'imperial').label, '3 in');
  assert.equal(gridStep(400, 'imperial').label, '2,000 ft');
  assert.equal(gridStep(700, 'imperial').label, '1 mi');
});

test('layoutLabels keeps labels by their objects and pushes overlaps down', () => {
  const out = layoutLabels([
    { id: 'a', anchorX: 100, anchorY: 50, width: 60 },
    { id: 'b', anchorX: 110, anchorY: 50, width: 60 }, // same spot as a → one line down
    { id: 'c', anchorX: 300, anchorY: 40, width: 60 }, // clear of everything
    { id: 'd', anchorX: 120, anchorY: 50, width: 20 }, // collides with a and b → two lines down
    { id: 'e', anchorX: 115, anchorY: 200, width: 60 }, // overlaps horizontally, but far lower
  ], { gap: 8, lineHeight: 16, offset: 16 });
  const byId = Object.fromEntries(out.map(o => [o.id, o]));
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map(id => byId[id].shift), [0, 1, 0, 2, 0]);
  assert.equal(byId.a.y, 66);
  assert.equal(byId.c.y, 56);
  assert.equal(byId.e.y, 216);
  assert.deepEqual(layoutLabels([]), []);
});

test('every reference kind has a silhouette that renders', () => {
  for (const ref of REFERENCES) {
    assert.ok(KINDS.includes(ref.kind), `missing silhouette for kind "${ref.kind}"`);
    const svg = drawSilhouette(ref);
    assert.ok(svg.startsWith('<') && !svg.includes('NaN') && !svg.includes('undefined'), ref.id);
  }
  assert.ok(drawSilhouette({ kind: 'unknown', w: 1, d: 1 }).includes('<rect'), 'falls back to a box');
});
