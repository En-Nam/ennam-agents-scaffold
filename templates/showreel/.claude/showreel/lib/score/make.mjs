// Procedural score from build/timeline.json (D10/D12). Pure Node, no dependencies.
// The timeline is the only time source: hits → HANDLERS + ducking, typing → keystrokes,
// sections → the bed. Output is exactly round(durationS × 48000) samples per channel.
import { SR, mkBus, mixSeed } from './dsp.mjs';
import { renderHits, renderKeys, renderTicks, assertHitKinds } from './handlers.mjs';
import { renderBed, anchors } from './bed.mjs';
import { master } from './mix.mjs';
export { writeWav, encodeWav } from './wav.mjs';

/**
 * @param timeline C8 timeline.json
 * @param opts {seed?} overrides timeline.seed (mulberry32 base for every noise layer)
 * @returns {{left: Float32Array, right: Float32Array, sampleRate: 48000}}
 */
export function renderScore(timeline, opts = {}) {
  const hits = [...timeline.hits].sort((a, b) => a.t - b.t);
  assertHitKinds(hits); // fail loud before any synthesis
  const seed = (opts.seed ?? timeline.seed) >>> 0;
  const N = Math.round(timeline.durationS * SR);
  const A = anchors(timeline);
  const beats = new Map(timeline.beats.map((b) => [b.id, b]));
  const ctx = {
    bed: mkBus(N),
    fx: mkBus(N),
    seed: (k) => mixSeed(seed, k),
    beat16: 60 / timeline.music.bpm / 4,
    inOutro: (x) => x >= A.outroT0,
    beatOf: (id) => beats.get(id),
    count: {},
  };
  renderKeys(ctx, timeline.typing);
  renderTicks(ctx, hits);
  renderHits(ctx, hits);
  renderBed(ctx, timeline);
  const { left, right } = master(ctx.bed, ctx.fx, hits);
  return { left, right, sampleRate: SR };
}
