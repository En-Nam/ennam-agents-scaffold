// DSP primitives for the procedural score (D12). Ported from spike A audio/make-score.mjs.
// Pure, dependency-free. No absolute times live here: every function works on durations
// and sample offsets handed to it by the caller (which reads them from timeline.json).

export const SR = 48000;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- small utils
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const expInterp = (a, b, u) => a * Math.pow(b / a, u);

/** mulberry32: deterministic uniform [0,1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a per-layer seed from the film seed so every noise layer is seeded by timeline.seed. */
export function mixSeed(seed, k) {
  let h = (Math.imul((seed >>> 0) ^ 0x9E3779B9, 0x85EBCA6B) + Math.imul(k | 0, 0xC2B2AE35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7FEB352D) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

// Frequencies (F# minor pentatonic + chord tones). Names are note+octave.
export const F = {
  Fs1: 46.249, Fs2: 92.499, B2: 123.471, Cs3: 138.591, D3: 146.832, E3: 164.814, Fs3: 184.997, A3: 220.0, B3: 246.942, Cs4: 277.183,
  E4: 329.628, Fs4: 369.994, Gs4: 415.305, A4: 440.0, B4: 493.883, Cs5: 554.365, E5: 659.255, Fs5: 739.989, A5: 880.0,
  Cs6: 1108.731, E6: 1318.51, Fs6: 1479.978, A6: 1760.0, Cs7: 2217.46,
};

// ---------------------------------------------------------------- filters / oscillators
/** TPT state-variable filter, per-sample modulation safe. */
export function SVF() {
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

/** Band-limited saw (polyBLEP). p = phase 0..1, dt = f / SR. */
export function sawBlep(p, dt) {
  let v = 2 * p - 1;
  if (p < dt) { const u = p / dt; v -= u + u - u * u - 1; }
  else if (p > 1 - dt) { const u = (p - 1) / dt; v -= u * u + u + u + 1; }
  return v;
}

// ---------------------------------------------------------------- buses
// dry L/R + reverb-send L/R. 'bed' gets sidechain ducking, 'fx' (hits, ticks, plucks) does not.
export const mkBus = (n) => ({ L: new Float32Array(n), R: new Float32Array(n), sL: new Float32Array(n), sR: new Float32Array(n) });

/**
 * Mix a mono buffer into a bus at time `at` (seconds, from the timeline). g = dry gain,
 * s = reverb send, pan -1..1 (or panFn(secondsIntoBuffer)), haas = ms delay for width.
 * Anything before 0 or past the bus end is dropped (the score is exactly N samples).
 */
export function add(bus, at, buf, o = {}) {
  const N = bus.L.length;
  const g = o.g ?? 1, s = o.s ?? 0, haas = Math.round((o.haas ?? 0) * SR / 1000);
  const s0 = Math.round(at * SR);
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
export const mono = (d) => new Float64Array(Math.max(1, Math.ceil(d * SR)));

/** Pitched sine boom: exponential pitch drop + soft saturation so it reads on small speakers. */
export function subBoom({ f0 = 100, f1 = 36, pt = 0.18, tau = 0.7, dur = 2.4, drive = 1.6, atk = 0.003 }) {
  const o = mono(dur); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const x = i / SR, f = f1 + (f0 - f1) * Math.exp(-x / pt);
    ph += TAU * f / SR;
    const e = (x < atk ? x / atk : 1) * Math.exp(-x / tau);
    o[i] = Math.tanh(drive * Math.sin(ph) * e) / Math.tanh(drive) + 0.2 * Math.sin(2 * ph) * e * Math.exp(-x / 0.15);
  }
  return o;
}

/** Noise through a swept filter. envFn(u, secs) shapes loudness (u = 0..1 across dur). */
export function noiseSweep(dur, f0, f1, Q, envFn, seed, mode = 'bpn') {
  const o = mono(dur), r = rng(seed), flt = SVF();
  for (let i = 0; i < o.length; i++) {
    const u = i / o.length, x = i / SR;
    const y = flt.run(r() * 2 - 1, expInterp(f0, f1, u), Q);
    o[i] = (mode === 'lp' ? y.lp : mode === 'hp' ? y.hp : y.bpn) * envFn(u, x);
  }
  return o;
}

/** Very short HP noise tick (transient layer for clicks/snaps). */
export function click(len, hpf, seed, tau) {
  const o = mono(len), r = rng(seed), flt = SVF();
  for (let i = 0; i < o.length; i++) o[i] = flt.run(r() * 2 - 1, hpf, 0.8).hp * Math.exp(-(i / SR) / tau);
  return o;
}

/** Additive pluck/bell/marimba: partials = [ratio, amp, tauMultiplier]. */
export function pluck(f, partials, tau, dur, atk = 0.0015) {
  const o = mono(dur);
  for (const [ratio, amp, tm] of partials) {
    const w = TAU * f * ratio / SR, ta = tau * tm;
    if (f * ratio > SR * 0.45) continue;
    for (let i = 0; i < o.length; i++) {
      const x = i / SR;
      o[i] += Math.sin(w * i) * amp * (x < atk ? x / atk : 1) * Math.exp(-x / ta);
    }
  }
  return o;
}
export const BELL = [[1, 1, 1], [2.0, 0.35, 0.6], [2.76, 0.22, 0.4], [5.4, 0.1, 0.25]];
export const MARIMBA = [[1, 1, 1], [3.97, 0.4, 0.2], [9.2, 0.12, 0.07]];
export const GLASS = [[1, 1, 1], [2, 0.3, 0.7], [3, 0.12, 0.5]];

/** Sine glide from fa to fb over dur, shaped by envFn(u). */
export function glide(dur, fa, fb, envFn, harm2 = 0) {
  const o = mono(dur); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const u = i / o.length;
    ph += TAU * expInterp(fa, fb, u) / SR;
    o[i] = (Math.sin(ph) + harm2 * Math.sin(2 * ph)) * envFn(u);
  }
  return o;
}

// ---------------------------------------------------------------- reverb (Freeverb-style)
export function makeReverb(inL, inR, { fb = 0.9, damp = 0.28, preMs = 18 } = {}) {
  const N = inL.length;
  const sc = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((x) => Math.round(x * sc));
  const apT = [556, 441, 341, 225].map((x) => Math.round(x * sc));
  const spread = Math.round(23 * sc), pre = Math.round(preMs * SR / 1000);
  const mkChan = (off) => ({
    combs: combT.map((n) => ({ b: new Float32Array(n + off), i: 0, s: 0 })),
    aps: apT.map((n) => ({ b: new Float32Array(n + off), i: 0 })),
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

// ---------------------------------------------------------------- limiter
/**
 * Look-ahead (2 ms) peak limiter with gentle release, in place on mL/mR.
 * Forward-window minimum via a monotonic deque (same result as the spike's naive loop, O(N)).
 */
export function limiter(mL, mR, thr) {
  const N = mL.length;
  const W = Math.round(0.002 * SR), rel = Math.exp(-1 / (0.18 * SR)), att = Math.exp(-1 / (0.0007 * SR));
  const need = new Float64Array(N);
  for (let i = 0; i < N; i++) { const p = Math.max(Math.abs(mL[i]), Math.abs(mR[i])); need[i] = p > thr ? thr / p : 1; }
  const dq = new Int32Array(N); let head = 0, tail = 0, next = 0;
  let gs = 1;
  for (let i = 0; i < N; i++) {
    const e = Math.min(N, i + W);
    for (; next < e; next++) {
      while (tail > head && need[dq[tail - 1]] >= need[next]) tail--;
      dq[tail++] = next;
    }
    while (dq[head] < i) head++;
    const m = Math.min(1, need[dq[head]]);
    gs = m < gs ? m + (gs - m) * att : m + (gs - m) * rel;
    mL[i] *= gs; mR[i] *= gs;
  }
}
