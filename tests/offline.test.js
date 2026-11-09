import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { offlineFiles } from '../tools/offline-files.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the list of files kept for offline use is up to date', () => {
  assert.deepEqual(JSON.parse(read('offline-files.json')), offlineFiles(), 'run: node tools/offline-files.mjs');
});

test('the site can be installed', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(i => i.sizes === '192x192'));
  assert.ok(manifest.icons.some(i => i.sizes === '512x512'));
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(`../${icon.src}`, import.meta.url)), icon.src);
  assert.match(read('index.html'), /<link rel="manifest" href="manifest\.webmanifest">/);
});

test('offline copies are only ever of this site\'s own files', () => {
  assert.match(read('sw.js'), /new URL\(request\.url\)\.origin !== location\.origin/);
  assert.doesNotMatch(read('sw.js'), /https?:\/\//);
});
