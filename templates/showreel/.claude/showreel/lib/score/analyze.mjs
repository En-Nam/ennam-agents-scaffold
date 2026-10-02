// Numeric verification of a rendered score against its timeline (AC4). Ported from spike A
// audio/analyze-score.mjs: peak/NaN/clip checks + the per-hit onset detector, generalised
// to locate each onset (not just test for one) so sync is judged to ±1 frame.
const SR = 48000;
const CEILING = 0.891; // -1 dBFS sample peak
const CLIP = 0.99997;
const AFTER = 0.04, BEFORE = 0.08, MIN_JUMP_DB = 3;
const SEARCH = 0.05;

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const lpCoef = (fc) => 1 - Math.exp(-2 * Math.PI * fc / SR);
function lowpass(x, fc) { const a = lpCoef(fc), o = new Float64Array(x.length); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); o[i] = y; } return o; }
function energy(x) { const c = new Float64Array(x.length + 1); for (let i = 0; i < x.length; i++) c[i + 1] = c[i] + x[i] * x[i]; return c; }

/**
 * @returns {{samples, peakDbfs, clipped, nan, hits:[{t, kind, onsetT, jumpDb, ok}], ok}}
 * A hit is ok when the strongest energy jump (40 ms after vs 80 ms before, best of
 * full/low/high band) near it is >= +3 dB AND lands within ±1 frame of hit.t.
 *
 * LIMITATION: this sees the final mix only, so it detects *an* onset near hit.t, not
 * *the hit's* onset. A bed event on the same grid (e.g. a throb 8th landing on a peak-section
 * hit) can satisfy it for a hit whose own sound is silent. Proving each hit contributes its
 * own energy needs an ablation against a render without that hit (see score.test.ts).
 */
export function analyzeScore(score, timeline) {
  const { left: L, right: R } = score;
  const N = L.length;
  const expected = Math.round(timeline.durationS * SR);
  const M = new Float64Array(N);
  let peak = 0, clipped = 0, nan = 0;
  for (let i = 0; i < N; i++) {
    const l = L[i], r = R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    if (a >= CLIP) clipped++;
    M[i] = (l + r) / 2;
  }
  // bands (one-pole, twice): low < ~250 Hz, high > ~3 kHz
  const lo = lowpass(lowpass(M, 250), 250);
  const l3 = lowpass(lowpass(M, 3000), 3000), hi = new Float64Array(N);
  for (let i = 0; i < N; i++) hi[i] = M[i] - l3[i];
  const bands = [energy(M), energy(lo), energy(hi)];
  const rms = (c, a, b) => { a = Math.max(0, a); b = Math.min(N, b); return b > a ? Math.sqrt((c[b] - c[a]) / (b - a)) : 0; };
  const nA = Math.round(AFTER * SR), nB = Math.round(BEFORE * SR);
  const jumpAt = (s) => Math.max(...bands.map((c) => db(rms(c, s, s + nA)) - db(rms(c, s - nB, s))));

  const frame = 1 / timeline.fps;
  // Search a fixed ±SEARCH window (= ±3 frames at 60 fps) at 0.5 ms steps. It must NOT scale with the
  // frame: at 30 fps a ±3-frame (±100 ms) window reached louder neighbouring bed onsets and failed
  // in-sync hits (found by the Task 8 e2e). The sync tolerance below stays ±1 frame of timeline.fps.
  const span = Math.round(SEARCH * SR), step = 24;
  const hits = [...timeline.hits].sort((a, b) => a.t - b.t).map((h) => {
    const c = Math.round(h.t * SR);
    let best = -Infinity, bestS = c;
    for (let s = c - span; s <= c + span; s += step) {
      const j = jumpAt(s);
      if (j > best) { best = j; bestS = s; }
    }
    const onsetT = bestS / SR;
    const ok = best >= MIN_JUMP_DB && Math.abs(onsetT - h.t) <= frame + 1e-9;
    return { t: h.t, kind: h.kind, onsetT, jumpDb: Math.round(best * 10) / 10, ok };
  });
  const ok = N === expected && R.length === expected && nan === 0 && clipped === 0 && peak <= CEILING && hits.every((h) => h.ok);
  return { samples: N, peakDbfs: db(peak), clipped, nan, hits, ok };
}
