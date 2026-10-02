// Hit synths + HANDLERS-by-kind, keystrokes and UI ticks (D12). Ported from spike A
// audio/make-score.mjs. Every placement is relative to a timeline time (h.t, typing.t0,
// beat.t0); nothing here knows an absolute second of the film.
import { ShowreelError } from '../util/out.mjs';
import { F, SR, add, mono, subBoom, noiseSweep, click, pluck, glide, sawBlep, SVF, rng, smooth, expInterp, BELL, MARIMBA, GLASS } from './dsp.mjs';

// ctx (built by make.mjs): { fx, bed, seed(k) → layer seed, beat16, inOutro(t), beatOf(id), count: {kind: n} }
const nextIdx = (ctx, kind) => { const i = ctx.count[kind] ?? 0; ctx.count[kind] = i + 1; return i; };
// Seed namespaces: every noise layer of the i-th hit of a kind gets ctx.seed(ns·2^20 + i·256 + k),
// so repeated hits of one kind never share noise and kinds never collide with each other
// (or with the bed/keystroke seeds, which all stay below 2^20). k is a per-layer constant < 256.
const SEED_NS = { boom: 1, snap: 2, sweep: 3, thud: 4, lock: 5, ignite: 6, pop: 7, slam: 8, whip: 9, count: 10 };
const seeder = (ctx, kind, i) => (k) => ctx.seed(SEED_NS[kind] * 0x100000 + i * 256 + k);

function hitBoom(ctx, h) {
  const { fx } = ctx, at = h.t, a = h.amp, sd = seeder(ctx, 'boom', nextIdx(ctx, 'boom'));
  add(fx, at, subBoom({ f0: 105, f1: 34, pt: 0.2, tau: 0.6, dur: 2.4 }), { g: 0.62 * a, s: 0.05 });
  // noise burst: bright -> dark, lots of reverb
  add(fx, at, noiseSweep(1.0, 9000, 160, 0.7, (u) => Math.exp(-u * 6.5), sd(11), 'lp'), { g: 0.4 * a, s: 0.4 });
  // shockwave crack + mechanical key bottom-out
  add(fx, at - 0.001, click(0.02, 1200, sd(3), 0.004), { g: 0.5 * a, s: 0.25 });
  add(fx, at, pluck(160, [[1, 1, 1], [2.3, 0.4, 0.5]], 0.03, 0.2), { g: 0.35 * a });
  // downward air sweep after the hit
  add(fx, at + 0.02, noiseSweep(1.1, 7500, 220, 1.4, (u) => smooth(u * 6) * Math.exp(-u * 3.5), sd(12)),
    { g: 0.3, s: 0.35, panFn: (x) => Math.sin(x * 3) * 0.6 });
  // anticipation: soft riser swelling into the hit
  const rise = 0.85;
  add(fx, at - rise, noiseSweep(rise, 450, 7500, 1.8, (u) => Math.pow(u, 3) * 0.55, sd(13)),
    { g: 0.5, s: 0.35, panFn: (x) => Math.sin(x * 9) * 0.5 });
  add(fx, at - rise, glide(rise, F.Fs4, F.Fs5, (u) => Math.pow(u, 2.5) * 0.18), { g: 1, s: 0.3, haas: 9 });
}

function hitSnap(ctx, h) {
  const { fx } = ctx, at = h.t, a = h.amp;
  const idx = nextIdx(ctx, 'snap'), sd = seeder(ctx, 'snap', idx), k0 = 0.7 + 0.9 * a, v = idx % 4;
  const f = [F.A5, F.Cs6, F.E6, F.Fs6][v];
  const pan = [-0.35, 0.0, 0.35, 0.0][v];
  add(fx, at, click(0.012, 3200, sd(20), 0.0016), { g: 0.85 * k0, pan });
  // clap: three tight bursts + short tail
  [0, 0.009, 0.018].forEach((d, k) => add(fx, at + d, noiseSweep(0.07, 1500, 1500, 1.1, (u, x) => Math.exp(-x / (k === 2 ? 0.03 : 0.01)), sd(30 + k)), { g: 0.6 * k0, pan, s: 0.18 }));
  add(fx, at, pluck(f, GLASS, 0.1, 0.5), { g: 0.5 * k0, pan, s: 0.4, haas: 6 });
  add(fx, at, pluck(f * 0.5, [[1, 1, 1]], 0.06, 0.25), { g: 0.18, pan });
  add(fx, at, subBoom({ f0: 140, f1: 60, pt: 0.04, tau: 0.09, dur: 0.4, drive: 1.2 }), { g: 0.55 * (0.7 + a) * k0 });
}

function hitThud(ctx, h) {
  const { fx } = ctx, at = h.t, i = nextIdx(ctx, 'thud'), sd = seeder(ctx, 'thud', i), v = i % 4;
  const f = [69.3, 82.4, 92.5, 110.0][v]; // C#2 E2 F#2 A2, ascending
  add(fx, at, subBoom({ f0: f * 2.4, f1: f, pt: 0.05, tau: 0.26 + 0.03 * v, dur: 1.2, drive: 1.9 }), { g: 0.6 });
  add(fx, at, pluck(f * 2, [[1, 1, 1], [3, 0.35, 0.4]], 0.09, 0.4), { g: 0.35, s: 0.12 });
  add(fx, at, noiseSweep(0.12, 700, 150, 0.7, (u) => Math.exp(-u * 8), sd(40), 'lp'), { g: 0.7, s: 0.2 });
  add(fx, at, click(0.01, 2000, sd(50), 0.002), { g: 0.4, pan: (i % 2 ? 0.2 : -0.2) });
  // granite grit that rings slightly higher each slab
  add(fx, at, pluck(f * 6, [[1, 1, 1]], 0.05, 0.25), { g: 0.07, s: 0.3, pan: (i % 2 ? 0.4 : -0.4) });
}

function hitLock(ctx, h) {
  const { fx } = ctx, at = h.t, i = nextIdx(ctx, 'lock'), sd = seeder(ctx, 'lock', i);
  const latch = (dt, g, f) => {
    const ms = Math.round(dt * 1000);
    add(fx, at + dt, click(0.012, 2400, sd(60 + ms), 0.002), { g: 0.8 * g });
    // resonant metal ring
    const o = mono(0.09), r = rng(sd(70 + ms)), flt = SVF();
    for (let k = 0; k < o.length; k++) o[k] = flt.run(k < 30 ? r() * 2 - 1 : 0, f, 14).bpn * Math.exp(-(k / SR) / 0.02) * 6;
    add(fx, at + dt, o, { g: 0.5 * g, s: 0.2, pan: 0.15 });
  };
  latch(0, 1.0, 2800);
  latch(0.034, 0.5, 1900);
  add(fx, at, subBoom({ f0: 110, f1: 52, pt: 0.05, tau: 0.22, dur: 0.8, drive: 1.8 }), { g: 0.8 });
  add(fx, at, pluck(1450, [[1, 1, 1], [1.5, 0.3, 0.6]], 0.05, 0.2), { g: 0.15, pan: -0.2 });
}

function hitIgnite(ctx, h) {
  const { fx } = ctx, at = h.t, sd = seeder(ctx, 'ignite', nextIdx(ctx, 'ignite'));
  // rising whoosh into the hit
  const rise = 0.75;
  add(fx, at - rise, noiseSweep(rise, 250, 9500, 1.2, (u) => Math.pow(u, 2.2) * 0.9, sd(80)), { g: 0.6, s: 0.35, panFn: (x) => Math.sin(x * 7) * 0.7 });
  add(fx, at - rise, glide(rise, F.Fs3, F.Fs5, (u) => Math.pow(u, 2) * 0.2, 0.4), { g: 1, s: 0.3, haas: 8 });
  // full-spectrum bloom
  add(fx, at, noiseSweep(1.6, 14000, 1200, 0.6, (u) => Math.exp(-u * 12), sd(81), 'lp'), { g: 0.6, s: 0.4, panFn: (x) => Math.sin(x * 2.5) * 0.4 });
  add(fx, at, noiseSweep(0.5, 12000, 3000, 0.7, (u) => Math.exp(-u * 8), sd(82), 'hp'), { g: 0.35, s: 0.4 });
  add(fx, at, subBoom({ f0: 90, f1: F.Fs1, pt: 0.15, tau: 0.38, dur: 1.5, drive: 1.5 }), { g: 0.5 });
  add(fx, at, click(0.02, 1500, sd(83), 0.004), { g: 0.45, s: 0.2 });
  // shimmering chord burst: F#m(add9) partials
  [F.Fs4, F.A4, F.Cs5, F.Gs4 * 2, F.Fs5].forEach((f, k) =>
    add(fx, at + k * 0.012, pluck(f, BELL, 0.28, 1.4), { g: 0.14, s: 0.45, pan: -0.6 + k * 0.3, haas: (k % 2 ? 7 : -7) }));
}

const POP_NOTES = [F.Fs4, F.A4, F.B4, F.Cs5, F.E5, F.Fs5]; // ascending F# minor pentatonic
function hitPop(ctx, h) {
  const { fx } = ctx, at = h.t, i = nextIdx(ctx, 'pop'), sd = seeder(ctx, 'pop', i), v = i % 6, f = POP_NOTES[v];
  const pan = -0.7 + v * 0.28;
  add(fx, at, pluck(f, MARIMBA, 0.095, 0.5), { g: (v === 0 ? 1.8 : 1.3 + v * 0.05), pan, s: 0.5, haas: 5 });
  add(fx, at, pluck(f * 2, [[1, 1, 1]], 0.08, 0.3), { g: 0.25, pan: -pan * 0.5, s: 0.3 });
  add(fx, at, click(0.008, 4000, sd(90), 0.0012), { g: 0.9, pan });
  add(fx, at, subBoom({ f0: f * 0.5, f1: f * 0.5, pt: 1, tau: 0.08, dur: 0.3, drive: 1 }), { g: 0.2 });
}

// Sweeps in the outro are the final light sweep across the lockup; elsewhere a convergence riser.
function hitSweep(ctx, h) {
  const { fx } = ctx, at = h.t, sd = seeder(ctx, 'sweep', nextIdx(ctx, 'sweep'));
  if (!ctx.inOutro(at)) {
    const rise = 0.6;
    add(fx, at - rise, noiseSweep(rise, 400, 8000, 2.2, (u) => Math.pow(u, 2.4) * 0.9, sd(100)), { g: 0.7, s: 0.3, panFn: (x) => -0.8 + 1.6 * (x / rise) });
    add(fx, at, noiseSweep(0.55, 6500, 300, 1.6, (u) => Math.exp(-u * 6), sd(101)), { g: 0.4, s: 0.4, panFn: (x) => 0.6 - 1.2 * (x / 0.55) });
    add(fx, at, pluck(F.E6, GLASS, 0.18, 0.9), { g: 0.35, s: 0.55, haas: 7 });
    add(fx, at, pluck(F.Fs5, GLASS, 0.2, 0.9), { g: 0.2, s: 0.5, haas: -7 });
    add(fx, at, subBoom({ f0: 150, f1: 55, pt: 0.06, tau: 0.3, dur: 0.9, drive: 1.5 }), { g: 0.6 });
    add(fx, at, click(0.015, 2500, sd(102), 0.003), { g: 0.5 });
  } else {
    const rise = 0.5;
    add(fx, at - rise, noiseSweep(rise, 1500, 11000, 2.5, (u) => Math.pow(u, 3) * 0.4, sd(103)), { g: 0.4, s: 0.4, panFn: (x) => -0.85 + 1.7 * (x / rise) });
    add(fx, at, noiseSweep(0.9, 11000, 2500, 1.4, (u) => Math.exp(-u * 5), sd(104)), { g: 0.5, s: 0.55, panFn: (x) => 0.85 - 0.5 * (x / 0.9) });
    [F.Cs6, F.E6, F.A6, F.Cs7].forEach((f, k) => add(fx, at + k * 0.045, pluck(f, GLASS, 0.5, 2.2), { g: 0.4, s: 0.6, pan: -0.4 + k * 0.3, haas: k % 2 ? 6 : -6 }));
    add(fx, at, subBoom({ f0: 100, f1: F.Fs2, pt: 0.1, tau: 0.5, dur: 1.2, drive: 1.4 }), { g: 0.35 });
    add(fx, at, click(0.012, 4500, sd(105), 0.002), { g: 0.5 });
  }
}

// THE slam: biggest hit. Sub boom + metallic anvil/gong + crack + reverb bloom, with the
// reverse swell leading in over the second before it.
function hitSlam(ctx, h) {
  const { fx } = ctx, at = h.t, sd = seeder(ctx, 'slam', nextIdx(ctx, 'slam'));
  add(fx, at, subBoom({ f0: 120, f1: 32, pt: 0.25, tau: 1.15, dur: 3.2, drive: 2.0 }), { g: 1.6, s: 0.05 });
  add(fx, at, subBoom({ f0: 60, f1: F.Fs1, pt: 0.3, tau: 3.0, dur: 3.0, drive: 1.1, atk: 0.02 }), { g: 0.2 });
  // metallic impact: inharmonic partials (anvil/gong)
  const base = 148;
  add(fx, at, pluck(base, [[1, 1, 1], [1.51, 0.7, 0.9], [2.76, 0.6, 0.7], [4.07, 0.45, 0.55], [5.4, 0.4, 0.45], [8.93, 0.3, 0.3], [13.3, 0.15, 0.2]], 1.3, 3.0, 0.001), { g: 0.6, s: 0.3, haas: 10 });
  add(fx, at, pluck(base * 2.01, [[1, 1, 1], [2.5, 0.4, 0.5], [4.1, 0.25, 0.4]], 0.9, 2.0, 0.001), { g: 0.2, s: 0.3, haas: -9 });
  add(fx, at - 0.001, click(0.03, 900, sd(110), 0.007), { g: 1.0, s: 0.4 });
  add(fx, at, noiseSweep(0.35, 16000, 3500, 0.6, (u) => Math.exp(-u * 9), sd(111), 'lp'), { g: 0.8, s: 0.5 });
  // reverb bloom: wide noise wash, mostly wet
  add(fx, at, noiseSweep(2.4, 12000, 700, 0.6, (u) => Math.exp(-u * 3.5), sd(112), 'lp'), { g: 0.3, s: 0.55, panFn: (x) => Math.sin(x * 2) * 0.5 });
  // after-sweep down
  add(fx, at + 0.02, noiseSweep(1.4, 9000, 150, 1.2, (u) => Math.exp(-u * 3), sd(113)), { g: 0.3, s: 0.5, panFn: (x) => Math.sin(x * 5) * 0.8 });

  // reverse-swell riser over the second before the slam, with a vacuum gap right before it
  const rise = 1.0, from = at - rise;
  const gate = (x) => 1 - smooth((x - 0.90) / 0.045);
  add(fx, from, noiseSweep(rise, 300, 11000, 1.4, (u) => Math.pow(u, 1.5) * gate(u * rise), sd(120)), { g: 1.0, s: 0.45, panFn: (x) => Math.sin(x * 11) * 0.7 });
  add(fx, from, noiseSweep(rise, 2000, 14000, 0.9, (u) => Math.pow(u, 2.2) * 0.7 * gate(u * rise), sd(121), 'hp'), { g: 0.8, s: 0.35, panFn: (x) => -Math.sin(x * 8) * 0.8 });
  // rising tonal glide F#3 -> F#5 (saw pair, filtered)
  const o = mono(rise); let p1 = 0, p2 = 0; const flt = SVF();
  for (let k = 0; k < o.length; k++) {
    const u = k / o.length, f = expInterp(F.Fs3, F.Fs5, Math.pow(u, 1.3));
    p1 = (p1 + f / SR) % 1; p2 = (p2 + f * 1.006 / SR) % 1;
    const s = (sawBlep(p1, f / SR) + sawBlep(p2, f * 1.006 / SR)) * 0.5;
    o[k] = flt.run(s, expInterp(500, 9000, u), 1.2).lp * Math.pow(u, 1.6) * 0.55 * gate(u * rise);
  }
  add(fx, from, o, { g: 0.8, s: 0.3, haas: 10 });
  // accelerating tick roll (16ths -> 32nds) on the timeline's grid
  const g16 = ctx.beat16;
  for (let k = 8; k >= 1; k--) {
    const tk = at - k * g16;
    const vol = 0.18 + 0.5 * (1 - k / 8);
    add(fx, tk, click(0.02, 6000, sd(130 + k), 0.004), { g: vol * 0.5, pan: k % 2 ? 0.3 : -0.3, s: 0.1 });
    if (k > 1 && tk > at - 0.55) add(fx, tk + g16 / 2, click(0.02, 6500, sd(160 + k), 0.003), { g: vol * 0.45, pan: k % 2 ? -0.35 : 0.35, s: 0.1 });
  }
}

export const HANDLERS = { boom: hitBoom, snap: hitSnap, sweep: hitSweep, thud: hitThud, lock: hitLock, ignite: hitIgnite, pop: hitPop, slam: hitSlam };

/** Throws E_HIT_KIND before any synthesis if a hit has no sound. */
export function assertHitKinds(hits) {
  for (const h of hits) {
    if (!Object.prototype.hasOwnProperty.call(HANDLERS, h.kind)) {
      throw new ShowreelError('E_HIT_KIND', `No sound for hit kind "${h.kind}" (beat ${h.beatId}, cue ${h.cue}).`,
        `Use one of: ${Object.keys(HANDLERS).join(', ')}.`);
    }
  }
}

export function renderHits(ctx, hits) {
  assertHitKinds(hits);
  for (const h of hits) HANDLERS[h.kind](ctx, h);
}

// ---------------------------------------------------------------- keystrokes + UI ticks
/** One keystroke per typed char from timeline.typing (t0 + i × interval). */
export function renderKeys(ctx, typing) {
  const { fx } = ctx;
  typing.forEach((ty, n) => {
    const r = rng(ctx.seed(777 + n * 1000));
    for (let i = 0; i < ty.chars; i++) {
      const at = ty.t0 + i * ty.interval;
      const vel = 0.65 + r() * 0.35, f = 165 * (0.9 + r() * 0.3), pan = (r() - 0.5) * 0.4;
      const seed = ctx.seed(5000 + n * 1000 + i);
      add(fx, at, click(0.012, 2600 + r() * 1200, seed, 0.0018), { g: 0.6 * vel, pan, s: 0.05 });
      add(fx, at, pluck(f, [[1, 1, 1], [2.1, 0.4, 0.5]], 0.012 + r() * 0.006, 0.09), { g: 0.5 * vel, pan, s: 0.04 });
      const ring = mono(0.05), flt = SVF(), rr = rng(seed ^ 0x5bd1e995); // tiny plastic resonance
      for (let k = 0; k < ring.length; k++) ring[k] = flt.run(k < 20 ? rr() * 2 - 1 : 0, 4200 + r() * 600, 10).bpn * Math.exp(-(k / SR) / 0.006) * 3;
      add(fx, at, ring, { g: 0.07 * vel, pan: -pan });
    }
  });
}

/**
 * UI ticks: decelerating whips landing on each snap (the spike's wizard reel), and
 * accelerating counter ticks into each lock, never earlier than the lock's beat start.
 */
export function renderTicks(ctx, hits) {
  const { fx } = ctx;
  const tick = (at, f, g, pan, seed) => {
    add(fx, at, pluck(f, [[1, 1, 1], [2, 0.3, 0.4]], 0.007, 0.05, 0.0004), { g, pan });
    add(fx, at, click(0.006, 5000, seed, 0.001), { g: g * 0.8, pan });
  };
  let k = 0;
  for (const h of hits) {
    if (h.kind !== 'snap' || ctx.inOutro(h.t)) continue;
    const v = k % 3;
    [0, 0.04, 0.09, 0.15, 0.22, 0.31, 0.42].forEach((d, j) => {
      const u = j / 6;
      tick(h.t - 0.5 + d, 1800 + v * 240 + j * 130, 0.1 + 0.08 * u, -0.5 + v * 0.5, seeder(ctx, 'whip', k)(j));
    });
    k++;
  }
  let m = 0;
  for (const h of hits) {
    if (h.kind !== 'lock') continue;
    const beat = ctx.beatOf(h.beatId);
    if (!beat) {
      throw new ShowreelError('E_TIMELINE', `Lock hit at t=${h.t} (cue ${h.cue}) references beat "${h.beatId}", which is not in timeline.beats.`,
        'Regenerate build/timeline.json so every hit.beatId names a beat.');
    }
    let at = Math.max(h.t - 0.8, beat.t0), gap = 0.1, n = 0;
    while (at < h.t - 0.03) {
      tick(at, 2400 + n * 55, 0.05 + 0.1 * (n / 20), 0.35 * Math.sin(n), seeder(ctx, 'count', m)(n));
      at += gap; gap = Math.max(0.026, gap * 0.9); n++;
    }
    m++;
  }
}
