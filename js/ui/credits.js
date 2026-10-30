import { MODELS } from '../data/models.js';
import { escapeHTML } from '../core/format.js';
import { t } from '../i18n/index.js';

const link = (url, text) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(text)}</a>`;

// Credits for the downloaded 3D models (required by CC-BY, polite for CC0), from data/models.js,
// and for the moon photo in the 3D night sky.
export function renderCredits(el) {
  const items = Object.values(MODELS).map(({ credit: c }) =>
    `<li>${t('credits.item', { title: link(c.url, c.title), author: escapeHTML(c.author), licence: escapeHTML(c.licence) })}</li>`);
  el.innerHTML = `
    <p>${t('credits.intro', { site: link('https://poly.pizza', 'Poly Pizza') })}</p>
    <ul>${items.join('')}</ul>
    <p>${t('credits.licences', { link: link('https://creativecommons.org/licenses/by/3.0/', t('credits.licence')) })}</p>
    <p>${t('credits.moon', { title: link('https://commons.wikimedia.org/wiki/File:Moon_nearside_LRO.jpg', 'Moon nearside (LRO)') })}</p>`;
}
