import { formatLengths, escapeHTML } from '../core/format.js';
import { keyDimension } from '../core/references.js';
import { fitCamera, zoomAt, panBy, clampPan, toScreen, toWorld } from './2d/camera.js';
import { gridStep } from './2d/grid.js';
import { layoutLabels, labelRank } from './labels.js';
import { drawSilhouette } from './2d/silhouettes.js';
import { kindColor } from './palette.js';
import { MODELS } from '../data/models.js';
import { toolsHTML, legendHTML, coarsePointer } from './stage-ui.js';
import { t as translate } from '../i18n/index.js'; // `t` is the top edge of a rectangle here
import { translatePage } from '../i18n/dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = { top: 92, right: 60, bottom: 50, left: 52 }; // room for stage controls, dimension lines, labels (+ legend)
const MAX_ZOOM_IN = 1000;  // relative to the fitted view
const MAX_ZOOM_OUT = 5;
const GRID_MIN_PX = 40;    // grid lines never closer than this
const FONT = 12;
const TINY_PX = 10;        // objects smaller than this on screen get a locator ring
const RING_R = 10;

const textWidth = (text, size = FONT) => text.length * size * 0.58;
const text = (x, y, s, cls) => `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${s}</text>`;

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
function landmarkSVG(landmark) {
  if (!landmark) return '';
  const { x, z, shape } = landmark;
  const marks = shape.marks.length ? `<path class="lm-marks" d="${shape.marks.map(m => pathOf(m, false)).join('')}"/>` : '';
  return `<g class="landmark" transform="translate(${x} ${z})">
    <path class="lm-shape" d="${shape.rings.map(r => pathOf(r, true)).join('')}"/>${marks}</g>`;
}

const capitalize = s => s[0].toUpperCase() + s.slice(1);

// Top-down view. The world group is drawn in meters and moved by a transform; grid, dimensions
// and labels are redrawn in screen pixels each frame so they stay crisp and constant-size.
export function createView() {
  let root, svg, gridEl, world, overlay, legendScale, hint;
  let resizeObserver = null;
  let scene = null;
  let opts = { system: 'metric', both: false, areaLabel: '', volumeLabel: '', settings: { grid: true, labels: true, measures: true } };
  let vw = 0, vh = 0;
  let cam = null, fitted = null, userMoved = false;
  let frame = 0;
  const pointers = new Map();

  const limits = () => [fitted.mpp / MAX_ZOOM_IN, fitted.mpp * MAX_ZOOM_OUT];
  const screen = (x, y) => toScreen(cam, vw, vh, x, y);

  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function refit() {
    // The legend wraps to two lines on narrow screens; keep labels clear of it.
    const legendHeight = root.querySelector('.stage-legend').offsetHeight;
    fitted = fitCamera(scene.bounds, vw, vh, { ...PAD, bottom: PAD.bottom + legendHeight });
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
      : `<rect class="shape" x="${-shape.width / 2}" y="${-shape.depth / 2}" width="${shape.width}" height="${shape.depth}"/>`;
    // Objects with a downloaded model use its picture from above; the rest are drawn.
    const refs = references.map(r => `<g class="ref" style="--c:${kindColor(r.kind)}" transform="translate(${r.x} ${r.z})">${
      MODELS[r.id]
        ? `<image href="assets/top/${r.id}.png" x="${-r.w / 2}" y="${-r.d / 2}" width="${r.w}" height="${r.d}" preserveAspectRatio="none"/>`
        : drawSilhouette(r)
    }</g>`).join('');
    world.innerHTML = landmarkSVG(scene.landmark) + shapeEl + refs;
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

  function dimensions({ l, t, r, b }) {
    if (r - l < 60) return '';
    const { shape } = scene;
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
    if (!label || r - l < textWidth(label, 15) + 16 || b - t < 28) return '';
    const [cx, cy] = [(l + r) / 2, (t + b) / 2];
    const { height } = scene;
    const tall = `↕ ${translate('dims.high', { d: formatLengths(height, opts.system, opts.both) })}`;
    const second = [`${tall} · ${opts.volumeLabel}`, tall].find(line => r - l >= textWidth(line) + 16);
    if (!height || !second || b - t < 48) return text(cx, cy + 5, label, 'area-text');
    return text(cx, cy - 3, label, 'area-text') + text(cx, cy + 15, second, 'volume-text');
  }

  function landmarkLabel() {
    const lm = scene.landmark;
    if (!lm) return '';
    const [l, t] = screen(lm.x - lm.shape.width / 2, lm.z - lm.shape.depth / 2);
    const [r, b] = screen(lm.x + lm.shape.width / 2, lm.z + lm.shape.depth / 2);
    if (Math.max(r - l, b - t) < 6) return '';
    return text((l + r) / 2, b + 16, capitalize(lm.name), 'lm-text');
  }

  // Name and key size under each object ("Car ↔ 4.5 m"), kept apart by the label layout. When
  // objects crowd, the most telling names win and tiny neighbours share one locator ring.
  function referenceLabels() {
    const items = scene.references.map(ref => {
      const [l, t] = screen(ref.x - ref.w / 2, ref.z - ref.d / 2);
      const [r, b] = screen(ref.x + ref.w / 2, ref.z + ref.d / 2);
      const cy = (t + b) / 2;
      const tiny = Math.max(r - l, b - t) < TINY_PX;
      const key = keyDimension(ref);
      const size = `${key.symbol} ${formatLengths(key.value, opts.system, opts.both)}`;
      return {
        name: ref.name, size, tiny, cy, rank: labelRank(ref),
        anchorX: (l + r) / 2, anchorY: tiny ? cy + RING_R : b, width: textWidth(`${ref.name} ${size}`) + 4,
      };
    });
    const rings = [];
    return layoutLabels(items, { maxShift: 1 }).map(it => {
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
      return out + text(it.x, it.y, `${escapeHTML(it.name)}<tspan class="ref-size"> ${it.size}</tspan>`, 'ref-text');
    }).join('');
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
    overlay.innerHTML = (measures ? dimensions(rect) + areaText(rect) : '') + (labels ? landmarkLabel() + referenceLabels() : '');
  }

  // --- input -----------------------------------------------------------------

  const local = e => {
    const box = svg.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { svg.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    pointers.set(e.pointerId, local(e));
    svg.classList.add('dragging');
  }

  function onPointerMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev || !scene) return;
    const cur = local(e);
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

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) svg.classList.remove('dragging');
  }

  function onWheel(e) {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const { x, y } = local(e);
    zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), x, y);
  }

  function onDoubleClick(e) {
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
    refit();
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
        </svg>
        ${toolsHTML}
        ${legendHTML(coarsePointer() ? 'hint.2dTouch' : 'hint.2dMouse')}`;
      translatePage(root);
      svg = root.querySelector('svg');
      gridEl = root.querySelector('.grid');
      world = root.querySelector('.world');
      overlay = root.querySelector('.overlay');
      legendScale = root.querySelector('.legend-scale');
      hint = root.querySelector('.legend-hint');

      svg.addEventListener('pointerdown', onPointerDown);
      svg.addEventListener('pointermove', onPointerMove);
      svg.addEventListener('pointerup', onPointerUp);
      svg.addEventListener('pointercancel', onPointerUp);
      svg.addEventListener('wheel', onWheel, { passive: false });
      svg.addEventListener('dblclick', onDoubleClick);
      svg.addEventListener('keydown', onKey);
      root.querySelector('.stage-tools').addEventListener('click', onToolClick);

      container.append(root);
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(root);
      onResize();
    },

    update(nextScene, nextOpts = {}) {
      scene = nextScene;
      opts = { ...opts, ...nextOpts };
      if (nextOpts.reframe !== false) userMoved = false; // something new to show: frame it
      drawWorld();
      refit();
      requestDraw();
    },

    unmount() {
      cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver?.disconnect();
      root?.remove();
      root = svg = null;
      pointers.clear();
    },
  };
}
