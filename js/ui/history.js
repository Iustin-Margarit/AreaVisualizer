// Undo and redo for everything that shapes the picture: the size, the objects, the comparison.
const TRACKED = ['mode', 'value', 'unit', 'shape', 'ratio', 'width', 'length', 'lengthUnit', 'height', 'heightUnit', 'compare', 'comparePlace', 'objects', 'points', 'second'];
const LIMIT = 100;
const BURST_MS = 700; // keystrokes this close together are one step

const snapshot = state => Object.fromEntries(TRACKED.map(k => [k, state[k]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typing = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');

export function initHistory(store, undoButton, redoButton) {
  let current = snapshot(store.get());
  let past = [];
  let future = [];
  let restoring = false;
  let lastChange = -Infinity;

  const refresh = () => {
    undoButton.disabled = !past.length;
    redoButton.disabled = !future.length;
  };

  store.subscribe(state => {
    if (restoring) return;
    const next = snapshot(state);
    if (same(next, current)) return;
    const now = performance.now();
    if (!(typing() && now - lastChange < BURST_MS)) {
      past.push(current);
      if (past.length > LIMIT) past.shift();
    }
    lastChange = now;
    current = next;
    future = [];
    refresh();
  });

  const go = (from, to) => {
    if (!from.length) return;
    to.push(current);
    current = from.pop();
    lastChange = -Infinity;
    restoring = true;
    store.set(current);
    restoring = false;
    refresh();
  };
  const undo = () => go(past, future);
  const redo = () => go(future, past);

  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || typing()) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) undo();
    else if (key === 'y' || (key === 'z' && e.shiftKey)) redo();
    else return;
    e.preventDefault();
  });
  refresh();
}
