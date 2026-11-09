// Overlay markup shared by the views: zoom / fit buttons, the legend line and the 3D camera bar.
// Text is filled in by translatePage (data-i18n, see js/i18n/dom.js).

export const coarsePointer = () => matchMedia('(pointer: coarse)').matches;

export const toolsHTML = `
  <div class="stage-tools">
    <button type="button" class="tool" data-act="in" data-i18n-attr="aria-label:zoom.in;title:zoom.in">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>
    </button>
    <button type="button" class="tool" data-act="out" data-i18n-attr="aria-label:zoom.out;title:zoom.out">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12"/></svg>
    </button>
    <button type="button" class="tool" data-act="fit" data-i18n-attr="aria-label:zoom.fit;title:zoom.fitTitle">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5"/><rect x="7" y="7" width="6" height="6" rx="1"/></svg>
    </button>
  </div>`;

// `hint`: the translation key of the how-to line.
export const legendHTML = hint => `
  <div class="stage-legend">
    <span class="legend-scale"></span>
    <span class="legend-hint" data-i18n="${hint}"></span>
  </div>`;

// 3D camera bar: preset views, turn left/right, and slow automatic spinning.
export const cameraDockHTML = `
  <div class="camera-dock" role="toolbar" data-i18n-attr="aria-label:camera.label">
    <button type="button" data-cam="angle" data-i18n-attr="title:camera.angleTitle"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l6.5 3.7v7.6L10 17.5l-6.5-3.7V6.2z"/><path d="M3.5 6.2L10 10l6.5-3.8M10 10v7.5"/></svg><span data-i18n="camera.angle"></span></button>
    <button type="button" data-cam="top" data-i18n-attr="title:camera.topTitle"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="1.5"/><circle cx="10" cy="10" r="1.6"/></svg><span data-i18n="camera.top"></span></button>
    <button type="button" data-cam="front" data-i18n-attr="title:camera.frontTitle"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 15h16"/><rect x="5" y="7" width="10" height="8"/></svg><span data-i18n="camera.front"></span></button>
    <button type="button" data-cam="eye" data-i18n-attr="title:camera.eyeTitle"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.5"/></svg><span data-i18n="camera.eye"></span></button>
    <span class="dock-divider" aria-hidden="true"></span>
    <button type="button" data-cam="left" data-i18n-attr="aria-label:camera.left;title:camera.left"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="8" y="3" width="4" height="6.5" rx="1"/><path d="M17 9.5c0 2.3-3.1 4.2-7 4.2s-7-1.9-7-4.2"/><path d="M1.2 12L3 9.5l3 1.8"/></svg></button>
    <button type="button" data-cam="right" data-i18n-attr="aria-label:camera.right;title:camera.right"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="8" y="3" width="4" height="6.5" rx="1"/><path d="M3 9.5c0 2.3 3.1 4.2 7 4.2s7-1.9 7-4.2"/><path d="M18.8 12L17 9.5l-3 1.8"/></svg></button>
    <button type="button" data-cam="spin" data-i18n-attr="aria-label:camera.spin;title:camera.spin" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="8" y="2.5" width="4" height="6.5" rx="1"/><ellipse cx="10" cy="11.5" rx="7.5" ry="3.8"/><path d="M9 13.5l3 1.8-3 1.9"/></svg></button>
  </div>`;
