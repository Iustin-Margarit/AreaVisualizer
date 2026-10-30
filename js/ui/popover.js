// Opens `panel` from `button`; closes on a second click, a click elsewhere, or Escape.
export function bindPopover(button, panel, { onOpen } = {}) {
  const set = open => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) onOpen?.();
  };
  button.addEventListener('click', () => set(panel.hidden));
  document.addEventListener('pointerdown', e => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) set(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) {
      set(false);
      button.focus();
    }
  });
  return { close: () => set(false) };
}
