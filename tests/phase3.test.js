import test from 'node:test';
import assert from 'node:assert/strict';
import { lShape, shapeTemplate, polygonArea, polygonDimensions, offsetPolygon, centerPolygon } from '../js/core/shapes.js';
import { fitStatus, overEdge } from '../js/core/arrange.js';
import { resolveInput, secondSize, inSystem } from '../js/core/input.js';
import { compareVolume, describeVolume } from '../js/core/comparisons.js';
import { buildScene } from '../js/core/scene.js';
import { canDraw, needsWorld, loadWorld, landmarkShape } from '../js/core/landmarks.js';
import { LANDMARKS } from '../js/data/landmarks.js';
import { readUrl, toQuery } from '../js/url.js';
import { DEFAULTS, initialState, sanitize } from '../js/state.js';

const room = { type: 'rectangle', width: 10, depth: 5 };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('custom shapes: area, centring, an L', () => {
  const points = lShape(10, 10, 0.5);
  close(polygonArea(points), 75);
  const { width, depth } = polygonDimensions(points);
  assert.deepEqual([width, depth], [10, 10]);
  const moved = centerPolygon([[10, 10], [14, 10], [14, 12], [10, 12]]);
  assert.deepEqual([moved.cx, moved.cz], [12, 11]);
  assert.deepEqual(moved.points[0], [-2, -1]);
  const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  close(polygonArea(offsetPolygon(square, 0.5)), 9, 1e-6);
  close(polygonArea(offsetPolygon([...square].reverse(), 0.5)), 9, 1e-6);
  const state = { ...DEFAULTS, shape: 'custom', points };
  const input = resolveInput(state);
  assert.equal(input.dims.type, 'polygon');
  close(input.areaM2, 75);
});

test('ready-made shapes keep the area they replace', () => {
  for (const name of ['l', 't', 'u', 'triangle']) {
    const points = shapeTemplate(name, 10, 8, 80);
    close(polygonArea(points), 80, 0.01);
    close(polygonDimensions(points).width / polygonDimensions(points).depth, 10 / 8, 0.01);
  }
});

test('objects fit a custom shape, and its inner corner counts', () => {
  const shape = polygonDimensions(lShape(10, 10, 0.5)); // the top right quarter is missing
  assert.equal(fitStatus({ x: -2.5, z: 2.5, w: 2, d: 2 }, shape).state, 'inside');
  assert.equal(fitStatus({ x: 2.5, z: -2.5, w: 2, d: 2 }, shape).state, 'outside');
  assert.equal(fitStatus({ x: 0, z: 0, w: 2, d: 2 }, shape).state, 'edge', 'the inner corner pokes into it');
});

test('links keep a custom shape, and a second area', () => {
  const points = lShape(8, 6);
  const state = {
    ...DEFAULTS, shape: 'custom', points,
    second: { shape: 'circle', width: 5, length: 5, unit: 'm', x: 1, z: 2, r: 30 },
  };
  const back = readUrl(toQuery(state));
  assert.deepEqual(back.points, points);
  assert.deepEqual(back.second, state.second);
  assert.equal(initialState({ url: readUrl('?s=custom&w=3') }).shape, 'rectangle', 'custom without corners');
  assert.deepEqual(sanitize({ points: [[0, 0], [1, 1]] }), {}, 'too few corners');
  assert.deepEqual(sanitize({ second: { shape: 'blob', width: 1, length: 1, unit: 'm' } }), {});
});

test('a second area has a size, and changes system with the rest', () => {
  close(secondSize({ shape: 'rectangle', width: 4, length: 5, unit: 'm' }).areaM2, 20);
  close(secondSize({ shape: 'circle', width: 2, length: 2, unit: 'm' }).areaM2, Math.PI);
  const patch = inSystem({ ...DEFAULTS, second: { shape: 'rectangle', width: 10, length: 10, unit: 'm' } }, 'imperial');
  assert.deepEqual([patch.second.unit, patch.second.width], ['ft', 32.81]);
});

test('scenes carry the second area, behind the first', () => {
  const shape = { width: 4, depth: 4, rings: [], marks: [] };
  const dims = { type: 'square', width: 10, depth: 10 };
  const scene = buildScene({ areaM2: 100, dims, layout: 'side', objects: [], second: { id: 'second', name: 'B', shape } });
  assert.ok(scene.second.z < -5);
  assert.ok(scene.bounds.minZ <= scene.second.z - 2);
});

test('volumes compare with something smaller and something bigger', () => {
  const near = compareVolume(50);
  assert.equal(near.length, 2);
  assert.ok(near.some(c => c.ratio >= 1) && near.some(c => c.ratio < 1));
  assert.match(describeVolume({ id: 'bathtub', ratio: 250 }), /250 bathtubs/);
  assert.match(describeVolume({ id: 'pool', ratio: 0.02 }), /2% of an Olympic/);
  assert.deepEqual(compareVolume(1e-9), []);
});

test('countries are drawable but downloaded only when needed', async () => {
  const france = LANDMARKS.find(l => l.id === 'france');
  assert.equal(canDraw(france), true);
  assert.equal(canDraw(LANDMARKS.find(l => l.id === 'earth')), false);
  assert.equal(needsWorld(LANDMARKS.find(l => l.id === 'tennis')), false);
  await loadWorld();
  assert.equal(needsWorld(france), false);
  assert.ok(landmarkShape(france).rings.length >= 1);
});
