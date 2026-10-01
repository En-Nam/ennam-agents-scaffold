// Draft contact sheet (Task 8): 2 stills per beat at S=1 → ffmpeg tile, 4 columns of 480×270
// → showreel/build/sheet.png (1920 px wide). The agent Reads this PNG in its QA rounds.
import { captureJpeg } from './frames.mjs';
import { startPipe } from '../lib/render/ffmpeg.mjs';

const COLS = 4;
const STILLS = [0.4, 0.85]; // fractions of each beat window: mid-action, then the settled state

/** → [{beatId, t}] — 2 per beat, on the frame grid, inside [t0, t1). */
export function sheetTimes(timeline) {
  const { fps } = timeline;
  const out = [];
  for (const b of timeline.beats) {
    for (const f of STILLS) {
      let t = Math.round((b.t0 + f * (b.t1 - b.t0)) * fps) / fps;
      if (t >= b.t1) t -= 1 / fps;
      out.push({ beatId: b.id, t });
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

/** Render the stills in `page` (engine ready) and write the sheet PNG. → {stills} */
export async function renderSheet({ page, ffmpeg, timeline, out }) {
  const times = sheetTimes(timeline);
  const pipe = startPipe(ffmpeg, sheetArgs({ out, count: times.length }), { what: 'sheet' });
  try {
    for (const { t } of times) await pipe.write(await captureJpeg(page, t, 1));
    await pipe.end();
  } catch (err) {
    pipe.abort();
    throw err;
  }
  return { stills: times.length };
}
