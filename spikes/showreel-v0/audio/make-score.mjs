// Procedural 15.000 s score for the Én Nam Scaffold film. Pure Node, no dependencies.
// Every sound is synthesised from the master timeline (../timeline.js) so picture and sound share one clock.
//   node audio/make-score.mjs  ->  build/score.wav  (48 kHz, stereo, 16-bit PCM, 720000 frames)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const TL = createRequire(import.meta.url)('../timeline.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../build/score.wav');

const SR = 48000;
const DUR = TL.duration;
const N = Math.round(SR * DUR);
const TAU = Math.PI * 2;
const SLAM = TL.hits.find(h => h.kind === 'slam').t;      // 12.2
const BOOM = TL.hits.find(h => h.kind === 'boom').t;      // 2.3
const T_ARMY = TL.scenes.s4.start;                         // 8.9
const BEAT16 = 60 / TL.music.bpm / 4;                      // 0.125 s
const BEAT8 = BEAT16 * 2;                                  // 0.25 s

// ---------------------------------------------------------------- small utils
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, u) => a + (b - a) * u;
const expInterp = (a, b, u) => a * Math.pow(b / a, u);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) {                       // mulberry32: deterministic
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Frequencies (F# minor pentatonic + chord tones). Names are note+octave.
const F = {
  Fs1: 46.249, Fs2: 92.499, B2: 123.471, Cs3: 138.591, D3: 146.832, E3: 164.814, Fs3: 184.997, A3: 220.0, B3: 246.942, Cs4: 277.183,
  E4: 329.628, Fs4: 369.994, Gs4: 415.305, A4: 440.0, B4: 493.883, Cs5: 554.365, E5: 659.255, Fs5: 739.989, A5: 880.0,
  Cs6: 1108.731, E6: 1318.51, Fs6: 1479.978, A6: 1760.0, Cs7: 2217.46,
};

// ---------------------------------------------------------------- filters / oscillators
function SVF() {                           // TPT state-variable filter, per-sample modulation safe
  let ic1 = 0, ic2 = 0;
  const s = {
    lp: 0, bp: 0, hp: 0, bpn: 0,
    run(x, fc, Q = 0.707) {
      if (fc > SR * 0.45) fc = SR * 0.45;
      if (fc < 8) fc = 8;
      const g = Math.tan(Math.PI * fc / SR), k = 1 / Q;
      const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
      const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      s.lp = v2; s.bp = v1; s.hp = x - k * v1 - v2; s.bpn = k * v1;
      return s;
    },
  };
  return s;
}
function sawBlep(p, dt) {                  // band-limited saw (polyBLEP)
  let v = 2 * p - 1;
  if (p < dt) { const t = p / dt; v -= t + t - t * t - 1; }
  else if (p > 1 - dt) { const t = (p - 1) / dt; v -= t * t + t + t + 1; }
  return v;
}

// ---------------------------------------------------------------- buses
// dry L/R + reverb-send L/R. 'bed' gets sidechain ducking, 'fx' (hits, ticks, plucks) does not.
const mkBus = () => ({ L: new Float32Array(N), R: new Float32Array(N), sL: new Float32Array(N), sR: new Float32Array(N) });
const bed = mkBus(), fx = mkBus();

// Mix a mono buffer into a bus at time t. g = dry gain, s = reverb send (absolute),
// pan -1..1 (or panFn(tRel)), haas = ms delay for width (+ delays right, - delays left).
function add(bus, t, buf, o = {}) {
  const g = o.g ?? 1, s = o.s ?? 0, haas = Math.round((o.haas ?? 0) * SR / 1000);
  const s0 = Math.round(t * SR);
  const panFn = o.panFn;
  let gl = 0, gr = 0;
  if (!panFn) { const a = ((o.pan ?? 0) + 1) * Math.PI / 4; gl = Math.cos(a); gr = Math.sin(a); }
  const dl = haas < 0 ? -haas : 0, dr = haas > 0 ? haas : 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    if (v === 0) continue;
    const j = s0 + i;
    if (j < 0 || j >= N) continue;
    if (panFn) { const a = (panFn(i / SR) + 1) * Math.PI / 4; gl = Math.cos(a); gr = Math.sin(a); }
    const jl = j + dl, jr = j + dr;
    if (jl < N) { bus.L[jl] += v * gl * g; bus.sL[jl] += v * gl * s; }
    if (jr < N) { bus.R[jr] += v * gr * g; bus.sR[jr] += v * gr * s; }
  }
}

// ---------------------------------------------------------------- sound building blocks
const mono = d => new Float64Array(Math.max(1, Math.ceil(d * SR)));

// Pitched sine boom: exponential pitch drop + soft saturation so it reads on small speakers.
function subBoom({ f0 = 100, f1 = 36, pt = 0.18, tau = 0.7, dur = 2.4, drive = 1.6, atk = 0.003 }) {
  const o = mono(dur); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t / pt);
    ph += TAU * f / SR;
    const e = (t < atk ? t / atk : 1) * Math.exp(-t / tau);
    o[i] = Math.tanh(drive * Math.sin(ph) * e) / Math.tanh(drive) + 0.2 * Math.sin(2 * ph) * e * Math.exp(-t / 0.15);
  }
  return o;
}

// Noise through a swept filter. envFn(u, t) shapes loudness (u = 0..1 across dur).
function noiseSweep(dur, f0, f1, Q, envFn, seed, mode = 'bpn') {
  const o = mono(dur), r = rng(seed), flt = SVF();
  for (let i = 0; i < o.length; i++) {
    const u = i / o.length, t = i / SR;
    const y = flt.run(r() * 2 - 1, expInterp(f0, f1, u), Q);
    o[i] = (mode === 'lp' ? y.lp : mode === 'hp' ? y.hp : y.bpn) * envFn(u, t);
  }
  return o;
}
// Very short HP noise tick (transient layer for clicks/snaps).
function click(len = 0.008, hpf = 2500, seed = 1, tau = 0.0015) {
  const o = mono(len), r = rng(seed), flt = SVF();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = flt.run(r() * 2 - 1, hpf, 0.8).hp * Math.exp(-t / tau);
  }
  return o;
}
// Additive pluck/bell/marimba: partials = [ratio, amp, tauMultiplier]
function pluck(f, partials, tau, dur, atk = 0.0015) {
  const o = mono(dur);
  for (const [ratio, amp, tm] of partials) {
    const w = TAU * f * ratio / SR, ta = tau * tm;
    if (f * ratio > SR * 0.45) continue;
    for (let i = 0; i < o.length; i++) {
      const t = i / SR;
      o[i] += Math.sin(w * i) * amp * (t < atk ? t / atk : 1) * Math.exp(-t / ta);
    }
  }
  return o;
}
const BELL = [[1, 1, 1], [2.0, 0.35, 0.6], [2.76, 0.22, 0.4], [5.4, 0.1, 0.25]];
const MARIMBA = [[1, 1, 1], [3.97, 0.4, 0.2], [9.2, 0.12, 0.07]];
const GLASS = [[1, 1, 1], [2, 0.3, 0.7], [3, 0.12, 0.5]];

// ---------------------------------------------------------------- hit layers
function hitBoom(h) {
  const t = h.t, a = h.amp;
  add(fx, t, subBoom({ f0: 105, f1: 34, pt: 0.2, tau: 0.6, dur: 2.4 }), { g: 0.62 * a, s: 0.05 });
  // noise burst: bright -> dark over 0.9 s, lots of reverb
  add(fx, t, noiseSweep(1.0, 9000, 160, 0.7, (u) => Math.exp(-u * 6.5), 11, 'lp'), { g: 0.4 * a, s: 0.4 });
  // shockwave crack + mechanical key bottom-out
  add(fx, t - 0.001, click(0.02, 1200, 3, 0.004), { g: 0.5 * a, s: 0.25 });
  add(fx, t, pluck(160, [[1, 1, 1], [2.3, 0.4, 0.5]], 0.03, 0.2), { g: 0.35 * a });
  // downward air sweep after the hit
  add(fx, t + 0.02, noiseSweep(1.1, 7500, 220, 1.4, (u) => Math.pow(smooth(u * 6), 1) * Math.exp(-u * 3.5), 12),
    { g: 0.3, s: 0.35, panFn: tt => Math.sin(tt * 3) * 0.6 });
  // anticipation: soft riser swelling into the hit
  const rise = 0.85;
  add(fx, t - rise, noiseSweep(rise, 450, 7500, 1.8, u => Math.pow(u, 3) * 0.55, 13),
    { g: 0.5, s: 0.35, panFn: tt => Math.sin(tt * 9) * 0.5 });
  add(fx, t - rise, (() => {                    // rising tone under the riser (sine glide F#4 -> F#5)
    const o = mono(rise); let ph = 0;
    for (let i = 0; i < o.length; i++) { const u = i / o.length; ph += TAU * expInterp(F.Fs4, F.Fs5, u) / SR; o[i] = Math.sin(ph) * Math.pow(u, 2.5) * 0.18; }
    return o;
  })(), { g: 1, s: 0.3, haas: 9 });
}

let snapIdx = 0;
function hitSnap(h) {
  const t = h.t, a = h.amp;
  const idx = snapIdx++, k0 = 0.7 + 0.9 * a;
  const f = [F.A5, F.Cs6, F.E6, F.Fs6][Math.min(idx, 3)];
  const pan = [-0.35, 0.0, 0.35, 0.0][Math.min(idx, 3)];
  add(fx, t, click(0.012, 3200, 20 + idx, 0.0016), { g: 0.85 * k0, pan });
  // clap: three tight bursts + short tail
  [0, 0.009, 0.018].forEach((d, k) => add(fx, t + d, noiseSweep(0.07, 1500, 1500, 1.1, (u, tt) => Math.exp(-tt / (k === 2 ? 0.03 : 0.01)), 30 + k + idx * 3), { g: 0.6 * k0, pan, s: 0.18 }));
  add(fx, t, pluck(f, GLASS, 0.1, 0.5), { g: 0.5 * k0, pan, s: 0.4, haas: 6 });
  add(fx, t, pluck(f * 0.5, [[1, 1, 1]], 0.06, 0.25), { g: 0.18, pan });
  add(fx, t, subBoom({ f0: 140, f1: 60, pt: 0.04, tau: 0.09, dur: 0.4, drive: 1.2 }), { g: 0.55 * (0.7 + a) * k0 });
}

let thudIdx = 0;
function hitThud(h) {
  const t = h.t, i = thudIdx++;
  const f = [69.3, 82.4, 92.5, 110.0][i % 4];       // C#2 E2 F#2 A2, ascending
  add(fx, t, subBoom({ f0: f * 2.4, f1: f, pt: 0.05, tau: 0.26 + 0.03 * i, dur: 1.2, drive: 1.9 }), { g: 0.6 });
  add(fx, t, pluck(f * 2, [[1, 1, 1], [3, 0.35, 0.4]], 0.09, 0.4), { g: 0.35, s: 0.12 });
  add(fx, t, noiseSweep(0.12, 700, 150, 0.7, (u) => Math.exp(-u * 8), 40 + i, 'lp'), { g: 0.7, s: 0.2 });
  add(fx, t, click(0.01, 2000, 50 + i, 0.002), { g: 0.4, pan: (i % 2 ? 0.2 : -0.2) });
  // granite grit that rings slightly higher each slab
  add(fx, t, pluck(f * 6, [[1, 1, 1]], 0.05, 0.25), { g: 0.07, s: 0.3, pan: (i % 2 ? 0.4 : -0.4) });
}

function hitLock(h) {
  const t = h.t;
  const latch = (dt, g, f) => {
    add(fx, t + dt, click(0.012, 2400, 60 + Math.round(dt * 1000), 0.002), { g: 0.8 * g });
    // resonant metal ring
    const o = mono(0.09), r = rng(70 + Math.round(dt * 1000)), flt = SVF();
    for (let i = 0; i < o.length; i++) o[i] = flt.run(i < 30 ? r() * 2 - 1 : 0, f, 14).bpn * Math.exp(-(i / SR) / 0.02) * 6;
    add(fx, t + dt, o, { g: 0.5 * g, s: 0.2, pan: 0.15 });
  };
  latch(0, 1.0, 2800);
  latch(0.034, 0.5, 1900);
  add(fx, t, subBoom({ f0: 110, f1: 52, pt: 0.05, tau: 0.22, dur: 0.8, drive: 1.8 }), { g: 0.8 });
  add(fx, t, pluck(1450, [[1, 1, 1], [1.5, 0.3, 0.6]], 0.05, 0.2), { g: 0.15, pan: -0.2 });
}

function hitIgnite(h) {
  const t = h.t;
  // rising whoosh into the hit
  const rise = 0.75;
  add(fx, t - rise, noiseSweep(rise, 250, 9500, 1.2, u => Math.pow(u, 2.2) * 0.9, 80), { g: 0.6, s: 0.35, panFn: tt => Math.sin(tt * 7) * 0.7 });
  add(fx, t - rise, (() => {
    const o = mono(rise); let ph = 0;
    for (let i = 0; i < o.length; i++) { const u = i / o.length; ph += TAU * expInterp(F.Fs3, F.Fs5, u) / SR; o[i] = (Math.sin(ph) + 0.4 * Math.sin(2 * ph)) * Math.pow(u, 2) * 0.2; }
    return o;
  })(), { g: 1, s: 0.3, haas: 8 });
  // full-spectrum bloom
  add(fx, t, noiseSweep(1.6, 14000, 1200, 0.6, (u) => Math.exp(-u * 12), 81, 'lp'), { g: 0.6, s: 0.4, panFn: tt => Math.sin(tt * 2.5) * 0.4 });
  add(fx, t, noiseSweep(0.5, 12000, 3000, 0.7, (u) => Math.exp(-u * 8), 82, 'hp'), { g: 0.35, s: 0.4 });
  add(fx, t, subBoom({ f0: 90, f1: F.Fs1, pt: 0.15, tau: 0.38, dur: 1.5, drive: 1.5 }), { g: 0.5 });
  add(fx, t, click(0.02, 1500, 83, 0.004), { g: 0.45, s: 0.2 });
  // shimmering chord burst: F#m(add9) partials that fade into the choir
  [F.Fs4, F.A4, F.Cs5, F.Gs4 * 2, F.Fs5].forEach((f, k) =>
    add(fx, t + k * 0.012, pluck(f, BELL, 0.28, 1.4), { g: 0.14, s: 0.45, pan: -0.6 + k * 0.3, haas: (k % 2 ? 7 : -7) }));
}

let popIdx = 0;
const POP_NOTES = [F.Fs4, F.A4, F.B4, F.Cs5, F.E5, F.Fs5];   // ascending F# minor pentatonic
function hitPop(h) {
  const t = h.t, i = popIdx++, f = POP_NOTES[i % 6];
  const pan = -0.7 + i * 0.28;
  add(fx, t, pluck(f, MARIMBA, 0.095, 0.5), { g: (i === 0 ? 1.8 : 1.3 + i * 0.05), pan, s: 0.5, haas: 5 });
  add(fx, t, pluck(f * 2, [[1, 1, 1]], 0.08, 0.3), { g: 0.25, pan: -pan * 0.5, s: 0.3 });
  add(fx, t, click(0.008, 4000, 90 + i, 0.0012), { g: 0.9, pan });
  add(fx, t, subBoom({ f0: f * 0.5, f1: f * 0.5, pt: 1, tau: 0.08, dur: 0.3, drive: 1 }), { g: 0.2 });
}

let sweepIdx = 0;
function hitSweep(h) {
  const t = h.t, i = sweepIdx++;
  if (i === 0) {          // 5.75: graph converges -> riser lands, convergence ping
    const rise = 0.6;
    add(fx, t - rise, noiseSweep(rise, 400, 8000, 2.2, u => Math.pow(u, 2.4) * 0.9, 100), { g: 0.7, s: 0.3, panFn: tt => -0.8 + 1.6 * (tt / rise) });
    add(fx, t, noiseSweep(0.55, 6500, 300, 1.6, u => Math.exp(-u * 6), 101), { g: 0.4, s: 0.4, panFn: tt => 0.6 - 1.2 * (tt / 0.55) });
    add(fx, t, pluck(F.E6, GLASS, 0.18, 0.9), { g: 0.35, s: 0.55, haas: 7 });
    add(fx, t, pluck(F.Fs5, GLASS, 0.2, 0.9), { g: 0.2, s: 0.5, haas: -7 });
    add(fx, t, subBoom({ f0: 150, f1: 55, pt: 0.06, tau: 0.3, dur: 0.9, drive: 1.5 }), { g: 0.6 });
    add(fx, t, click(0.015, 2500, 102, 0.003), { g: 0.5 });
  } else {                // 13.8: final light sweep across the lockup, L -> R, rising shimmer
    const rise = 0.5;
    add(fx, t - rise, noiseSweep(rise, 1500, 11000, 2.5, u => Math.pow(u, 3) * 0.4, 103), { g: 0.4, s: 0.4, panFn: tt => -0.85 + 1.7 * (tt / rise) });
    add(fx, t, noiseSweep(0.9, 11000, 2500, 1.4, u => Math.exp(-u * 5), 104), { g: 0.5, s: 0.55, panFn: tt => 0.85 - 0.5 * (tt / 0.9) });
    [F.Cs6, F.E6, F.A6, F.Cs7].forEach((f, k) => add(fx, t + k * 0.045, pluck(f, GLASS, 0.5, 2.2), { g: 0.4, s: 0.6, pan: -0.4 + k * 0.3, haas: k % 2 ? 6 : -6 }));
    add(fx, t, subBoom({ f0: 100, f1: F.Fs2, pt: 0.1, tau: 0.5, dur: 1.2, drive: 1.4 }), { g: 0.35 });
    add(fx, t, click(0.012, 4500, 105, 0.002), { g: 0.5 });
  }
}

// THE slam: biggest hit. Sub boom + metallic anvil/gong + crack + reverb bloom, with the reverse swell leading in.
function hitSlam(h) {
  const t = h.t;
  add(fx, t, subBoom({ f0: 120, f1: 32, pt: 0.25, tau: 1.15, dur: 3.2, drive: 2.0 }), { g: 1.6, s: 0.05 });
  add(fx, t, subBoom({ f0: 60, f1: F.Fs1, pt: 0.3, tau: 3.0, dur: 3.0, drive: 1.1, atk: 0.02 }), { g: 0.2 });   // F#1 tail into the end card
  // metallic impact: inharmonic partials (anvil/gong)
  const base = 148;
  add(fx, t, pluck(base, [[1, 1, 1], [1.51, 0.7, 0.9], [2.76, 0.6, 0.7], [4.07, 0.45, 0.55], [5.4, 0.4, 0.45], [8.93, 0.3, 0.3], [13.3, 0.15, 0.2]], 1.3, 3.0, 0.001), { g: 0.6, s: 0.3, haas: 10 });
  add(fx, t, pluck(base * 2.01, [[1, 1, 1], [2.5, 0.4, 0.5], [4.1, 0.25, 0.4]], 0.9, 2.0, 0.001), { g: 0.2, s: 0.3, haas: -9 });
  add(fx, t - 0.001, click(0.03, 900, 110, 0.007), { g: 1.0, s: 0.4 });
  add(fx, t, noiseSweep(0.35, 16000, 3500, 0.6, u => Math.exp(-u * 9), 111, 'lp'), { g: 0.8, s: 0.5 });
  // reverb bloom: wide noise wash, mostly wet
  add(fx, t, noiseSweep(2.4, 12000, 700, 0.6, u => Math.exp(-u * 3.5), 112, 'lp'), { g: 0.3, s: 0.55, panFn: tt => Math.sin(tt * 2) * 0.5 });
  // after-sweep down
  add(fx, t + 0.02, noiseSweep(1.4, 9000, 150, 1.2, u => Math.exp(-u * 3), 113), { g: 0.3, s: 0.5, panFn: tt => Math.sin(tt * 5) * 0.8 });

  // ---- reverse-swell riser 11.2 -> 12.2 with a vacuum gap right before the slam
  const t0 = SLAM - 1.0, rise = 1.0;
  const gate = tt => 1 - smooth((tt - 0.90) / 0.045);                 // closes 12.10 -> 12.145
  add(fx, t0, noiseSweep(rise, 300, 11000, 1.4, u => Math.pow(u, 1.5) * 1.0 * gate(u * rise), 120), { g: 1.0, s: 0.45, panFn: tt => Math.sin(tt * 11) * 0.7 });
  add(fx, t0, noiseSweep(rise, 2000, 14000, 0.9, u => Math.pow(u, 2.2) * 0.7 * gate(u * rise), 121, 'hp'), { g: 0.8, s: 0.35, panFn: tt => -Math.sin(tt * 8) * 0.8 });
  // rising tonal glide F#3 -> F#5 (saw pair, filtered) + octave up shimmer
  const o = mono(rise); let p1 = 0, p2 = 0; const flt = SVF();
  for (let i = 0; i < o.length; i++) {
    const u = i / o.length, f = expInterp(F.Fs3, F.Fs5, Math.pow(u, 1.3));
    p1 = (p1 + f / SR) % 1; p2 = (p2 + f * 1.006 / SR) % 1;
    const s = (sawBlep(p1, f / SR) + sawBlep(p2, f * 1.006 / SR)) * 0.5;
    o[i] = flt.run(s, expInterp(500, 9000, u), 1.2).lp * Math.pow(u, 1.6) * 0.55 * gate(u * rise);
  }
  add(fx, t0, o, { g: 0.8, s: 0.3, haas: 10 });
  // accelerating tick roll (16ths -> 32nds)
  for (let k = 8; k >= 1; k--) {
    const tk = SLAM - k * BEAT16;
    const vol = 0.18 + 0.5 * (1 - k / 8);
    add(fx, tk, click(0.02, 6000, 130 + k, 0.004), { g: vol * 0.5, pan: k % 2 ? 0.3 : -0.3, s: 0.1 });
    if (k > 1 && tk > SLAM - 0.55) add(fx, tk + BEAT16 / 2, click(0.02, 6500, 160 + k, 0.003), { g: vol * 0.45, pan: k % 2 ? -0.35 : 0.35, s: 0.1 });
  }
}

const HANDLERS = { boom: hitBoom, snap: hitSnap, sweep: hitSweep, thud: hitThud, lock: hitLock, ignite: hitIgnite, pop: hitPop, slam: hitSlam };

// ---------------------------------------------------------------- keystrokes + UI
function renderKeys() {
  const { text, start, interval } = TL.typing, r = rng(777);
  for (let i = 0; i < text.length; i++) {
    const t = start + i * interval, ch = text[i];
    const vel = 0.65 + r() * 0.35, f = (ch === ' ' ? 120 : 165) * (0.9 + r() * 0.3), pan = (r() - 0.5) * 0.4;
    const seed = 500 + i;
    add(fx, t, click(0.012, 2600 + r() * 1200, seed, 0.0018), { g: 0.6 * vel, pan, s: 0.05 });
    add(fx, t, pluck(f, [[1, 1, 1], [2.1, 0.4, 0.5]], 0.012 + r() * 0.006, 0.09), { g: 0.5 * vel, pan, s: 0.04 });
    const ring = mono(0.05), flt = SVF(), rr = rng(seed * 3);          // tiny plastic resonance
    for (let k = 0; k < ring.length; k++) ring[k] = flt.run(k < 20 ? rr() * 2 - 1 : 0, 4200 + r() * 600, 10).bpn * Math.exp(-(k / SR) / 0.006) * 3;
    add(fx, t, ring, { g: 0.07 * vel, pan: -pan });
  }
}

function renderTicks() {
  const tick = (t, f, g, pan, seed) => {
    add(fx, t, pluck(f, [[1, 1, 1], [2, 0.3, 0.4]], 0.007, 0.05, 0.0004), { g, pan });
    add(fx, t, click(0.006, 5000, seed, 0.001), { g: g * 0.8, pan });
  };
  // wizard reel whips: decelerating ticks landing on each lock
  const locks = TL.hits.filter(h => h.t > 3 && h.t < 5 && h.kind === 'snap').map(h => h.t);
  locks.forEach((tl, k) => {
    [0, 0.04, 0.09, 0.15, 0.22, 0.31, 0.42].forEach((d, j) => {
      const u = j / 6;
      tick(tl - 0.5 + d, 1800 + k * 240 + j * 130, 0.1 + 0.08 * u, -0.5 + k * 0.5, 600 + k * 10 + j);
    });
  });
  // counters ticking up before they lock (8.15 -> 8.85 accelerating)
  const tl = TL.hits.find(h => h.kind === 'lock').t;
  let tt = tl - 0.8, gap = 0.1, n = 0;
  while (tt < tl - 0.03) { tick(tt, 2400 + n * 55, 0.05 + 0.1 * (n / 20), 0.35 * Math.sin(n), 700 + n); tt += gap; gap = Math.max(0.026, gap * 0.9); n++; }
}

// ---------------------------------------------------------------- the bed
// Per-sample automation curves (computed once): lowpass cutoff + volume with underwater dips.
const cutCurve = new Float64Array(N), volCurve = new Float64Array(N);
function dipFactor(t, th) {        // closes into the hit, snaps back open after it
  if (t <= th) return 1 - 0.78 * smooth((t - (th - 0.4)) / 0.4);
  return 1 - 0.78 * Math.exp(-(t - th) / 0.45);
}
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const open = t < SLAM ? 110 + 3400 * Math.pow(smooth(t / SLAM), 2.0) : 1400 + 1800 * Math.exp(-(t - SLAM) / 0.8);
  cutCurve[i] = open * dipFactor(t, BOOM) * dipFactor(t, SLAM);
  volCurve[i] = (t < SLAM ? 0.12 + 0.88 * Math.pow(smooth(t / SLAM), 1.1) : 0.62 - 0.25 * smooth((t - SLAM) / 2.8)) * (0.5 * smooth(t / 1.5));
}

function bedVoice({ f, cents = [0], gain = 1, pan = 0, haas = 0, send = 0.15, gate = () => 1, filt = true, wave = 'saw', t0 = 0, t1 = DUR, q = 0.8 }) {
  const i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor(t1 * SR));
  const out = new Float64Array(i1 - i0), r = rng(Math.round(f * 10));
  const ph = cents.map(() => r()), freqs = cents.map(c => f * Math.pow(2, c / 1200)), flt = SVF();
  for (let i = i0; i < i1; i++) {
    let s = 0;
    for (let k = 0; k < freqs.length; k++) {
      ph[k] += freqs[k] / SR; if (ph[k] >= 1) ph[k] -= 1;
      s += wave === 'saw' ? sawBlep(ph[k], freqs[k] / SR) : Math.sin(TAU * ph[k]);
    }
    s /= freqs.length;
    if (filt) s = flt.run(s, cutCurve[i], q).lp;
    out[i - i0] = s * gate(i / SR) * volCurve[i] * gain;
  }
  add(bed, t0, out, { g: 1, pan, haas, s: send });
}

function renderDrone() {
  bedVoice({ f: F.Fs1, wave: 'sine', filt: false, gain: 0.55, send: 0, cents: [0] });                          // sub body
  bedVoice({ f: F.Fs1, cents: [-6, 5], gain: 0.5, send: 0.05 });
  bedVoice({ f: F.Fs2, cents: [-9, 8], gain: 0.4, pan: -0.25, haas: 8 });
  bedVoice({ f: F.Cs3, cents: [-8, 9], gain: 0.3, pan: 0.3, haas: -9, send: 0.25 });
  bedVoice({ f: F.A3, cents: [-7, 7, 0], gain: 0.22, pan: -0.15, haas: 11, send: 0.3, gate: t => smooth((t - 5.6) / 1.6), t0: 5.0 });
  bedVoice({ f: F.Cs4, cents: [-6, 6], gain: 0.15, pan: 0.45, haas: -12, send: 0.3, gate: t => smooth((t - 7.5) / 1.5), t0: 7.0 });
  // tension before the slam: IV (B) over the F# pedal, cut on the hit and resolving to F#m
  const tens = t => smooth((t - 10.6) / 1.3) * (t < SLAM ? 1 : Math.exp(-(t - SLAM) / 0.04));
  bedVoice({ f: F.B2, cents: [-7, 8], gain: 0.4, pan: -0.3, haas: 9, send: 0.3, gate: tens, t0: 10.0, t1: SLAM + 0.4 });
  bedVoice({ f: F.D3, cents: [-7, 8], gain: 0.28, pan: 0.3, haas: -9, send: 0.3, gate: tens, t0: 10.0, t1: SLAM + 0.4 });
  bedVoice({ f: F.B3, cents: [-5, 6], gain: 0.2, pan: 0.0, haas: 13, send: 0.4, gate: tens, t0: 10.0, t1: SLAM + 0.4 });
}

// Choir-ish pad: detuned saws through vowel formants, swells in on the ignite, falls away into the vacuum.
function renderChoir() {
  const t0 = 8.9, t1 = SLAM + 0.05;
  const notes = [[F.Fs3, -0.6], [F.A3, -0.2], [F.Cs4, 0.25], [F.Fs4, 0.6], [F.A4, 0.0]];
  const formants = [[730, 1.0, 9], [1090, 0.55, 11], [2440, 0.3, 13], [3400, 0.12, 14]];
  const swell = t => smooth((t - 9.0) / 0.9);
  const body = t => (t < 11.4 ? 1 : 1 - 0.3 * smooth((t - 11.4) / 0.7)) * (1 - smooth((t - 12.06) / 0.1));
  notes.forEach(([f, pan], ni) => {
    const i0 = Math.floor(t0 * SR), i1 = Math.floor(t1 * SR), out = new Float64Array(i1 - i0);
    const r = rng(900 + ni), cents = [-9, 0, 8], ph = cents.map(() => r()), fl = formants.map(() => SVF()), nz = rng(950 + ni);
    for (let i = i0; i < i1; i++) {
      const t = i / SR, vib = 1 + 0.004 * Math.sin(TAU * 5.2 * t + ni);
      let s = 0;
      for (let k = 0; k < 3; k++) { const fk = f * Math.pow(2, cents[k] / 1200) * vib; ph[k] += fk / SR; if (ph[k] >= 1) ph[k] -= 1; s += sawBlep(ph[k], fk / SR); }
      s = s / 3 + (nz() * 2 - 1) * 0.05;
      let y = 0;
      for (let k = 0; k < formants.length; k++) y += fl[k].run(s, formants[k][0] * (1 + 0.02 * Math.sin(t * 0.7 + ni)), formants[k][2]).bpn * formants[k][1];
      out[i - i0] = y * swell(t) * body(t) * (ni === 4 ? smooth((t - 10.4) / 1.0) : 1) * 1.0;
    }
    add(bed, t0, out, { g: 1, pan, haas: ni % 2 ? 9 : -9, s: 0.5 });
  });
}

// Sub throb on 8ths (120 BPM), growing; anchored to the slam so the last pulse lands one 8th before it.
function renderThrob() {
  const kMax = Math.floor((SLAM - T_ARMY) / BEAT8);
  for (let k = kMax; k >= 1; k--) {
    const t = SLAM - k * BEAT8;
    const u = clamp01((t - T_ARMY) / (SLAM - T_ARMY));
    const accent = (k % 2 === 0) ? 1 : 0.72;
    const g = (0.2 + 1.3 * Math.pow(u, 1.5)) * accent;
    const o = mono(0.3); let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const tt = i / SR, f = F.Fs1 * (1 + 0.5 * Math.exp(-tt / 0.02));
      ph += TAU * f / SR;
      o[i] = Math.tanh(1.6 * Math.sin(ph)) * (tt < 0.006 ? tt / 0.006 : 1) * Math.exp(-tt / (0.09 + 0.05 * u));
    }
    add(bed, t, o, { g: 0.8 * g, s: 0.02 });
    // a soft upper-harmonic "push" so it speaks on small speakers
    add(bed, t, pluck(F.Fs2, [[1, 1, 1], [2, 0.5, 0.5]], 0.07, 0.25), { g: 0.2 * g, s: 0.05 });
  }
}

// Shimmering high arps through "Army" (9.3 -> 12.2), 8ths first, 16ths from 10.7, panned on a slow orbit.
const ARP_T0 = 10.4;                  // the pops own 9.6-10.35; arps take over right after
function renderArps() {
  const scale = [F.Fs5, F.A5, F.Cs6, F.E6, F.Fs6, F.A6, F.Cs7];
  const pat = [0, 2, 4, 2, 3, 4, 5, 4, 0, 2, 4, 6, 5, 4, 2, 3];
  const hitsT = [];
  for (let k = 22; k >= 1; k--) {
    const t = SLAM - k * BEAT16;
    if (t < ARP_T0) continue;
    if (t < 10.9 && Math.round(k) % 2) continue;      // 8ths until 10.9
    hitsT.push(t);
  }
  hitsT.forEach((t, n) => {
    const u = clamp01((t - ARP_T0) / (SLAM - ARP_T0));
    let idx = pat[n % pat.length] + (t > 11.2 ? 1 : 0);
    idx = Math.min(6, idx);
    const f = scale[idx], pan = Math.sin(t * 2.2) * 0.75;
    const g = 0.14 + 0.5 * Math.pow(u, 1.2);
    add(bed, t, pluck(f, GLASS, 0.16, 0.9), { g, pan, s: 0.45 + 0.2 * u });
    if (u > 0.4) add(bed, t, pluck(f * 2, [[1, 1, 1]], 0.07, 0.4), { g: g * 0.25, pan: -pan, s: 0.5 });
    // dotted-8th ping-pong echoes
    add(bed, t + BEAT16 * 3, pluck(f, GLASS, 0.16, 0.9), { g: g * 0.35, pan: -pan, s: 0.4 });
    add(bed, t + BEAT16 * 6, pluck(f, GLASS, 0.16, 0.9), { g: g * 0.15, pan: pan * 0.5, s: 0.4 });
  });
}

// End card: warm F#m(add9) with a slow swell, then a gentle ring-out; rolled bell harp on top.
function renderEndCard() {
  const chord = [[F.Fs2, -0.1], [F.Cs3, 0.15], [F.Fs3, -0.35], [F.A3, 0.3], [F.Cs4, -0.5], [F.Gs4, 0.5], [F.Fs4, 0.0]];
  const env = (t, k) => smooth((t - SLAM - 0.04 * k) / 0.55) * Math.exp(-(t - SLAM) / 5.5);
  chord.forEach(([f, pan], k) => {
    const t0 = SLAM, i0 = Math.floor(t0 * SR), out = new Float64Array(N - i0), r = rng(1300 + k);
    const cents = [-8, 7], ph = cents.map(() => r()), flt = SVF();
    for (let i = i0; i < N; i++) {
      const t = i / SR;
      let s = 0;
      for (let c = 0; c < 2; c++) { const fk = f * Math.pow(2, cents[c] / 1200); ph[c] += fk / SR; if (ph[c] >= 1) ph[c] -= 1; s += sawBlep(ph[c], fk / SR); }
      const fc = 650 + 2300 * smooth((t - SLAM) / 0.9) * Math.exp(-(t - SLAM) / 3.5);
      out[i - i0] = flt.run(s * 0.5, fc, 0.9).lp * env(t, k) * (k < 2 ? 0.4 : k === 5 ? 0.45 : 0.3);
    }
    add(bed, t0, out, { g: 1, pan, haas: k % 2 ? 12 : -12, s: 0.35 });
  });
  // rolled bell-harp
  [F.Fs4, F.A4, F.Cs5, F.Gs4 * 2, F.Fs5, F.A5].forEach((f, k) =>
    add(fx, SLAM + 0.16 + k * 0.07, pluck(f, BELL, 0.9, 3.0), { g: 0.2, s: 0.6, pan: -0.5 + k * 0.2, haas: k % 2 ? 6 : -6 }));
  // "SCAFFOLD resolves" lands on a held low octave and a soft sparkle
  add(fx, 12.7, pluck(F.Fs3, BELL, 1.4, 2.4), { g: 0.2, s: 0.5, pan: 0 });
  // tiny sparkle air through the tail
  add(fx, SLAM + 0.3, noiseSweep(2.5, 7000, 4500, 1.0, u => smooth(u * 4) * Math.exp(-u * 3) * 0.12, 1400, 'hp'), { g: 0.35, s: 0.6, panFn: tt => Math.sin(tt * 1.3) * 0.7 });
}

// ---------------------------------------------------------------- reverb (Freeverb-style)
function makeReverb(inL, inR, { fb = 0.9, damp = 0.28, preMs = 18 } = {}) {
  const sc = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(x => Math.round(x * sc));
  const apT = [556, 441, 341, 225].map(x => Math.round(x * sc));
  const spread = Math.round(23 * sc), pre = Math.round(preMs * SR / 1000);
  const mkChan = off => ({
    combs: combT.map(n => ({ b: new Float32Array(n + off), i: 0, s: 0 })),
    aps: apT.map(n => ({ b: new Float32Array(n + off), i: 0 })),
  });
  const chans = [mkChan(0), mkChan(spread)];
  const out = [new Float32Array(N), new Float32Array(N)];
  let hpL = 0, hpR = 0;
  for (let i = 0; i < N; i++) {
    const j = i - pre;
    let xl = j >= 0 ? inL[j] : 0, xr = j >= 0 ? inR[j] : 0;
    // keep mud and sub out of the tank (one-pole HP ~ 180 Hz)
    hpL += 0.0231 * (xl - hpL); hpR += 0.0231 * (xr - hpR);
    xl -= hpL; xr -= hpR;
    const ins = [(xl * 0.7 + xr * 0.3) * 0.022, (xr * 0.7 + xl * 0.3) * 0.022];
    for (let c = 0; c < 2; c++) {
      let sum = 0;
      for (const cb of chans[c].combs) {
        const y = cb.b[cb.i];
        cb.s = y * (1 - damp) + cb.s * damp;
        cb.b[cb.i] = ins[c] + cb.s * fb;
        if (++cb.i >= cb.b.length) cb.i = 0;
        sum += y;
      }
      for (const ap of chans[c].aps) {
        const bo = ap.b[ap.i], y = -sum + bo;
        ap.b[ap.i] = sum + bo * 0.5;
        if (++ap.i >= ap.b.length) ap.i = 0;
        sum = y;
      }
      out[c][i] = sum;
    }
  }
  return out;
}

// ---------------------------------------------------------------- build
const t_start = Date.now();
renderKeys();
renderTicks();
for (const h of TL.hits) {
  const fn = HANDLERS[h.kind];
  if (!fn) throw new Error('no sound for hit kind: ' + h.kind);
  fn(h);
}
const MUTE = new Set((process.env.MUTE || '').split(','));
if (!MUTE.has('drone')) renderDrone();
if (!MUTE.has('choir')) renderChoir();
if (!MUTE.has('throb')) renderThrob();
if (!MUTE.has('arps')) renderArps();
if (!MUTE.has('end')) renderEndCard();

// Sidechain-style ducking of the bed from every hit + a pre-hit vacuum before the two big ones.
const duck = new Float32Array(N).fill(1);
for (const h of TL.hits) {
  const big = h.kind === 'boom' || h.kind === 'slam';
  const depth = big ? 0.72 : h.kind === 'ignite' ? 0.6 : h.kind === 'pop' ? 0.4 : Math.min(0.45, 0.35 + 0.5 * h.amp);
  const tau = big ? 0.5 : h.kind === 'pop' ? 0.12 : h.kind === 'ignite' ? 0.4 : 0.22;
  const i0 = Math.max(0, Math.round((h.t - (big ? 0.12 : 0)) * SR)), i1 = Math.min(N, Math.round((h.t + 3 * tau + 0.2) * SR));
  for (let i = i0; i < i1; i++) {
    const t = i / SR;
    let d;
    if (t < h.t) d = depth * smooth((t - (h.t - 0.12)) / 0.09) * (big ? 1 : 0);
    else d = depth * Math.exp(-(t - h.t) / tau) * (big ? 1 : h.kind === 'pop' ? 0.9 : 0.8);
    duck[i] *= 1 - d;
  }
}
// the bed gets a slightly longer vacuum before the slam (12.08 -> 12.2)
for (let i = Math.round((SLAM - 0.12) * SR); i < Math.round(SLAM * SR); i++) duck[i] *= 0.5 + 0.5 * (1 - smooth((i / SR - (SLAM - 0.12)) / 0.06));

const rIn = [new Float32Array(N), new Float32Array(N)];
for (let i = 0; i < N; i++) {
  rIn[0][i] = bed.sL[i] * duck[i] + fx.sL[i];
  rIn[1][i] = bed.sR[i] * duck[i] + fx.sR[i];
}
const rev = makeReverb(rIn[0], rIn[1], { fb: 0.915, damp: 0.3 });

const REV = 1.0, BED = 0.8, FX = 1.0;
let mL = new Float64Array(N), mR = new Float64Array(N);
for (let i = 0; i < N; i++) {
  mL[i] = bed.L[i] * duck[i] * BED + fx.L[i] * FX + rev[0][i] * REV;
  mR[i] = bed.R[i] * duck[i] * BED + fx.R[i] * FX + rev[1][i] * REV;
}

if (process.env.DBG) {                 // per-stem loudness table (pre-master) for gain staging
  const r = (a, i0, i1, f = x => x) => { let s = 0; for (let i = i0; i < i1; i++) { const v = f(i); s += v * v; } return 20 * Math.log10(Math.sqrt(s / (i1 - i0)) + 1e-9); };
  console.log('   t   bed   fx   rev   (RMS dB pre-master, mono L)');
  for (let t = 0; t < 15; t += 0.5) {
    const a = Math.round(t * SR), b = Math.round((t + 0.5) * SR);
    console.log(t.toFixed(1).padStart(5), r(null, a, b, i => bed.L[i] * duck[i] * BED).toFixed(1).padStart(6), r(null, a, b, i => fx.L[i] * FX).toFixed(1).padStart(6), r(null, a, b, i => rev[0][i] * REV).toFixed(1).padStart(6));
  }
}

// ---------------------------------------------------------------- master bus
// DC blocker (very low corner so the 46 Hz sub is untouched)
for (const ch of [mL, mR]) {
  let x1 = 0, y1 = 0;
  for (let i = 0; i < N; i++) { const x = ch[i], y = x - x1 + 0.9995 * y1; x1 = x; y1 = y; ch[i] = y; }
}
// look-ahead peak limiter (2 ms) with gentle release, then tanh soft clip.
function limiter(thr) {
  const W = Math.round(0.002 * SR), rel = Math.exp(-1 / (0.18 * SR)), att = Math.exp(-1 / (0.0007 * SR));
  const need = new Float32Array(N);
  for (let i = 0; i < N; i++) { const p = Math.max(Math.abs(mL[i]), Math.abs(mR[i])); need[i] = p > thr ? thr / p : 1; }
  // forward-window minimum (monotonic deque would be faster; the naive loop is fine at 720k x 96)
  let gs = 1;
  for (let i = 0; i < N; i++) {
    let m = 1;
    const e = Math.min(N, i + W);
    for (let j = i; j < e; j++) if (need[j] < m) m = need[j];
    gs = m < gs ? m + (gs - m) * att : m + (gs - m) * rel;
    mL[i] *= gs; mR[i] *= gs;
  }
}
let pk0 = 0;
for (let i = 0; i < N; i++) pk0 = Math.max(pk0, Math.abs(mL[i]), Math.abs(mR[i]));
const LIM_THR = pk0 * 0.55;
limiter(LIM_THR);
for (let i = 0; i < N; i++) { mL[i] = Math.tanh(mL[i] / LIM_THR * 0.9); mR[i] = Math.tanh(mR[i] / LIM_THR * 0.9); }
// fades: 12 ms in, 0.4 s out
const fi = Math.round(0.012 * SR), fo = Math.round(0.4 * SR);
for (let i = 0; i < fi; i++) { const g = 0.5 - 0.5 * Math.cos(Math.PI * i / fi); mL[i] *= g; mR[i] *= g; }
for (let i = 0; i < fo; i++) { const g = 0.5 + 0.5 * Math.cos(Math.PI * (i + 1) / fo); mL[N - fo + i] *= g; mR[N - fo + i] *= g; }
// peak normalise to -1 dBFS
let pk = 0;
for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(mL[i]), Math.abs(mR[i]));
const norm = Math.pow(10, -1 / 20) / pk;

// ---------------------------------------------------------------- write WAV
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mL[i] * norm * 32767))), i * 4);
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mR[i] * norm * 32767))), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([hdr, data]));
console.log(`score.wav written: ${N} frames/ch, ${(N / SR).toFixed(3)} s, ${(Date.now() - t_start) / 1000}s to render, premaster peak ${pk0.toFixed(3)}`);
