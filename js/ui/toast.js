let el = null;
let timer = 0;

// A short, non-blocking message at the bottom of the screen (also announced to screen readers).
export function toast(message, timeout = 4000) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), timeout);
}
