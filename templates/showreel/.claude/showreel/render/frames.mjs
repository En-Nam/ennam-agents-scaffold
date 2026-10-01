// Frame capture from the engine page (Task 8). Sequential, one page, one browser (M0 ruling: no
// parallelism). Each frame: SHOWREEL.renderAt(i/fps, samples) → stage.toDataURL JPEG q0.97.
import { JPEG_QUALITY } from './encode.mjs';

const PREFIX = 'data:image/jpeg;base64,';

/** Render + JPEG-encode one frame at time t in the page. → Buffer */
export async function captureJpeg(page, t, samples) {
  const url = await page.evaluate(
    (t, S, q) => {
      window.SHOWREEL.renderAt(t, S);
      return document.getElementById('stage').toDataURL('image/jpeg', q);
    },
    t, samples, JPEG_QUALITY,
  );
  if (typeof url !== 'string' || !url.startsWith(PREFIX)) {
    throw new Error(`frame at t=${t}: stage did not produce a JPEG data URL`);
  }
  return Buffer.from(url.slice(PREFIX.length), 'base64');
}

/** captureFrames({page, fps, frames, samples, onFrame(buf, i)}) — frame i is time i/fps. */
export async function captureFrames({ page, fps, frames, samples, onFrame }) {
  for (let i = 0; i < frames; i++) {
    await onFrame(await captureJpeg(page, i / fps, samples), i);
  }
}

/** SHA-256 hex of the stage RGBA after renderAt(t, samples) — the determinism fingerprint (D9). */
export function hashAt(page, t, samples) {
  return page.evaluate(async (t, S) => {
    window.SHOWREEL.renderAt(t, S);
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const h = await crypto.subtle.digest('SHA-256', d);
    return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }, t, samples);
}
