// `verify` core (Task 8), also run at the end of `render`. Checks, all measured from artifacts:
//   D13  video frames == timeline.frames (ffmpeg null decode); audio samples within ±1024 (one AAC
//        frame) of durationS × 48000 (decoded s16le byte count); stream format (H.264 High yuv420p
//        1920x1080 @ fps, AAC 48 kHz stereo)
//   AC4  analyzeScore on the muxed score WAV: exact length, peak ≤ −1 dBFS, no clip/NaN, every hit onset ±1 frame
//   D8   build/manifest.json (what the engine drew) ⊆ resolved, and every resolved item was drawn
//   D9   the 3 hashes recorded during render re-rendered in a FRESH page are identical
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShowreelError } from '../util/out.mjs';
import { readJson } from '../util/json.mjs';
import { paths } from '../util/paths.mjs';
import { checkManifest } from '../truth/manifest.mjs';
import { analyzeScore } from '../score/analyze.mjs';
import { resolveFfmpeg } from '../render/ffmpeg.mjs';
import { openSession, useSession } from '../render/session.mjs';
import { probeVideo, countAudioSamples, decodeWav } from '../../render/verify.mjs';
import { hashAt } from '../../render/frames.mjs';

export const AAC_FRAME = 1024;
const SR = 48000;
const RENDER_FIX = 'run: node .claude/showreel/cli.mjs render --final';

export function buildPaths(hostRoot) {
  const p = paths(hostRoot);
  const b = join(hostRoot, p.build);
  return { record: join(b, 'render.json'), determinism: join(b, 'determinism.json'), video: join(b, 'video.mp4') };
}

/**
 * sha256 of the build inputs the render was made from (timeline.json + resolved.json after the text fit).
 * `check` rewrites both; comparing them is how verify tells a stale render from a broken one.
 */
export function inputHashes(hostRoot) {
  const p = paths(hostRoot);
  const h = (rel) => (existsSync(join(hostRoot, rel)) ? createHash('sha256').update(readFileSync(join(hostRoot, rel))).digest('hex') : null);
  return { timeline: h(p.timeline), resolved: h(p.resolved) };
}

/** D13 stream format: H.264 High yuv420p 1920x1080 @ fps + AAC 48 kHz stereo (streams = parseStreams output). */
export function streamsOk(streams, fps) {
  const v = streams.video;
  const a = streams.audio;
  return !!v && !!a && v.codec === 'h264' && v.profile === 'High' && v.pixFmt === 'yuv420p' && v.width === 1920 && v.height === 1080
    && v.fps === fps && a.codec === 'aac' && a.rate === SR && a.layout === 'stereo';
}

/** Coverage half of D8: an engine that draws nothing would pass manifest ⊆ resolved trivially. */
export function undrawn(manifest, resolved) {
  const sources = new Set(manifest.map((m) => m.source));
  const missing = [];
  for (const [beatId, beat] of Object.entries(resolved.beats)) {
    for (const [slot, s] of Object.entries(beat.slots)) {
      for (const it of s.items) {
        if (!sources.has(it.id)) missing.push(`${beatId}.${slot} ${it.id}`);
        if (typeof it.unit === 'string' && !sources.has('unit:' + it.id)) missing.push(`${beatId}.${slot} unit:${it.id}`);
      }
    }
  }
  return missing;
}

/** → {data, failed: string[]} — throws only when there is nothing to verify. */
export async function runVerify(hostRoot) {
  const p = paths(hostRoot);
  const bp = buildPaths(hostRoot);
  if (!existsSync(bp.record)) throw new ShowreelError('E_NO_RENDER', `No render recorded in ${p.build} (render.json).`, RENDER_FIX);
  const rec = readJson(bp.record);
  const out = join(hostRoot, rec.out);
  if (!existsSync(out)) throw new ShowreelError('E_NO_RENDER', `${rec.out} is missing.`, RENDER_FIX);
  const now = inputHashes(hostRoot);
  const changed = ['timeline', 'resolved'].filter((k) => !rec.inputs || rec.inputs[k] !== now[k]);
  if (changed.length) {
    throw new ShowreelError(
      'E_STALE_RENDER',
      `${changed.map((k) => p[k]).join(' and ')} changed after ${rec.out} was rendered (check or render ran again), so the film no longer matches the build.`,
      `Re-render: node .claude/showreel/cli.mjs render --${rec.mode}`,
    );
  }
  const timeline = readJson(join(hostRoot, p.timeline));
  if (timeline.fps !== rec.fps || timeline.durationS !== rec.durationS) {
    throw new ShowreelError(
      'E_STALE_RENDER',
      `${p.timeline} (${timeline.durationS} s @ ${timeline.fps} fps) was recompiled after ${rec.out} was rendered (${rec.durationS} s @ ${rec.fps} fps).`,
      `Re-render: node .claude/showreel/cli.mjs render --${rec.mode}`,
    );
  }
  const resolved = readJson(join(hostRoot, p.resolved));
  const manifest = readJson(join(hostRoot, p.manifest));
  const det = readJson(bp.determinism);
  const ffmpeg = resolveFfmpeg(hostRoot);
  const failed = [];

  // D13
  const expected = { frames: timeline.frames, samples: Math.round(timeline.durationS * SR) };
  const { frames: videoFrames, streams } = await probeVideo(ffmpeg, out);
  const audioSamples = await countAudioSamples(ffmpeg, out);
  if (videoFrames !== expected.frames) failed.push(`videoFrames ${videoFrames} != ${expected.frames}`);
  if (Math.abs(audioSamples - expected.samples) > AAC_FRAME) failed.push(`audioSamples ${audioSamples} not within ±${AAC_FRAME} of ${expected.samples}`);
  const formatOk = streamsOk(streams, rec.fps);
  if (!formatOk) failed.push(`streams ${JSON.stringify(streams)} are not H.264 High yuv420p 1920x1080@${rec.fps} + AAC 48000 Hz stereo`);

  // AC4 on the exact WAV that was muxed
  const score = decodeWav(readFileSync(join(hostRoot, p.scoreWav)));
  const an = analyzeScore(score, timeline);
  const hitsOk = an.hits.every((h) => h.ok);
  if (!an.ok) {
    const bad = an.hits.filter((h) => !h.ok).map((h) => `${h.kind}@${h.t.toFixed(3)}s (onset ${h.onsetT.toFixed(3)}s, ${h.jumpDb} dB)`);
    failed.push(`score: samples ${an.samples}/${expected.samples}, peak ${an.peakDbfs.toFixed(2)} dBFS, clipped ${an.clipped}, nan ${an.nan}${bad.length ? `, hits without onset: ${bad.join(', ')}` : ''}`);
  }

  // D8
  const bad = checkManifest(manifest, resolved);
  const missing = undrawn(manifest, resolved);
  const manifestOk = manifest.length > 0 && bad.length === 0 && missing.length === 0;
  if (bad.length) failed.push(`manifest has untraceable text: ${bad.map((b) => `"${b.text}" (${b.source}: ${b.reason})`).join('; ')}`);
  if (missing.length) failed.push(`resolved items never drawn: ${missing.join('; ')}`);
  if (!manifest.length) failed.push('manifest is empty (the engine recorded no text)');

  // D9 spot check — fresh page, same browser build + machine (AC3 scope)
  const mismatched = [];
  let renderer;
  await useSession(await openSession(hostRoot), async (session) => {
    const fresh = await session.page();
    renderer = fresh.renderer;
    for (const pt of det.points) {
      const h = await hashAt(fresh.page, pt.t, det.samples);
      if (h !== pt.sha256) mismatched.push(`${pt.label} t=${pt.t}`);
    }
  });
  const determinismOk = mismatched.length === 0 && det.points.length === 3;
  if (!determinismOk) {
    failed.push(`determinism: ${mismatched.join(', ') || 'no points recorded'} re-rendered differently at S=${det.samples}`
      + (renderer !== det.renderer ? ` (renderer changed: "${det.renderer}" → "${renderer}")` : ''));
  }

  return {
    data: {
      out: rec.out,
      mode: rec.mode,
      videoFrames,
      audioSamples,
      expected,
      streamsOk: formatOk,
      peakDbfs: Math.round(an.peakDbfs * 100) / 100,
      scoreOk: an.ok,
      hitsOk,
      hits: an.hits.length,
      manifestOk,
      manifestEntries: manifest.length,
      determinismOk,
    },
    failed,
  };
}
