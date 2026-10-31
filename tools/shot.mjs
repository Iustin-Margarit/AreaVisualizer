// Screenshot via headless Chrome + DevTools protocol, waiting a fixed time (works with WebGL).
// node --experimental-websocket tools/shot.mjs <out.png> <url> [width] [height] [waitMs] [scrollSelector]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out, url, w = '411', h = '800', wait = '12000', scrollTo] = process.argv.slice(2);
const PORT = 9333;
const brave = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--window-size=${w},${h}`, '--no-first-run',
  `--user-data-dir=${join(tmpdir(), 'areavisualizer-shot-profile')}`, 'about:blank',
], { stdio: 'ignore' });
const kill = () => { try { brave.kill(); } catch {} };
setTimeout(() => { console.error('hard timeout'); kill(); process.exit(1); }, 60000);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch {}
}
if (!target) { console.error('no browser'); kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m.result); });
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url });
await sleep(+wait);
if (scrollTo) { await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView()` }); await sleep(800); }
const { data } = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(data, 'base64'));
console.log('saved', out);
ws.close();
kill();
process.exit(0);
