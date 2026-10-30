import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, VOLUME_UNITS, toM2, fromM2, fromM3, naturalVolumeUnit } from '../js/core/units.js';
import { shapeDimensions } from '../js/core/shapes.js';
import { formatNumber, parseNumber, formatLength, formatVolume, formatVolumes } from '../js/core/format.js';
import { pickReferences } from '../js/core/references.js';
import { compare, describe } from '../js/core/comparisons.js';
import { buildScene } from '../js/core/scene.js';
import { landmarkShape, chooseLandmark } from '../js/core/landmarks.js';
import { LANDMARKS } from '../js/data/landmarks.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('units round-trip and known values', () => {
  for (const id of Object.keys(UNITS)) close(fromM2(toM2(123.4, id), id), 123.4);
  close(toM2(1, 'ac'), 4046.8564224);
  close(fromM2(1, 'ft2'), 10.7639104, 1e-7);
  close(toM2(640, 'ac'), toM2(1, 'mi2'));
  close(fromM3(1, 'l'), 1000);
  close(fromM3(VOLUME_UNITS.ft3.toM3, 'in3'), 1728);
  close(fromM3(VOLUME_UNITS.yd3.toM3, 'ft3'), 27);
  close(fromM3(VOLUME_UNITS.gal.toM3, 'in3'), 231);
});

test('volumes are shown in a unit that suits their size', () => {
  assert.equal(naturalVolumeUnit(50, 'metric'), 'm3');
  assert.equal(naturalVolumeUnit(0.0005, 'metric'), 'cm3');
  assert.equal(naturalVolumeUnit(50, 'imperial'), 'ft3');
  assert.equal(naturalVolumeUnit(0.01, 'imperial'), 'in3');
  assert.equal(formatVolume(50), '50 m³');
  assert.equal(formatVolume(50, 'imperial'), '1,766 ft³');
  assert.equal(formatVolume(0.0005), '500 cm³');
  assert.equal(formatVolumes(1, 'metric', true), '1 m³ · 35.3 ft³');
});

test('every shape preserves the area', () => {
  for (const area of [0.01, 1, 50, 1e6]) {
    const sq = shapeDimensions(area, 'square');
    close(sq.width * sq.depth, area);
    const rect = shapeDimensions(area, 'rectangle', 3);
    close(rect.width * rect.depth, area);
    close(rect.width / rect.depth, 3);
    const c = shapeDimensions(area, 'circle');
    close(Math.PI * c.radius ** 2, area);
  }
});

test('parseNumber is lenient but strict about garbage', () => {
  assert.equal(parseNumber('1.5'), 1.5);
  assert.equal(parseNumber('1,5'), 1.5);
  assert.equal(parseNumber(' 10 000 '), 10000);
  assert.equal(parseNumber('1,000'), 1000);
  assert.equal(parseNumber('1,000.5'), 1000.5);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('1.'), 1);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('-3')));
  assert.ok(Number.isNaN(parseNumber('1.2.3')));
});

test('formatting', () => {
  assert.equal(formatNumber(10.7639104), '10.8');
  assert.equal(formatNumber(1234567.8), '1,234,568');
  assert.equal(formatNumber(10763910416710), '10.8 trillion');
  assert.equal(formatNumber(25000000, 6, false), '25,000,000');
  assert.equal(formatNumber(0.000123456), '0.000123');
  assert.equal(formatLength(0.5), '50 cm');
  assert.equal(formatLength(7.0710678), '7.07 m');
  assert.equal(formatLength(2500), '2.5 km');
  assert.equal(formatLength(0.3048, 'imperial'), '1 ft');
  assert.equal(formatLength(0.1524, 'imperial'), '6 in');
});

test('reference picking scales with the area', () => {
  const ids = span => pickReferences(span).map(r => r.id);
  assert.ok(ids(1).includes('person'));
  assert.ok(ids(Math.sqrt(50)).includes('car'));
  assert.ok(!ids(1000).includes('person'), 'a person is invisible next to 1 km²');
  assert.ok(ids(1000).length > 0);
});

test('comparisons pick readable ratios and mix bigger with smaller', () => {
  const tennis = compare(260.87)[0];
  assert.equal(tennis.id, 'tennis');
  assert.equal(describe(tennis), '≈ 1 tennis court');
  assert.deepEqual(compare(1).map(describe), [
    '≈ 55% of a single bed',
    '≈ 26% of a king-size bed',
    '≈ 16 A4 sheets',
  ]);
  assert.deepEqual(compare(50).map(describe), [
    '≈ 1.7 shipping containers',
    '≈ 4 parking spots',
    '≈ 19% of a tennis court',
  ]);
  assert.deepEqual(compare(1e6).map(describe), [
    '≈ 2× Vatican City',
    '≈ 29% of Central Park',
    '≈ 46 Manhattan city blocks',
  ]);
  assert.equal(describe({ ratio: 0.76, id: 'football' }), '≈ 76% of an American football field');
  assert.equal(describe({ ratio: 1.01, id: 'centralpark', proper: true }), '≈ the size of Central Park');
  assert.ok(compare(1e-6).length === 0);
});

const sceneFor = (areaM2, layout) => buildScene({ areaM2, dims: shapeDimensions(areaM2, 'square'), layout });

test('front layout: references stand in front of the area, inside bounds', () => {
  const scene = sceneFor(50, 'front');
  assert.ok(scene.references.length > 0);
  for (const r of scene.references) {
    assert.ok(r.z - r.d / 2 > scene.shape.depth / 2, 'starts beyond the front edge');
    assert.ok(r.x + r.w / 2 <= scene.bounds.maxX + 1e-9);
    assert.ok(r.z + r.d / 2 <= scene.bounds.maxZ + 1e-9);
  }
  assert.ok(scene.bounds.maxY >= 1.75);
});

test('side layout: references line up to the right, fronts flush with the area', () => {
  const scene = sceneFor(50, 'side');
  let lastRight = scene.shape.width / 2;
  for (const r of scene.references) {
    assert.ok(r.x - r.w / 2 > lastRight, 'each one right of the previous');
    close(r.z + r.d / 2, scene.shape.depth / 2);
    lastRight = r.x + r.w / 2;
  }
  close(scene.bounds.maxX, lastRight);
  close(scene.bounds.maxZ, scene.shape.depth / 2);
});

test('there is a reference object at every scale, from a coin to the Moon', () => {
  for (let span = 0.02; span < 5e7; span *= 1.5) {
    assert.ok(pickReferences(span).length > 0, `nothing to compare with at span ${span} m`);
  }
  assert.ok(pickReferences(1e5).map(r => r.id).includes('fuji'));
  assert.deepEqual(pickReferences(5e6).map(r => r.id), ['moon']);
});

const ringArea = ring => Math.abs(ring.reduce((sum, [x, z], i) => {
  const [x2, z2] = ring[(i + 1) % ring.length];
  return sum + x * z2 - x2 * z;
}, 0)) / 2;

test('landmark shapes are drawn at their real area, with markings inside', () => {
  for (const l of LANDMARKS) {
    const shape = landmarkShape(l);
    if (l.id === 'earth') { assert.equal(shape, null, 'too spread out to draw'); continue; }
    assert.ok(shape, `${l.id} has no shape`);
    const area = shape.rings.reduce((sum, r) => sum + ringArea(r), 0);
    assert.ok(Math.abs(area / l.area - 1) < 0.01, `${l.id}: drawn ${area} m² vs ${l.area} m²`);
    for (const p of [...shape.rings.flat(), ...shape.marks.flat()]) {
      assert.ok(Math.abs(p[0]) <= shape.width / 2 * 1.001 && Math.abs(p[1]) <= shape.depth / 2 * 1.001, `${l.id}: point outside`);
    }
  }
  assert.ok(landmarkShape(LANDMARKS.find(l => l.id === 'soccer')).marks.length > 5, 'soccer field has its markings');
});

test('landmarks are only drawn when picked, and the pick stays listed', () => {
  assert.equal(chooseLandmark('none'), null);
  assert.equal(chooseLandmark('tennis').id, 'tennis');
  assert.equal(chooseLandmark('earth'), null, 'cannot be drawn');
  const far = compare(1e6, { keep: 'tennis' });
  assert.equal(far.at(-1).id, 'tennis', 'a picked landmark far off scale is still offered');
  assert.equal(describe(far.at(-1)), '≈ 3,835 tennis courts');
  assert.equal(compare(260.87, { keep: 'tennis' }).filter(c => c.id === 'tennis').length, 1, 'not listed twice');
});

test('the landmark sits left of the area without touching it, inside the bounds', () => {
  const tennis = LANDMARKS.find(l => l.id === 'tennis');
  for (const layout of ['front', 'side']) {
    const scene = buildScene({ areaM2: 50, dims: shapeDimensions(50, 'square'), layout, landmark: { ...tennis, shape: landmarkShape(tennis) } });
    const lm = scene.landmark;
    assert.ok(lm.x + lm.shape.width / 2 < -scene.shape.width / 2, 'left of the area');
    close(scene.bounds.minX, lm.x - lm.shape.width / 2);
  }
  assert.equal(sceneFor(50, 'front').landmark, null);
});

test('the visitor\'s own objects replace the automatic pick, in order', () => {
  const custom = { name: 'Sofa', w: 2, d: 0.9, h: 0.8 };
  const scene = buildScene({ areaM2: 50, dims: shapeDimensions(50, 'square'), objects: ['moon', custom, 'person'] });
  assert.deepEqual(scene.references.map(r => r.name), ['The Moon', 'Sofa', 'Person']);
  assert.equal(scene.references[1].kind, 'box');
  assert.deepEqual(scene.references[1].token, custom, 'keeps its token so the list can be edited');
  assert.equal(buildScene({ areaM2: 50, dims: shapeDimensions(50, 'square'), objects: [] }).references.length, 0);
  assert.ok(sceneFor(50, 'front').references.every(r => r.token === r.id), 'automatic picks carry their ids');
});

test('a height raises the area into a box, and a tall one gets tall objects beside it', () => {
  const flat = buildScene({ areaM2: 1, dims: shapeDimensions(1, 'square') });
  assert.equal(flat.height, 0);
  assert.ok(flat.references.every(r => r.h <= 2), 'small things next to 1 m²');
  const column = buildScene({ areaM2: 1, dims: shapeDimensions(1, 'square'), height: 30 });
  assert.equal(column.height, 30);
  assert.equal(column.bounds.maxY, 30);
  assert.ok(column.references.some(r => r.h >= 8), 'something tall next to a 30 m column');
  const ids = height => buildScene({ areaM2: 20, dims: shapeDimensions(20, 'square'), height }).references.map(r => r.id);
  assert.deepEqual(ids(2.5), ids(0), 'a room keeps the objects of its floor');
});
