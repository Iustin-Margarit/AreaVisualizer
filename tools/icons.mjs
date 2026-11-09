// Draws the app icons in assets/icons with headless Chrome: the logo, its middle square lit.
// node --experimental-websocket tools/icons.mjs     (then node tools/offline-files.mjs)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = new URL('../assets/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const logo = `
  <path d="M11.7 3v26M20.3 3v26M3 11.7h26M3 20.3h26" stroke="#fff" stroke-opacity=".42" stroke-width="1.1" fill="none"/>
  <rect x="11.7" y="11.7" width="8.6" height="8.6" rx="1.2" fill="#6f8fff"/>`;
// `any`: the rounded square, for places that show the icon as it is.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="3 3 26 26"><defs><clipPath id="c"><rect x="3" y="3" width="26" height="26" rx="6.5"/></clipPath></defs><g clip-path="url(#c)"><rect x="3" y="3" width="26" height="26" fill="#18181a"/>${logo}</g></svg>`;
// `maskable` and iPhones: filling the whole square, since they cut their own corners.
const filled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 34 34"><rect x="-1" y="-1" width="34" height="34" fill="#18181a"/>${logo}</svg>`;

const ICONS = [
  ['icon-192.png', 192, rounded],
  ['icon-512.png', 512, rounded],
  ['icon-maskable-512.png', 512, filled],
  ['apple-touch-icon.png', 180, filled],
];

const PORT = 9420;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${join(tmpdir(), 'areavisualizer-icons-profile')}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch { /* still starting */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m.result); });
const send = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });

await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [file, size, svg] of ICONS) {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
  await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
  await sleep(400);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(new URL(file, OUT), Buffer.from(data, 'base64'));
  console.log('saved', file);
}
ws.close();
chrome.kill();
process.exit(0);
