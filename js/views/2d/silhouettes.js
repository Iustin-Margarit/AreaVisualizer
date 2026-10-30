// Top-down silhouettes, centered on (0, 0) in meters: x spans the object's width `w`, y its depth `d`.
// Fronts face +x. Classes are themed in CSS: .body (outlined main colour), .light / .shade (tints), .white,
// .fill (main colour, no outline), .field and .line (stadium pitch).

const rect = (x, y, w, h, rx = 0, cls = 'body') =>
  `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const circle = (cx, cy, r, cls = 'body') => `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
const ellipse = (cx, cy, rx, ry, cls = 'body') =>
  `<ellipse class="${cls}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const poly = (pts, cls = 'body') => `<path class="${cls}" d="M${pts.map(p => p.join(' ')).join('L')}Z"/>`;
const mirrorY = pts => pts.map(([x, y]) => [x, -y]);
const mirrorX = pts => pts.map(([x, y]) => [-x, y]);

const DRAW = {
  box: (w, d) => rect(-w / 2, -d / 2, w, d, Math.min(w, d) * 0.08),

  phone: (w, d) =>
    rect(-w / 2, -d / 2, w, d, w * 0.18) +
    rect(-w * 0.42, -d * 0.44, w * 0.84, d * 0.88, w * 0.1, 'shade'),

  chair: (w, d) =>
    rect(-w * 0.45, -d * 0.32, w * 0.9, d * 0.8, w * 0.1) +
    rect(-w / 2, -d / 2, w, d * 0.18, w * 0.06, 'shade'),

  // Shoulders with the head on top.
  person: (w, d) =>
    ellipse(0, 0, w / 2, d * 0.38) +
    circle(0, d * 0.04, Math.min(w, d) * 0.36, 'shade'),

  dog: (w, d) =>
    poly([[-w * 0.32, -d * 0.06], [-w * 0.5, d * 0.22], [-w * 0.46, d * 0.3], [-w * 0.3, d * 0.08]], 'shade') +
    ellipse(-w * 0.04, 0, w * 0.3, d * 0.4) +
    ellipse(w * 0.27, -d * 0.26, w * 0.05, d * 0.13, 'shade') +
    ellipse(w * 0.27, d * 0.26, w * 0.05, d * 0.13, 'shade') +
    circle(w * 0.3, 0, d * 0.3) +
    ellipse(w * 0.42, 0, w * 0.07, d * 0.13, 'light'),

  car: (w, d) => {
    const windshield = [[w * 0.06, -d * 0.36], [w * 0.2, -d * 0.42], [w * 0.2, d * 0.42], [w * 0.06, d * 0.36]];
    const rearWindow = [[-w * 0.24, -d * 0.36], [-w * 0.32, -d * 0.4], [-w * 0.32, d * 0.4], [-w * 0.24, d * 0.36]];
    return ellipse(w * 0.12, -d * 0.52, w * 0.025, d * 0.06, 'shade') +
      ellipse(w * 0.12, d * 0.52, w * 0.025, d * 0.06, 'shade') +
      rect(-w / 2, -d / 2, w, d, d * 0.3) +
      poly(windshield, 'shade') +
      poly(rearWindow, 'shade') +
      rect(-w * 0.24, -d * 0.36, w * 0.3, d * 0.72, d * 0.06, 'light');
  },

  // Canopy of overlapping lobes: outlined pass first, then an unoutlined pass hides the inner seams.
  tree: (w, d) => {
    const r = Math.min(w, d) / 2;
    const lobes = cls => Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      return circle(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.45, cls);
    }).join('') + circle(0, 0, r * 0.62, cls);
    return lobes('body') + lobes('fill') + circle(-r * 0.18, -r * 0.2, r * 0.32, 'light');
  },

  bus: (w, d) =>
    rect(-w / 2, -d / 2, w, d, d * 0.18) +
    rect(-w * 0.44, -d * 0.36, w * 0.86, d * 0.72, d * 0.1, 'light') +
    rect(-w * 0.1, -d * 0.22, w * 0.2, d * 0.44, d * 0.05, 'shade') +
    rect(w * 0.45, -d * 0.42, w * 0.04, d * 0.84, d * 0.05, 'shade'),

  // Hip roof: lit back face, shaded front face, two side triangles, a chimney.
  house: (w, d) => {
    const rx = w * 0.2;
    return poly([[-w / 2, -d / 2], [w / 2, -d / 2], [rx, 0], [-rx, 0]], 'light') +
      poly([[-w / 2, d / 2], [w / 2, d / 2], [rx, 0], [-rx, 0]], 'shade') +
      poly([[-w / 2, -d / 2], [-rx, 0], [-w / 2, d / 2]]) +
      poly([[w / 2, -d / 2], [rx, 0], [w / 2, d / 2]]) +
      rect(w * 0.22, -d * 0.34, w * 0.08, d * 0.08, 0, 'shade');
  },

  building: (w, d) =>
    rect(-w / 2, -d / 2, w, d) +
    rect(-w * 0.46, -d * 0.42, w * 0.92, d * 0.84, 0, 'light') +
    rect(-w * 0.3, -d * 0.25, w * 0.18, d * 0.35, 0, 'shade') +
    rect(w * 0.08, -d * 0.2, w * 0.12, d * 0.2, 0, 'shade') +
    rect(w * 0.24, d * 0.05, w * 0.12, d * 0.2, 0, 'shade'),

  // Swept wings and tailplane, four engines, fuselage on top. w = length, d = wingspan.
  plane: (w, d) => {
    const u = w / 2, v = d / 2, hw = v * 0.1;
    const wing = [[u * 0.2, 0], [-u * 0.3, -v], [-u * 0.45, -v], [-u * 0.25, 0]];
    const tail = [[-u * 0.72, 0], [-u * 0.92, -v * 0.34], [-u, -v * 0.34], [-u * 0.9, 0]];
    const engine = (x, y) => ellipse(x, y, u * 0.07, v * 0.035, 'shade');
    return poly(wing) + poly(mirrorY(wing)) + poly(tail) + poly(mirrorY(tail)) +
      engine(u * 0.06, -v * 0.36) + engine(u * 0.06, v * 0.36) +
      engine(-u * 0.1, -v * 0.66) + engine(-u * 0.1, v * 0.66) +
      `<path class="light" d="M${-u} ${-hw * 0.5}L${u * 0.8} ${-hw}Q${u} ${-hw * 0.6} ${u} 0Q${u} ${hw * 0.6} ${u * 0.8} ${hw}L${-u} ${hw * 0.5}Z"/>`;
  },

  stadium: (w, d) =>
    rect(-w / 2, -d / 2, w, d, d * 0.4) +
    rect(-w * 0.36, -d * 0.3, w * 0.72, d * 0.6, d * 0.2, 'shade') +
    rect(-w * 0.23, -d * 0.18, w * 0.46, d * 0.36, 0, 'field') +
    `<path class="line" d="M0 ${-d * 0.18}V${d * 0.18}"/>` +
    circle(0, 0, d * 0.05, 'line'),

  // Eiffel Tower from above: four legs joined by diagonal bracing to the central column.
  tower: (w, d) => {
    const t = w * 0.09, leg = w * 0.24;
    const band = [[-w / 2, -d / 2 + t], [-w / 2 + t, -d / 2], [w / 2, d / 2 - t], [w / 2 - t, d / 2]];
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      .map(([sx, sy]) => rect(sx > 0 ? w / 2 - leg : -w / 2, sy > 0 ? d / 2 - leg : -d / 2, leg, leg))
      .join('');
    return poly(band, 'shade') + poly(mirrorX(band), 'shade') + legs +
      rect(-w * 0.1, -d * 0.1, w * 0.2, d * 0.2, 0, 'light');
  },

  coin: w => circle(0, 0, w / 2) + circle(0, 0, w * 0.38, 'light'),

  // Pointed bow toward +x, white decks with a pool, the funnel aft.
  ship: (w, d) =>
    poly([[-w / 2, -d * 0.42], [w * 0.3, -d / 2], [w / 2, 0], [w * 0.3, d / 2], [-w / 2, d * 0.42]]) +
    rect(-w * 0.42, -d * 0.4, w * 0.67, d * 0.8, d * 0.1, 'white') +
    rect(-w * 0.1, -d * 0.15, w * 0.12, d * 0.3, d * 0.05, 'light') +
    rect(-w * 0.3, -d * 0.12, w * 0.06, d * 0.24, d * 0.04, 'shade'),

  // Burj Khalifa from above: its Y-shaped plan, stepping in as it rises.
  spire: (w, d) => {
    const s = w / 109, ox = -10.6 * s, hw = 13 * s;
    const wings = (length, cls) => [0, 1, 2].map(k => {
      const a = (k * 2 * Math.PI) / 3, [ux, uz, px, pz] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
      return poly([[ox + px * hw, pz * hw], [ox + px * hw + ux * length * s, pz * hw + uz * length * s],
        [ox - px * hw + ux * length * s, -pz * hw + uz * length * s], [ox - px * hw, -pz * hw]], cls);
    }).join('');
    return wings(65) + wings(45, 'light') + wings(25, 'white') + circle(ox, 0, 6 * s, 'shade');
  },

  // Golden Gate Bridge: the deck with its two towers 1,280 m apart.
  bridge: (w, d) => {
    const sx = w / 2737;
    return rect(-w / 2, -d * 0.45, w, d * 0.9) +
      [-1, 1].map(s => rect(s * 640 * sx - 7 * sx, -d / 2, 14 * sx, d, 0, 'shade')).join('');
  },

  // Mount Fuji: the cone, its snow cap and the crater.
  mountain: w => circle(0, 0, w / 2) + circle(0, 0, w * 0.11, 'white') + circle(0, 0, w * 0.0175, 'shade'),

  moon: w =>
    circle(0, 0, w / 2) +
    circle(-w * 0.15, -w * 0.1, w * 0.12, 'shade') + circle(w * 0.12, -w * 0.18, w * 0.09, 'shade') +
    circle(w * 0.05, w * 0.15, w * 0.1, 'shade') + circle(-w * 0.2, w * 0.25, w * 0.03, 'light'),
};

export const KINDS = Object.keys(DRAW);

export const drawSilhouette = ({ kind, w, d }) => (DRAW[kind] ?? DRAW.box)(w, d);
