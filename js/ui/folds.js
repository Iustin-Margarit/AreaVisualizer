// Folds: the extras (quick picks, landmark comparisons, the size in every unit) sit in <details
// class="fold">. Phones start them folded behind a tappable row, so the page isn't crowded; wider
// screens have room, so they're always open and the row is just a heading (or hidden, with .bare).
const phone = matchMedia('(max-width: 620px)');

export const foldOpen = () => !phone.matches;

// Opens or folds `root`'s folds; on wide screens keyboard focus skips their headings.
export function prepareFolds(root, open = foldOpen()) {
  for (const fold of root.querySelectorAll('details.fold')) {
    fold.open = open;
    fold.querySelector('summary').tabIndex = phone.matches ? 0 : -1;
  }
}

export function initFolds() {
  prepareFolds(document);
  phone.addEventListener('change', () => prepareFolds(document));
  // Wide screens: the heading can't fold them away (it also ignores pointers, see styles.css).
  document.addEventListener('click', e => {
    if (!phone.matches && e.target.closest?.('details.fold > summary')) e.preventDefault();
  });
}
