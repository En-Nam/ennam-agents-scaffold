// Bus mixing + master chain (D12). Ported from spike A audio/make-score.mjs:
// hit ducking of the bed comes from timeline.hits; reverb; DC block; limiter; fades;
// peak normalisation to the -1 dBFS ceiling.
import { SR, smooth, makeReverb, limiter } from './dsp.mjs';

/** Sample peak ceiling: -1 dBFS is 0.8913; we normalise a hair under it so float32/16-bit rounding stays <= 0.891. */
export const CEILING = 0.89;

/** Sidechain-style ducking curve of the bed from every hit, plus a pre-hit vacuum before boom/slam. */
export function duckCurve(N, hits) {
  const duck = new Float32Array(N).fill(1);
  for (const h of hits) {
    const big = h.kind === 'boom' || h.kind === 'slam';
    const depth = big ? 0.72 : h.kind === 'ignite' ? 0.6 : h.kind === 'pop' ? 0.4 : Math.min(0.45, 0.35 + 0.5 * h.amp);
    const tau = big ? 0.5 : h.kind === 'pop' ? 0.12 : h.kind === 'ignite' ? 0.4 : 0.22;
    const i0 = Math.max(0, Math.round((h.t - (big ? 0.12 : 0)) * SR)), i1 = Math.min(N, Math.round((h.t + 3 * tau + 0.2) * SR));
    for (let i = i0; i < i1; i++) {
      const x = i / SR;
      const d = x < h.t
        ? depth * smooth((x - (h.t - 0.12)) / 0.09) * (big ? 1 : 0)
        : depth * Math.exp(-(x - h.t) / tau) * (big ? 1 : h.kind === 'pop' ? 0.9 : 0.8);
      duck[i] *= 1 - d;
    }
    if (h.kind === 'slam') { // a slightly longer vacuum right before the slam
      const a = Math.max(0, Math.round((h.t - 0.12) * SR)), b = Math.min(N, Math.round(h.t * SR));
      for (let i = a; i < b; i++) duck[i] *= 0.5 + 0.5 * (1 - smooth((i / SR - (h.t - 0.12)) / 0.06));
    }
  }
  return duck;
}

/** Mix bed (ducked) + fx + reverb, run the master chain, return float32 L/R at the ceiling. */
export function master(bed, fx, hits) {
  const N = bed.L.length;
  const duck = duckCurve(N, hits);
  const rInL = new Float32Array(N), rInR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    rInL[i] = bed.sL[i] * duck[i] + fx.sL[i];
    rInR[i] = bed.sR[i] * duck[i] + fx.sR[i];
  }
  const rev = makeReverb(rInL, rInR, { fb: 0.915, damp: 0.3 });
  const BED = 0.8;
  const mL = new Float64Array(N), mR = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    mL[i] = bed.L[i] * duck[i] * BED + fx.L[i] + rev[0][i];
    mR[i] = bed.R[i] * duck[i] * BED + fx.R[i] + rev[1][i];
  }
  // DC blocker (very low corner so the 46 Hz sub is untouched)
  for (const ch of [mL, mR]) {
    let x1 = 0, y1 = 0;
    for (let i = 0; i < N; i++) { const x = ch[i], y = x - x1 + 0.9995 * y1; x1 = x; y1 = y; ch[i] = y; }
  }
  // look-ahead limiter at 0.55 × pre-master peak, then tanh soft clip
  let pk0 = 0;
  for (let i = 0; i < N; i++) pk0 = Math.max(pk0, Math.abs(mL[i]), Math.abs(mR[i]));
  const left = new Float32Array(N), right = new Float32Array(N);
  if (pk0 === 0) return { left, right };
  const thr = pk0 * 0.55;
  limiter(mL, mR, thr);
  for (let i = 0; i < N; i++) { mL[i] = Math.tanh(mL[i] / thr * 0.9); mR[i] = Math.tanh(mR[i] / thr * 0.9); }
  // fades: 12 ms in, 0.4 s out (relative to the film's own ends)
  const fi = Math.min(N, Math.round(0.012 * SR)), fo = Math.min(N, Math.round(0.4 * SR));
  for (let i = 0; i < fi; i++) { const g = 0.5 - 0.5 * Math.cos(Math.PI * i / fi); mL[i] *= g; mR[i] *= g; }
  for (let i = 0; i < fo; i++) { const g = 0.5 + 0.5 * Math.cos(Math.PI * (i + 1) / fo); mL[N - fo + i] *= g; mR[N - fo + i] *= g; }
  // peak normalise to the ceiling
  let pk = 0;
  for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(mL[i]), Math.abs(mR[i]));
  const norm = pk > 0 ? CEILING / pk : 0;
  for (let i = 0; i < N; i++) { left[i] = mL[i] * norm; right[i] = mR[i] * norm; }
  return { left, right };
}
