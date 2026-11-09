import { formatLengths, escapeHTML } from '../core/format.js';
import { keyDimension } from '../core/references.js';
import { footprint, corners } from '../core/arrange.js';
import { MAX_CORNERS, crosses, innerPoint, reachableCorner } from '../core/shapes.js';
import { contentKey } from '../core/scene.js';
import { fitCamera, zoomAt, panBy, clampPan, toScreen, toWorld } from './2d/camera.js';
import { gridStep } from './2d/grid.js';
import { layoutLabels, labelRank } from './labels.js';
import { drawSilhouette } from './2d/silhouettes.js';
import { kindColor } from './palette.js';
import { MODELS } from '../data/models.js';
import { toolsHTML, legendHTML, coarsePointer } from './stage-ui.js';
import { pictureOfSvg } from './picture.js';
import { t as translate } from '../i18n/index.js'; // `t` is the top edge of a rectangle here
import { translatePage } from '../i18n/dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = { top: 92, right: 60, bottom: 50, left: 52 }; // room for stage controls, dimension lines, labels (+ legend)
const PHONE_PAD = { top: 52, right: 30, bottom: 46, left: 44 }; // phones keep most controls off the picture
const MAX_ZOOM_IN = 1000;  // relative to the fitted view
const MAX_ZOOM_OUT = 5;
const GRID_MIN_PX = 40;    // grid lines never closer than this
const FONT = 12;
const TINY_PX = 10;        // objects smaller than this on screen get a locator ring
const RING_R = 10;

const textWidth = (text, size = FONT) => text.length * size * 0.58;
let written = []; // where text has gone on the picture so far this frame: later labels keep off it
const text = (x, y, s, cls) => {
  const half = textWidth(s, cls === 'area-text' ? 15 : FONT) / 2;
  written.push({ left: x - half, right: x + half, y });
  return `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${s}</text>`;
};

// Whether a straight line from a to b passes through a box [left, top, right, bottom].
function sideInBox([ax, ay], [bx, by], [left, top, right, bottom]) {
  let [from, to] = [0, 1];
  for (const [p, q] of [[ax - bx, ax - left], [bx - ax, right - ax], [ay - by, ay - top], [by - ay, bottom - ay]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) {
      from = Math.max(from, q / p);
    } else {
      to = Math.min(to, q / p);
    }
    if (from > to) return false;
  }
  return true;
}

const lineTaken = (x, y, width) => written.some(p => x - width / 2 < p.right + 4 && x + width / 2 > p.left - 4 && Math.abs(y - p.y) < 18);

// The nearest free line for text this wide, from y downward (or upward, with a step of -4).
function freeLine(x, y, width, step = 4) {
  let line = y;
  while (lineTaken(x, line, width) && Math.abs(line - y) < 64) line += step;
  return line;
}

function arrow(x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const nx = -uy * 3.5, ny = ux * 3.5, a = Math.min(7, len / 3);
  const head = (tx, ty, dir) =>
    `M${tx} ${ty}L${tx + dir * ux * a + nx} ${ty + dir * uy * a + ny}L${tx + dir * ux * a - nx} ${ty + dir * uy * a - ny}Z`;
  return `<line class="dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
    `<path class="dim-head" d="${head(x1, y1, 1)}${head(x2, y2, -1)}"/>`;
}

const pathOf = (points, close) => `M${points.map(p => p.join(' ')).join('L')}${close ? 'Z' : ''}`;

// The comparison landmark: a dashed outline with its markings (court lines, pillows…).
function landmarkSVG(landmark, target = 'landmark') {
  if (!landmark) return '';
  const { x, z, r, shape } = landmark;
  const marks = shape.marks.length ? `<path class="lm-marks" d="${shape.marks.map(m => pathOf(m, false)).join('')}"/>` : '';
  return `<g class="landmark ${target}" data-target="${target}" transform="translate(${x} ${z}) rotate(${r})">
    <path class="lm-shape" d="${shape.rings.map(r => pathOf(r, true)).join('')}"/>${marks}</g>`;
}

const objectArt = r => (MODELS[r.id]
  ? `<image href="assets/top/${r.id}.png" x="${-r.w / 2}" y="${-r.d / 2}" width="${r.w}" height="${r.d}" preserveAspectRatio="none"/>`
  : drawSilhouette(r));

const capitalize = s => s[0].toUpperCase() + s.slice(1);
const CLOSE_PX = 22;       // this near the first corner, a tap closes the shape being drawn
const TAP_WAIT_MS = 320;   // a tap selects after this, if no second tap came
const GRAB_PX = 16;        // how near a click must be to a tiny object to grab it
const DRAG_PX = 3;         // a press that moves less than this is a tap
const SNAP_PX = 8;         // objects this close to the area's edge stand flush against it
const BIG_SHARE = 0.7;     // an object this big on screen pans the view until it's selected

// Top-down view. The world group is drawn in meters and moved by a transform; grid, dimensions
// and labels are redrawn in screen pixels each frame so they stay crisp and constant-size.
// `host` (ui/arrange.js) knows what's selected; objects are grabbed and dragged here.
export function createView(host) {
  let root, svg, gridEl, world, overlay, handles, legendScale, hint;
  let corner = null;        // { index, from, moved } while a corner of a custom shape is moved
  let pickedCorner = null;  // the corner tapped last, which offers to be removed
  let hover = null;         // where the mouse is while a shape is being drawn
  let builtFrom = '';       // contentKey of what's currently drawn
  let lastHandleAt = -1e9;  // when a corner was last touched
  let resizeObserver = null;
  let scene = null;
  let opts = { system: 'metric', both: false, areaLabel: '', volumeLabel: '', settings: { grid: true, labels: true, measures: true } };
  let vw = 0, vh = 0;
  let cam = null, fitted = null, userMoved = false;
  let frame = 0;
  const pointers = new Map();
  let drag = null;  // { target, dx, dz, from, moved } while an object is being moved
  let press = null; // { at, target } until the pointer lifts or moves: a tap selects
  let tapTimer = 0;

  const limits = () => [fitted.mpp / MAX_ZOOM_IN, fitted.mpp * MAX_ZOOM_OUT];
  const screen = (x, y) => toScreen(cam, vw, vh, x, y);

  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function refit() {
    // The legend wraps to two lines on narrow screens; keep labels clear of it.
    const legendHeight = root.querySelector('.stage-legend').offsetHeight;
    const pad = matchMedia('(max-width: 620px)').matches ? PHONE_PAD : PAD;
    fitted = fitCamera(scene.bounds, vw, vh, { ...pad, bottom: pad.bottom + legendHeight });
    if (!userMoved) cam = fitted;
  }

  function setCam(next) {
    cam = clampPan(next, scene.bounds, vw, vh);
    userMoved = true;
    hint.hidden = true;
    requestDraw();
  }

  function zoomBy(factor, px = vw / 2, py = vh / 2) {
    if (scene) setCam(zoomAt(cam, factor, px, py, vw, vh, limits()));
  }

  function resetView() {
    userMoved = false;
    if (scene) { refit(); requestDraw(); }
  }

  // --- drawing ---------------------------------------------------------------

  function drawWorld() {
    const { shape, references } = scene;
    const shapeEl = shape.type === 'circle'
      ? `<circle class="shape" cx="0" cy="0" r="${shape.radius}"/>`
      : shape.type === 'polygon'
        ? `<path class="shape" d="${pathOf(shape.points, true)}"/>`
        : `<rect class="shape" x="${-shape.width / 2}" y="${-shape.depth / 2}" width="${shape.width}" height="${shape.depth}"/>`;
    // Objects with a downloaded model use its picture from above; the rest are drawn.
    const refs = references.map((r, i) => `<g class="ref" data-target="${i}" style="--c:${kindColor(r.kind)}" transform="translate(${r.x} ${r.z}) rotate(${r.r ?? 0})">${
      objectArt(r)
    }<rect class="hit" x="${-r.w / 2}" y="${-r.d / 2}" width="${r.w}" height="${r.d}"/></g>`).join('');
    world.innerHTML = landmarkSVG(scene.landmark) + landmarkSVG(scene.second, 'second') + shapeEl + refs;
    svg.setAttribute('aria-label', translate('aria.2d') +
      (scene.height ? translate('aria.high', { d: formatLengths(scene.height, opts.system) }) : '') +
      (references.length ? translate('aria.nextTo', { list: references.map(r => r.name).join(', ') }) : ''));
  }

  // Grid lines start at the shape's top-left corner so whole squares line up with its edges.
  function gridPath(step) {
    const ox = -scene.shape.width / 2, oy = -scene.shape.depth / 2;
    const [x0, y0] = toWorld(cam, vw, vh, 0, 0);
    const [x1, y1] = toWorld(cam, vw, vh, vw, vh);
    let d = '';
    for (let k = Math.ceil((x0 - ox) / step); ox + k * step <= x1; k++) {
      d += `M${Math.round(screen(ox + k * step, 0)[0]) + 0.5} 0V${vh}`;
    }
    for (let k = Math.ceil((y0 - oy) / step); oy + k * step <= y1; k++) {
      d += `M0 ${Math.round(screen(0, oy + k * step)[1]) + 0.5}H${vw}`;
    }
    return d;
  }

  function shapeRect() {
    const { width, depth } = scene.shape;
    const [l, t] = screen(-width / 2, -depth / 2);
    const [r, b] = screen(width / 2, depth / 2);
    return { l, t, r, b };
  }

  // Where the area's own label goes: the middle, or a custom shape's roomiest spot. Finding that
  // takes a while, so it's only done for a new outline, and not while a corner is being dragged.
  let roomiest = { outline: '', at: null };
  function areaSpot({ l, t, r, b }) {
    const { shape } = scene;
    if (shape.type !== 'polygon') return [(l + r) / 2, (t + b) / 2];
    const outline = shape.points.join(';');
    if (!roomiest.at || (outline !== roomiest.outline && !corner)) roomiest = { outline, at: innerPoint(shape.points) };
    return screen(...roomiest.at);
  }

  // The length of each side of a custom shape, written just outside it.
  function edgeLengths(rect) {
    const pts = scene.shape.points.map(([x, z]) => screen(x, z));
    const clockwise = pts.reduce((sum, [x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length];
      return sum + x * ny - nx * y;
    }, 0) > 0;
    const { points } = scene.shape;
    const metres = i => Math.hypot(points[(i + 1) % pts.length][0] - points[i][0], points[(i + 1) % pts.length][1] - points[i][1]);
    // The longest sides first, each only if it has room: a shape with many short sides stays readable.
    const [cx, cy] = areaSpot(rect);
    const areaHalf = textWidth(opts.areaLabel, 15) / 2 + 4;
    const taken = [[cx - areaHalf, cy - 10, cx + areaHalf, cy + 10]];
    return points.map((_, i) => i).sort((a, b) => metres(b) - metres(a)).map(i => {
      const [p, q] = [pts[i], pts[(i + 1) % pts.length]];
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const label = formatLengths(metres(i), opts.system, opts.both);
      const half = textWidth(label) / 2 + 6;
      if (length < half * 1.2) return '';
      const side = clockwise ? 1 : -1;
      const [nx, ny] = [(side * (q[1] - p[1])) / length, (-side * (q[0] - p[0])) / length];
      const clear = 16 + Math.abs(nx) * (textWidth(label) / 2); // beside an upright side, its width counts
      // Outside the shape, unless the edge of the view or something else is in the way: then just
      // inside it, and if that's no better, not at all.
      const outward = (p[0] + q[0]) / 2 + nx * clear;
      const spot = (outward < half || outward > vw - half ? [-1] : [1, -1]).map(flip => {
        const x = (p[0] + q[0]) / 2 + flip * nx * clear;
        const y = (p[1] + q[1]) / 2 + flip * ny * clear + 4;
        return { x, y, box: [x - half, y - 13, x + half, y + 5] };
      }).find(({ box }) => !taken.some(o => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]) &&
        !pts.some((a, j) => j !== i && sideInBox(a, pts[(j + 1) % pts.length], box)));
      if (!spot) return '';
      taken.push(spot.box);
      return text(spot.x, spot.y, label, 'dim-text');
    }).join('');
  }

  function dimensions({ l, t, r, b }) {
    if (r - l < 60) return '';
    const { shape } = scene;
    if (shape.type === 'polygon') return edgeLengths({ l, t, r, b });
    const fmt = m => formatLengths(m, opts.system, opts.both);
    const y = t - 18;
    let out = `<path class="dim-ext" d="M${l} ${t - 6}V${t - 26}M${r} ${t - 6}V${t - 26}"/>` +
      arrow(l, y, r, y) +
      text((l + r) / 2, y - 6, shape.type === 'circle' ? `⌀ ${fmt(shape.width)}` : fmt(shape.width), 'dim-text');
    if (shape.type !== 'circle') {
      const x = l - 18;
      out += `<path class="dim-ext" d="M${l - 6} ${t}H${l - 26}M${l - 6} ${b}H${l - 26}"/>` +
        arrow(x, t, x, b) +
        `<text class="dim-text" transform="translate(${x - 6} ${(t + b) / 2}) rotate(-90)" text-anchor="middle">${fmt(shape.depth)}</text>`;
    }
    return out;
  }

  // The area in the middle of the shape. A height can't be seen from above, so it's written
  // underneath with the volume — or just the height, if that's all that fits.
  function areaText({ l, t, r, b }) {
    const label = opts.areaLabel;
    if (!label) return '';
    const [cx, cy] = areaSpot({ l, t, r, b });
    // Too small to hold its label (next to Texas, say): written above it, a dot gets a ring too.
    if (r - l < textWidth(label, 15) + 16 || b - t < 28) {
      const tiny = Math.max(r - l, b - t) < TINY_PX;
      const half = textWidth(label, 15) / 2 + 6;
      const widthDrawnAbove = r - l >= 60 && scene.shape.type !== 'polygon'; // dimensions(), above: stay clear of it
      const x = Math.max(half, Math.min(cx, vw - half));
      const y = freeLine(x, tiny ? cy - RING_R - 8 : t - (widthDrawnAbove ? 42 : 8), textWidth(label, 15), -4);
      return (tiny ? `<circle class="locator" cx="${cx}" cy="${cy}" r="${RING_R}"/>` : '') + text(x, y, label, 'area-text');
    }
    const { height } = scene;
    const tall = `↕ ${translate('dims.high', { d: formatLengths(height, opts.system, opts.both) })}`;
    const second = [`${tall} · ${opts.volumeLabel}`, tall].find(line => r - l >= textWidth(line) + 16);
    if (!height || !second || b - t < 48) return text(cx, cy + 5, label, 'area-text');
    return text(cx, cy - 3, label, 'area-text') + text(cx, cy + 15, second, 'volume-text');
  }

  function placeLabel(lm, extra = '') {
    if (!lm) return '';
    const { hx, hz } = footprint({ w: lm.shape.width, d: lm.shape.depth, r: lm.r });
    const [l, t] = screen(lm.x - hx, lm.z - hz);
    const [r, b] = screen(lm.x + hx, lm.z + hz);
    if (Math.max(r - l, b - t) < 6) return '';
    const [name, x] = [capitalize(lm.name), (l + r) / 2];
    const width = textWidth(name);
    // Under its shape, or if that's taken, over it; failing that, the nearest free line below.
    const useOver = lineTaken(x, b + 16, width) && t > 20 && !lineTaken(x, t - 6, width);
    return text(x, useOver ? t - 6 : freeLine(x, b + 16, width), name, `lm-text${extra}`);
  }

  // Name and key size under each object ("Car ↔ 4.5 m"), kept apart by the label layout. When
  // objects crowd, the most telling names win and tiny neighbours share one locator ring.
  function referenceLabels() {
    const items = scene.references.map(ref => {
      const { hx, hz } = footprint(ref);
      const [l, t] = screen(ref.x - hx, ref.z - hz);
      const [r, b] = screen(ref.x + hx, ref.z + hz);
      const cy = (t + b) / 2;
      const tiny = Math.max(r - l, b - t) < TINY_PX;
      const key = keyDimension(ref);
      const size = `${key.symbol} ${formatLengths(key.value, opts.system, opts.both)}`;
      return {
        name: ref.name, size, tiny, cy, rank: labelRank(ref), box: tiny ? undefined : { left: l, right: r, top: t, bottom: b },
        anchorX: (l + r) / 2, anchorY: tiny ? cy + RING_R : b, width: textWidth(`${ref.name} ${size}`) + 4,
      };
    });
    const rings = [];
    return layoutLabels(items, { maxShift: 2, avoid: written, within: [6, vw - 6] }).map(it => {
      let out = '';
      if (it.tiny && !rings.some(q => Math.hypot(q.x - it.anchorX, q.y - it.cy) < 2 * RING_R + 8)) {
        out = `<circle class="locator" cx="${it.anchorX}" cy="${it.cy}" r="${RING_R}"/>`;
        rings.push({ x: it.anchorX, y: it.cy });
      }
      if (it.hidden) return out;
      const top = it.y - FONT;
      if (it.shift) {
        out += `<line class="leader" x1="${it.anchorX}" y1="${it.anchorY + 2}" x2="${it.x}" y2="${top}"/>`;
      }
      const x = Math.max(it.width / 2 + 6, Math.min(it.x, vw - it.width / 2 - 6)); // kept on the stage
      return out + text(x, it.y, `${escapeHTML(it.name)}<tspan class="ref-size"> ${it.size}</tspan>`, 'ref-text');
    }).join('');
  }

  const itemOf = target => (typeof target === 'string' ? scene[target] : scene.references[target]);

  // Grab points on a custom shape's corners, and a + on each side to add a corner there.
  function handlesSVG() {
    const { shape } = scene;
    const drawing = host?.drawing() ?? null;
    if (drawing) return draftSVG(drawing);
    if (shape.type !== 'polygon' || (host?.selected() ?? null) !== null) return '';
    const points = shape.points.map(([x, z]) => screen(x, z));
    return points.map(([x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length];
      const [mx, my] = [(x + nx) / 2, (y + ny) / 2];
      const add = points.length < MAX_CORNERS && Math.hypot(nx - x, ny - y) > 64
        ? `<g data-mid="${i}"><circle class="handle-hit" cx="${mx}" cy="${my}" r="15"/><circle class="handle-mid" cx="${mx}" cy="${my}" r="7"/><path class="handle-plus" d="M${mx - 3.5} ${my}h7M${mx} ${my - 3.5}v7"/></g>`
        : '';
      return `${add}<g data-corner="${i}"><circle class="handle-hit" cx="${x}" cy="${y}" r="18"/><circle class="handle${i === pickedCorner ? ' picked' : ''}" cx="${x}" cy="${y}" r="7"/></g>`;
    }).join('') + cornerDeleteSVG(points);
  }

  // A corner that was tapped offers a × next to it (a shape needs at least three).
  function cornerDeleteSVG(points) {
    if (pickedCorner === null || points.length <= 3 || !points[pickedCorner]) return '';
    if (crosses(scene.shape.points.filter((_, i) => i !== pickedCorner))) return ''; // the sides would cross without it
    const [x, y] = points[pickedCorner];
    const by = y < 60 ? y + 32 : y - 32;
    return `<g data-delete-corner><circle class="handle-hit" cx="${x}" cy="${by}" r="18"/><circle class="corner-delete" cx="${x}" cy="${by}" r="13"/><path class="corner-x" d="M${x - 4.5} ${by - 4.5}l9 9M${x + 4.5} ${by - 4.5}l-9 9"/></g>`;
  }

  // The shape being drawn: its sides so far with their lengths, and where the next corner would go.
  function draftSVG(drawing) {
    const points = drawing.map(([x, z]) => screen(x, z));
    const closable = points.length >= 3;
    const atFirst = hover && closable && Math.hypot(hover.x - points[0][0], hover.y - points[0][1]) < CLOSE_PX;
    const next = hover && !atFirst ? snappedCorner(hover) : null;
    const aim = atFirst ? points[0] : next && screen(...next);
    const bad = aim && points.length && (atFirst ? crosses(drawing) : crosses([...drawing, next], false)) ? ' bad' : '';
    const label = (a, b, metres) => {
      const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return Math.hypot(b[0] - a[0], b[1] - a[1]) < 44 ? '' : text(mx, my - 9, formatLengths(metres, opts.system, opts.both), 'dim-text');
    };
    let out = closable ? `<path class="draft-fill" d="${pathOf(points, true)}"/>` : '';
    if (points.length > 1) out += `<path class="draft" d="${pathOf(points, false)}"/>`;
    points.slice(1).forEach((p, i) => {
      out += label(points[i], p, Math.hypot(drawing[i + 1][0] - drawing[i][0], drawing[i + 1][1] - drawing[i][1]));
    });
    if (aim && points.length) {
      const last = points[points.length - 1];
      const to = atFirst ? drawing[0] : next;
      const from = drawing[drawing.length - 1];
      out += `<path class="draft rubber${bad}" d="${pathOf([last, aim], false)}"/>` + label(last, aim, Math.hypot(to[0] - from[0], to[1] - from[1]));
    }
    if (closable) out += `<circle class="draft-ring${atFirst ? ' near' : ''}" cx="${points[0][0]}" cy="${points[0][1]}" r="${CLOSE_PX - 4}"/>`;
    out += points.map(([x, y], i) => `<circle class="draft-dot${i ? '' : ' first'}" cx="${x}" cy="${y}" r="${i ? 5 : 8}"/>`).join('');
    if (aim && !atFirst) out += `<circle class="draft-dot ghost" cx="${aim[0]}" cy="${aim[1]}" r="6"/>`;
    return out;
  }

  // Where a corner lands: on a fifth of a grid square, so sides come out at round lengths.
  function snappedCorner(cur) {
    const [x, z] = toWorld(cam, vw, vh, cur.x, cur.y);
    const step = gridStep(cam.mpp * GRID_MIN_PX, opts.system).step / 5;
    return [Math.round(x / step) * step, Math.round(z / step) * step];
  }
  const sizeOf = item => (item.shape ? [item.shape.width, item.shape.depth] : [item.w, item.d]);

  // The outline round the selected object: green when it fits, red when it doesn't.
  function selectionOutline() {
    const target = host?.selected() ?? null;
    const item = target === null ? null : itemOf(target);
    if (!item) return '';
    const [w, d] = sizeOf(item);
    const points = corners({ x: item.x, z: item.z, w, d, r: item.r }).map(([x, z]) => screen(x, z));
    return `<path class="selection" data-state="${host.fitState(target)}" d="${pathOf(points, true)}"/>`;
  }

  function draw() {
    frame = 0;
    if (!scene || !vw || !vh) return;
    const s = 1 / cam.mpp;
    world.setAttribute('transform', `translate(${vw / 2 - cam.cx * s} ${vh / 2 - cam.cy * s}) scale(${s})`);

    const { grid: showGrid, measures, labels } = opts.settings;
    const grid = gridStep(cam.mpp * GRID_MIN_PX, opts.system);
    gridEl.setAttribute('d', showGrid ? gridPath(grid.step) : '');
    legendScale.hidden = !showGrid;
    legendScale.textContent = translate('legend.square', { side: grid.label });

    const rect = shapeRect();
    const drawing = Boolean(host?.drawing());
    root.classList.toggle('drawing', drawing); // the picture fades back: this is a clean sheet
    written = [];
    overlay.innerHTML = drawing ? '' : selectionOutline() + (measures ? dimensions(rect) + areaText(rect) : '') +
      (labels ? placeLabel(scene.landmark) + placeLabel(scene.second, ' second') + referenceLabels() : '');
    handles.innerHTML = handlesSVG();
  }

  // --- input -----------------------------------------------------------------

  const local = e => {
    const box = svg.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  // What's under a press: an object's picture, else a tiny object close to it.
  function targetAt(e, at) {
    const el = e.target.closest?.('[data-target]');
    if (el) return /^\d+$/.test(el.dataset.target) ? Number(el.dataset.target) : el.dataset.target;
    let best = null, nearest = GRAB_PX;
    scene.references.forEach((ref, i) => {
      const [x, y] = screen(ref.x, ref.z);
      const distance = Math.hypot(x - at.x, y - at.y);
      if (distance < nearest) [best, nearest] = [i, distance];
    });
    return best;
  }

  function grab(e, at) {
    const target = targetAt(e, at);
    press = { at, target };
    if (target === null || !host) return;
    const item = itemOf(target);
    const big = Math.max(...sizeOf(item)) / cam.mpp > BIG_SHARE * Math.min(vw, vh);
    // On a touch screen a finger on an object may just be moving the view: only a tap selects,
    // and only what's selected can be dragged.
    if ((big || e.pointerType === 'touch') && host.selected() !== target) return;
    host.select(target);
    const [x, z] = toWorld(cam, vw, vh, at.x, at.y);
    drag = { target, dx: item.x - x, dz: item.z - z, from: at, moved: false };
  }

  function placeItem(target) {
    const item = itemOf(target);
    world.querySelector(`[data-target="${target}"]`)?.setAttribute('transform', `translate(${item.x} ${item.z}) rotate(${item.r ?? 0})`);
    requestDraw();
  }

  function endDrag() {
    if (!drag) return;
    const { target, moved } = drag;
    drag = null;
    if (moved) host.drop(target, itemOf(target).x, itemOf(target).z);
  }

  // A corner of a custom shape is being moved; a + becomes a new corner as it's pulled.
  function startCorner(handle, at) {
    const points = scene.shape.points;
    const added = handle.dataset.mid !== undefined;
    let index = Number(added ? handle.dataset.mid : handle.dataset.corner);
    if (added) {
      const [a, b] = [points[index], points[(index + 1) % points.length]];
      points.splice(++index, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    corner = { index, from: at, moved: added };
    userMoved = true;
    lastHandleAt = performance.now();
  }

  // The shape was re-centred on its new middle: the camera follows, so nothing seems to move.
  function followShape({ cx, cz }) {
    cam = { ...cam, cx: cam.cx - cx, cy: cam.cy - cz };
    userMoved = true;
  }

  const saveCorners = () => followShape(host.setPoints(scene.shape.points.map(p => [...p])));

  function endCorner() {
    if (!corner) return;
    const { index, moved } = corner;
    corner = null;
    if (moved) {
      pickedCorner = null;
      return saveCorners();
    }
    pickedCorner = pickedCorner === index ? null : index; // a tap on a corner offers to remove it
    requestDraw();
  }

  function removePickedCorner() {
    scene.shape.points.splice(pickedCorner, 1);
    pickedCorner = null;
    lastHandleAt = performance.now();
    saveCorners();
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (scene && !pointers.size && e.target.closest?.('[data-delete-corner]')) return removePickedCorner();
    const secondTap = tapTimer !== 0;
    clearTimeout(tapTimer);
    tapTimer = 0;
    try { svg.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const at = local(e);
    const handle = e.target.closest?.('[data-corner],[data-mid]');
    if (!handle && pickedCorner !== null) {
      pickedCorner = null;
      requestDraw();
    }
    if (scene && !pointers.size && handle) startCorner(handle, at);
    else if (scene && !pointers.size && host?.drawing()) press = { at, target: null };
    else if (scene && !pointers.size) grab(e, at);
    else { endDrag(); endCorner(); press = null; } // a second finger: pinching
    if (secondTap) press = null;
    pointers.set(e.pointerId, at);
    svg.classList.add('dragging');
  }

  function onPointerMove(e) {
    if (host?.drawing() && e.pointerType === 'mouse' && !pointers.size) {
      hover = local(e);
      requestDraw();
      return;
    }
    const prev = pointers.get(e.pointerId);
    if (!prev || !scene) return;
    const cur = local(e);
    if (press && Math.hypot(cur.x - press.at.x, cur.y - press.at.y) > DRAG_PX) press = null;
    if (corner) {
      if (corner.moved || Math.hypot(cur.x - corner.from.x, cur.y - corner.from.y) > DRAG_PX) {
        corner.moved = true;
        const { points } = scene.shape;
        points[corner.index] = reachableCorner(points, corner.index, snappedCorner(cur));
        world.querySelector('.shape').setAttribute('d', pathOf(points, true)); // only the outline changes
        requestDraw();
      }
      pointers.set(e.pointerId, cur);
      return;
    }
    if (drag) {
      if (drag.moved || Math.hypot(cur.x - drag.from.x, cur.y - drag.from.y) > DRAG_PX) {
        drag.moved = userMoved = true; // the camera stays put while things are arranged
        hint.hidden = true;
        const [x, z] = toWorld(cam, vw, vh, cur.x, cur.y);
        const at = host.dragTo(drag.target, x + drag.dx, z + drag.dz, SNAP_PX * cam.mpp);
        Object.assign(itemOf(drag.target), { x: at.x, z: at.z });
        placeItem(drag.target);
      }
      pointers.set(e.pointerId, cur);
      return;
    }
    if (pointers.size === 1) {
      setCam(panBy(cam, cur.x - prev.x, cur.y - prev.y));
    } else if (pointers.size === 2) {
      // Pinch: zoom by the change in finger distance, pan by the change in midpoint.
      const other = [...pointers].find(([id]) => id !== e.pointerId)[1];
      const before = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2, d: Math.hypot(prev.x - other.x, prev.y - other.y) };
      const after = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2, d: Math.hypot(cur.x - other.x, cur.y - other.y) };
      const panned = panBy(cam, after.x - before.x, after.y - before.y);
      setCam(zoomAt(panned, after.d / (before.d || 1), after.x, after.y, vw, vh, limits()));
    }
    pointers.set(e.pointerId, cur);
  }

  // Drawing a shape: each tap is a corner, and a tap on the first one closes it.
  function placeDrawnCorner(at) {
    const corners = host.drawing();
    const [fx, fy] = corners.length ? screen(...corners[0]) : [Infinity, Infinity];
    if (corners.length >= 3 && Math.hypot(at.x - fx, at.y - fy) < CLOSE_PX) {
      host.finishDrawing();
    } else {
      host.addCorner(...snappedCorner(at));
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) svg.classList.remove('dragging');
    if (corner) endCorner();
    else if (drag) endDrag();
    else if (press && e.type === 'pointerup' && host?.drawing()) placeDrawnCorner(press.at);
    else if (press && e.type === 'pointerup') {
      const { target } = press;
      // A touch waits to see that it isn't the first half of a double tap or the start of a pinch.
      if (e.pointerType === 'touch') {
        tapTimer = setTimeout(() => {
          tapTimer = 0;
          host?.select(target);
        }, TAP_WAIT_MS);
      } else {
        host?.select(target);
      }
    }
    press = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const { x, y } = local(e);
    zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), x, y);
  }

  function onDoubleClick(e) {
    if (host?.drawing() || performance.now() - lastHandleAt < 500) return; // those taps were for corners
    const { x, y } = local(e);
    zoomBy(2, x, y);
  }

  function onKey(e) {
    const pan = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
    if (pan && scene) setCam(panBy(cam, ...pan));
    else if (e.key === '+' || e.key === '=') zoomBy(1.5);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.5);
    else if (e.key === '0') resetView();
    else return;
    e.preventDefault();
  }

  function onToolClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'in') zoomBy(1.6);
    else if (act === 'out') zoomBy(1 / 1.6);
    else if (act === 'fit') resetView();
  }

  function onResize() {
    vw = root.clientWidth;
    vh = root.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    if (!scene) return;
    if (!host?.typing()) refit(); // a keyboard opening isn't a reason to reframe
    cam = clampPan(cam, scene.bounds, vw, vh);
    requestDraw();
  }

  return {
    mount(container) {
      root = document.createElement('div');
      root.className = 'view-2d';
      root.innerHTML = `
        <svg tabindex="0" role="img">
          <path class="grid"/>
          <g class="world"></g>
          <g class="overlay" aria-hidden="true"></g>
          <g class="handles" aria-hidden="true"></g>
        </svg>
        ${toolsHTML}
        ${legendHTML(coarsePointer() ? 'hint.2dTouch' : 'hint.2dMouse')}`;
      translatePage(root);
      svg = root.querySelector('svg');
      gridEl = root.querySelector('.grid');
      world = root.querySelector('.world');
      overlay = root.querySelector('.overlay');
      handles = root.querySelector('.handles');
      legendScale = root.querySelector('.legend-scale');
      hint = root.querySelector('.legend-hint');

      svg.addEventListener('pointerdown', onPointerDown);
      svg.addEventListener('pointermove', onPointerMove);
      svg.addEventListener('pointerup', onPointerUp);
      svg.addEventListener('pointercancel', onPointerUp);
      svg.addEventListener('wheel', onWheel, { passive: false });
      svg.addEventListener('dblclick', onDoubleClick);
      svg.addEventListener('pointerleave', () => {
        hover = null;
        requestDraw();
      });
      svg.addEventListener('keydown', onKey);
      root.querySelector('.stage-tools').addEventListener('click', onToolClick);

      container.append(root);
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(root);
      onResize();
    },

    update(nextScene, nextOpts = {}) {
      const builtBefore = builtFrom;
      scene = nextScene;
      opts = { ...opts, ...nextOpts };
      builtFrom = contentKey(scene, opts);
      if (nextOpts.reframe !== false) userMoved = false; // something new to show: frame it
      // Only something's position or turn changed: move it, without drawing everything again.
      if (nextOpts.reframe === false && builtFrom === builtBefore) {
        scene.references.forEach((_, i) => placeItem(i));
        for (const target of ['landmark', 'second']) if (scene[target]) placeItem(target);
        refit();
        return;
      }
      drawWorld();
      refit();
      requestDraw();
    },

    selectionChanged: requestDraw,
    shapeMoved: followShape,

    // A still of the view, without what's only there for editing.
    capture: () => pictureOfSvg(svg, { width: vw, height: vh, background: getComputedStyle(root).backgroundColor, leaveOut: '.handles, .selection' }),

    // Shows an object at a new pose while it's being changed; saving is up to the caller.
    poseObject(target, pose) {
      Object.assign(itemOf(target), pose);
      placeItem(target);
    },

    unmount() {
      clearTimeout(tapTimer);
      cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver?.disconnect();
      root?.remove();
      root = svg = null;
      pointers.clear();
    },
  };
}
