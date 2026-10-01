// `cli.mjs render [--draft|--final] [--master]` (Task 8). One call, sequential, one browser:
//   check (no sheet, at the render fps) → score WAV → frames piped to ffmpeg → determinism hashes +
//   text manifest → encode → mux (no -shortest) → verify.
// Prints ok('render', {out, mode, samples, fps, frames, crf, timings:{check, score, frames, encode, mux,
// verify, total}, gpu, renderer, verify, notice?}). Timings are ms. Frames are encoded while they are
// captured, so `frames` includes ffmpeg back-pressure and `encode` is only the flush after the last frame.
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ok, fail, ShowreelError } from '../util/out.mjs';
import { paths } from '../util/paths.mjs';
import { prepare, fitInPage, writeJson } from '../check/prepare.mjs';
import { renderPolicy, parseRenderArgs, fpsFor, slugify, determinismPoints } from './policy.mjs';
import { openSession } from './session.mjs';
import { resolveFfmpeg } from './ffmpeg.mjs';
import { renderScore, writeWav } from '../score/make.mjs';
import { captureFrames, hashAt } from '../../render/frames.mjs';
import { startEncoder } from '../../render/encode.mjs';
import { mux } from '../../render/mux.mjs';
import { runVerify, buildPaths, inputHashes } from '../verify/run.mjs';

const CMD = 'render';

function appName(facts) {
  const byId = new Map(facts.facts.map((f) => [f.id, f]));
  const f = byId.get(facts.brand && facts.brand.wordmark) || facts.facts.find((x) => x.kind === 'app.name');
  return f ? f.display : (facts.brand && facts.brand.name) || 'showreel';
}

export async function run(args, hostRoot) {
  const t0 = performance.now();
  const lap = (() => { let last = t0; return () => { const now = performance.now(); const ms = Math.round(now - last); last = now; return ms; }; })();
  const { mode, master } = parseRenderArgs(args);
  const p = paths(hostRoot);
  const bp = buildPaths(hostRoot);
  const timings = {};

  // check (no sheet) at the render fps
  const { facts, resolved, timeline } = prepare(hostRoot, { fps: fpsFor(mode) });
  const ffmpeg = resolveFfmpeg(hostRoot);
  const out = p.out(slugify(appName(facts)), timeline.durationS, { draft: mode === 'draft' });
  rmSync(bp.record, { force: true }); // a failed render must not leave the previous record for verify
  const session = await openSession(hostRoot);
  let policy;
  let encoder = null;
  try {
    const { page, renderer, errors } = await session.page();
    await fitInPage(hostRoot, page, resolved);
    policy = { ...renderPolicy({ mode, master, renderer }), renderer };
    timings.check = lap();

    // score — exactly durationS × 48000 samples (renderScore guarantees the length; verify re-checks)
    writeWav(join(hostRoot, p.scoreWav), renderScore(timeline));
    timings.score = lap();

    // frames → ffmpeg
    mkdirSync(dirname(bp.video), { recursive: true });
    encoder = startEncoder({ ffmpeg, out: bp.video, fps: policy.fps, crf: policy.crf });
    await captureFrames({ page, fps: policy.fps, frames: timeline.frames, samples: policy.samples, onFrame: (buf) => encoder.write(buf) });

    // determinism fingerprints (same page, after the full film) + the text manifest
    const points = [];
    for (const pt of determinismPoints(timeline)) points.push({ ...pt, sha256: await hashAt(page, pt.t, policy.samples) });
    writeJson(bp.determinism, { version: 1, samples: policy.samples, fps: policy.fps, renderer, points });
    writeJson(join(hostRoot, p.manifest), await page.evaluate(() => window.SHOWREEL.manifest()));
    if (errors.length) throw new ShowreelError('E_ENGINE', `Engine page errors during render: ${errors.join(' | ')}`, 'This is a toolkit bug — report it with the storyboard.');
    timings.frames = lap();
  } catch (err) {
    if (encoder) encoder.abort();
    throw err;
  } finally {
    // A close() failure (browser still holding the temp profile) must not leave ffmpeg waiting on stdin
    // EOF forever — that hangs the CLI instead of printing the JSON error.
    try { await session.close(); } catch (e) { if (encoder) encoder.abort(); throw e; }
  }

  await encoder.end();
  timings.encode = lap();

  mkdirSync(dirname(join(hostRoot, out)), { recursive: true });
  await mux({ ffmpeg, video: bp.video, wav: join(hostRoot, p.scoreWav), out: join(hostRoot, out) });
  timings.mux = lap();
  writeJson(bp.record, {
    version: 1, out, mode, fps: policy.fps, samples: policy.samples, crf: policy.crf,
    frames: timeline.frames, durationS: timeline.durationS, renderer: policy.renderer,
    inputs: inputHashes(hostRoot),
  });

  const { data: verify, failed } = await runVerify(hostRoot);
  timings.verify = lap();
  timings.total = Math.round(performance.now() - t0);
  if (failed.length) {
    return fail(CMD, 'E_VERIFY', `${out} was rendered but ${failed.length} verify check(s) failed: ${failed.join(' | ')}`, 'Re-run render; if it fails again, report a toolkit bug with this output.');
  }
  return ok(CMD, {
    out, mode, samples: policy.samples, fps: policy.fps, frames: timeline.frames, crf: policy.crf,
    timings, gpu: policy.gpu, renderer: policy.renderer,
    verify: { videoFrames: verify.videoFrames, audioSamples: verify.audioSamples, peakDbfs: verify.peakDbfs, hitsOk: verify.hitsOk, manifestOk: verify.manifestOk, determinismOk: verify.determinismOk },
    ...(policy.notice ? { notice: policy.notice } : {}),
  });
}
