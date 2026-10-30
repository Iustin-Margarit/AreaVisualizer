import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, initialState, sanitize, normalize } from '../js/state.js';
import { readUrl, toQuery } from '../js/url.js';
import { prefersImperial } from '../js/prefs.js';
import { resolveInput, systemOf, sidesOf, inSystem, startHeight } from '../js/core/input.js';
import { escapeHTML } from '../js/core/format.js';
import { naturalAreaUnit, toM2, UNITS, LENGTH_UNITS } from '../js/core/units.js';
import { PRESETS } from '../js/data/presets.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('initial state: 3D, 10 m × 10 m (30 ft × 30 ft; a 4 × 5 m room on phones), prefs override, links set the size', () => {
  const metric = initialState();
  assert.deepEqual([metric.mode, metric.width, metric.length, metric.lengthUnit, metric.unit, metric.units, metric.view], ['dims', 10, 10, 'm', 'm2', 'metric', '3d']);
  assert.equal(metric.compare, 'none', 'nothing is compared until the visitor asks');

  const us = initialState({ imperial: true });
  assert.deepEqual([us.width, us.length, us.lengthUnit, us.unit, us.units], [30, 30, 'ft', 'ft2', 'imperial']);
  const phone = initialState({ phone: true }), usPhone = initialState({ phone: true, imperial: true });
  assert.deepEqual([phone.width, phone.length, usPhone.width, usPhone.length], [4, 5, 12, 15]);
  assert.equal(initialState({ prefs: { view: '2d' } }).view, '2d', 'a remembered view wins');

  const remembered = initialState({ imperial: true, prefs: { units: 'imperial', unit: 'ac', view: '3d', lengthUnit: 'yd', theme: 'dark', grid: false, color: 'teal' } });
  assert.deepEqual([remembered.unit, remembered.view, remembered.width, remembered.length], ['ac', '3d', 1, 1]);
  assert.deepEqual([remembered.theme, remembered.grid, remembered.color], ['dark', false, 'teal'], 'display settings are remembered');

  const linked = initialState({ prefs: { view: '3d' }, url: readUrl('?a=50&u=m2') });
  assert.deepEqual([linked.mode, linked.value, linked.view], ['area', 50, '3d'], 'old-style links still open in area mode');

  const square = initialState({ url: readUrl('?m=dims&w=3&s=square&lu=m') });
  assert.deepEqual([square.shape, square.width, square.length], ['rectangle', 3, 3], 'old square links become equal sides');
});

test('switching measuring systems keeps the physical size', () => {
  // A link made in feet opens in meters for a metric visitor...
  const fromFeet = initialState({ url: readUrl('?m=dims&w=10&l=20&s=rectangle&u=ft2&lu=ft') });
  assert.deepEqual([fromFeet.lengthUnit, fromFeet.unit], ['m', 'm2']);
  assert.deepEqual([fromFeet.width, fromFeet.length], [3.048, 6.096]);
  // ...unless they compare both systems, then it stays as it was made.
  const both = initialState({ prefs: { units: 'both' }, url: readUrl('?m=dims&w=10&l=20&s=rectangle&u=ft2&lu=ft') });
  assert.deepEqual([both.lengthUnit, both.width], ['ft', 10]);

  for (const state of [
    { ...DEFAULTS, mode: 'area', value: 50, unit: 'm2' },
    { ...DEFAULTS, mode: 'area', value: 3, unit: 'ha' },
    { ...DEFAULTS, mode: 'dims', width: 4, length: 5, lengthUnit: 'm' },
    { ...DEFAULTS, mode: 'dims', width: 30, length: 80, lengthUnit: 'cm', unit: 'km2' },
  ]) {
    const imperial = { ...state, ...inSystem(state, 'imperial') };
    assert.equal(UNITS[imperial.unit].system, 'imperial');
    assert.equal(LENGTH_UNITS[imperial.lengthUnit].system, 'imperial');
    close(resolveInput(imperial).areaM2, resolveInput(state).areaM2, 1e-3); // rounded to 4 digits
    const back = { ...imperial, ...inSystem(imperial, 'metric') };
    close(resolveInput(back).areaM2, resolveInput(state).areaM2, 2e-3);
    assert.deepEqual([back.unit, back.lengthUnit], [state.unit, state.lengthUnit], 'round trip returns to the same units');
  }
  assert.deepEqual(inSystem({ ...DEFAULTS }, 'metric'), {}, 'already metric: nothing to change');
  assert.equal(normalize({ ...DEFAULTS, units: 'both', unit: 'ft2' }).unit, 'ft2');
});

test('sanitize drops unknown fields and bad values', () => {
  assert.deepEqual(sanitize({ unit: 'parsecs', value: -1, ratio: 500, mode: 'x', view: 'vr', theme: 'pink', grid: 'yes', color: 'gold', units: 'cubits', compare: 'auto', evil: 1 }), {});
  assert.deepEqual(sanitize(null), {});
  assert.deepEqual(sanitize({ ...DEFAULTS }), DEFAULTS);
  assert.deepEqual(sanitize({ value: Infinity, width: NaN, length: 2e9 }), {});
  assert.deepEqual(sanitize({ value: 30689e6, unit: 'm2' }), { value: 30689e6, unit: 'm2' }, 'Belgium typed in m² is fine');
  assert.deepEqual(sanitize({ objects: ['person', 'unicorn'] }), {}, 'unknown catalog object');
  assert.deepEqual(sanitize({ objects: [{ name: ' ', w: 1, d: 1, h: 1 }] }), {}, 'blank custom name');
  assert.deepEqual(sanitize({ objects: [{ name: 'Sofa', w: 2, d: -1, h: 1 }] }), {}, 'bad custom size');
  assert.deepEqual(sanitize({ objects: Array(13).fill('person') }), {}, 'too many');
  assert.deepEqual(sanitize({ objects: null }), { objects: null });
  assert.deepEqual(sanitize({ height: 0, heightUnit: 'cubits' }), {});
  assert.deepEqual(sanitize({ height: -2.5 }), {});
  assert.deepEqual(sanitize({ height: null, heightUnit: 'ft' }), { height: null, heightUnit: 'ft' });
});

test('an optional height: in links, converted with the system, and turned into a volume', () => {
  const room = { ...DEFAULTS, mode: 'dims', width: 4, length: 5, lengthUnit: 'm', height: 2.5, heightUnit: 'm' };
  assert.equal(toQuery(room), '?m=dims&w=4&l=5&s=rectangle&u=m2&lu=m&h=2.5&hu=m&v=3d');
  assert.deepEqual([readUrl(toQuery(room)).height, readUrl(toQuery(room)).heightUnit], [2.5, 'm']);
  assert.ok(!toQuery(DEFAULTS).includes('h='), 'a flat area has no height in its link');
  assert.equal(readUrl('?h=0&hu=m').height, undefined);

  const r = resolveInput(room);
  close(r.height, 2.5);
  close(r.volumeM3, 50);
  const flat = resolveInput(DEFAULTS);
  assert.deepEqual([flat.height, flat.volumeM3], [0, 0]);
  close(resolveInput({ ...room, height: 250, heightUnit: 'cm' }).volumeM3, 50); // the height has its own unit

  // A link with the height in feet opens in meters for a metric visitor, and back again.
  const fromFeet = initialState({ url: readUrl('?m=dims&w=10&l=10&s=rectangle&u=ft2&lu=ft&h=8&hu=ft') });
  assert.deepEqual([fromFeet.height, fromFeet.heightUnit], [2.438, 'm']);
  const imperial = { ...room, ...inSystem(room, 'imperial') };
  assert.deepEqual([imperial.height, imperial.heightUnit], [8.202, 'ft']);
  close(resolveInput(imperial).volumeM3, 50, 1e-3);
  assert.deepEqual(inSystem({ ...DEFAULTS, heightUnit: 'in' }, 'metric'), { heightUnit: 'cm' }, 'no height: only the unit follows');
});

test('a new height starts as a room, or a cube on a small area', () => {
  assert.equal(startHeight(20, 'm'), 2.5);
  assert.equal(startHeight(1, 'm'), 1, '1 m² becomes a cubic meter');
  assert.equal(startHeight(2, 'm'), 1.4);
  assert.equal(startHeight(1e6, 'm'), 2.5);
  assert.equal(startHeight(toM2(100, 'ft2'), 'ft'), 8);
  assert.equal(startHeight(toM2(1, 'ft2'), 'ft'), 1, '1 ft² becomes a cubic foot');
  assert.equal(startHeight(toM2(1, 'ft2'), 'in'), 12);
  assert.equal(startHeight(1.2 * 0.6, 'cm'), 85, 'a desk-sized area in centimeters');
});

test('url round-trips both input modes and keeps links minimal', () => {
  const area = { ...DEFAULTS, mode: 'area', value: 12.5, shape: 'rectangle', ratio: 2.5, view: '3d' };
  const back = readUrl(toQuery(area));
  assert.deepEqual(back, { mode: 'area', value: 12.5, unit: 'm2', shape: 'rectangle', ratio: 2.5, lengthUnit: 'm', view: '3d' });

  const dims = { ...DEFAULTS, mode: 'dims', shape: 'rectangle', width: 10.97, length: 23.77, lengthUnit: 'm' };
  assert.equal(toQuery(dims), '?m=dims&w=10.97&l=23.77&s=rectangle&u=m2&lu=m&v=3d');
  assert.deepEqual(readUrl(toQuery(dims)), { mode: 'dims', width: 10.97, length: 23.77, shape: 'rectangle', unit: 'm2', lengthUnit: 'm', view: '3d' });
  assert.ok(!toQuery({ ...dims, shape: 'square' }).includes('l='), 'a square needs one side');
  assert.equal(readUrl('?m=dims&w=4&l=5&lu=m').shape, 'rectangle', 'older sides links were rectangles');

  // Objects, including the visitor's own, survive the trip; display settings never go in links.
  const objects = ['person', { name: 'Big, odd: "sofa" <b>', w: 2, d: 0.9, h: 0.8 }];
  assert.deepEqual(readUrl(toQuery({ ...area, objects })).objects, objects);
  assert.deepEqual(readUrl(toQuery({ ...area, objects: [] })).objects, []);
  assert.ok(!toQuery(area).includes('o='), 'automatic objects stay out of links');
  assert.ok(!/theme|grid|color|units/.test(toQuery({ ...area, theme: 'dark', units: 'both' })), 'display settings stay out of links');
  assert.equal(readUrl('?o=~%E0%A4%A').objects, undefined, 'malformed objects are dropped');

  assert.ok(!toQuery({ ...area, shape: 'square' }).includes('r='), 'ratio only for rectangles');
  assert.ok(!toQuery(area).includes('c='), 'no landmark: nothing in the link');
  assert.equal(readUrl(toQuery({ ...area, compare: 'tennis' })).compare, 'tennis');
  assert.equal(readUrl('?c=auto').compare, undefined, 'there is no automatic landmark any more');
  assert.equal(readUrl('?c=atlantis').compare, undefined);
  assert.deepEqual(readUrl('?a=-1&u=parsecs&s=blob&v=vr&r=0&w=0&lu=cubits'), {});
});

test('resolveInput: typed sides give exact shapes, longer side across', () => {
  const r = resolveInput({ ...DEFAULTS, mode: 'dims', shape: 'rectangle', width: 4, length: 5, lengthUnit: 'm' });
  close(r.areaM2, 20);
  assert.deepEqual(r.dims, { type: 'rectangle', width: 5, depth: 4 });
  assert.equal(r.areaUnit, 'm2');

  const ft = resolveInput({ ...DEFAULTS, mode: 'dims', shape: 'square', width: 12, length: 99, lengthUnit: 'in', unit: 'ft2' });
  close(ft.areaM2, toM2(1, 'ft2'));
  assert.equal(ft.dims.type, 'square', 'a square ignores the second side');
  assert.equal(ft.system, 'imperial');

  const round = resolveInput({ ...DEFAULTS, mode: 'dims', shape: 'circle', width: 2, lengthUnit: 'm' });
  close(round.areaM2, Math.PI);
  assert.equal(round.dims.radius, 1);

  // The side fields keep the visitor's order: second side longer when ratio >= 1, shorter when < 1.
  assert.deepEqual(sidesOf({ width: 6, depth: 3 }, 'm'), [3, 6]);
  assert.deepEqual(sidesOf({ width: 6, depth: 3 }, 'm', 0.5), [6, 3]);
  close(sidesOf({ width: 0.3048, depth: 0.3048 }, 'ft')[0], 1);
  const flipped = resolveInput({ ...DEFAULTS, mode: 'area', value: 18, unit: 'm2', ratio: 0.5 });
  close(flipped.dims.width, 6);
  close(flipped.dims.depth, 3);

  const area = resolveInput({ ...DEFAULTS, mode: 'area', value: 2, unit: 'ac', shape: 'circle' });
  close(area.areaM2, toM2(2, 'ac'));
  assert.equal(area.dims.type, 'circle');
  assert.equal(systemOf({ ...DEFAULTS, unit: 'ha' }), 'metric');
});

test('every quick pick is a valid size in its own measuring system', () => {
  for (const system of ['metric', 'imperial']) {
    assert.equal(PRESETS[system].length, 7);
    for (const { label, patch } of PRESETS[system]) {
      assert.deepEqual(sanitize(patch), patch, `${label} (${system})`);
      assert.equal(systemOf({ ...DEFAULTS, ...patch }), system, `${label} (${system})`);
    }
  }
  const pool = PRESETS.metric.find(p => p.key === 'preset.pool').patch;
  close(resolveInput({ ...DEFAULTS, ...pool }).areaM2, 1250);
});

test('locale detection and natural units', () => {
  assert.equal(prefersImperial(['en-US', 'en']), true);
  assert.equal(prefersImperial(['en-GB']), false);
  assert.equal(prefersImperial(['de-DE', 'en-US']), false);
  assert.equal(prefersImperial([]), false);
  assert.equal(naturalAreaUnit(50, 'imperial'), 'ft2');
  assert.equal(naturalAreaUnit(toM2(3, 'ac'), 'imperial'), 'ac');
  assert.equal(naturalAreaUnit(toM2(3, 'mi2'), 'imperial'), 'mi2');
  assert.equal(naturalAreaUnit(500, 'metric'), 'm2');
  assert.equal(naturalAreaUnit(50000, 'metric'), 'ha');
  assert.equal(naturalAreaUnit(5e6, 'metric'), 'km2');
});

test('escapeHTML neutralises markup in names', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHTML("Tom's & Jerry's"), 'Tom&#39;s &amp; Jerry&#39;s');
});
