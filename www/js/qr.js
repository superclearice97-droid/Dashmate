// QR codes for pairing: draw one, or read one from the camera.
import qrcode from '../vendor/qrcode/qrcode.mjs';
import { loadScript } from './camera.js';

export function qrSvg(text) {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
}

// Calls onCode(text) for the first code that passes `accept`. Returns a stop function.
export async function scanQr(video, accept, onCode) {
  await loadScript('vendor/jsqr/jsQR.js');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h) {
      const scale = Math.min(1, 960 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hit = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (hit?.data && accept(hit.data)) {
        stopped = true;
        onCode(hit.data);
        return;
      }
    }
    setTimeout(tick, 150);
  };
  tick();
  return () => { stopped = true; };
}
