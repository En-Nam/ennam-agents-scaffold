// The music bed (drone, choir, throb, arps, end card), driven by timeline.sections (D12).
// Ported from spike A audio/make-score.mjs: the spike's absolute anchors (SLAM, T_ARMY,
// ARP_T0, the 5.0/7.0/10.0 entries…) are replaced by section-derived anchors:
//   climax = earliest slam hit inside the outro (else outro start, else the film end)
//   build  = first build section start (else end of intro)
//   peak   = first peak section start (else 60% of the way from build to climax)
// and every layer time is an offset from (or a fraction between) those anchors.
import { F, SR, TAU, add, mono, pluck, sawBlep, SVF, rng, smooth, clamp01, GLASS, BELL, noiseSweep } from './dsp.mjs';

/** Section-derived anchors (seconds) for the bed. */
export function anchors(timeline) {
  const D = timeline.durationS;
  const first = (name) => timeline.sections.find((s) => s.name === name);
  const outro = first('outro');
  // earliest slam in the outro by time, not array order (never trust the input sort here)
  const slamTs = outro ? timeline.hits.filter((h) => h.kind === 'slam' && h.t >= outro.t0 && h.t <= outro.t1).map((h) => h.t) : [];
  const climax = slamTs.length ? Math.min(...slamTs) : outro ? outro.t0 : D;
  const intro = first('intro');
  const build = first('build');
  const buildT0 = build ? build.t0 : intro ? intro.t1 : 0;
  const peak = first('peak');
  const peakT0 = peak ? peak.t0 : buildT0 + 0.6 * (climax - buildT0);
  const dips = timeline.hits.filter((h) => h.kind === 'boom' || h.kind === 'slam').map((h) => h.t);
  return { D, climax, buildT0, peakT0, dips, outroT0: outro ? outro.t0 : D };
}

// Per-sample automation: lowpass cutoff + volume, with underwater dips into each big hit.
function dipFactor(x, th) { // closes into the hit, snaps back open after it
  if (x <= th) return 1 - 0.78 * smooth((x - (th - 0.4)) / 0.4);
  return 1 - 0.78 * Math.exp(-(x - th) / 0.45);
}
function curves(N, A) {
  const C = A.climax, cut = new Float64Array(N), vol = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / SR;
    let open = x < C ? 110 + 3400 * Math.pow(smooth(x / C), 2.0) : 1400 + 1800 * Math.exp(-(x - C) / 0.8);
    for (const th of A.dips) open *= dipFactor(x, th);
    cut[i] = open;
    vol[i] = (x < C ? 0.12 + 0.88 * Math.pow(smooth(x / C), 1.1) : 0.62 - 0.25 * smooth((x - C) / 2.8)) * (0.5 * smooth(x / 1.5));
  }
  return { cut, vol };
}

function bedVoice(ctx, cv, { f, cents = [0], gain = 1, pan = 0, haas = 0, send = 0.15, gate = () => 1, filt = true, wave = 'saw', from = 0, to = Infinity, q = 0.8 }) {
  const N = ctx.bed.L.length;
  const i0 = Math.max(0, Math.floor(from * SR)), i1 = Math.min(N, Math.floor(to * SR));
  if (i1 <= i0) return;
  const out = new Float64Array(i1 - i0), r = rng(ctx.seed(Math.round(f * 10)));
  const ph = cents.map(() => r()), freqs = cents.map((c) => f * Math.pow(2, c / 1200)), flt = SVF();
  for (let i = i0; i < i1; i++) {
    let s = 0;
    for (let k = 0; k < freqs.length; k++) {
      ph[k] += freqs[k] / SR; if (ph[k] >= 1) ph[k] -= 1;
      s += wave === 'saw' ? sawBlep(ph[k], freqs[k] / SR) : Math.sin(TAU * ph[k]);
    }
    s /= freqs.length;
    if (filt) s = flt.run(s, cv.cut[i], q).lp;
    out[i - i0] = s * gate(i / SR) * cv.vol[i] * gain;
  }
  add(ctx.bed, i0 / SR, out, { g: 1, pan, haas, s: send });
}

function renderDrone(ctx, cv, A) {
  const C = A.climax, mid = (A.buildT0 + A.peakT0) / 2;
  bedVoice(ctx, cv, { f: F.Fs1, wave: 'sine', filt: false, gain: 0.55, send: 0, cents: [0] }); // sub body
  bedVoice(ctx, cv, { f: F.Fs1, cents: [-6, 5], gain: 0.5, send: 0.05 });
  bedVoice(ctx, cv, { f: F.Fs2, cents: [-9, 8], gain: 0.4, pan: -0.25, haas: 8 });
  bedVoice(ctx, cv, { f: F.Cs3, cents: [-8, 9], gain: 0.3, pan: 0.3, haas: -9, send: 0.25 });
  // the third enters with the build, the fifth above it halfway to the peak
  bedVoice(ctx, cv, { f: F.A3, cents: [-7, 7, 0], gain: 0.22, pan: -0.15, haas: 11, send: 0.3, gate: (x) => smooth((x - A.buildT0) / 1.6), from: A.buildT0 - 0.6 });
  bedVoice(ctx, cv, { f: F.Cs4, cents: [-6, 6], gain: 0.15, pan: 0.45, haas: -12, send: 0.3, gate: (x) => smooth((x - mid) / 1.5), from: mid - 0.5 });
  // tension before the climax: IV (B) over the F# pedal, cut on the hit and resolving to F#m
  const tens = (x) => smooth((x - (C - 1.6)) / 1.3) * (x < C ? 1 : Math.exp(-(x - C) / 0.04));
  for (const [f, gain, pan, haas, send] of [[F.B2, 0.4, -0.3, 9, 0.3], [F.D3, 0.28, 0.3, -9, 0.3], [F.B3, 0.2, 0.0, 13, 0.4]]) {
    bedVoice(ctx, cv, { f, cents: [-7, 8], gain, pan, haas, send, gate: tens, from: C - 2.2, to: C + 0.4 });
  }
}

// Choir-ish pad: detuned saws through vowel formants; swells in with the peak, falls away into the climax vacuum.
function renderChoir(ctx, A) {
  const C = A.climax, from = A.peakT0, to = C + 0.05, N = ctx.bed.L.length;
  const i0 = Math.max(0, Math.floor(from * SR)), i1 = Math.min(N, Math.floor(to * SR));
  if (i1 <= i0) return;
  const notes = [[F.Fs3, -0.6], [F.A3, -0.2], [F.Cs4, 0.25], [F.Fs4, 0.6], [F.A4, 0.0]];
  const formants = [[730, 1.0, 9], [1090, 0.55, 11], [2440, 0.3, 13], [3400, 0.12, 14]];
  const swell = (x) => smooth((x - (from + 0.1)) / 0.9);
  const body = (x) => (x < C - 0.8 ? 1 : 1 - 0.3 * smooth((x - (C - 0.8)) / 0.7)) * (1 - smooth((x - (C - 0.14)) / 0.1));
  notes.forEach(([f, pan], ni) => {
    const out = new Float64Array(i1 - i0);
    const r = rng(ctx.seed(900 + ni)), cents = [-9, 0, 8], ph = cents.map(() => r()), fl = formants.map(() => SVF()), nz = rng(ctx.seed(950 + ni));
    for (let i = i0; i < i1; i++) {
      const x = i / SR, vib = 1 + 0.004 * Math.sin(TAU * 5.2 * x + ni);
      let s = 0;
      for (let k = 0; k < 3; k++) { const fk = f * Math.pow(2, cents[k] / 1200) * vib; ph[k] += fk / SR; if (ph[k] >= 1) ph[k] -= 1; s += sawBlep(ph[k], fk / SR); }
      s = s / 3 + (nz() * 2 - 1) * 0.05;
      let y = 0;
      for (let k = 0; k < formants.length; k++) y += fl[k].run(s, formants[k][0] * (1 + 0.02 * Math.sin(x * 0.7 + ni)), formants[k][2]).bpn * formants[k][1];
      out[i - i0] = y * swell(x) * body(x) * (ni === 4 ? smooth((x - (C - 1.8)) / 1.0) : 1);
    }
    add(ctx.bed, i0 / SR, out, { g: 1, pan, haas: ni % 2 ? 9 : -9, s: 0.5 });
  });
}

// Sub throb on 8ths through the peak, growing; anchored so the last pulse lands one 8th before the climax.
function renderThrob(ctx, A) {
  const C = A.climax, b8 = ctx.beat16 * 2, span = C - A.peakT0;
  if (span <= 0) return;
  for (let k = Math.floor(span / b8); k >= 1; k--) {
    const at = C - k * b8;
    const u = clamp01((at - A.peakT0) / span);
    const accent = (k % 2 === 0) ? 1 : 0.72;
    const g = (0.2 + 1.3 * Math.pow(u, 1.5)) * accent;
    const o = mono(0.3); let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const x = i / SR, f = F.Fs1 * (1 + 0.5 * Math.exp(-x / 0.02));
      ph += TAU * f / SR;
      o[i] = Math.tanh(1.6 * Math.sin(ph)) * (x < 0.006 ? x / 0.006 : 1) * Math.exp(-x / (0.09 + 0.05 * u));
    }
    add(ctx.bed, at, o, { g: 0.8 * g, s: 0.02 });
    add(ctx.bed, at, pluck(F.Fs2, [[1, 1, 1], [2, 0.5, 0.5]], 0.07, 0.25), { g: 0.2 * g, s: 0.05 });
  }
}

// Shimmering high arps over the second half of the peak: 8ths first, 16ths for the last
// stretch, one step higher in the final third. (Spike ratios of its 8.9→12.2 peak window.)
function renderArps(ctx, A) {
  const C = A.climax, span = C - A.peakT0, g16 = ctx.beat16;
  if (span <= 0) return;
  const arpT0 = A.peakT0 + 0.45 * span, sixteenthsT = A.peakT0 + 0.6 * span, liftT = A.peakT0 + 0.7 * span;
  const scale = [F.Fs5, F.A5, F.Cs6, F.E6, F.Fs6, F.A6, F.Cs7];
  const pat = [0, 2, 4, 2, 3, 4, 5, 4, 0, 2, 4, 6, 5, 4, 2, 3];
  const notes = [];
  for (let k = Math.floor((C - arpT0) / g16); k >= 1; k--) {
    const at = C - k * g16;
    if (at < sixteenthsT && k % 2) continue; // 8ths until the 16ths stretch
    notes.push(at);
  }
  notes.forEach((at, n) => {
    const u = clamp01((at - arpT0) / (C - arpT0));
    const idx = Math.min(6, pat[n % pat.length] + (at > liftT ? 1 : 0));
    const f = scale[idx], pan = Math.sin(at * 2.2) * 0.75;
    const g = 0.14 + 0.5 * Math.pow(u, 1.2);
    add(ctx.bed, at, pluck(f, GLASS, 0.16, 0.9), { g, pan, s: 0.45 + 0.2 * u });
    if (u > 0.4) add(ctx.bed, at, pluck(f * 2, [[1, 1, 1]], 0.07, 0.4), { g: g * 0.25, pan: -pan, s: 0.5 });
    // dotted-8th ping-pong echoes
    add(ctx.bed, at + g16 * 3, pluck(f, GLASS, 0.16, 0.9), { g: g * 0.35, pan: -pan, s: 0.4 });
    add(ctx.bed, at + g16 * 6, pluck(f, GLASS, 0.16, 0.9), { g: g * 0.15, pan: pan * 0.5, s: 0.4 });
  });
}

// End card: warm F#m(add9) swelling from the climax, then a gentle ring-out; rolled bell harp on top.
function renderEndCard(ctx, A) {
  const C = A.climax, N = ctx.bed.L.length, i0 = Math.max(0, Math.floor(C * SR));
  if (i0 >= N) return;
  const chord = [[F.Fs2, -0.1], [F.Cs3, 0.15], [F.Fs3, -0.35], [F.A3, 0.3], [F.Cs4, -0.5], [F.Gs4, 0.5], [F.Fs4, 0.0]];
  const env = (x, k) => smooth((x - C - 0.04 * k) / 0.55) * Math.exp(-(x - C) / 5.5);
  chord.forEach(([f, pan], k) => {
    const out = new Float64Array(N - i0), r = rng(ctx.seed(1300 + k));
    const cents = [-8, 7], ph = cents.map(() => r()), flt = SVF();
    for (let i = i0; i < N; i++) {
      const x = i / SR;
      let s = 0;
      for (let c = 0; c < 2; c++) { const fk = f * Math.pow(2, cents[c] / 1200); ph[c] += fk / SR; if (ph[c] >= 1) ph[c] -= 1; s += sawBlep(ph[c], fk / SR); }
      const fc = 650 + 2300 * smooth((x - C) / 0.9) * Math.exp(-(x - C) / 3.5);
      out[i - i0] = flt.run(s * 0.5, fc, 0.9).lp * env(x, k) * (k < 2 ? 0.4 : k === 5 ? 0.45 : 0.3);
    }
    add(ctx.bed, i0 / SR, out, { g: 1, pan, haas: k % 2 ? 12 : -12, s: 0.35 });
  });
  // rolled bell-harp
  [F.Fs4, F.A4, F.Cs5, F.Gs4 * 2, F.Fs5, F.A5].forEach((f, k) =>
    add(ctx.fx, C + 0.16 + k * 0.07, pluck(f, BELL, 0.9, 3.0), { g: 0.2, s: 0.6, pan: -0.5 + k * 0.2, haas: k % 2 ? 6 : -6 }));
  // held low octave half a second after the climax
  add(ctx.fx, C + 0.5, pluck(F.Fs3, BELL, 1.4, 2.4), { g: 0.2, s: 0.5, pan: 0 });
  // tiny sparkle air through the tail
  add(ctx.fx, C + 0.3, noiseSweep(2.5, 7000, 4500, 1.0, (u) => smooth(u * 4) * Math.exp(-u * 3) * 0.12, ctx.seed(1400), 'hp'), { g: 0.35, s: 0.6, panFn: (x) => Math.sin(x * 1.3) * 0.7 });
}

/** Render all bed layers into ctx.bed (and the end-card bells into ctx.fx). */
export function renderBed(ctx, timeline) {
  const A = anchors(timeline);
  const cv = curves(ctx.bed.L.length, A);
  renderDrone(ctx, cv, A);
  renderChoir(ctx, A);
  renderThrob(ctx, A);
  renderArps(ctx, A);
  renderEndCard(ctx, A);
  return A;
}
