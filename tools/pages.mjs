// Pages for search engines: one per common size ("How big is 1 acre?") and a home page per
// language, each the same tool as index.html, opening at that size in that language.
//   node tools/pages.mjs      (after changing index.html or the sizes below; a test says when)
// Writes pages/*.html, vercel.json (each page's address → its file), sitemap.xml, and the marked
// parts of index.html (the same page in other languages; links to the size pages).
// Addresses have one part (/1-acre, /ro-100-m2, /ro) so the page's links to css/, js/… still work.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { UNITS } from '../js/core/units.js';
import { withUnit, formatNumber, escapeHTML } from '../js/core/format.js';
import { compare, describe } from '../js/core/comparisons.js';
import { LANGUAGES, setLanguage, t } from '../js/i18n/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://areavisualizer.vercel.app';
const LANGS = Object.keys(LANGUAGES);

// Metric sizes get a page in every language; imperial ones only in English.
const METRIC = [[10, 'm2'], [20, 'm2'], [30, 'm2'], [50, 'm2'], [100, 'm2'], [200, 'm2'], [500, 'm2'], [1000, 'm2'], [1, 'ha'], [1, 'km2']];
const IMPERIAL = [[100, 'ft2'], [200, 'ft2'], [500, 'ft2'], [1000, 'ft2'], [2000, 'ft2'], [1, 'ac'], [5, 'ac'], [10, 'ac'], [1, 'mi2']];
const SLUG = { m2: 'm2', km2: 'km2', ha: 'hectare', ft2: 'sq-ft', ac: 'acres', mi2: 'square-mile' };

// The size the way people search for it (in the current language).
const phrase = (n, unit) => ({
  ha: () => t('page.hectare'),
  ft2: () => `${formatNumber(n)} sq ft`,
  ac: () => (n === 1 ? '1 acre' : `${n} acres`),
  mi2: () => '1 square mile',
}[unit]?.() ?? withUnit(n, unit));

const slugOf = (lang, n, unit) => `${lang === 'en' ? '' : `${lang}-`}${n}-${n === 1 && unit === 'ac' ? 'acre' : SLUG[unit]}`;
const address = slug => `${SITE}/${slug}`;

const sizes = LANGS.flatMap(lang => [...METRIC, ...(lang === 'en' ? IMPERIAL : [])].map(([n, unit]) => ({ lang, n, unit, slug: slugOf(lang, n, unit) })));
const homes = LANGS.map(lang => ({ lang, slug: lang === 'en' ? '' : lang }));

const between = (html, name, inner) => {
  const re = new RegExp(`(<!-- pages:${name}\\b[^>]*-->)[\\s\\S]*?([ \\t]*<!-- /pages:${name} -->)`);
  if (!re.test(html)) throw new Error(`index.html lost its <!-- pages:${name} --> marks`);
  return html.replace(re, (_, open, close) => `${open}\n${inner}${close}`);
};
const swap = (html, re, to) => {
  if (!re.test(html)) throw new Error(`index.html: nothing matches ${re}`);
  return html.replace(re, to);
};

const alternates = group => [
  ...group.map(p => `  <link rel="alternate" hreflang="${p.lang}" href="${address(p.slug)}">\n`),
  ...(group.length > 1 ? [`  <link rel="alternate" hreflang="x-default" href="${address(group.find(p => p.lang === 'en').slug)}">\n`] : []),
].join('');

function links(lang, current) {
  const own = sizes.filter(p => p.lang === lang);
  setLanguage(lang);
  const items = own.map(p => (p.slug === current
    ? `<span aria-current="page">${escapeHTML(phrase(p.n, p.unit))}</span>`
    : `<a href="${p.slug}">${escapeHTML(phrase(p.n, p.unit))}</a>`));
  return `    <nav class="sizes" aria-label="${escapeHTML(t('page.sizes'))}"><span>${escapeHTML(t('page.sizes'))}:</span> ${items.join(' ')}</nav>\n`;
}

// Static text in the page's language, so it reads right before the scripts run (and to any
// search engine that doesn't run them). The scripts set the same text again.
const translateText = html => html.replace(
  /(<(\w+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g,
  (_, open, tag, key, text, close) => `${open}${escapeHTML(t(key))}${close}`,
);

function page(template, { lang, slug, title, description, heading, answer, start, group }) {
  setLanguage(lang);
  const url = address(slug);
  let html = template;
  html = swap(html, /<html lang="en">/, `<html lang="${lang}" data-lang="${lang}"${start ? ` data-start="${start}"` : ''}>`);
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${escapeHTML(title)}</title>`);
  html = swap(html, /(<meta name="description" content=")[^"]*/, `$1${escapeHTML(description)}`);
  html = swap(html, /(<meta property="og:title" content=")[^"]*/, `$1${escapeHTML(title)}`);
  html = swap(html, /(<meta property="og:description" content=")[^"]*/, `$1${escapeHTML(description)}`);
  html = swap(html, /(<link rel="canonical" href=")[^"]*/, `$1${url}`);
  html = swap(html, /(<meta property="og:url" content=")[^"]*/, `$1${url}`);
  html = between(html, 'head', alternates(group));
  html = between(html, 'links', links(lang, slug));
  setLanguage(lang);
  html = translateText(html);
  if (heading) html = swap(html, /<h1 class="page-title" data-i18n="tagline">[^<]*<\/h1>/, `<h1 class="page-title">${escapeHTML(heading)}</h1>`);
  if (answer) html = swap(html, /<p id="answer" class="answer"><\/p>/, `<p id="answer" class="answer">${answer}</p>`);
  return html;
}

export function buildPages() {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8').replaceAll('\r\n', '\n');
  // index.html itself: the English home page, and the template for the others.
  const index = between(between(source, 'head', alternates(homes)), 'links', links('en', ''));
  const files = { 'index.html': index };

  for (const home of homes.filter(h => h.lang !== 'en')) {
    setLanguage(home.lang);
    files[`pages/${home.slug}.html`] = page(index, {
      ...home, group: homes, title: `${t('tagline')} · AreaVisualizer`, description: t('meta.description'),
    });
  }
  for (const size of sizes) {
    setLanguage(size.lang);
    const { n, unit } = size;
    const area = phrase(n, unit);
    const facts = compare(n * UNITS[unit].toM2).slice(0, 2).map(describe);
    files[`pages/${size.slug}.html`] = page(index, {
      ...size,
      group: sizes.filter(p => p.n === n && p.unit === unit),
      title: `${t('page.title', { area })} · AreaVisualizer`,
      description: `${area} ${facts.join(' · ')}. ${t('page.about')}`,
      heading: t('page.heading', { area }),
      answer: `<strong>${escapeHTML(withUnit(n, unit))}</strong> ${facts.map(escapeHTML).join(' · ')}`,
      start: `m=area&amp;a=${n}&amp;u=${unit}`,
    });
  }

  const extra = Object.keys(files).filter(f => f.startsWith('pages/')).map(f => f.slice(6, -5));
  files['vercel.json'] = `${JSON.stringify({
    rewrites: extra.map(slug => ({ source: `/${slug}`, destination: `/pages/${slug}.html` })),
  }, null, 2)}\n`;
  files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    [...homes, ...sizes].map(p => `  <url><loc>${address(p.slug)}</loc></url>\n`).join('')}</urlset>\n`;
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = buildPages();
  rmSync(join(ROOT, 'pages'), { recursive: true, force: true });
  mkdirSync(join(ROOT, 'pages'));
  for (const [path, text] of Object.entries(files)) writeFileSync(join(ROOT, path), text);
  console.log(`wrote ${readdirSync(join(ROOT, 'pages')).length} pages`);
}
