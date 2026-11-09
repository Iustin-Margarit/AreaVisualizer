// Turns what a view shows into a still image, for saving or sharing (ui/picture.js adds the caption).

// The long side comes out about 2000 px: sharp on any screen, and never more than 3× the screen.
export const pictureScale = (w, h) => Math.max(1, Math.min(3, 2000 / Math.max(w, h)));

// The size in the file's name: "100 m²" → areavisualizer-100-m2.png. Stays readable in every alphabet.
export function pictureFileName(areaLabel) {
  const size = areaLabel.split(' · ')[0].replace(/²/g, '2').replace(/³/g, '3')
    .replace(/[^\p{L}\p{N}.,]+/gu, '-').replace(/^-|-$/g, '');
  return `areavisualizer-${size}.png`;
}

export function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  return { canvas, ctx: canvas.getContext('2d') };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const known = new Map(); // address → its contents, so each file is only fetched once

function asDataUrl(url) {
  const key = String(url);
  if (!known.has(key)) {
    known.set(key, fetch(url).then(response => response.blob()).then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    })));
  }
  return known.get(key);
}

// An SVG drawn as an image can't reach the page's stylesheet, fonts or other files, so it has to
// carry everything it uses.
const INLINED = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor',
  'dominant-baseline', 'paint-order', 'vector-effect', 'shape-rendering', 'display', 'visibility',
];

function inlineStyles(from, to) {
  const style = getComputedStyle(from);
  to.setAttribute('style', INLINED.map(name => `${name}:${style.getPropertyValue(name)}`).join(';'));
  [...from.children].forEach((child, i) => inlineStyles(child, to.children[i]));
}

let fonts = null;
function pageFonts() {
  const faces = [...document.styleSheets].flatMap(sheet => (
    [...sheet.cssRules].filter(rule => rule instanceof CSSFontFaceRule).map(rule => ({ css: rule.cssText, base: sheet.href }))
  ));
  fonts ??= Promise.all(faces.map(async ({ css, base }) => {
    const url = css.match(/url\("?([^")]+)"?\)/)[1];
    return css.replace(url, await asDataUrl(new URL(url, base)));
  })).then(all => all.join('')).catch(() => ''); // without them, the system's font does the job
  return fonts;
}

// A still of an <svg>. `leaveOut`: what's only there to work with, not part of the picture.
export async function pictureOfSvg(svg, { width, height, background, leaveOut }) {
  const copy = svg.cloneNode(true);
  inlineStyles(svg, copy);
  copy.querySelectorAll(leaveOut).forEach(el => el.remove());
  copy.setAttribute('xmlns', SVG_NS);
  copy.setAttribute('width', width);
  copy.setAttribute('height', height);
  await Promise.all([...copy.querySelectorAll('image')].map(async image => {
    image.setAttribute('href', await asDataUrl(image.getAttribute('href')));
  }));
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = await pageFonts();
  copy.prepend(style);

  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  });
  const scale = pictureScale(width, height);
  const { canvas, ctx } = newCanvas(width * scale, height * scale);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, scale };
}

function paintText(ctx, el, origin, halo) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (!text) continue;
    const style = getComputedStyle(node.parentElement);
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    const [x, y] = [box.left - origin.left, box.top + box.height / 2 - origin.top];
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textBaseline = 'middle';
    if (halo) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = halo;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(text, x, y);
  }
}

// The 3D view's labels are page elements floating over the picture: this draws them onto it.
export function paintLabels(ctx, layer, scale) {
  const origin = layer.getBoundingClientRect();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const el of layer.children) {
    if (el.hidden) continue;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const [x, y, w, h] = [box.left - origin.left, box.top - origin.top, box.width, box.height];
    if (el.classList.contains('l3-ring')) {
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = style.borderTopColor;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (el.classList.contains('l3-leader')) {
      ctx.globalAlpha = Number(style.opacity);
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else {
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, parseFloat(style.borderTopLeftRadius));
        ctx.fillStyle = style.backgroundColor;
        ctx.fill();
      }
      paintText(ctx, el, origin, style.textShadow === 'none' ? null : style.getPropertyValue('--surface').trim());
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
