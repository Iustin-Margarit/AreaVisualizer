import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildPages } from '../tools/pages.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
// Node versions group digits a little differently (Italian 1000 or 1.000), so marks between
// digits don't count.
const digits = text => text.replace(/(?<=\d)[.,   ](?=\d)/g, '');

test('the size and language pages are up to date with index.html (node tools/pages.mjs)', () => {
  const files = buildPages();
  for (const [path, text] of Object.entries(files)) assert.equal(digits(read(path)), digits(text), `${path} is out of date — run node tools/pages.mjs`);
  const pages = readdirSync(new URL('../pages', import.meta.url)).map(name => `pages/${name}`);
  assert.deepEqual(pages.sort(), Object.keys(files).filter(f => f.startsWith('pages/')).sort(), 'pages/ has files the script no longer makes');
});

test('every page names its own address, language and size, and has an address on the site', () => {
  const files = buildPages();
  const { rewrites } = JSON.parse(files['vercel.json']);
  for (const { source, destination } of rewrites) {
    const html = files[destination.slice(1)];
    assert.ok(html, `${source} → ${destination}, which isn't made`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://areavisualizer\\.vercel\\.app${source}">`));
    assert.match(files['sitemap.xml'], new RegExp(`<loc>https://areavisualizer\\.vercel\\.app${source}</loc>`));
    assert.match(html, /<html lang="(\w\w)" data-lang="\1"/);
    assert.doesNotMatch(html, /<title>[^<]*\{/, 'a placeholder left in the title');
  }
  assert.match(files['pages/ro-1-hectare.html'], /<h1 class="page-title">Cât înseamnă 1 hectar\?<\/h1>/);
  assert.match(files['pages/1-acre.html'], /data-start="m=area&amp;a=1&amp;u=ac"/);
});
