import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';
import { renderScore, writeWav } from '../../templates/showreel/.claude/showreel/lib/score/make.mjs';
import { HANDLERS } from '../../templates/showreel/.claude/showreel/lib/score/handlers.mjs';
import { mkBus, mixSeed } from '../../templates/showreel/.claude/showreel/lib/score/dsp.mjs';
import { analyzeScore } from '../../templates/showreel/.claude/showreel/lib/score/analyze.mjs';
import { duckCurve } from '../../templates/showreel/.claude/showreel/lib/score/mix.mjs';
import { renderBed, renderThrob, renderArps, arpThin, anchors } from '../../templates/showreel/.claude/showreel/lib/score/bed.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { storyboardFromArrangement, type DigestFact } from './helpers/storyboard';

// v1.16 showreel — AC4 (D12/D13): the score is synthesised from build/timeline.json, the
// same clock the picture uses. If a sound lands off its hit, the film reads as out of sync;
// if the WAV is not exactly N×48000 samples, the mux drifts (we mux WITHOUT -shortest);
// if it clips or carries NaN, the AAC encode is audibly broken. Each test below can fail
// when one of those business rules breaks.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const SCORE_DIR = path.join(TOOLKIT, 'lib', 'score');
const FIX = path.join(HERE, 'fixtures', 'score');
const SR = 48000;
const CEILING = 0.891; // -1 dBFS sample peak
const FRAME = 1 / 60;

type Hit = { t: number; kind: string; amp: number; beatId: string; cue: string };
type Timeline = { durationS: number; fps: number; seed: number; hits: Hit[]; typing: { t0: number; interval: number; chars: number }[]; sections: { name: string; t0: number; t1: number }[] } & Record<string, unknown>;
type Score = { left: Float32Array; right: Float32Array; sampleRate: number };

const load = (name: string): Timeline => JSON.parse(readFileSync(path.join(FIX, name), 'utf8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const bytes = (s: Score) => Buffer.concat([Buffer.from(s.left.buffer), Buffer.from(s.right.buffer)]);
const timed = (tl: Timeline, opts?: { seed?: number }) => {
  const t0 = process.hrtime.bigint();
  const score = renderScore(tl, opts) as Score;
  return { score, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
};

// Per-window (100 ms) energy of the sample difference a−b relative to a, in dB. Very negative
// where the renders agree; ≈ −29 dB where they differ only by the global normalisation gain.
const DIFF_W = 0.1;
const diffProfile = (a: Score, b: Score, durationS: number) => {
  const out: { t: number; db: number }[] = [];
  for (let w = 0; (w + 1) * DIFF_W <= durationS; w++) {
    const i0 = Math.round(w * DIFF_W * SR), i1 = Math.round((w + 1) * DIFF_W * SR);
    let ea = 0, ed = 0;
    for (let i = i0; i < i1; i++) { ea += a.left[i] ** 2; ed += (a.left[i] - b.left[i]) ** 2; }
    out.push({ t: w * DIFF_W, db: 10 * Math.log10(Math.max(ed, 1e-30) / Math.max(ea, 1e-30)) });
  }
  return out;
};
const firstDivergence = (p: { t: number; db: number }[], thresholdDb: number) => p.find((w) => w.db > thresholdDb)?.t;
const leftEnergy = (x: Score, a: number, b: number) => { let v = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) v += x.left[i] ** 2; return v; };

// Integrated loudness: RMS over the whole film, both channels, in dBFS. The master limiter sits at
// 0.7 × the pre-master peak (spike: 0.55) so a light pop after an ignite's wash keeps its onset
// (AC4); that costs ~1.3 dB of loudness. Measured -15.2…-18.2 dBFS over the 15/30 fixtures and
// every arrangement × seed × slot count; the band stops any further AC4 fix from quietly buying
// headroom with loudness (floor) or squashing the dynamics the onsets rely on (ceiling).
const LOUDNESS_BAND_DBFS = [-19, -13] as const;
const rmsDbfs = (x: Score) => { let e = 0; for (let i = 0; i < x.left.length; i++) e += x.left[i] ** 2 + x.right[i] ** 2; return 10 * Math.log10(e / (2 * x.left.length)); };

// Energy of the mono mix in [t, t+40 ms], per band (full / <250 Hz / >3 kHz), the same bands
// analyzeScore's onset detector uses. Filters run from t−0.5 s so they are settled at t.
const onePole = (x: Float64Array, fc: number) => {
  const a = 1 - Math.exp(-2 * Math.PI * fc / SR), o = new Float64Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); o[i] = y; }
  return o;
};
const bandEnergyAt = (s: Score, t: number) => {
  const a = Math.round((t - 0.5) * SR), b = Math.round((t + 0.04) * SR), k0 = Math.round(0.5 * SR);
  const m = new Float64Array(b - a);
  for (let i = a; i < b; i++) m[i - a] = (s.left[i] + s.right[i]) / 2;
  const lo = onePole(onePole(m, 250), 250);
  const l3 = onePole(onePole(m, 3000), 3000);
  const hi = m.map((v, i) => v - l3[i]);
  return [m, lo, hi].map((x) => { let e = 0; for (let i = k0; i < x.length; i++) e += x[i] * x[i]; return e; });
};

type HitCtx = { count: Record<string, number> };
const handlers = HANDLERS as Record<string, (ctx: HitCtx, h: Hit) => void>;
/** Render tl with ONE hit's synth muted (timeline, ducking, ticks, anchors and later hits' variants unchanged). */
const renderWithoutHitSound = (tl: Timeline, target: Hit): Score => {
  const orig = handlers[target.kind];
  handlers[target.kind] = (ctx, h) => {
    if (h.t === target.t && h.kind === target.kind) ctx.count[h.kind] = (ctx.count[h.kind] ?? 0) + 1; // keep later hits' variant index
    else orig(ctx, h);
  };
  try { return renderScore(tl) as Score; } finally { handlers[target.kind] = orig; }
};

const TL15 = load('timeline-15s.json');
const TL30 = load('timeline-30s.json');
const renders: Record<string, { score: Score; ms: number }> = {};

beforeAll(() => {
  renders['15'] = timed(TL15);
  renders['30'] = timed(TL30);
  // eslint-disable-next-line no-console
  console.log(`[score] render time: 15 s → ${renders['15'].ms.toFixed(0)} ms, 30 s → ${renders['30'].ms.toFixed(0)} ms`);
}, 120000);

describe('score fixtures conform to the C8 timeline contract', () => {
  it.each(['timeline-15s.json', 'timeline-30s.json'])('%s validates against timeline.schema.json', (name) => {
    const schema = JSON.parse(readFileSync(path.join(TOOLKIT, 'schema', 'timeline.schema.json'), 'utf8'));
    expect(validate(schema, load(name))).toEqual([]);
  });
});

describe.each([
  ['15', TL15],
  ['30', TL30],
])('renderScore %s s (AC4)', (key, tl) => {
  it('is exactly durationS × 48000 samples per channel at 48 kHz (D13: mux has no -shortest)', () => {
    const { score } = renders[key];
    expect(score.sampleRate).toBe(SR);
    expect(score.left).toBeInstanceOf(Float32Array);
    expect(score.left.length).toBe(tl.durationS * SR);
    expect(score.right.length).toBe(tl.durationS * SR);
  });

  it('peaks at or below -1 dBFS with no NaN/Inf and no clipped samples', () => {
    const { score } = renders[key];
    let peak = 0;
    let bad = 0;
    for (const ch of [score.left, score.right]) {
      for (let i = 0; i < ch.length; i++) {
        if (!Number.isFinite(ch[i])) bad++;
        else peak = Math.max(peak, Math.abs(ch[i]));
      }
    }
    expect(bad).toBe(0);
    expect(peak).toBeLessThanOrEqual(CEILING);
    // the mix is not silent: the limiter normalises up to the ceiling, not just under it
    expect(peak).toBeGreaterThan(0.8);
    const a = analyzeScore(score, tl);
    expect(a.samples).toBe(tl.durationS * SR);
    expect(a.nan).toBe(0);
    expect(a.clipped).toBe(0);
    expect(a.peakDbfs).toBeLessThanOrEqual(-1);
  });

  it(`integrated loudness stays within ${LOUDNESS_BAND_DBFS[0]}…${LOUDNESS_BAND_DBFS[1]} dBFS RMS`, () => {
    const db = rmsDbfs(renders[key].score);
    expect(db).toBeGreaterThanOrEqual(LOUDNESS_BAND_DBFS[0]);
    expect(db).toBeLessThanOrEqual(LOUDNESS_BAND_DBFS[1]);
  });

  it('every timeline hit has an audible onset within ±1 frame (picture/sound sync)', () => {
    const a = analyzeScore(renders[key].score, tl);
    expect(a.hits).toHaveLength(tl.hits.length);
    for (let i = 0; i < tl.hits.length; i++) {
      const h = a.hits[i];
      expect(h.t).toBe(tl.hits[i].t);
      expect(h.kind).toBe(tl.hits[i].kind);
      expect({ ...h, within: Math.abs(h.onsetT - h.t) <= FRAME + 1e-9 }).toMatchObject({ ok: true, within: true });
    }
    expect(a.ok).toBe(true);
  });

  it('every hit contributes its OWN onset: muting just that hit drops [t, t+40 ms] by >= 3 dB in some band', () => {
    // analyzeScore only sees the final mix, so a bed event on the same grid (a throb 8th on a
    // peak-section lock) can pass it for a hit whose sound is silent. Ablation proves the
    // sound the picture is cut to actually comes from that hit's handler.
    const full = renders[key].score;
    const drops: { kind: string; t: number; dropDb: number }[] = [];
    for (const h of tl.hits) {
      const muted = renderWithoutHitSound(tl, h);
      const A = bandEnergyAt(full, h.t), B = bandEnergyAt(muted, h.t);
      const dropDb = Math.max(...A.map((e, i) => 10 * Math.log10(e / Math.max(B[i], 1e-30))));
      drops.push({ kind: h.kind, t: h.t, dropDb: Math.round(dropDb * 10) / 10 });
    }
    // eslint-disable-next-line no-console
    console.log(`[score] ${key} s per-hit ablation drop (dB): ${drops.map((d) => `${d.kind}@${d.t}=${d.dropDb}`).join(' ')}`);
    expect(drops.filter((d) => !(d.dropDb >= 3))).toEqual([]);
  }, 180000);
});

describe('renderScore is timeline-driven, never absolute-time driven (D10)', () => {
  it('hits follow the timeline: shifting every hit moves the onsets with it', () => {
    const shifted = clone(TL15);
    for (const h of shifted.hits) h.t += 0.5;
    for (const ty of shifted.typing) { ty.enterAt = (ty as unknown as { enterAt: number }).enterAt + 0.5; }
    const s = renderScore(shifted) as Score;
    // judged against its own timeline: in sync
    expect(analyzeScore(s, shifted).ok).toBe(true);
    // judged against the original clock: the sounds are no longer where the picture expects them
    const stale = analyzeScore(s, TL15);
    expect(stale.ok).toBe(false);
    expect(stale.hits.filter((h: { ok: boolean }) => !h.ok).length).toBeGreaterThan(0);
  }, 60000);

  it('typing ticks come from timeline.typing (no typing entry → no keystrokes in that window)', () => {
    const noTyping = clone(TL15);
    noTyping.typing = [];
    const quiet = renderScore(noTyping) as Score;
    const typed = renders['15'].score;
    const ty = TL15.typing[0];
    const a = Math.round(ty.t0 * SR);
    const b = Math.round((ty.t0 + ty.chars * ty.interval) * SR);
    const hfEnergy = (x: Float32Array) => { let e = 0; for (let i = a + 1; i < b; i++) { const d = x[i] - x[i - 1]; e += d * d; } return e; };
    // keystrokes are clicks: high-frequency energy in the typing window must clearly rise
    expect(hfEnergy(typed.left)).toBeGreaterThan(hfEnergy(quiet.left) * 4);
  }, 60000);

  it('the bed follows timeline.sections (moving the build→peak boundary moves the peak layers)', () => {
    // The peak layers (choir, throb, arps) start at the peak section; the climax anchor is the
    // outro's slam hit. Moving peak.t0 7 → 5.5 must change the score from the new peak start
    // on: not earlier (sections must not leak back in time) and not keyed to another anchor.
    const moved = clone(TL15);
    moved.sections[1].t1 = 5.5;
    moved.sections[2].t0 = 5.5;
    const s = renderScore(moved) as Score;
    const p = diffProfile(renders['15'].score, s, TL15.durationS);
    // well before the new peak the renders differ only by the global normalisation gain
    expect(Math.max(...p.filter((w) => w.t + DIFF_W <= 5.5 - 0.5).map((w) => w.db))).toBeLessThan(-20);
    // the first real divergence is the arrival of the peak layers at the new peak.t0
    const at = firstDivergence(p, -10);
    expect(at).toBeGreaterThanOrEqual(5.5 - DIFF_W - 1e-9);
    expect(at).toBeLessThanOrEqual(5.5 + 0.2);
    // and over the old build tail the moved render is louder (peak layers present)
    expect(10 * Math.log10(leftEnergy(s, 5.5, 7) / leftEnergy(renders['15'].score, 5.5, 7))).toBeGreaterThan(1);
  }, 60000);

  it('without a slam in the outro, the climax falls back to the outro section start', () => {
    // Removing the slam must not silently drop the end card: the bed then pivots on outro.t0,
    // so moving the outro boundary changes the score.
    const noSlam = clone(TL15);
    noSlam.hits = noSlam.hits.filter((h) => h.kind !== 'slam');
    const a = renderScore(noSlam) as Score;
    const moved = clone(noSlam);
    moved.sections[2].t1 = 9.5;
    moved.sections[3].t0 = 9.5;
    const b = renderScore(moved) as Score;
    // climax 10.5 → 9.5: the score diverges only inside the window the bed builds into the
    // climax (tension voices from C − 2.2 s), never before it, and clearly from the new
    // outro.t0 on (end card). A fallback to any other anchor (film end, build, peak) would
    // move or remove this divergence.
    const p = diffProfile(a, b, noSlam.durationS);
    const C = 9.5;
    // (only the bed's slow climax-relative filter/volume ramp shifts before it: < -15 dB)
    expect(Math.max(...p.filter((w) => w.t + DIFF_W <= C - 2.2).map((w) => w.db))).toBeLessThan(-15);
    const at = firstDivergence(p, -10);
    expect(at).toBeGreaterThanOrEqual(C - 2.2 - 1e-9);
    expect(at).toBeLessThan(C);
    const after = p.filter((w) => w.t >= C - 1e-9 && w.t + DIFF_W <= 10.5 + 1e-9);
    expect(after.reduce((v, w) => v + w.db, 0) / after.length).toBeGreaterThan(-6);
    expect(analyzeScore(a, noSlam).ok).toBe(true);
  }, 60000);

  it('the seed is mulberry32(timeline.seed): a different seed changes the noise layers', () => {
    const s = renderScore(TL15, { seed: TL15.seed + 1 }) as Score;
    expect(bytes(s).equals(bytes(renders['15'].score))).toBe(false);
  }, 60000);

  it('lib/score contains no literal absolute seconds and no wall-clock/unseeded randomness', () => {
    const files = readdirSync(SCORE_DIR).filter((f) => f.endsWith('.mjs'));
    expect(files.length).toBeGreaterThanOrEqual(7);
    const literalTime = /\b(t|time|lt|localT)\s*[<>=!]=?\s*(\d+(\.\d+)?)\b/g;
    const atLiteral = /\bat\s*:\s*\d/;
    const impure = /Math\.random|Date\.now|performance\.now|new Date\(/;
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(path.join(SCORE_DIR, f), 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(literalTime)) if (m[2] !== '0' && m[2] !== '1') offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        if (atLiteral.test(line) || impure.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('determinism + failure modes', () => {
  it('two renders of the same timeline are byte-equal (D9)', () => {
    const again = renderScore(TL15) as Score;
    expect(bytes(again).equals(bytes(renders['15'].score))).toBe(true);
  }, 60000);

  it('a lock hit whose beatId is not in timeline.beats throws E_TIMELINE (no silent clamp to t=0)', () => {
    // the lock's counter ticks start no earlier than its beat; with no beat there is no
    // honest start, so the render must refuse rather than guess.
    const bad = clone(TL15);
    const lock = bad.hits.find((h) => h.kind === 'lock')!;
    lock.beatId = 'b99';
    let err: { code?: string; message?: string; name?: string } | undefined;
    try { renderScore(bad); } catch (e) { err = e as typeof err; }
    expect(err?.name).toBe('ShowreelError');
    expect(err?.code).toBe('E_TIMELINE');
    expect(err?.message).toContain('b99');
  });

  it('the climax is the EARLIEST outro slam, independent of hit array order', () => {
    // C8 says hits are sorted, but the bed must not depend on it: with a second, later slam
    // in the outro, an unsorted copy renders byte-identical to the sorted one.
    const two = clone(TL15);
    two.hits.push({ ...two.hits.find((h) => h.kind === 'slam')!, t: 12.5, cue: 'slam2' });
    const sorted = renderScore(two) as Score;
    const unsorted = clone(two);
    unsorted.hits.reverse();
    expect(bytes(renderScore(unsorted) as Score).equals(bytes(sorted))).toBe(true);
  }, 60000);

  it.each(['boom', 'ignite'])('repeated %s hits get distinct noise (seed includes the per-kind index)', (kind) => {
    // Identical noise on every boom/ignite reads as a looped sample. Render the same hit twice
    // through the handler (the 2nd call is index 1) into fresh buses: they must differ.
    const n = 4 * SR;
    const ctx = { fx: mkBus(n), bed: mkBus(n), seed: (k: number) => mixSeed(TL15.seed, k), beat16: 0.125, inOutro: () => false, beatOf: () => undefined, count: {} as Record<string, number> };
    const h = { t: 2, kind, amp: 1, beatId: 'b1', cue: 'x' };
    handlers[kind](ctx, h);
    const first = Float32Array.from(ctx.fx.L);
    ctx.fx = mkBus(n);
    handlers[kind](ctx, h);
    expect(ctx.count[kind]).toBe(2);
    expect(Buffer.from(ctx.fx.L.buffer).equals(Buffer.from(first.buffer))).toBe(false);
  });

  it('an unknown hit kind throws ShowreelError E_HIT_KIND (never a silent missing sound)', () => {
    const bad = clone(TL15);
    bad.hits[1].kind = 'kaboom';
    let err: { code?: string; message?: string; name?: string } | undefined;
    try { renderScore(bad); } catch (e) { err = e as typeof err; }
    expect(err?.name).toBe('ShowreelError');
    expect(err?.code).toBe('E_HIT_KIND');
    expect(err?.message).toContain('kaboom');
  });

  it('analyzeScore fails a silent track (the onset detector can actually fail)', () => {
    const n = TL15.durationS * SR;
    const silent = { left: new Float32Array(n), right: new Float32Array(n), sampleRate: SR };
    const a = analyzeScore(silent, TL15);
    expect(a.ok).toBe(false);
    expect(a.hits.every((h: { ok: boolean }) => !h.ok)).toBe(true);
  });

  it('analyzeScore fails a track of the wrong length', () => {
    const s = renders['15'].score;
    const short = { left: s.left.subarray(0, s.left.length - 1024), right: s.right.subarray(0, s.right.length - 1024), sampleRate: SR };
    expect(analyzeScore(short, TL15).ok).toBe(false);
  });

  it('renders 30 s in under 20 s (measured, logged above)', () => {
    expect(renders['30'].ms).toBeLessThan(20000);
  });
});

// ---------------------------------------------------------------------------------------------
// M2: every recommended arrangement (archetypes/arrangements.json) must pass AC4, not just the two
// hand-made 15/30 fixtures. In 45/60 s films the peak section is long and hit-dense (card
// carousels, orbit nodes): low-amp snaps/pops (amp 0.15–0.3) landed under the bed's climax-
// anchored throb 8ths and a light pop after an ignite tripped the master limiter, so verify failed
// (min onset jump was −0.3 dB at 60 s). The fix lives in the mix (light-hit bed ducking, throb rests,
// thinner arps in long peaks, limiter threshold) — analyzeScore's 3 dB / ±1 frame criterion is NOT
// loosened. Seeds vary every noise layer.
function synthFact(kind: string, n: number, display: string, extra: Record<string, unknown> = {}) {
  return {
    id: `f.${kind}.${n}`, kind, value: display, display, unit: null,
    source: { file: 'synthetic', locator: `${kind}/${n}`, extractor: 'test', rule: 'synthetic' },
    hash: 'sha256:0000000000000000', ...extra,
  };
}
const SYNTH_FACTS = {
  version: 1,
  minimumGate: { passed: true, missing: [] },
  brand: { name: 'Acme Shop', palette: 'violet', wordmark: 'f.app.name.1' },
  facts: [
    synthFact('app.name', 1, 'Acme Shop'),
    synthFact('app.tagline', 1, 'Checkout in one click'),
    ...['Saved carts', 'Guest checkout', 'Order history', 'Live inventory', 'Gift cards', 'Fast search'].map((d, i) => synthFact('feature', i + 1, d)),
    ...['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Postgres', 'Stripe'].map((d, i) => synthFact('stack.item', i + 1, d)),
    ...['/checkout', '/cart', '/orders/[id]', '/api/health'].map((d, i) => synthFact('route', i + 1, d)),
    ...['npm run dev', 'npm test', 'npm run build'].map((d, i) => synthFact('command', i + 1, d)),
    ...([[42, 'routes'], [7, 'commands'], [128, 'tests'], [12, 'components']] as const).map(([v, u], i) => synthFact('count', i + 1, String(v), { value: v, unit: u })),
  ],
};
const SYNTH_DIGEST: DigestFact[] = SYNTH_FACTS.facts.map((f) => ({ id: f.id, kind: f.kind, display: f.display, unit: f.unit }));
const readToolkitJson = (...p: string[]) => JSON.parse(readFileSync(path.join(TOOLKIT, ...p), 'utf8'));

describe('every recommended arrangement scores in sync at seeds 1/7/42 and at max slot counts (AC4, M2)', () => {
  const ARCH = readToolkitJson('archetypes', 'archetypes.json');
  const PHRASES = readToolkitJson('phrases.json');
  const ARR = readToolkitJson('archetypes', 'arrangements.json').arrangements;
  const minJump: Record<string, number> = {};

  // typical AND max slot counts (the densest storyboard an arrangement allows), each at seeds 1/7/42.
  // CTO condition on R-g: the >= 3 dB onset headroom is pinned at max-N for every arrangement x seed,
  // because the margin is thinnest there (~3.2-3.3 dB at 30/45 s) and a later mix tweak must not erode it.
  const CASES = (['typical', 'max'] as const).flatMap((count) =>
    [15, 30, 45, 60].flatMap((d) => [1, 7, 42].map((seed) => [d, seed, count] as const)));
  it.each(CASES)('%i s arrangement, seed %i, %s slot counts', (d, seed, count) => {
    const sb = storyboardFromArrangement(SYNTH_DIGEST, d, ARR[String(d)], ARCH, PHRASES, { seed, count });
    const tl = compileTimeline(sb, resolve(sb, { archetypes: ARCH, facts: SYNTH_FACTS, phrases: PHRASES }), ARCH, { fps: 60 }) as Timeline;
    expect(tl.seed).toBe(seed);
    const score = renderScore(tl) as Score;
    expect(score.left.length).toBe(d * SR);
    expect(score.right.length).toBe(d * SR);
    const a = analyzeScore(score, tl);
    expect(a.samples).toBe(d * SR);
    expect(a.nan).toBe(0);
    expect(a.clipped).toBe(0);
    expect(a.peakDbfs).toBeLessThanOrEqual(-1);
    expect(a.hits).toHaveLength(tl.hits.length);
    // every hit: a >= 3 dB onset, located within ±1 frame of the picture's hit time
    const weak = a.hits.filter((h: { jumpDb: number; onsetT: number; t: number }) => !(h.jumpDb >= 3 && Math.abs(h.onsetT - h.t) <= FRAME + 1e-9));
    expect(weak).toEqual([]);
    expect(a.ok).toBe(true);
    const db = rmsDbfs(score);
    expect(db).toBeGreaterThanOrEqual(LOUDNESS_BAND_DBFS[0]);
    expect(db).toBeLessThanOrEqual(LOUDNESS_BAND_DBFS[1]);
    const key = `${d} s ${count}`;
    minJump[key] = Math.min(minJump[key] ?? Infinity, ...a.hits.map((h: { jumpDb: number }) => h.jumpDb));
    // eslint-disable-next-line no-console
    if (seed === 42 || count === 'max') console.log(`[score] ${key} min onset jump: ${minJump[key]} dB, loudness ${db.toFixed(2)} dBFS RMS`);
  }, 120000);
});

describe('the bed makes room for light hits (mix, AC4)', () => {
  it('light hits duck the bed: 5 ms attack fully down on the hit, depth scaled by amp and capped, ~0.1 s release', () => {
    const n = 2 * SR, t = 1;
    const at = (d: Float32Array, s: number) => d[Math.round(s * SR)];
    const snap = (amp: number) => duckCurve(n, [{ t, kind: 'snap', amp }]) as Float32Array;
    const d25 = snap(0.25);
    // untouched until 5 ms before the hit (no audible pre-hit dip / vacuum on light hits)
    expect(at(d25, t - 0.0055)).toBe(1);
    // fully down on the hit sample: the hit's onset window is the ducked one. Bounded, not exact:
    // deep enough to make room (< 0.9), never past the light-hit cap (>= 0.55). The arrangement
    // matrix above pins whether the depth is actually enough (AC4).
    expect(at(d25, t)).toBeLessThan(0.9);
    expect(at(d25, t)).toBeGreaterThanOrEqual(0.55 - 1e-6);
    // attack is <= 5 ms and already complete on the hit: the sample just before is shallower
    expect(at(d25, t - 0.0025)).toBeGreaterThan(at(d25, t));
    expect(at(d25, t - 0.0025)).toBeLessThan(1);
    // short release: mostly back by 0.3 s so a run of hits every 0.5 s does not hold the bed down
    expect(at(d25, t + 0.3)).toBeGreaterThan(0.98);
    expect(at(d25, t + 0.1)).toBeLessThan(0.9);
    // louder light hit → deeper duck; but never deeper than the spike's light-hit maximum (0.45)
    expect(at(snap(0.3), t)).toBeLessThan(at(snap(0.15), t));
    expect(at(snap(1), t)).toBeCloseTo(1 - 0.45, 5);
  });

  it('boom/slam keep their pre-hit vacuum and deep duck (no new pumping at big hits)', () => {
    const n = 2 * SR, t = 1;
    const d = duckCurve(n, [{ t, kind: 'boom', amp: 1 }]) as Float32Array;
    expect(d[Math.round((t - 0.05) * SR)]).toBeLessThan(0.9); // vacuum before the hit
    expect(d[Math.round(t * SR)]).toBeCloseTo(1 - 0.72, 5);
  });

  it('a throb 8th landing just before a light hit is ghosted (it would mask the hit onset)', () => {
    // TL30: peak 15.5–23.5, climax = slam 24.25, so throb 8ths fall on 21.5 and 21.75 — 0.25 s
    // before and on the 21.75 lock. Rendering the bed with and without that lock in the timeline
    // isolates the rest (the lock is not a boom/slam, so no anchor or filter dip moves).
    const bedOf = (tl: Timeline) => {
      const n = Math.round(tl.durationS * SR);
      const ctx = { bed: mkBus(n), fx: mkBus(n), seed: (k: number) => mixSeed(tl.seed >>> 0, k), beat16: 60 / 120 / 4 };
      renderBed(ctx, tl);
      return ctx.bed as { L: Float32Array; R: Float32Array };
    };
    const lockT = 21.75;
    expect(TL30.hits.some((h) => h.kind === 'lock' && h.t === lockT)).toBe(true);
    const withLock = bedOf(TL30);
    const noLock = clone(TL30);
    noLock.hits = noLock.hits.filter((h) => !(h.kind === 'lock' && h.t === lockT));
    const without = bedOf(noLock);
    // The bed is a linear sum of layers, so without − with is exactly the ghosted part of the throb.
    const diff = (i: number) => without.L[i] - withLock.L[i];
    let first = -1, last = -1;
    for (let i = 0; i < withLock.L.length; i++) if (diff(i) !== 0) { if (first < 0) first = i; last = i; }
    // local: only the 8ths on 21.5 (0.25 s ahead) and 21.75 (on the hit) change, each a 0.3 s pulse
    expect(first / SR).toBeCloseTo(lockT - 0.25, 3);
    expect(last / SR).toBeLessThan(lockT + 0.3);
    // substantial: the removed pulse energy is a real share of the bed where it lands
    const e = (f: (i: number) => number, a: number, z: number) => { let v = 0; for (let i = Math.round(a * SR); i < Math.round(z * SR); i++) v += f(i) ** 2; return v; };
    const share = (a: number, z: number) => 10 * Math.log10(e(diff, a, z) / e((i) => withLock.L[i], a, z));
    expect(share(lockT - 0.25, lockT - 0.15)).toBeGreaterThan(-8);
    expect(share(lockT, lockT + 0.1)).toBeGreaterThan(-8);
    // An ignite rests the throb exactly like a light hit: it has no pre-hit vacuum in the mix, so
    // a pulse just ahead of it would mask its onset too. Same slot as the lock → identical bed.
    const asIgnite = clone(TL30);
    asIgnite.hits = asIgnite.hits.map((h) => (h.kind === 'lock' && h.t === lockT ? { ...h, kind: 'ignite' } : h));
    const withIgnite = bedOf(asIgnite);
    expect(Buffer.from(withIgnite.L.buffer).equals(Buffer.from(withLock.L.buffer))).toBe(true);
    expect(Buffer.from(withIgnite.L.buffer).equals(Buffer.from(without.L.buffer))).toBe(false);
  });

  // The throb alone (renderThrob is a pure layer of the bed): which hits rest it.
  const throbOf = (tl: Timeline, hits: Hit[]) => {
    const n = Math.round(tl.durationS * SR);
    const ctx = { bed: mkBus(n), fx: mkBus(n), seed: (k: number) => mixSeed(tl.seed >>> 0, k), beat16: 60 / 120 / 4 };
    renderThrob(ctx, anchors(tl), hits);
    return Buffer.concat([Buffer.from(ctx.bed.L.buffer), Buffer.from(ctx.bed.R.buffer), Buffer.from(ctx.bed.sL.buffer), Buffer.from(ctx.bed.sR.buffer)]);
  };

  it('boom / slam never rest the throb: the build runs full into them (they carry their own pre-hit vacuum)', () => {
    // same 21.75 slot as the lock above (a throb 8th lands on it and one 0.25 s ahead): a lock or ignite there
    // ghosts those pulses; a boom or slam there leaves the throb byte-identical to no hit at all
    const slot = (kind: string): Hit => ({ t: 21.75, kind, amp: 1, beatId: 'b5', cue: 'x' });
    const none = throbOf(TL30, []);
    expect(throbOf(TL30, [slot('lock')]).equals(none), 'a lock rests the throb (the check can fail)').toBe(false);
    expect(throbOf(TL30, [slot('ignite')]).equals(none), 'an ignite rests the throb').toBe(false);
    expect(throbOf(TL30, [slot('boom')]).equals(none), 'a boom must NOT rest the throb').toBe(true);
    expect(throbOf(TL30, [slot('slam')]).equals(none), 'a slam must NOT rest the throb').toBe(true);
  });

  const arpsOf = (tl: Timeline, thin?: { gk: number; sk: number }) => {
    const n = Math.round(tl.durationS * SR);
    const ctx = { bed: mkBus(n), fx: mkBus(n), seed: (k: number) => mixSeed(tl.seed >>> 0, k), beat16: 60 / 120 / 4 };
    if (thin) renderArps(ctx, anchors(tl), thin); else renderArps(ctx, anchors(tl));
    return ctx.bed as { L: Float32Array; R: Float32Array; sL: Float32Array; sR: Float32Array };
  };
  const energy = (a: Float32Array) => a.reduce((s, v) => s + v * v, 0);

  it('arps thin on long peaks only: a 15 s peak is untouched; a long peak plays at 0.8 dry and 0.5 send', () => {
    // why: on dense 45–60 s peaks the wet 16ths pile into a reverb wash that masked light pops (AC4); the
    // spike-length 15 s film must keep the spike's arps exactly
    expect(arpThin(3)).toEqual({ gk: 1, sk: 1 });
    expect(arpThin(4)).toEqual({ gk: 1, sk: 1 });
    for (const s of [8, 30]) { expect(arpThin(s).gk, `gk @${s}`).toBeCloseTo(0.8, 12); expect(arpThin(s).sk, `sk @${s}`).toBeCloseTo(0.5, 12); }
    const mid = arpThin(6);
    expect(mid.gk).toBeGreaterThan(0.8); expect(mid.gk).toBeLessThan(1);
    expect(mid.sk).toBeGreaterThan(0.5); expect(mid.sk).toBeLessThan(1);
    const A15 = anchors(TL15), A30 = anchors(TL30);
    expect(A15.climax - A15.peakT0, '15 s fixture peak span').toBeLessThanOrEqual(4);
    expect(A30.climax - A30.peakT0, '30 s fixture peak span').toBeGreaterThanOrEqual(8);
    // 15 s: the default render IS the unthinned render, byte for byte
    const a15 = arpsOf(TL15), ref15 = arpsOf(TL15, { gk: 1, sk: 1 });
    expect(energy(ref15.L)).toBeGreaterThan(0);
    for (const k of ['L', 'R', 'sL', 'sR'] as const) expect(Buffer.from(a15[k].buffer).equals(Buffer.from(ref15[k].buffer)), k).toBe(true);
    // 30 s: dry scaled by 0.8 (energy 0.64), send by 0.5 (energy 0.25) against the unthinned reference
    const a30 = arpsOf(TL30), ref30 = arpsOf(TL30, { gk: 1, sk: 1 });
    expect(energy(a30.L) / energy(ref30.L)).toBeCloseTo(0.64, 4);
    expect(energy(a30.sL) / energy(ref30.sL)).toBeCloseTo(0.25, 4);
  });
});

describe('writeWav', () => {
  it('writes a 16-bit stereo 48 kHz PCM WAV whose RIFF/fmt/data sizes round-trip', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'showreel-score-'));
    try {
      const score = renders['15'].score;
      const n = score.left.length;
      const file = path.join(dir, 'score.wav');
      writeWav(file, score);
      const buf = readFileSync(file);
      expect(buf.length).toBe(44 + n * 4);
      expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
      expect(buf.readUInt32LE(4)).toBe(36 + n * 4);
      expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
      expect(buf.toString('ascii', 12, 16)).toBe('fmt ');
      expect(buf.readUInt32LE(16)).toBe(16);
      expect(buf.readUInt16LE(20)).toBe(1); // PCM
      expect(buf.readUInt16LE(22)).toBe(2); // stereo
      expect(buf.readUInt32LE(24)).toBe(SR);
      expect(buf.readUInt32LE(28)).toBe(SR * 4);
      expect(buf.readUInt16LE(32)).toBe(4);
      expect(buf.readUInt16LE(34)).toBe(16);
      expect(buf.toString('ascii', 36, 40)).toBe('data');
      expect(buf.readUInt32LE(40)).toBe(n * 4);
      // interleaved samples decode back to the float score (within one 16-bit step)
      for (const i of [0, 12345, Math.floor(n / 2), n - 1]) {
        expect(Math.abs(buf.readInt16LE(44 + i * 4) / 32767 - score.left[i])).toBeLessThanOrEqual(1 / 32767);
        expect(Math.abs(buf.readInt16LE(46 + i * 4) / 32767 - score.right[i])).toBeLessThanOrEqual(1 / 32767);
      }
      // the WAV is the exact length the mux expects: N × 48000 frames
      expect(buf.readUInt32LE(40) / 4).toBe(TL15.durationS * SR);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
