// Touch extras on top of OrbitControls (which does one-finger turn, pinch zoom and two-finger move):
// twisting two fingers turns the view like a map, and a double tap glides in. Pure helpers are
// exported for the tests.

const TWIST_START = 0.12; // radians of twist before turning starts, so a pinch doesn't wobble
const TAP_MS = 300;       // a tap is shorter than this, and so is the gap between two taps
const TAP_MOVE = 10;      // px a finger may drift and still count as a tap
const TAP_GAP = 30;       // px between the two taps of a double tap

// Smallest signed difference between two angles (radians).
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export const isDoubleTap = (prev, tap) =>
  !!prev && tap.time - prev.time < TAP_MS && Math.hypot(tap.x - prev.x, tap.y - prev.y) < TAP_GAP;

// Calls onTwist(radians, clockwise on screen positive) and onDoubleTap({ x, y }); returns a function
// that removes the listeners.
export function touchGestures(el, { onTwist, onDoubleTap }) {
  const points = new Map();
  let lastAngle = null;
  let pending = 0;
  let twisting = false;
  let down = null;
  let lastTap = null;

  const angle = () => {
    const [a, b] = [...points.values()];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const restart = () => {
    lastAngle = points.size === 2 ? angle() : null;
    pending = 0;
    twisting = false;
  };

  function onDown(e) {
    if (e.pointerType !== 'touch') return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    down = points.size === 1 ? { x: e.clientX, y: e.clientY, time: e.timeStamp } : null;
    restart();
  }

  function onMove(e) {
    const p = points.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (down && Math.hypot(p.x - down.x, p.y - down.y) > TAP_MOVE) down = null;
    if (lastAngle === null) return;
    const a = angle();
    const d = angleDelta(lastAngle, a);
    lastAngle = a;
    if (!twisting) {
      pending += d;
      twisting = Math.abs(pending) >= TWIST_START;
      return;
    }
    onTwist(d);
  }

  function onUp(e) {
    if (!points.delete(e.pointerId)) return;
    if (e.type === 'pointerup' && down && !points.size && e.timeStamp - down.time < TAP_MS) {
      const tap = { x: e.clientX, y: e.clientY, time: e.timeStamp };
      if (isDoubleTap(lastTap, tap)) {
        lastTap = null;
        onDoubleTap(tap);
      } else {
        lastTap = tap;
      }
    }
    down = null;
    restart();
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}
