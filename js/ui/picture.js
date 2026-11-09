import { newCanvas, pictureFileName } from '../views/picture.js';
import { t } from '../i18n/index.js';
import { toast } from './toast.js';

const BAND = 62; // height of the caption under the picture, in screen pixels
const SIDE = 16;

// Sets the font, smaller if needed for the text to fit.
function fit(ctx, text, weight, size, family, room) {
  ctx.font = `${weight} ${size}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width > room) ctx.font = `${weight} ${size * room / width}px ${family}`;
}

function drawLogo(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.roundRect(3, 3, 26, 26, 7);
  ctx.stroke();
  ctx.stroke(new Path2D('M11.7 3v26M20.3 3v26M3 11.7h26M3 20.3h26'));
  ctx.restore();
}

// The still with its caption underneath: the size, what it compares to, and where it was made.
function withCaption({ canvas: shot, scale }, { title, detail }) {
  const css = getComputedStyle(document.documentElement);
  const color = name => css.getPropertyValue(name).trim();
  const family = getComputedStyle(document.body).fontFamily;
  const [w, h] = [shot.width / scale, shot.height / scale];
  const { canvas, ctx } = newCanvas(shot.width, shot.height + BAND * scale);
  ctx.drawImage(shot, 0, 0);
  ctx.scale(scale, scale);
  ctx.fillStyle = color('--surface');
  ctx.fillRect(0, h, w, BAND);
  ctx.fillStyle = color('--border');
  ctx.fillRect(0, h, w, 1);

  const site = new URL(document.querySelector('link[rel="canonical"]').href).host;
  ctx.textBaseline = 'middle';
  ctx.font = `500 12px ${family}`;
  const siteWidth = ctx.measureText(site).width;
  ctx.fillStyle = color('--muted');
  ctx.fillText(site, w - SIDE - siteWidth, h + 22);
  drawLogo(ctx, w - SIDE - siteWidth - 22, h + 13, 18, color('--muted'));

  fit(ctx, title, 700, 20, family, w - 2 * SIDE - siteWidth - 36);
  ctx.fillStyle = color('--text');
  ctx.fillText(title, SIDE, h + 22);
  fit(ctx, detail, 500, 13, family, w - 2 * SIDE);
  ctx.fillStyle = color('--muted');
  ctx.fillText(detail, SIDE, h + 45);
  return canvas;
}

const toBlob = canvas => new Promise((resolve, reject) => {
  canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('no picture'))), 'image/png');
});

// The camera button on the stage: shows the picture it made, to save or share.
export function initPicture(button, dialog, activeView) {
  const preview = dialog.querySelector('img');
  const shareButton = dialog.querySelector('[data-picture="share"]');
  let caption = { title: '', detail: '', name: '' };
  let file = null;
  let address = '';
  let busy = false;

  async function open() {
    if (busy || !activeView()?.capture) return;
    busy = button.disabled = true;
    try {
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve))); // the button shows it was pressed
      const canvas = withCaption(await activeView().capture(), caption);
      file = new File([await toBlob(canvas)], pictureFileName(caption.name), { type: 'image/png' });
      address = URL.createObjectURL(file);
      preview.src = address;
      shareButton.hidden = !navigator.canShare?.({ files: [file] });
      dialog.showModal();
    } catch (err) {
      console.error(err);
      toast(t('picture.failed'));
    } finally {
      busy = button.disabled = false;
    }
  }

  function save() {
    const link = Object.assign(document.createElement('a'), { href: address, download: file.name });
    link.click();
    dialog.close();
  }

  async function share() {
    try {
      await navigator.share({ files: [file], text: location.href });
      dialog.close();
    } catch (err) {
      if (err.name !== 'AbortError') save(); // the visitor closing the share sheet isn't a failure
    }
  }

  button.addEventListener('click', open);
  dialog.addEventListener('click', e => {
    const action = e.target.closest('[data-picture]')?.dataset.picture;
    if (action === 'close') dialog.close();
    else if (action === 'save') save();
    else if (action === 'share') share();
    else if (e.target === dialog) { // a tap beside the picture, on the dimmed page
      const box = dialog.getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dialog.close();
    }
  });
  // Time for the download to start before its address is given up.
  dialog.addEventListener('close', () => {
    const used = address;
    setTimeout(() => URL.revokeObjectURL(used), 60000);
  });

  return { update(next) { caption = next; } };
}
