import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSaved, storeSaved, sameArea, MAX_SAVED } from '../js/saved.js';
import { outlinePath } from '../js/core/shapes.js';
import { readUrl, toQuery } from '../js/url.js';
import { DEFAULTS } from '../js/state.js';

const shelf = () => {
  const box = new Map();
  return { getItem: k => box.get(k) ?? null, setItem: (k, v) => box.set(k, v) };
};
const area = (id, extra) => ({ id, name: '', size: '100 m²', query: '?m=area&a=100', thumb: 'M3 3L37 3L37 37L3 37Z', at: 1, ...extra });

test('saved areas come back from storage', () => {
  const storage = shelf();
  assert.equal(storeSaved([area('a'), area('b', { name: 'Kitchen' })], storage), true);
  assert.deepEqual(loadSaved(storage).map(a => a.name || a.id), ['a', 'Kitchen']);
});

test('nothing goes wrong without storage, or with damaged data', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadSaved(blocked), []);
  assert.equal(storeSaved([area('a')], blocked), false);
  const storage = shelf();
  storage.setItem('areavisualizer:areas', 'not json');
  assert.deepEqual(loadSaved(storage), []);
  storage.setItem('areavisualizer:areas', JSON.stringify([area('a', { thumb: '"><script>' }), { id: 'x' }, area('ok')]));
  assert.deepEqual(loadSaved(storage).map(a => a.id), ['ok']);
  storage.setItem('areavisualizer:areas', JSON.stringify(Array.from({ length: MAX_SAVED + 9 }, (_, i) => area(String(i)))));
  assert.equal(loadSaved(storage).length, MAX_SAVED);
});

test('2D and 3D are the same saved area, a different size is not', () => {
  assert.equal(sameArea('?a=100&v=2d', '?a=100&v=3d'), true);
  assert.equal(sameArea('?a=100&v=2d', '?a=120&v=2d'), false);
});

test('an area with everything on it survives being saved and reopened', () => {
  const state = {
    ...DEFAULTS, mode: 'dims', width: 12, length: 9, shape: 'custom', view: '2d', height: 2.5, compare: 'tennis',
    comparePlace: { id: 'tennis', x: 4, z: -3, r: 90 }, points: [[-5, -5], [5, -5], [5, 5], [-5, 5]],
    objects: [{ id: 'car', x: 1, z: 2, r: 45 }, { name: 'Sofa', w: 2, d: 0.9, h: 0.8 }],
    second: { shape: 'circle', width: 7, length: 7, unit: 'm', x: 10, z: 4, r: 0 },
  };
  const back = readUrl(toQuery(state));
  for (const field of ['shape', 'view', 'height', 'compare', 'comparePlace', 'points', 'objects', 'second']) assert.deepEqual(back[field], state[field], field);
});

test('small pictures fit their square, whatever the shape', () => {
  const inside = path => [...path.matchAll(/-?\d+(?:\.\d+)?/g)].every(n => Number(n[0]) >= 0 && Number(n[0]) <= 40);
  const wide = outlinePath({ type: 'rectangle', width: 100, depth: 2 });
  assert.ok(wide.startsWith('M3.0 '), wide);
  assert.ok(inside(wide));
  assert.ok(inside(outlinePath({ type: 'polygon', width: 10, depth: 8, points: [[-5, -4], [5, -4], [0, 4]] })));
  assert.match(outlinePath({ type: 'circle', radius: 5, width: 10, depth: 10 }), /A17 17/);
});
