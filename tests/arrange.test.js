import test from 'node:test';
import assert from 'node:assert/strict';
import { footprint, overlap, overEdge, fitStatus, snapToEdges, arrangedTokens } from '../js/core/arrange.js';
import { buildScene, contentKey } from '../js/core/scene.js';
import { resolveObjects, isObjectToken } from '../js/core/references.js';
import { readUrl, toQuery } from '../js/url.js';
import { DEFAULTS, sanitize } from '../js/state.js';

const room = { type: 'rectangle', width: 5, depth: 4 };
const round = { type: 'circle', radius: 2, width: 4, depth: 4 };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const bed = (x, z, r = 0) => ({ x, z, w: 2, d: 1.5, r });

test('a turned object takes up different room', () => {
  assert.deepEqual(footprint({ w: 2, d: 1 }), { hx: 1, hz: 0.5 });
  const quarter = footprint({ w: 2, d: 1, r: 90 });
  close(quarter.hx, 0.5);
  close(quarter.hz, 1);
});

test('fit status: inside, over the edge, overlapping, outside', () => {
  assert.equal(fitStatus(bed(0, 0), room).state, 'inside');
  const edge = fitStatus(bed(2, 0), room);
  assert.equal(edge.state, 'edge');
  close(edge.over, 0.5);
  assert.equal(fitStatus(bed(10, 0), room).state, 'outside');
  const hit = fitStatus(bed(0, 0), room, [{ ...bed(0.5, 0), name: 'Sofa' }]);
  assert.deepEqual([hit.state, hit.with.name], ['overlap', 'Sofa']);
  assert.equal(fitStatus(bed(1.5, 0), room).state, 'inside', 'flush against the wall fits');
  assert.equal(overlap(bed(0, 0), bed(2, 0)), false, 'side by side, touching, is not overlapping');
  assert.equal(overlap(bed(0, 0, 45), bed(2.2, 0, 45)), false, 'turned ones are compared properly');
  assert.equal(overlap(bed(0, 0, 45), bed(1.2, 0, 45)), true);
});

test('fit status in a round area', () => {
  assert.equal(fitStatus(bed(0, 0), round).state, 'inside');
  assert.ok(overEdge(bed(1, 0), round) > 0);
  assert.equal(fitStatus(bed(5, 5), round).state, 'outside');
});

test('objects near the edge stand flush against it', () => {
  assert.deepEqual(snapToEdges(bed(1.45, 0.1), room, 0.1), { x: 1.5, z: 0.1 });
  assert.deepEqual(snapToEdges(bed(0, -1.2), room, 0.1), { x: 0, z: -1.25 });
  assert.deepEqual(snapToEdges(bed(0.5, 0.5), room, 0.1), { x: 0.5, z: 0.5 }, 'nothing near');
  assert.deepEqual(snapToEdges(bed(1.95, 0), round, 0.1), { x: 1.95, z: 0 }, 'circles have no sides to line up with');
});

const dims = { type: 'rectangle', width: 10, depth: 10 };

test('moved objects stay where they are, new ones line up beyond them', () => {
  const objects = [{ id: 'car', x: 1, z: 2, r: 90 }, 'person', { name: 'Sofa', w: 2, d: 1, h: 1, x: 20, z: 0 }, 'dog'];
  const { references, bounds } = buildScene({ areaM2: 100, dims, layout: 'side', objects });
  assert.deepEqual([references[0].x, references[0].z, references[0].r], [1, 2, 90]);
  assert.ok(references[1].x > 21, 'beyond the furthest moved object');
  assert.ok(references[3].x > references[1].x, 'in a row');
  assert.equal(references[2].name, 'Sofa');
  assert.ok(bounds.maxX >= references[3].x);
});

test('a catalog object can have its own size, and be listed twice', () => {
  const [car, again] = resolveObjects([{ id: 'car', w: 6, d: 2, h: 2 }, { id: 'car' }]);
  assert.deepEqual([car.w, car.d, car.h, car.resized], [6, 2, 2, true]);
  assert.ok(again.w !== 6);
  assert.equal(again.resized, undefined);
});

test('pinning keeps everything where it stands and changes one', () => {
  const { references } = buildScene({ areaM2: 100, dims, layout: 'side', objects: ['person', 'car'] });
  const tokens = arrangedTokens(references, 1, { x: 0, z: 0 });
  assert.equal(tokens[0].id, 'person');
  close(tokens[0].x, references[0].x, 1e-3);
  assert.deepEqual([tokens[1].id, tokens[1].x, tokens[1].z], ['car', 0, 0]);
  assert.ok(tokens.every(isObjectToken));
});

test('positions, turns, sizes and copies survive a link', () => {
  const objects = [
    { id: 'car', x: 1.5, z: -2, r: 90 }, { id: 'car', x: 6, z: 0, r: 0 }, 'person',
    { id: 'chair', w: 1, d: 1, h: 2, x: 0, z: 0, r: 0 }, { name: 'Sofa, big', w: 2, d: 1, h: 1, x: 3, z: 3, r: 45 }, { id: 'dog', w: 1, d: 0.5, h: 0.5 },
  ];
  const state = { ...DEFAULTS, objects, compare: 'tennis', comparePlace: { id: 'tennis', x: 3, z: 4, r: 30 } };
  const back = readUrl(toQuery(state));
  assert.deepEqual(back.objects[0], objects[0]);
  assert.deepEqual(back.objects[2], 'person');
  assert.deepEqual(back.objects[3], objects[3]);
  assert.deepEqual(back.objects[4], objects[4]);
  assert.deepEqual(back.objects[5], objects[5]);
  assert.deepEqual(back.comparePlace, state.comparePlace);
  assert.ok(!toQuery({ ...state, compare: 'pool' }).includes('cp='), 'a move belongs to the landmark that was moved');
  assert.equal(readUrl('?o=car@1:x').objects, undefined, 'bad positions are dropped');
  assert.deepEqual(sanitize({ objects: [{ id: 'nope', x: 1, z: 1 }] }), {}, 'unknown objects are dropped');
});

test('moving something leaves what has to be drawn the same; changing it does not', () => {
  const at = objects => contentKey(buildScene({ areaM2: 100, dims, layout: 'side', objects }), { night: false, reframe: false });
  const base = at([{ id: 'car', x: 0, z: 0, r: 0 }]);
  assert.equal(at([{ id: 'car', x: 2, z: 1, r: 90 }]), base, 'moved and turned');
  assert.notEqual(at([{ id: 'car', w: 6, d: 2, h: 2, x: 0, z: 0, r: 0 }]), base, 'resized');
  assert.notEqual(at([{ id: 'car', x: 0, z: 0 }, 'person']), base, 'one more object');
});

test('a landmark can be moved and turned', () => {
  const shape = { width: 20, depth: 10, rings: [], marks: [] };
  const { landmark, bounds } = buildScene({ areaM2: 100, dims, layout: 'side', objects: [], landmark: { id: 'x', name: 'X', shape, place: { x: 1, z: 2, r: 90 } } });
  assert.deepEqual([landmark.x, landmark.z, landmark.r], [1, 2, 90]);
  assert.ok(landmark.place === undefined);
  close(bounds.maxZ, 12);
});
