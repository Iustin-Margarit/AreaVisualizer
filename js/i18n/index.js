import { UNITS, LENGTH_UNITS, VOLUME_UNITS } from '../core/units.js';
import en from './en.js';
import es from './es.js';
import de from './de.js';
import fr from './fr.js';
import it from './it.js';
import pt from './pt.js';
import ru from './ru.js';
import ro from './ro.js';

// Translations. Each language file has: `name` (in that language), `locale` (for numbers and
// plurals), `ui` (interface text, with {placeholders}), `units` (unit names), optional `symbols`
// (unit symbols, where they differ from m², ft…), `objects` (names of the objects), and
// `landmarks` (the comparison phrases — see describe() in core/comparisons.js). Anything a
// language leaves out falls back to English.
export const LANGUAGES = { en, es, de, fr, it, pt, ro, ru };

let current = en;

export const isLanguage = code => typeof code === 'string' && Object.hasOwn(LANGUAGES, code);

export function setLanguage(code) {
  current = LANGUAGES[code] ?? en;
}

export const locale = () => current.locale;

// The first of the browser's languages that we have, else English.
export function detectLanguage(languages = globalThis.navigator?.languages ?? []) {
  return languages.map(tag => tag.slice(0, 2).toLowerCase()).find(isLanguage) ?? 'en';
}

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));

export const t = (key, vars = {}) => fill(current.ui[key] ?? en.ui[key] ?? key, vars);

export const unitName = id => current.units?.[id] ?? en.units[id];

export const unitSymbol = id =>
  current.symbols?.[id] ?? (UNITS[id] ?? LENGTH_UNITS[id] ?? VOLUME_UNITS[id])?.label ?? id;

export const objectName = id => current.objects?.[id] ?? en.objects[id] ?? id;

// A landmark's phrases: { one, other, few?, many?, of } for countable things, { name, of, like? }
// for places.
export const landmarkText = id => current.landmarks?.[id] ?? en.landmarks[id];

export const landmarkName = id => {
  const text = landmarkText(id);
  return text.name ?? text.one;
};

// Picks the right form for a number: forms = { one, few, many, other } as the language needs.
export const plural = (n, forms) => forms[new Intl.PluralRules(current.locale).select(n)] ?? forms.other;

const marks = new Map();
// The decimal separator: "." in English, "," in most other languages.
export function decimalMark() {
  if (!marks.has(current.locale)) {
    marks.set(current.locale, new Intl.NumberFormat(current.locale).formatToParts(1.5).find(p => p.type === 'decimal').value);
  }
  return marks.get(current.locale);
}
