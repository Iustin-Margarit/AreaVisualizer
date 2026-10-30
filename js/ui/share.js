import { toast } from './toast.js';
import { t } from '../i18n/index.js';

// Phones get the native share sheet; everything else copies the link.
const canShareNatively = () => !!navigator.share && matchMedia('(pointer: coarse)').matches;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: fall back to a hidden textarea.
    const area = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* reported below */ }
    area.remove();
    return ok;
  }
}

export function initShare(button) {
  const label = button.querySelector('.share-label');
  if (canShareNatively()) label.dataset.i18n = 'share.share'; // translated with the page

  button.addEventListener('click', async () => {
    const url = location.href;
    if (canShareNatively()) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // the visitor closed the share sheet
      }
    }
    toast(await copyText(url) ? t('share.copied') : t('share.manual', { url }));
  });
}
