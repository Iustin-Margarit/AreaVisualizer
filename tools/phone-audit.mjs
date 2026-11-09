// Opens every panel and state of the site at real phone widths, in all 8 languages, and reports
// anything that sticks out of its box, runs off the screen, gets cut off or lands on something else.
// Needs `npm run dev`. Run after any change to what's on screen:
//   npm run audit            everything (a few minutes)
//   npm run audit -- quick   only the width of the owner's phone (330 px)
// Screenshots of what it finds go to a folder it names at the end.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'http://localhost:5173/';
const quick = process.argv.includes('quick');
// The owner's phone (OnePlus Nord CE2 Lite, display size set large) measures 330 × 661: from a
// screenshot, the 40 px buttons are 2.78× bigger than CSS pixels on a 917 px wide image.
const chosen = process.argv.slice(2).map(Number).filter(Boolean); // npm run audit -- 320 360
const WIDTHS = chosen.length ? chosen : quick ? [330] : [320, 330, 360, 411, 768, 1280];
const heightFor = width => (width < 700 ? 661 : 800);
const TEXT = ['100%', '130%']; // large system text
const LANGUAGES = ['en', 'es', 'de', 'fr', 'it', 'pt', 'ro', 'ru'];
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = join(tmpdir(), 'areavisualizer-audit');
mkdirSync(out, { recursive: true });

// Runs in the page; returns [{ key, example }].
const CHECK = `(() => {
  const found = new Map();
  const add = (key, example = '') => { if (!found.has(key)) found.set(key, example); };
  const name = el => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.getAttribute('class')?.trim() ? '.' + el.getAttribute('class').trim().split(/\\s+/).pop() : '');
  const words = el => (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28);
  const css = el => getComputedStyle(el);
  const box = el => el.getBoundingClientRect();
  const shown = el => { const b = box(el); return b.width > 1 && b.height > 1 && css(el).visibility !== 'hidden'; }; // 1 px: only for screen readers
  const hits = (a, b, gap = 1.5) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > gap && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > gap;
  const ignored = el => el.closest('svg, select, .labels-3d, .intro-splash, .scroll-edge, .toast, details:not([open]) > :not(summary)');
  const root = document.querySelector('dialog[open]') || document.body;
  const all = [...root.querySelectorAll('*')].filter(el => !ignored(el) && shown(el));

  if (document.documentElement.scrollWidth > innerWidth + 1) add('the page is wider than the screen', document.documentElement.scrollWidth + ' px');

  for (const el of all) {
    const style = css(el), b = box(el);
    const placed = style.position === 'absolute' || style.position === 'fixed';
    const inline = style.display === 'inline';
    if (b.right > innerWidth + 1 || b.left < -1) add(name(el) + ' runs off the screen', words(el));

    let parent = el.parentElement;
    while (parent && css(parent).display === 'contents') parent = parent.parentElement;
    const scrolls = parent && /auto|scroll/.test(css(parent).overflowX + css(parent).overflowY);
    if (parent && !placed && !scrolls && box(parent).width > 0 && css(parent).display !== 'inline') {
      const p = box(parent);
      if (b.right > p.right + 1.5 || b.left < p.left - 1.5 || (!inline && (b.bottom > p.bottom + 1.5 || b.top < p.top - 1.5))) add(name(el) + ' sticks out of ' + name(parent), words(el));
      // Inside the box but over its inner margin: the row is too wide for the box.
      const room = css(parent);
      const [padLeft, padRight] = [parseFloat(room.paddingLeft), parseFloat(room.paddingRight)];
      if ((padRight >= 6 && b.right > p.right - padRight - parseFloat(room.borderRightWidth) + 1.5) || (padLeft >= 6 && b.left < p.left + padLeft + parseFloat(room.borderLeftWidth) - 1.5)) add(name(el) + ' runs into the margin of ' + name(parent), words(el));
    }

    for (let a = el.parentElement, from = el; a && a !== document.body; from = a, a = a.parentElement) {
      if (css(from).position === 'fixed') break; // pinned to the screen: its parents can't cut it off
      const { overflowX, overflowY } = css(a);
      if (/auto|scroll/.test(overflowX + overflowY)) break;
      if (/hidden|clip/.test(overflowX + overflowY)) {
        const c = box(a);
        if (b.right > c.right + 1.5 || b.left < c.left - 1.5 || b.bottom > c.bottom + 1.5 || b.top < c.top - 1.5) add(name(el) + ' is cut off by ' + name(a), words(el));
        break;
      }
    }

    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim() || inline) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const t = range.getBoundingClientRect();
      if (style.textOverflow !== 'ellipsis' && (t.right > b.right + 1.5 || t.left < b.left - 1.5)) add('the text of ' + name(el) + ' spills out of it', node.textContent.trim().slice(0, 28));
    }
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && style.overflowX === 'hidden') add(style.textOverflow === 'ellipsis' ? 'shortened with …: ' + name(el) : 'the text of ' + name(el) + ' is cut off', words(el));

    const kids = [...el.children].filter(k => !ignored(k) && shown(k) && !/absolute|fixed/.test(css(k).position));
    kids.forEach((a, i) => kids.slice(i + 1).forEach(c => { if (hits(box(a), box(c))) add(name(a) + ' overlaps ' + name(c), words(a)); }));
  }

  // A list's rows end in the same place (buttons at the end of each row form a straight column).
  for (const list of root.querySelectorAll('ul')) {
    const ends = [...list.children].filter(li => shown(li) && li.lastElementChild?.tagName === 'BUTTON' && shown(li.lastElementChild) && !ignored(li)).map(li => box(li).right - box(li.lastElementChild).right);
    if (ends.length > 1 && Math.max(...ends) - Math.min(...ends) > 1.5) add('the rows of ' + name(list) + ' don\\'t line up', words(list));
  }

  if (root === document.body) {
    const overlays = ['.pill-toggle', '.history-tools', '#settings-button', '#fullscreen-button', '.stage-tools', '.legend-scale', '.legend-hint', '.camera-dock', '.draw-bar', '#drawer-button']
      .map(sel => document.querySelector(sel)).filter(el => el && shown(el));
    overlays.forEach((a, i) => overlays.slice(i + 1).forEach(c => { if (hits(box(a), box(c))) add(name(a) + ' lands on ' + name(c)); }));

    // The writing on the picture itself.
    if (!document.querySelector('.view-2d.drawing')) {
      const stage = box(document.querySelector('#stage'));
      const labels = [...document.querySelectorAll('.view-2d svg text, .labels-3d .l3:not(.l3-ring):not(.l3-leader)')].filter(el => !el.hidden && shown(el));
      labels.forEach((a, i) => {
        const b = box(a);
        if (b.left < stage.left - 1 || b.right > stage.right + 1 || b.top < stage.top - 1 || b.bottom > stage.bottom + 1) add('picture: ' + name(a) + ' runs off the edge', words(a));
        labels.slice(i + 1).forEach(c => { if (hits(b, box(c), 2)) add('picture: ' + name(a) + ' lands on ' + name(c), words(a) + ' / ' + words(c)); });
      });
    }
  }
  return [...found].map(([key, example]) => ({ key, example }));
})()`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function browser(port) {
  const chrome = spawn(CHROME, [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, '--no-first-run', `--user-data-dir=${join(out, `profile-${port}`)}`, 'about:blank',
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* still starting */ }
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    pending.get(m.id)?.(m.result);
  });
  const send = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  const run = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;
  await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return { send, run, errors, close() { ws.close(); try { chrome.kill(); } catch { /* gone */ } } };
}

const click = selector => `document.querySelector(${JSON.stringify(selector)})?.click()`;

// Each state builds on the one before it. [name, what to do, milliseconds to let it settle]
const STATES = [
  ['the page', '', 0],
  ['height and second area', `${click('#add-height')}; ${click('#add-second')}`, 150],
  ['everything unfolded', `document.querySelectorAll('details').forEach(d => { d.open = true; })`, 150],
  ['add object open', click('#compare .add-object .add-button'), 250],
  ['add object closed', click('#compare .add-object .add-button'), 100],
  ['places open', click('.places-button'), 250],
  ['places closed', click('.places-button'), 100],
  ['circle', click('[data-shape=circle]'), 150],
  ['custom shape', click('[data-shape=custom]'), 300],
  ['drawing, no corners', click('#custom-draw'), 300],
  ['drawing, corners placed', 'TAP3', 200],
  ['drawing, sides would cross', 'TAPCROSS', 200],
  ['back from drawing', click('[data-draw=cancel]'), 200],
  ['rectangle', `${click('[data-shape=rectangle]')}; ${click('#remove-second')}; ${click('#remove-height')}`, 200],
  ['object picked', click('.object-chip'), 300],
  ['object sizes open', click('[data-do=size]'), 150],
  ['typing a size', `document.querySelector('[name=w]').focus()`, 250],
  ['done typing', `document.activeElement.blur(); ${click('[data-do=close]')}`, 200],
  ['place drawn', click('.answer-item'), 300],
  ['both units', click('[data-units=both]'), 300],
  ['both units, object picked', click('.object-chip'), 300],
  ['both units, sizes open', click('[data-do=size]'), 150],
  ['both units, picked closed', `${click('[data-do=size]')}; ${click('[data-do=close]')}; ${click('[data-units=metric]')}`, 200],
  ['settings open', click('#settings-button'), 200],
  ['settings closed', click('#settings-button'), 100],
  ['languages open', click('.lang-button'), 200],
  ['languages closed', click('.lang-button'), 100],
  ['picture preview', click('#picture-button'), 'dialog[open]'],
  ['picture closed', click('[data-picture=close]'), 150],
  ['my areas, none saved', click('#areas-button'), 200],
  ['my areas, one saved', click('[data-areas=save]'), 200],
  ['my areas, renaming', click('[data-areas=rename]'), 200],
  ['my areas, long name', `document.querySelector('.area-rename').value = 'A rather long name for this place'; document.querySelector('.area-rename').blur()`, 200],
  ['my areas, area changed', click('#presets button'), 300],
  ['my areas, saved as new', click('[data-areas=save]'), 200],
  ['my areas, delete asked', click('[data-areas=delete]'), 150],
  ['my areas closed', click('#areas-button'), 100],
  // The panels are the same in 3D, so large text is only checked once, above.
  ['3D', click('[data-view="3d"]'), '.view-3d .camera-dock', '100%'],
  ['3D object picked', click('.object-chip'), 400, '100%'],
  ['3D picked closed', click('[data-do=close]'), 200, '100%'],
  ['3D picture preview', click('#picture-button'), 'dialog[open]', '100%'],
  ['3D picture closed', click('[data-picture=close]'), 200, '100%'],
  ['full screen', 'FULL', 800],
];

const results = new Map(); // key → { where: Set, example, state, shot }
const saveAll = process.argv.includes('shots'); // also keep a picture of every state, in Romanian
let stateNumber = 0;
let checked = 0;
let shots = 0;

async function audit(width, port) {
  const b = await browser(port);
  await b.send('Emulation.setDeviceMetricsOverride', { width, height: heightFor(width), deviceScaleFactor: 1, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const tap = async (x, y) => {
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    await sleep(40);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(380);
  };
  await b.send('Page.navigate', { url: SITE });
  await sleep(1500);
  for (const text of width > 411 ? TEXT.slice(0, 1) : TEXT) {
    for (const lang of LANGUAGES) {
      await b.run(`sessionStorage.setItem('areavisualizer:intro', '1'); localStorage.removeItem('areavisualizer:areas'); localStorage.setItem('areavisualizer:prefs', JSON.stringify({ lang: '${lang}', units: 'metric', view: '2d' }))`);
      await b.send('Page.navigate', { url: `${SITE}?a=100&u=m2&o=person,car,house&v=2d` });
      await sleep(1800);
      await b.run(`document.documentElement.style.fontSize = '${text}'; dispatchEvent(new Event('resize'))`);
      await sleep(250);
      for (const [state, action, settle, onlyAt] of STATES) {
        if (onlyAt && onlyAt !== text) continue;
        if (action === 'TAP3') {
          await b.run(`document.querySelector('#stage').scrollIntoView({ block: 'center' })`);
          await sleep(500);
          const c = await b.run(`(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          for (const [dx, dy] of [[-70, -60], [50, -70], [60, 40]]) await tap(c.x + dx, c.y + dy);
        } else if (action === 'TAPCROSS') {
          const c = await b.run(`(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          await tap(c.x, c.y - 120);
        } else if (action === 'FULL') {
          const r = await b.run(`(() => { document.querySelector('#stage').scrollIntoView({ block: 'center' }); const r = document.querySelector('#fullscreen-button').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          await sleep(300);
          await tap(r.x, r.y);
        } else if (action) {
          await b.run(action);
        }
        if (typeof settle === 'string') { // wait for it to appear (3D is slow without a graphics card)
          for (let i = 0; i < 60 && !(await b.run(`!!document.querySelector(${JSON.stringify(settle)})`)); i++) await sleep(250);
          await sleep(500);
        } else if (settle) {
          await sleep(settle);
        }
        const found = await b.run(CHECK) ?? [];
        checked++;
        if (saveAll && lang === 'ro' && text === '100%') {
          const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(join(out, `state-${width}-${String(++stateNumber).padStart(2, '0')}.png`), Buffer.from(data, 'base64'));
        }
        for (const { key, example } of found) {
          const where = `${width} px ${text} ${lang}`;
          if (!results.has(key)) {
            const file = `${++shots}.png`;
            const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(join(out, file), Buffer.from(data, 'base64'));
            results.set(key, { where: new Set(), example, state, file });
          }
          results.get(key).where.add(where);
        }
      }
      await b.run(`document.fullscreenElement && document.exitFullscreen()`);
    }
  }
  for (const error of new Set(b.errors)) console.log('Page error:', error);
  b.close();
}

const stop = setTimeout(() => { console.error('Stopped: took over 20 minutes'); process.exit(1); }, 20 * 60000);
await Promise.all(WIDTHS.map((width, i) => audit(width, 9500 + i)));
clearTimeout(stop);

const notes = [...results].filter(([key]) => key.startsWith('shortened'));
const problems = [...results].filter(([key]) => !key.startsWith('shortened'));
console.log(`\nChecked ${checked} screens.`);
for (const [key, r] of problems) console.log(`\n✗ ${key}\n  in "${r.state}", e.g. "${r.example}" (${r.where.size} cases, like ${[...r.where][0]})\n  picture: ${join(out, r.file)}`);
for (const [key, r] of notes) console.log(`\n… ${key}, e.g. "${r.example}" (${r.where.size} cases, like ${[...r.where][0]})`);
console.log(problems.length ? `\n${problems.length} problems.` : '\nNothing out of place.');
process.exit(problems.length ? 1 : 0);
