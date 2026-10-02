// Render policy + pure helpers for `render` / `verify` (Task 8). Dependency-free.
// Policy = M0 RULINGS (mem:decisions/showreel-addon-v1.16, binding):
//   --final  GPU, S=6, 60 fps, crf 18 (14 with --master)
//   --draft  S=1, 30 fps
//   GPU-less (SwiftShader or no WebGL, see isGpuLess) --final → S=1 @ 60 fps + GPU_NOTICE
// One browser, sequential frames: no parallelism in v1.
import { ShowreelError } from '../util/out.mjs';
import { GPU_NOTICE, isGpuLess } from '../preflight/plan.mjs';

export const RENDER_USAGE = 'Use: node .claude/showreel/cli.mjs render [--draft|--final] [--master]';

/** args → {mode: 'final'|'draft', master}. Default mode is final; --master implies final. */
export function parseRenderArgs(args) {
  let draft = false;
  let final = false;
  let master = false;
  for (const a of args) {
    if (a === '--draft') draft = true;
    else if (a === '--final') final = true;
    else if (a === '--master') master = true;
    else throw new ShowreelError('E_USAGE', `Unknown argument "${a}" for render.`, RENDER_USAGE);
  }
  if (draft && final) throw new ShowreelError('E_USAGE', 'Pick one of --draft or --final.', RENDER_USAGE);
  if (draft && master) throw new ShowreelError('E_USAGE', '--master (crf 14) applies to --final only.', RENDER_USAGE);
  return { mode: draft ? 'draft' : 'final', master };
}

/** fps depends only on the mode (the timeline is compiled before the browser reports its renderer). */
export function fpsFor(mode) {
  return mode === 'draft' ? 30 : 60;
}

/** → {mode, fps, samples, crf, gpu, notice} */
export function renderPolicy({ mode, master, renderer }) {
  const gpu = !isGpuLess(renderer);
  if (mode === 'draft') return { mode, fps: fpsFor(mode), samples: 1, crf: 18, gpu, notice: null };
  return { mode: 'final', fps: fpsFor('final'), samples: gpu ? 6 : 1, crf: master ? 14 : 18, gpu, notice: gpu ? null : GPU_NOTICE };
}

/** Output file slug: kebab-case of the app name, ASCII-folded (Vietnamese đ included), never empty. */
export function slugify(name) {
  const s = String(name)
    .replace(/[đĐ]/g, 'd')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'showreel';
}

const onFrame = (t, fps) => Math.round(t * fps) / fps;

/**
 * Three fixed spot-check timestamps (frame grid) whose RGBA hash `render` records and `verify`
 * re-renders in a fresh page: beat-1 mid, the zoom-through overlap nearest mid-film (or, in an
 * all-cut film, the middle beat's mid), last-beat mid.
 */
export function determinismPoints(timeline) {
  const { beats, fps, durationS } = timeline;
  const mid = (b) => onFrame((b.t0 + b.t1) / 2, fps);
  const overlaps = [];
  beats.forEach((b, i) => {
    if (i < beats.length - 1 && b.overlapOut > 0) overlaps.push((beats[i + 1].t0 + b.t1) / 2);
  });
  let middle;
  if (overlaps.length) {
    middle = overlaps.reduce((best, t) => (Math.abs(t - durationS / 2) < Math.abs(best - durationS / 2) ? t : best));
  } else {
    middle = (beats[Math.floor(beats.length / 2)].t0 + beats[Math.floor(beats.length / 2)].t1) / 2;
  }
  return [
    { label: 'beat1-mid', t: mid(beats[0]) },
    { label: 'middle-overlap', t: onFrame(middle, fps) },
    { label: 'last-beat-mid', t: mid(beats[beats.length - 1]) },
  ];
}
