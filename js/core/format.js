import { fromM3, naturalVolumeUnit } from './units.js';
import { locale, decimalMark, unitSymbol } from '../i18n/index.js';

// Numbers follow the visitor's language: 1,234.5 in English, 1.234,5 in German, 1 234,5 in Russian.

// Up to `sig` significant digits; big numbers get thousands separators and no decimals, and from
// ten million on are written in words ("10.8 trillion") unless `compact` is off.
export function formatNumber(n, sig = 3, compact = true) {
  if (!Number.isFinite(n)) return '—';
  if (compact && Math.abs(n) >= 1e7) {
    return n.toLocaleString(locale(), { notation: 'compact', compactDisplay: 'long', maximumSignificantDigits: sig });
  }
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString(locale());
  return Number(n.toPrecision(sig)).toLocaleString(locale(), { maximumFractionDigits: 12 });
}

// A number for an input field: no thousands separators, so it stays easy to edit and parse.
export const editableNumber = (n, sig = 6) =>
  Number(n.toPrecision(sig)).toLocaleString(locale(), { useGrouping: false, maximumFractionDigits: 12 });

// Lenient: "1.5", "1,5", "10 000", "1,000" and "1,000.5" all parse (in English; in languages with
// a decimal comma the roles of "." and "," swap). A thousands mark followed by groups of exactly
// three digits separates thousands; otherwise either mark is taken as the decimal point.
export function parseNumber(text, decimal = decimalMark()) {
  const group = decimal === ',' ? '.' : ',';
  let s = String(text).trim().replace(/\s/g, ''); // \s includes the non-breaking spaces in 1 234,5
  const mark = c => (c === '.' ? '[.]' : c);
  const grouped = new RegExp('^[0-9]{1,3}(' + mark(group) + '[0-9]{3})+(' + mark(decimal) + '[0-9]+)?$');
  s = grouped.test(s) ? s.split(group).join('') : s.replace(group, decimal);
  s = s.replace(decimal, '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return parseFloat(s);
}

// For any text that ends up in innerHTML — custom object names arrive through shared links.
export const escapeHTML = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const FT = 0.3048;

export const OTHER_SYSTEM = { metric: 'imperial', imperial: 'metric' };

// A number with its unit symbol ("25 m²", or "25 м²" in Russian).
export const withUnit = (n, unit) => `${formatNumber(n)} ${unitSymbol(unit)}`;

export function formatLength(m, system = 'metric') {
  if (system === 'imperial') {
    const ft = m / FT;
    if (ft < 1) return withUnit(ft * 12, 'in');
    if (ft < 5279.99) return withUnit(ft, 'ft'); // tolerance: 1 mi in meters ÷ ft isn't exactly 5280
    return withUnit(ft / 5280, 'mi');
  }
  if (m < 0.01) return withUnit(m * 1000, 'mm');
  if (m < 1) return withUnit(m * 100, 'cm');
  if (m < 1000) return withUnit(m, 'm');
  return withUnit(m / 1000, 'km');
}

// A length in one system, or in both side by side ("7.07 m · 23.2 ft") when comparing systems.
export const formatLengths = (m, system, both = false) =>
  both ? `${formatLength(m, system)} · ${formatLength(m, OTHER_SYSTEM[system])}` : formatLength(m, system);

// A volume in the unit that suits its size ("25 m³", "350 in³"), or in both systems.
export function formatVolume(m3, system = 'metric') {
  const unit = naturalVolumeUnit(m3, system);
  return withUnit(fromM3(m3, unit), unit);
}

export const formatVolumes = (m3, system, both = false) =>
  both ? `${formatVolume(m3, system)} · ${formatVolume(m3, OTHER_SYSTEM[system])}` : formatVolume(m3, system);
