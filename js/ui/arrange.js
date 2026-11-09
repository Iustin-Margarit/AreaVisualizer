import { arrangedTokens, tokenFields, fitStatus, footprint, snapToEdges, tidy } from '../core/arrange.js';
import { centerPolygon, crosses } from '../core/shapes.js';
import { LENGTH_UNITS } from '../core/units.js';
import { editableNumber, formatLengths, parseNumber } from '../core/format.js';
import { t, unitSymbol } from '../i18n/index.js';

export const MAX_OBJECTS = 30;

const capitalize = s => s[0].toUpperCase() + s.slice(1);
const turned = degrees => ((degrees % 360) + 360) % 360;
const isPlace = target => typeof target === 'string'; // 'landmark' or 'second': flat shapes, not objects

// The selected object and the panel for changing it. The views ask `host` what's selected and tell
// it about clicks and drags; a drag only moves the picture until it ends, then it's saved.
// A target is an object's index in the scene, 'landmark' or 'second'.
export function initArrange(panel, store, activeView) {
  const $ = sel => panel.querySelector(sel);
  const angle = $('.arrange-angle');
  const sizes = ['w', 'd', 'h'].map(name => panel.querySelector(`[name="${name}"]`));
  let selected = null;
  let sizesOpen = false;
  let keepCamera = false;
  let drawing = null; // the corners placed so far while drawing a shape
  let ctx = null; // { scene, state, system, both }

  const placeItem = target => {
    const place = ctx.scene[target];
    return { ...place, w: place.shape.width, d: place.shape.depth };
  };
  const item = target => (isPlace(target) ? placeItem(target) : ctx.scene.references[target]);
  const fitOf = (object, target) => (isPlace(target)
    ? null
    : fitStatus(object, ctx.scene.shape, ctx.scene.references.filter((_, i) => i !== target)));

  function showFit(fit) {
    const status = $('.arrange-status');
    status.hidden = !fit;
    if (!fit) return;
    status.dataset.state = fit.state;
    status.textContent = t(`arrange.${fit.state}`, {
      d: fit.over ? formatLengths(fit.over, ctx.system, ctx.both) : '', name: fit.with?.name ?? '',
    });
  }

  function showPanel() {
    panel.hidden = selected === null;
    if (selected === null) return;
    const object = item(selected);
    const place = isPlace(selected);
    $('.arrange-name').textContent = capitalize(object.name);
    showFit(fitOf(object, selected));
    angle.value = object.r ?? 0;
    $('.arrange-degrees').textContent = `${Math.round(object.r ?? 0)}°`;
    $('.arrange-sizes').hidden = place || !sizesOpen;
    $('[data-do="size"]').setAttribute('aria-expanded', String(sizesOpen));
    for (const action of ['size', 'duplicate']) $(`[data-do="${action}"]`).hidden = place;
    if (place) return;
    const unit = ctx.state.lengthUnit;
    sizes.forEach(input => {
      if (document.activeElement !== input) input.value = editableNumber(object[input.name] / LENGTH_UNITS[unit].toM, 4);
      input.removeAttribute('aria-invalid');
    });
    $('.arrange-unit').textContent = unitSymbol(unit);
  }

  function save(target, change) {
    if (target === 'landmark') {
      const lm = ctx.scene.landmark;
      store.set({ comparePlace: { id: lm.id, x: tidy(lm.x), z: tidy(lm.z), r: lm.r ?? 0, ...change } });
    } else if (target === 'second') {
      const area = ctx.scene.second;
      store.set({ second: { ...ctx.state.second, x: tidy(area.x), z: tidy(area.z), r: area.r ?? 0, ...change } });
    } else {
      store.set({ objects: arrangedTokens(ctx.scene.references, target, change) });
    }
  }

  const select = target => {
    if (target === selected) return;
    if (sizes.includes(document.activeElement)) document.activeElement.blur(); // saves what was typed
    selected = target;
    showPanel();
    activeView()?.selectionChanged?.();
  };

  function remove() {
    const target = selected;
    select(null);
    if (target === 'landmark') store.set({ compare: 'none' });
    else if (target === 'second') store.set({ second: null });
    else store.set({ objects: arrangedTokens(ctx.scene.references).filter((_, i) => i !== target) });
  }

  function duplicate() {
    const { references } = ctx.scene;
    if (isPlace(selected) || references.length >= MAX_OBJECTS) return;
    const object = references[selected];
    const { hx } = footprint(object);
    const copy = { ...tokenFields(object.token), x: tidy(object.x + 2.1 * hx), z: tidy(object.z), r: object.r ?? 0 };
    store.set({ objects: [...arrangedTokens(references), copy] });
    selected = references.length;
  }

  const turnBy = degrees => save(selected, { r: turned((item(selected).r ?? 0) + degrees) });

  panel.addEventListener('click', e => {
    const action = e.target.closest('[data-do]')?.dataset.do;
    if (action === 'close') select(null);
    else if (action === 'turn') turnBy(90);
    else if (action === 'size') {
      sizesOpen = !sizesOpen;
      showPanel();
    } else if (action === 'duplicate') duplicate();
    else if (action === 'remove') remove();
  });

  angle.addEventListener('input', () => {
    const r = Number(angle.value);
    activeView()?.poseObject?.(selected, { r });
    $('.arrange-degrees').textContent = `${r}°`;
    showFit(fitOf({ ...item(selected), r }, selected));
  });
  angle.addEventListener('change', () => save(selected, { r: Number(angle.value) }));

  // Phones: the panel is a sheet at the bottom of the screen. While a size is being typed it
  // shrinks to just the sizes and goes to the top, where the keyboard and the bars browsers add
  // above it can't cover it (how much they take up can't be measured reliably, least of all in
  // full screen), with the picture brought into view.
  const phone = matchMedia('(max-width: 620px)');
  const screen = window.visualViewport;
  const followScreen = () => panel.style.setProperty('--screen-top', `${screen.offsetTop}px`);
  screen?.addEventListener('resize', followScreen);
  screen?.addEventListener('scroll', followScreen);

  panel.addEventListener('focusin', e => {
    if (!sizes.includes(e.target)) return;
    panel.classList.add('typing');
    if (phone.matches) document.getElementById('stage').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  panel.addEventListener('focusout', e => {
    if (!sizes.includes(e.relatedTarget)) panel.classList.remove('typing');
  });
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !sizes.includes(e.target)) return;
    e.preventDefault();
    const next = sizes[sizes.indexOf(e.target) + 1];
    if (next) next.focus();
    else e.target.blur();
  });

  // A size typed for an object replaces its own, in the units the sides are in.
  panel.addEventListener('change', e => {
    if (!sizes.includes(e.target) || selected === null) return;
    const metres = parseNumber(e.target.value) * LENGTH_UNITS[ctx.state.lengthUnit].toM;
    const ok = metres > 0 && metres <= 1e7;
    e.target.setAttribute('aria-invalid', String(!ok));
    if (!ok) return;
    const { w, d, h } = item(selected);
    save(selected, { w, d, h, [e.target.name]: tidy(metres) });
  });

  // Keys, unless the visitor is typing. In the capture phase, so the arrows move the object and
  // not the view behind it.
  document.addEventListener('keydown', e => {
    if (selected === null || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
    const object = item(selected);
    const step = Math.max(object.w, object.d) * (e.shiftKey ? 0.5 : 0.1);
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (nudge) save(selected, { x: tidy(object.x + nudge[0]), z: tidy(object.z + nudge[1]) });
    else if (e.key === 'Escape') select(null);
    else if (e.key === 'Delete' || e.key === 'Backspace') remove();
    else if (e.key.toLowerCase() === 'r') turnBy(e.shiftKey ? -90 : 90);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // A new outline for the custom shape. It's centred on its middle, so everything placed relative
  // to the area shifts with it and nothing seems to move; returns how far, for the camera.
  function setPoints(raw) {
    const { points, cx, cz } = centerPolygon(raw);
    const moved = place => (place.x === undefined ? place : { ...place, x: tidy(place.x - cx), z: tidy(place.z - cz) });
    const s = store.get();
    keepCamera = true; // the visitor is working on the shape in view
    store.set({
      shape: 'custom', mode: 'dims', points,
      objects: s.objects?.map(token => (typeof token === 'string' ? token : moved(token))) ?? null,
      comparePlace: s.comparePlace && moved(s.comparePlace),
      second: s.second && moved(s.second),
    });
    return { cx, cz };
  }

  // While a shape is drawn, the stage says what the one next step is.
  const stage = document.getElementById('stage');
  const drawBar = document.getElementById('draw-bar');
  const drawButton = name => drawBar.querySelector(`[data-draw="${name}"]`);

  function showDrawing(refused = false) {
    stage.classList.toggle('is-drawing', Boolean(drawing));
    drawBar.hidden = !drawing;
    if (drawing) {
      const prompt = drawBar.querySelector('.draw-prompt');
      prompt.textContent = t(refused ? 'draw.cross' : drawing.length >= 3 ? 'draw.close' : drawing.length ? 'draw.next' : 'draw.first');
      prompt.classList.toggle('refused', refused);
      drawButton('back').disabled = !drawing.length;
      drawButton('done').disabled = drawing.length < 3;
    }
    activeView()?.selectionChanged?.();
  }

  const stopDrawing = () => {
    drawing = null;
    showDrawing();
  };

  function finishDrawing() {
    if (drawing.length >= 3 && crosses(drawing)) return showDrawing(true);
    const shift = drawing.length >= 3 ? setPoints(drawing) : null;
    if (shift) activeView()?.shapeMoved?.(shift);
    stopDrawing();
  }

  function undoCorner() {
    drawing.pop();
    showDrawing();
  }

  drawBar.addEventListener('click', e => {
    const action = e.target.closest('[data-draw]')?.dataset.draw;
    if (action === 'back') undoCorner();
    else if (action === 'cancel') stopDrawing();
    else if (action === 'done') finishDrawing();
  });

  document.addEventListener('keydown', e => {
    if (!drawing || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'Escape') stopDrawing();
    else if (e.key === 'Backspace' || e.key === 'Delete') undoCorner();
    else if (e.key === 'Enter') finishDrawing();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  return {
    host: {
      selected: () => selected,
      select,
      fitState: target => fitOf(item(target), target)?.state ?? '',
      // Where an object dragged to (x, z) would land.
      dragTo(target, x, z, tolerance) {
        const object = item(target);
        const at = isPlace(target) ? { x, z } : snapToEdges({ ...object, x, z }, ctx.scene.shape, tolerance);
        const fit = fitOf({ ...object, ...at }, target);
        showFit(fit);
        return { ...at, state: fit?.state ?? '' };
      },
      drop: (target, x, z) => save(target, { x: tidy(x), z: tidy(z) }),
      setPoints,
      typing: () => panel.classList.contains('typing'),
      drawing: () => drawing,
      addCorner(x, z) {
        if (crosses([...drawing, [x, z]], false)) return showDrawing(true);
        drawing.push([x, z]);
        showDrawing();
      },
      finishDrawing,
    },
    select,
    startDrawing() {
      select(null);
      drawing = [];
      store.set({ view: '2d' });
      showDrawing();
      if (phone.matches) stage.scrollIntoView({ block: 'center', behavior: 'smooth' }); // it happens on the picture
    },
    cancelDrawing: stopDrawing,
    takeKeepCamera() {
      const keep = keepCamera;
      keepCamera = false;
      return keep;
    },
    update(next) {
      ctx = next;
      const gone = isPlace(selected) ? !ctx.scene[selected] : selected >= ctx.scene.references.length;
      if (selected !== null && gone) selected = null;
      showPanel();
      if (drawing) showDrawing();
    },
  };
}
