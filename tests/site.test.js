import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));

test('the page loads nothing from other sites (no visitor data goes to third parties)', () => {
  const html = read('index.html').toString();
  const external = [...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="(https?:[^"]*)"[^>]*>/g)]
    .filter(m => !m[0].includes('rel="canonical"')) // names the official address, loads nothing
    .map(m => m[1]);
  assert.deepEqual(external, []);
  const { imports } = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  for (const url of Object.values(imports)) assert.ok(url.startsWith('./'), `import map points outside: ${url}`);
  // Relative paths only, so the site also works from a sub-folder (username.github.io/repo/).
  assert.ok(!/(?:src|href)="\/[^/]/.test(html), 'a root-absolute path would break in a sub-folder');
});

test('the bundled three.js is the exact version the tests run against', () => {
  for (const file of ['build/three.module.min.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/controls/OrbitControls.js',
    'examples/jsm/utils/SkeletonUtils.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'LICENSE']) {
    assert.ok(read(`vendor/three/${file}`).equals(read(`node_modules/three/${file}`)), `vendor/three/${file} is out of date — run node tools/vendor.mjs`);
  }
});
