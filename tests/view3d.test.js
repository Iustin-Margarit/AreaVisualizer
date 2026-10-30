import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildModel, createKit, MODEL_KINDS, frustumGeometry, polyhedron } from '../js/views/3d/models.js';
import { orbitBasis, fitDistance, gridLevels } from '../js/views/3d/math.js';
import { angleDelta, isDoubleTap } from '../js/views/3d/gestures.js';
import { easeOutBack, easeOutCubic } from '../js/views/3d/effects.js';
import { keyDimension } from '../js/core/references.js';
import { REFERENCES, orientedSize } from '../js/data/references.js';
import { MODELS } from '../js/data/models.js';
import { existsSync } from 'node:fs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('every reference has a built-in model that stands on the ground and fits its real size', () => {
  const kit = createKit({ textures: false });
  for (const ref of REFERENCES) {
    assert.ok(MODEL_KINDS.includes(ref.kind), `no model for kind "${ref.kind}"`);
    const box = new THREE.Box3().setFromObject(buildModel(ref, kit), true); // vertex-exact
    const size = box.getSize(new THREE.Vector3());
    const tol = 0.012; // 1.2 %
    assert.ok(Math.abs(box.min.y) <= ref.h * tol, `${ref.id} floats or sinks: min y ${box.min.y}`);
    // Objects with a downloaded model only fall back to these: they must fit, not fill.
    const fill = MODELS[ref.id] ? 0 : 1;
    assert.ok(size.y <= ref.h * (1 + tol) && size.y >= ref.h * 0.95 * fill, `${ref.id} height ${size.y} vs ${ref.h}`);
    assert.ok(size.x <= ref.w * (1 + tol) && size.x >= ref.w * 0.8 * fill, `${ref.id} width ${size.x} vs ${ref.w}`);
    assert.ok(size.z <= ref.d * (1 + tol) && size.z >= ref.d * 0.75 * fill, `${ref.id} depth ${size.z} vs ${ref.d}`);
    assert.ok(Math.abs(box.min.x + box.max.x) / 2 <= ref.w * 0.06, `${ref.id} not centered on x`);
    assert.ok(Math.abs(box.min.z + box.max.z) / 2 <= ref.d * 0.06, `${ref.id} not centered on z`);
  }
  kit.dispose();
});

test('unknown kinds fall back to a plain box of the right size', () => {
  const box = new THREE.Box3().setFromObject(buildModel({ id: 'x', kind: 'nope', w: 2, h: 3, d: 4 }, createKit({ textures: false })));
  assert.deepEqual(box.getSize(new THREE.Vector3()).toArray(), [2, 3, 4]);
  assert.equal(box.min.y, 0);
});

test('kit shares materials between parts of the same colour', () => {
  const kit = createKit({ textures: false });
  assert.equal(kit.mat('#ff0000'), kit.mat('#ff0000'));
  assert.notEqual(kit.mat('#ff0000'), kit.mat('#ff0000', { side: THREE.DoubleSide }));
});

test('polyhedron and frustum faces all point outward', () => {
  const geometries = [
    frustumGeometry({ x: 0, z: 0, hw: 2, hd: 1, y: 0 }, { x: 1, z: 0.5, hw: 0.5, hd: 0.25, y: 3 }),
    polyhedron([[[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 0, 0], [0, 0, 1], [1, 0, 0]], [[1, 0, 0], [0, 0, 1], [0, 1, 0]]]),
  ];
  for (const g of geometries) {
    const pos = g.attributes.position;
    const center = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) center.add(new THREE.Vector3().fromBufferAttribute(pos, i));
    center.divideScalar(pos.count); // centroid: inside any convex solid
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      const out = a.clone().add(b).add(c).divideScalar(3).sub(center);
      assert.ok(normal.dot(out) > 0, `triangle ${i / 3} faces inward`);
    }
  }
});

test('orbitBasis gives an orthonormal camera frame looking at the target', () => {
  const { toCamera, forward, right, up } = orbitBasis(0.5, -0.4);
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  for (const v of [forward, right, up]) close(dot(v, v), 1);
  close(dot(forward, right), 0);
  close(dot(forward, up), 0);
  close(dot(right, up), 0);
  assert.ok(up[1] > 0, 'up points up');
  assert.ok(right[1] === 0 || Math.abs(right[1]) < 1e-12, 'horizon stays level');
  close(toCamera[1], Math.sin(0.5));
  const front = orbitBasis(0, 0);
  assert.deepEqual(front.right.map(v => Math.round(v)), [1, 0, 0], 'from the front, +x is to the right');
});

test('fitDistance frames every point, tightly', () => {
  const basis = orbitBasis(0.45, -0.5);
  const corners = [];
  for (const x of [-10, 30]) for (const y of [0, 8]) for (const z of [-4, 6]) corners.push([x - 10, y - 4, z - 1]);
  const [tanX, tanY] = [0.5, 0.35];
  const d = fitDistance(corners, basis, tanX, tanY);
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  let tight = 0;
  for (const p of corners) {
    const depth = d + dot(p, basis.forward);
    const sx = Math.abs(dot(p, basis.right)) / depth / tanX;
    const sy = Math.abs(dot(p, basis.up)) / depth / tanY;
    assert.ok(sx <= 1 + 1e-9 && sy <= 1 + 1e-9, 'point outside the frustum');
    tight = Math.max(tight, sx, sy);
  }
  close(tight, 1, 1e-9);
});

test('gridLevels picks powers of ten that match the shader', () => {
  const a = gridLevels(0.05, 12); // 0.6 units per 12 px → 1 is the smallest readable
  assert.deepEqual([a.fine, a.coarse], [1, 10]);
  close(a.fade, -Math.log10(0.6));
  const { fine, coarse } = gridLevels(0.2, 12); // 2.4 units per 12 px → 10 is the smallest readable
  assert.deepEqual([fine, coarse], [10, 100]);
  const g = gridLevels(1 / 12, 12);
  assert.equal(g.fine, 1);
  assert.ok(g.fade >= 0 && g.fade < 1);
});

test('keyDimension prints height, or length for long low things', () => {
  const byId = Object.fromEntries(REFERENCES.map(r => [r.id, keyDimension(r)]));
  assert.deepEqual(byId.person, { symbol: '↕', value: 1.75 });
  assert.deepEqual(byId.eiffel, { symbol: '↕', value: 330 });
  assert.deepEqual(byId.car, { symbol: '↔', value: 4.5 });
  assert.deepEqual(byId.airliner, { symbol: '↔', value: 73.9 });
  assert.deepEqual(byId.phone, { symbol: '↔', value: 0.15 });
});

test('downloaded models: files present, credited, and scaled to the real measurement', () => {
  for (const [id, model] of Object.entries(MODELS)) {
    assert.ok(existsSync(new URL(`../${model.file}`, import.meta.url)), `${id}: ${model.file} missing`);
    assert.ok(existsSync(new URL(`../assets/top/${id}.png`, import.meta.url)), `${id}: top view missing`);
    assert.ok(/^CC(0|-BY)/.test(model.credit.licence) && model.credit.author && model.credit.url, `${id}: credit`);
    const ref = REFERENCES.find(r => r.id === id);
    assert.ok(ref, `${id}: no reference object`);
    const [x, y, z] = orientedSize(model);
    if (model.fit === 'h') close(ref.h, y * (ref.h / y));
    else close(ref.w / x * z, ref.d, 1e-9);
  }
  assert.deepEqual(orientedSize({ size: [1, 2, 3], turn: 90 }), [3, 2, 1]);
  assert.deepEqual(orientedSize({ size: [1, 2, 3], lay: true }), [1, 3, 2]);
});

test('touch: a twist turns by the short way round, and a double tap is two quick taps close together', () => {
  close(angleDelta(0.1, 0.3), 0.2);
  close(angleDelta(3.1, -3.1), 2 * Math.PI - 6.2); // across ±π: a small step, not a full turn
  close(angleDelta(-3.1, 3.1), -(2 * Math.PI - 6.2));
  const first = { x: 100, y: 100, time: 1000 };
  assert.ok(isDoubleTap(first, { x: 110, y: 105, time: 1200 }));
  assert.ok(!isDoubleTap(first, { x: 110, y: 105, time: 1400 })); // too slow
  assert.ok(!isDoubleTap(first, { x: 180, y: 100, time: 1200 })); // too far apart
  assert.ok(!isDoubleTap(null, first));
});

test('opening animation: easings start at 0 and land on 1, the pop overshooting a touch', () => {
  for (const ease of [easeOutBack, easeOutCubic]) {
    close(ease(0), 0);
    close(ease(1), 1);
  }
  assert.ok(Math.max(...Array.from({ length: 50 }, (_, i) => easeOutBack(i / 49))) > 1, 'pops a touch past full size');
});
