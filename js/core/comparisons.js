import { LANDMARKS } from '../data/landmarks.js';
import { VOLUMES } from '../data/volumes.js';
import { formatNumber } from './format.js';
import { t, landmarkText, volumeText, plural } from '../i18n/index.js';

const closeness = c => Math.abs(Math.log(c.ratio));

// The landmarks whose ratio to `areaM2` is easiest to grasp (closest to 1×, within a sane range).
// When possible the pick mixes "N of something smaller" with "X% of something bigger".
// `keep` (a landmark id) is always listed — the one the visitor picked stays, even far off scale.
export function compare(areaM2, { min = 0.05, max = 500, limit = 3, keep = null } = {}) {
  const ranked = LANDMARKS
    .map(l => ({ ...l, ratio: areaM2 / l.area }))
    .filter(c => c.ratio >= min && c.ratio <= max)
    .sort((a, b) => closeness(a) - closeness(b));
  const picked = ranked.slice(0, limit);
  for (const side of [c => c.ratio >= 1, c => c.ratio < 1]) {
    const alt = ranked.find(side);
    if (picked.length === limit && limit > 1 && alt && !picked.some(side)) picked[limit - 1] = alt;
  }
  picked.sort((a, b) => closeness(a) - closeness(b));
  const kept = LANDMARKS.find(l => l.id === keep);
  if (kept && !picked.some(c => c.id === keep)) picked.push({ ...kept, ratio: areaM2 / kept.area, extra: true });
  return picked;
}

// The volumes closest to this one: the nearest smaller and the nearest bigger, the closest first.
export function compareVolume(m3, { min = 0.0005, max = 2000 } = {}) {
  const ranked = VOLUMES
    .map(v => ({ ...v, ratio: m3 / v.m3 }))
    .filter(c => c.ratio >= min && c.ratio <= max)
    .sort((a, b) => closeness(a) - closeness(b));
  const other = ranked.find(c => (c.ratio >= 1) !== (ranked[0].ratio >= 1));
  return [ranked[0], other].filter(Boolean);
}

export const describeVolume = comparison => phrase(comparison, volumeText(comparison.id));

// "≈ 16 A4 sheets", "≈ 55% of a single bed", "≈ 2× Vatican City", in the visitor's language: the
// phrases and their grammar (cases, number forms) come from the language file.
export const describe = comparison => phrase(comparison, landmarkText(comparison.id));

function phrase({ ratio, proper }, text) {
  const name = text.name ?? text.one;
  if (ratio >= 0.95 && ratio < 1.05) return proper ? t('cmp.same', { of: text.of, like: text.like ?? name }) : t('cmp.one', { one: text.one });
  if (ratio < 1) return t('cmp.pct', { pct: formatNumber(ratio * 100, 2), of: text.of });
  const n = formatNumber(ratio, 2);
  if (proper) return t('cmp.times', { n, name });
  const shown = ratio >= 1000 ? Math.round(ratio) : Number(ratio.toPrecision(2)); // the number as printed
  return t('cmp.count', { n, plural: plural(shown, text) });
}
