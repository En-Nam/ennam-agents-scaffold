// Draft contact sheet (Task 8; labels M2 C17): 3 stills per beat at S=1 → ffmpeg tile, 4 columns of 480×270
// → showreel/build/sheet.png (1920 px wide). The agent Reads this PNG in its QA rounds.
// Every still carries a label strip — beat id, archetype/variant, which still, local t — drawn onto the
// captured frame only (after renderAt, straight on the stage pixels): it is NOT engine text, never enters the
// text manifest, and the next renderAt repaints the whole stage, so films and verify never see it.
import { JPEG_QUALITY } from './encode.mjs';
import { startPipe } from '../lib/render/ffmpeg.mjs';

const COLS = 4;
// fractions of each beat's SOLO window [t0 + overlapIn, t1 − overlapOut]: settling in, fully revealed, exit begins
const STILLS = [['enter', 0.2], ['hold', 0.6], ['exit', 0.92]];
const LABEL_PX = 40; // ≈10 px in a 480×270 tile
const PREFIX = 'data:image/jpeg;base64,';

/** → [{beatId, still, t, label}] — 3 per beat, on the frame grid, inside [t0, t1). */
export function sheetTimes(timeline) {
  const { fps } = timeline;
  const out = [];
  for (const b of timeline.beats) {
    const a = b.t0 + (b.overlapIn ?? 0), z = b.t1 - (b.overlapOut ?? 0);
    for (const [still, f] of STILLS) {
      let t = Math.round((a + f * (z - a)) * fps) / fps;
      if (t >= b.t1) t -= 1 / fps;
      if (t < b.t0) t = Math.ceil(b.t0 * fps) / fps;
      out.push({ beatId: b.id, still, t, label: `${b.id}  ${b.archetype}/${b.variant}  ${still}  t=${(t - b.t0).toFixed(2)}s` });
    }
  }
  return out;
}

export function sheetArgs({ out, count }) {
  const rows = Math.ceil(count / COLS);
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=480:270,tile=${COLS}x${rows}`,
    '-frames:v', '1', '-update', '1',
    out,
  ];
}

/** Render one still at S=1 with its label strip burned into the captured pixels. → Buffer (JPEG) */
export async function captureLabelled(page, t, label) {
  const url = await page.evaluate(
    (t, label, px, q) => {
      window.SHOWREEL.renderAt(t, 1);
      const stage = document.getElementById('stage');
      const g = stage.getContext('2d');
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
      g.font = `700 ${px}px "Showreel Mono", monospace`;
      const w = g.measureText(label).width;
      g.fillStyle = 'rgba(0,0,0,0.72)';
      g.fillRect(0, 0, w + px, px * 1.6);
      g.fillStyle = '#ffffff';
      g.textBaseline = 'middle';
      g.fillText(label, px / 2, px * 0.8);
      g.restore();
      return stage.toDataURL('image/jpeg', q);
    },
    t, label, LABEL_PX, JPEG_QUALITY,
  );
  if (typeof url !== 'string' || !url.startsWith(PREFIX)) throw new Error(`sheet still at t=${t}: stage did not produce a JPEG data URL`);
  return Buffer.from(url.slice(PREFIX.length), 'base64');
}

/** Render the stills in `page` (engine ready) and write the sheet PNG. → {stills} */
export async function renderSheet({ page, ffmpeg, timeline, out }) {
  const times = sheetTimes(timeline);
  const pipe = startPipe(ffmpeg, sheetArgs({ out, count: times.length }), { what: 'sheet' });
  try {
    for (const { t, label } of times) await pipe.write(await captureLabelled(page, t, label));
    await pipe.end();
  } catch (err) {
    pipe.abort();
    throw err;
  }
  return { stills: times.length };
}
