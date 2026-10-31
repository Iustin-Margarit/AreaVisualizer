import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES, setLanguage, detectLanguage, t, unitSymbol, objectName } from '../js/i18n/index.js';
import { formatNumber, formatLength, parseNumber, editableNumber } from '../js/core/format.js';
import { compare, describe } from '../js/core/comparisons.js';
import { LANDMARKS } from '../js/data/landmarks.js';
import { REFERENCES } from '../js/data/references.js';
import { UNITS, LENGTH_UNITS, VOLUME_UNITS } from '../js/core/units.js';

afterEach(() => setLanguage('en'));

const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
const en = LANGUAGES.en;

test('every language translates every piece of text, keeping its placeholders', () => {
  for (const [code, lang] of Object.entries(LANGUAGES)) {
    assert.ok(lang.name && lang.locale, code);
    for (const [key, text] of Object.entries(en.ui)) {
      assert.equal(typeof lang.ui[key], 'string', `${code}: missing "${key}"`);
      // Comparison phrases may pick the grammatical form their language needs ({of} or {like}).
      if (key.startsWith('cmp.')) {
        const allowed = ['n', 'pct', 'one', 'plural', 'name', 'of', 'like'];
        assert.ok(placeholders(lang.ui[key]).split(',').every(p => allowed.includes(p)), `${code}: placeholders of "${key}"`);
      } else {
        assert.equal(placeholders(lang.ui[key]), placeholders(text), `${code}: placeholders of "${key}"`);
      }
    }
    assert.deepEqual(Object.keys(lang.ui).filter(k => !(k in en.ui)), [], `${code}: unknown keys`);
    for (const id of [...Object.keys(UNITS), ...Object.keys(LENGTH_UNITS), ...Object.keys(VOLUME_UNITS)]) {
      assert.ok(lang.units[id], `${code}: unit ${id}`);
    }
    for (const r of REFERENCES) assert.ok(lang.objects[r.id], `${code}: object ${r.id}`);
    for (const l of LANDMARKS) {
      const text = lang.landmarks[l.id];
      assert.ok(text?.of, `${code}: landmark ${l.id}`);
      assert.ok(l.proper ? text.name : text.one && text.other, `${code}: forms of ${l.id}`);
    }
  }
});

test('every text key used in the page and the code exists', () => {
  const sources = ['index.html', 'js/main.js', 'js/ui/compare.js', 'js/ui/controls.js', 'js/ui/results.js', 'js/ui/share.js',
    'js/ui/stage-chrome.js', 'js/ui/credits.js', 'js/ui/language-picker.js', 'js/views/stage-ui.js', 'js/views/view2d.js', 'js/views/view3d.js', 'js/data/presets.js']
    .map(f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
  const keys = [
    ...[...sources.matchAll(/data-i18n="([\w.]+)"/g)].map(m => m[1]),
    ...[...sources.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(m => m[1].split(';').map(p => p.split(':')[1])),
    ...[...sources.matchAll(/\bt\('([\w.]+)'/g)].map(m => m[1]),
    ...[...sources.matchAll(/'((?:preset|hint|color)\.\w+)'/g)].map(m => m[1]),
  ].filter(k => !k.includes('$'));
  assert.ok(keys.length > 80);
  for (const key of keys) assert.ok(key in en.ui, `unknown key "${key}"`);
});

test('the browser language picks the interface language', () => {
  assert.equal(detectLanguage(['de-AT', 'en']), 'de');
  assert.equal(detectLanguage(['nl-NL', 'fr-BE']), 'fr', 'the first one we have');
  assert.equal(detectLanguage(['pt-PT']), 'pt');
  assert.equal(detectLanguage(['ja-JP']), 'en');
  assert.equal(detectLanguage([]), 'en');
});

test('numbers are written and read the local way', () => {
  setLanguage('de');
  assert.equal(formatNumber(1234567.8), '1.234.568');
  assert.equal(formatLength(2.5), '2,5 m');
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(parseNumber('1.000'), 1000);
  assert.equal(parseNumber('2.5'), 2.5, 'a point typed on a phone keyboard still works');
  assert.equal(parseNumber(editableNumber(0.125)), 0.125);
  setLanguage('ru');
  assert.equal(formatLength(2500), '2,5 км');
  assert.equal(unitSymbol('m2'), 'м²');
  assert.equal(parseNumber(formatNumber(1234567)), 1234567, 'its own thousands spaces read back');
  setLanguage('fr');
  assert.equal(parseNumber('1 234,5'), 1234.5);
});

test('comparisons speak each language with its grammar', () => {
  const at = (code, m2) => { setLanguage(code); return compare(m2).map(describe); };
  assert.deepEqual(at('de', 1), ['≈ 55\u00a0% eines Einzelbetts', '≈ 26\u00a0% eines Kingsize-Betts', '≈ 16 A4-Blätter']);
  assert.deepEqual(at('ru', 1), ['≈ 55\u00a0% односпальной кровати', '≈ 26\u00a0% кровати king-size', '≈ 16 листов A4']);
  assert.deepEqual(at('es', 1e6), ['≈ 2× Ciudad del Vaticano', '≈ 29\u00a0% de Central Park', '≈ 46 manzanas de Manhattan']);
  setLanguage('ru');
  const tennis = LANDMARKS.find(l => l.id === 'tennis');
  assert.equal(describe({ ...tennis, ratio: 2 }), '≈ 2 теннисных корта');
  assert.equal(describe({ ...tennis, ratio: 5 }), '≈ 5 теннисных кортов');
  assert.equal(describe({ ...tennis, ratio: 21 }), '≈ 21 теннисный корт');
  assert.equal(describe({ ...tennis, ratio: 1.5 }), '≈ 1,5 теннисного корта');
  assert.equal(describe({ id: 'uk', proper: true, ratio: 1 }), '≈ размером с Великобританию');
  setLanguage('fr');
  assert.equal(describe({ id: 'belgium', proper: true, ratio: 0.5 }), '≈ 50\u00a0% de la Belgique');
  assert.equal(objectName('person'), 'Personne');
  assert.equal(t('legend.square', { side: '1 m' }), 'Chaque carré\u00a0: 1 m × 1 m');
});
