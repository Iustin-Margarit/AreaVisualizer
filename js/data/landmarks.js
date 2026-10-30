// Well-known areas for the "about the size of" comparisons, and to draw next to the area.
// Rectangles give their real `size` [length, width] in meters (area follows); places give their
// `area` in m² and have an outline in outlines.js. `proper` names (places) are compared as
// "2× Vatican City", countable things as "3 tennis courts". Names and phrases in every language
// are in js/i18n/ (`landmarks`).
const RAW = [
  { id: 'card',        size: [0.0856, 0.05398] },
  { id: 'paper',       size: [0.297, 0.21] },    // 16 of them make 1 m² (A0)
  { id: 'singlebed',   size: [1.9, 0.95] },
  { id: 'kingbed',     size: [2.03, 1.93] },     // 80 × 76 in
  { id: 'parking',     size: [5, 2.5] },
  { id: 'container',   size: [12.19, 2.44] },    // 40 ft
  { id: 'tennis',      size: [23.77, 10.97] },
  { id: 'basketball',  size: [28.65, 15.24] },   // NBA
  { id: 'pool',        size: [50, 25] },
  { id: 'football',    size: [109.73, 48.77] }, // incl. end zones
  { id: 'soccer',      size: [105, 68] },
  { id: 'block',       size: [274, 80] },        // 900 × 264 ft
  { id: 'vatican',     proper: true, area: 0.49e6 },
  { id: 'centralpark', proper: true, size: [4000, 852.5] },
  { id: 'manhattan',   proper: true, area: 59.1e6 },
  { id: 'paris',       proper: true, area: 105.4e6 },
  { id: 'nyc',         proper: true, area: 783.8e6 },
  { id: 'luxembourg',  proper: true, area: 2586e6 },
  { id: 'belgium',     proper: true, area: 30689e6 },
  { id: 'uk',          proper: true, area: 243610e6 },
  { id: 'texas',       proper: true, area: 695662e6 },
  { id: 'usa',         proper: true, area: 8080464e6 },
  { id: 'earth',       proper: true, area: 1.489e14 },
];

export const LANDMARKS = RAW.map(l => ({ ...l, area: l.area ?? l.size[0] * l.size[1] }));
