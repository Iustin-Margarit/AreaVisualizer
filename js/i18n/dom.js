import { t } from './index.js';

// Puts the current language into fixed markup: data-i18n="key" sets an element's text,
// data-i18n-attr="title:key;aria-label:key" sets attributes. Text that changes with the state is
// written by its component instead.
export function translatePage(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  }
}
