// Builds js/data/outlines.js: simplified outlines of the place landmarks, in meters.
//
//   node tools/outlines.mjs
//
// Countries come from Natural Earth (world-atlas package), Texas from the US Census (us-atlas
// package) — both public domain. New York City's five boroughs come from the NYC Department of
// City Planning (borough boundaries clipped to the shoreline, as GeoJSON in dwillis/nyc-maps).
// Manhattan, Paris and Vatican City are hand-traced approximations.
// Every outline is projected with an equal-area projection centered on the place, simplified, and
// scaled so its area matches the landmark's official area exactly.
import { writeFile } from 'node:fs/promises';
import { LANDMARKS } from '../js/data/landmarks.js';

// TopoJSON files, and GeoJSON files (pinned to a commit so the outlines can be rebuilt exactly).
const DATA = {
  world: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json',
  states: 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json',
};
const GEOJSON = {
  boroughs: 'https://raw.githubusercontent.com/dwillis/nyc-maps/951a03112459e17f96c15234e99f5b1c31cceae8/boroughs.geojson',
};

// [latitude, longitude] points, in order around the outline.
const TRACED = {
  vatican: [
    [41.9074, 12.4469], [41.9071, 12.4518], [41.9058, 12.4549], [41.9036, 12.4580], [41.9022, 12.4590],
    [41.9010, 12.4580], [41.9013, 12.4545], [41.9005, 12.4510], [41.9018, 12.4478], [41.9040, 12.4458],
  ],
  manhattan: [
    [40.7003, -74.0161], [40.7075, -74.0191], [40.7170, -74.0160], [40.7290, -74.0111], [40.7430, -74.0095],
    [40.7560, -74.0060], [40.7700, -73.9960], [40.7880, -73.9830], [40.8050, -73.9720], [40.8230, -73.9600],
    [40.8420, -73.9480], [40.8590, -73.9370], [40.8710, -73.9310], [40.8783, -73.9255], [40.8760, -73.9120],
    [40.8700, -73.9110], [40.8560, -73.9230], [40.8370, -73.9330], [40.8180, -73.9330], [40.8030, -73.9290],
    [40.7950, -73.9300], [40.7840, -73.9410], [40.7720, -73.9450], [40.7600, -73.9580], [40.7470, -73.9700],
    [40.7350, -73.9730], [40.7240, -73.9730], [40.7120, -73.9760], [40.7090, -73.9930], [40.7040, -74.0030],
    [40.7010, -74.0110],
  ],
  paris: [
    [48.9020, 2.3700], [48.8990, 2.3440], [48.8960, 2.3200], [48.8880, 2.2980], [48.8790, 2.2830],
    [48.8740, 2.2580], [48.8630, 2.2420], [48.8470, 2.2250], [48.8350, 2.2450], [48.8370, 2.2580],
    [48.8300, 2.2760], [48.8250, 2.3010], [48.8210, 2.3270], [48.8160, 2.3440], [48.8170, 2.3600],
    [48.8250, 2.3890], [48.8240, 2.4100], [48.8180, 2.4380], [48.8250, 2.4680], [48.8420, 2.4560],
    [48.8470, 2.4160], [48.8580, 2.4130], [48.8650, 2.4090], [48.8770, 2.4060], [48.8890, 2.3980],
    [48.8980, 2.3880],
  ],
};

// Which shape each place landmark uses. `largest` keeps only the biggest polygon
// (the contiguous US without Alaska and Hawaii); `geojson` takes every polygon in a GeoJSON file;
// `detail` is the simplification tolerance as a share of the shape's size (default 0.0025).
const SOURCES = {
  vatican: { traced: 'vatican' },
  manhattan: { traced: 'manhattan' },
  paris: { traced: 'paris' },
  luxembourg: { data: 'world', object: 'countries', id: '442' },
  belgium: { data: 'world', object: 'countries', id: '056' },
  uk: { data: 'world', object: 'countries', id: '826' },
  texas: { data: 'states', object: 'states', id: '48' },
  usa: { data: 'world', object: 'countries', id: '840', largest: true },
  nyc: { geojson: 'boroughs', detail: 0.005 }, // a coarser coast: its piers are all zigzags
};

// --- TopoJSON → exterior rings of [lon, lat] ----------------------------------------------

function decodeArcs({ arcs, transform }) {
  const [sx, sy] = transform.scale;
  const [tx, ty] = transform.translate;
  return arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]);
  });
}

function exteriorRings(geometry, arcs) {
  const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
  return polygons.map(([outer]) => {
    const ring = [];
    for (const index of outer) {
      const arc = index < 0 ? [...arcs[~index]].reverse() : arcs[index];
      ring.push(...(ring.length ? arc.slice(1) : arc));
    }
    return ring;
  });
}

// --- geometry -------------------------------------------------------------------------------

const R = 6371008.8;
const rad = d => (d * Math.PI) / 180;

// Lambert azimuthal equal-area around (lon0, lat0): x east, z south, meters.
function projector(lon0, lat0) {
  const [l0, p0] = [rad(lon0), rad(lat0)];
  return ([lon, lat]) => {
    const [l, p] = [rad(lon), rad(lat)];
    const k = Math.sqrt(2 / (1 + Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0)));
    const x = R * k * Math.cos(p) * Math.sin(l - l0);
    const y = R * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0));
    return [x, -y];
  };
}

const ringArea = ring => Math.abs(ring.reduce((sum, [x, z], i) => {
  const [x2, z2] = ring[(i + 1) % ring.length];
  return sum + x * z2 - x2 * z;
}, 0)) / 2;

// Douglas–Peucker on an open polyline.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dz) || 1;
  let worst = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((points[i][0] - a[0]) * dz - (points[i][1] - a[1]) * dx) / len;
    if (d > worst) [worst, index] = [d, i];
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

function buildOutline(rings, area, { largest = false, detail = 0.0025 } = {}) {
  rings = rings.map(r => (r.length > 1 && r[0].join() === r.at(-1).join() ? r.slice(0, -1) : r));

  // Drop specks first (rough lon/lat areas are enough to compare pieces): keep the main pieces,
  // or only the biggest one.
  const rough = rings.map(r => ringArea(r.map(([lon, lat]) => [lon * Math.cos(rad(lat)), lat])));
  const biggest = Math.max(...rough);
  rings = rings.filter((_, i) => (largest ? rough[i] === biggest : rough[i] >= biggest * 0.02));

  // Then project around the center of what's left (projecting around everything would put the
  // contiguous US far off-center because the Aleutians cross the 180° meridian).
  const all = rings.flat();
  const lons = all.map(p => p[0]), lats = all.map(p => p[1]);
  const project = projector((Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2);
  let parts = rings.map(r => r.map(project));

  const xs = parts.flat().map(p => p[0]), zs = parts.flat().map(p => p[1]);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  // A closed ring starts and ends at the same point, so split it at the point farthest from the
  // start and simplify the two halves.
  const simplifyRing = (r, tolerance) => {
    const far = r.reduce((best, p, i) => (Math.hypot(p[0] - r[0][0], p[1] - r[0][1]) > Math.hypot(r[best][0] - r[0][0], r[best][1] - r[0][1]) ? i : best), 0);
    return [...simplify(r.slice(0, far + 1), tolerance).slice(0, -1), ...simplify([...r.slice(far), r[0]], tolerance).slice(0, -1)];
  };
  parts = parts.map(r => simplifyRing(r, extent * detail)).filter(r => r.length >= 3);

  // Center on the bounding box of what's drawn (simplifying can drop an extreme point) and scale
  // to the official area.
  const [sxs, szs] = [parts.flat().map(p => p[0]), parts.flat().map(p => p[1])];
  const cx = (Math.min(...sxs) + Math.max(...sxs)) / 2, cz = (Math.min(...szs) + Math.max(...szs)) / 2;
  const scale = Math.sqrt(area / parts.reduce((sum, r) => sum + ringArea(r), 0));
  const unit = extent > 50000 ? 100 : 1; // round big shapes to 100 m, small ones to 1 m
  return parts.map(r => r.flatMap(([x, z]) => [x, z].map((v, i) => Math.round(((v - (i ? cz : cx)) * scale) / unit) * unit)));
}

// --- main -----------------------------------------------------------------------------------

const topologies = {};
for (const [name, url] of Object.entries(DATA)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const topology = await res.json();
  topologies[name] = { topology, arcs: decodeArcs(topology) };
}

const geojsons = {};
for (const [name, url] of Object.entries(GEOJSON)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  geojsons[name] = await res.json();
}

const outlines = {};
for (const [id, source] of Object.entries(SOURCES)) {
  const landmark = LANDMARKS.find(l => l.id === id);
  let rings;
  if (source.traced) {
    rings = [TRACED[source.traced].map(([lat, lon]) => [lon, lat])];
  } else if (source.geojson) {
    rings = geojsons[source.geojson].features.flatMap(({ geometry: g }) =>
      (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(([outer]) => outer));
  } else {
    const { topology, arcs } = topologies[source.data];
    const geometry = topology.objects[source.object].geometries.find(g => String(g.id) === source.id);
    if (!geometry) throw new Error(`${id}: no ${source.object} with id ${source.id}`);
    rings = exteriorRings(geometry, arcs);
  }
  outlines[id] = buildOutline(rings, landmark.area, source);
  console.log(`${id}: ${outlines[id].length} part(s), ${outlines[id].reduce((n, r) => n + r.length / 2, 0)} points`);
}

const body = Object.entries(outlines)
  .map(([id, parts]) => `  ${id}: [\n${parts.map(p => `    [${p.join(',')}],`).join('\n')}\n  ],`)
  .join('\n');

await writeFile(new URL('../js/data/outlines.js', import.meta.url), `// Generated by tools/outlines.mjs — do not edit by hand.
// Place outlines as flat [x0, z0, x1, z1, …] rings in meters (x → east, z → south), centered on
// their bounding box and scaled to the landmark's official area. Sources: Natural Earth and the
// US Census (public domain), NYC Department of City Planning (New York City); Manhattan, Paris and
// Vatican City are hand-traced approximations.
export const OUTLINES = {
${body}
};
`);
