// Little round flags for the language menu, drawn on a 20 × 20 square that CSS clips to a circle.
// (Emoji flags would be simpler, but Windows shows them as plain letters.) Portuguese gets
// Brazil's flag and Spanish Spain's, matching the wording of the translations.
const stripes = (dir, colors) => colors.map((c, i) => (dir === 'h'
  ? `<rect y="${i * 6.66}" width="20" height="6.8" fill="${c}"/>`
  : `<rect x="${i * 6.66}" width="6.8" height="20" fill="${c}"/>`)).join('');

const FLAGS = {
  en: '<rect width="20" height="20" fill="#fff"/>' +
    [0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${i * 20 / 13}" width="20" height="${20 / 13}" fill="#b22234"/>`).join('') +
    '<rect width="10" height="10.8" fill="#3c3b6e"/>' +
    [[2, 2], [5, 2], [8, 2], [3.5, 4.2], [6.5, 4.2], [2, 6.4], [5, 6.4], [8, 6.4], [3.5, 8.6], [6.5, 8.6]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".55" fill="#fff"/>`).join(''),
  es: '<rect width="20" height="20" fill="#aa151b"/><rect y="5" width="20" height="10" fill="#f1bf00"/>',
  de: stripes('h', ['#000', '#dd0000', '#ffce00']),
  fr: stripes('v', ['#0055a4', '#fff', '#ef4135']),
  it: stripes('v', ['#009246', '#fff', '#ce2b37']),
  pt: '<rect width="20" height="20" fill="#009c3b"/><path d="M10 3.2L18 10l-8 6.8L2 10z" fill="#ffdf00"/>' +
    '<circle cx="10" cy="10" r="3.9" fill="#002776"/><path d="M6.3 9.3q3.7-1.3 7.4 1.2" stroke="#fff" stroke-width=".8" fill="none"/>',
  ro: stripes('v', ['#002b7f', '#fcd116', '#ce1126']),
  ru: stripes('h', ['#fff', '#0039a6', '#d52b1e']),
};

export const flagHTML = code =>
  `<span class="flag" aria-hidden="true"><svg viewBox="0 0 20 20">${FLAGS[code] ?? ''}</svg></span>`;
