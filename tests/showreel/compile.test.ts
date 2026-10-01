import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTimeline, assertOverlapsFit } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';
import { stableStringify } from '../../templates/showreel/.claude/showreel/lib/util/json.mjs';

// v1.16 showreel — Task 4 timeline compiler (D10 / C8).
// build/timeline.json is the ONLY time source for picture AND audio. If a boundary drifts off
// the 1/16-note grid, the cut lands between musical beats; if the `enter` hit and the typing
// window disagree, the ENTER key visibly fires before/after its boom; if sections leave a gap,
// the score bed drops out. Every assertion below guards one of those audible/visible failures.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const FIX = path.join(HERE, 'fixtures', 'compile');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const TIMELINE_SCHEMA = readJ(path.join(TOOLKIT, 'schema', 'timeline.schema.json'));
const STORYBOARD_SCHEMA = readJ(path.join(TOOLKIT, 'schema', 'storyboard.schema.json'));
const RESOLVED_SCHEMA = readJ(path.join(TOOLKIT, 'schema', 'resolved.schema.json'));
const sb = (n: number) => readJ(path.join(FIX, `storyboard-${n}.json`));
const rs = (n: number) => readJ(path.join(FIX, `resolved-${n}.json`));

const GRID = 0.125; // 1/16 note at 120 bpm
const onGrid = (t: number, q: number) => Math.abs(t / q - Math.round(t / q)) < 1e-9;
const onFrame = (t: number, fps: number) => Math.abs(t * fps - Math.round(t * fps)) < 1e-9;

type Beat = { id: string; archetype: string; t0: number; t1: number; overlapIn: number; overlapOut: number; transitionOut: string };
type Hit = { t: number; kind: string; amp: number; beatId: string; cue: string };

describe('fixtures are contract-conformant (C4/C7) — otherwise the compiler tests prove nothing', () => {
  for (const n of [15, 30, 45, 60]) {
    it(`storyboard-${n} / resolved-${n} validate against their schemas`, () => {
      expect(validate(STORYBOARD_SCHEMA, sb(n))).toEqual([]);
      expect(validate(RESOLVED_SCHEMA, rs(n))).toEqual([]);
    });
  }
});

describe('compileTimeline — per-duration invariants (C8)', () => {
  for (const n of [15, 30, 45, 60]) {
    for (const fps of [30, 60]) {
      describe(`${n} s @ ${fps} fps`, () => {
        const story = sb(n);
        const tl = compileTimeline(story, rs(n), ARCH, { fps });
        const beats: Beat[] = tl.beats;

        it('emits a timeline.json that validates against the C8 schema', () => {
          expect(validate(TIMELINE_SCHEMA, tl)).toEqual([]);
        });

        it('frames = N x fps exactly (D13: video length is exactly N*fps frames)', () => {
          expect(tl.frames).toBe(n * fps);
          expect(tl.fps).toBe(fps);
          expect(tl.durationS).toBe(n);
          expect(tl.seed).toBe(story.seed);
          expect(tl.palette).toBe(story.palette);
          expect(tl.music).toEqual({ bpm: 120, key: 'F#m' });
        });

        it('spans the film: beats[0].t0 = 0 and beats[last].t1 = N', () => {
          expect(beats[0].t0).toBe(0);
          expect(beats.at(-1)!.t1).toBe(n);
          expect(beats.map((b) => b.id)).toEqual(story.beats.map((b: { id: string }) => b.id));
        });

        it('every beat window edge is on the 1/16-note grid', () => {
          for (const b of beats) {
            expect(onGrid(b.t0, GRID), `${b.id}.t0=${b.t0}`).toBe(true);
            expect(onGrid(b.t1, GRID), `${b.id}.t1=${b.t1}`).toBe(true);
          }
        });

        it('beats are monotonic (t0 and t1 strictly increase, every beat has positive length)', () => {
          for (let i = 0; i < beats.length; i++) {
            expect(beats[i].t1).toBeGreaterThan(beats[i].t0);
            if (i > 0) {
              expect(beats[i].t0).toBeGreaterThan(beats[i - 1].t0);
              expect(beats[i].t1).toBeGreaterThan(beats[i - 1].t1);
            }
          }
        });

        it('overlaps follow transitionOut: zoom-through = 0.375 s window shared by both beats, cut = 0', () => {
          expect(beats[0].overlapIn).toBe(0);
          expect(beats.at(-1)!.overlapOut).toBe(0); // last beat's transitionOut is ignored
          for (let i = 0; i < beats.length - 1; i++) {
            const want = story.beats[i].transitionOut === 'zoom-through' ? 0.375 : 0;
            expect(beats[i].overlapOut, beats[i].id).toBe(want);
            expect(beats[i + 1].overlapIn).toBe(beats[i].overlapOut);
            // The overlap IS the transition: both scenes must actually be on screen for that long.
            expect(beats[i].t1 - beats[i + 1].t0).toBeCloseTo(want, 12);
          }
        });

        it('hits are sorted by t, inside the film, on the frame grid and within half a frame of the 1/16 grid', () => {
          const hits: Hit[] = tl.hits;
          expect(hits.length).toBeGreaterThan(0);
          for (let i = 1; i < hits.length; i++) expect(hits[i].t).toBeGreaterThanOrEqual(hits[i - 1].t);
          for (const h of hits) {
            expect(h.t).toBeGreaterThanOrEqual(0);
            expect(h.t).toBeLessThan(n);
            expect(onFrame(h.t, fps), `hit ${h.beatId}/${h.cue} t=${h.t}`).toBe(true);
            const nearestGrid = Math.round(h.t / GRID) * GRID;
            expect(Math.abs(h.t - nearestGrid)).toBeLessThanOrEqual(0.5 / fps + 1e-9);
          }
        });

        it('every beat gets its archetype default cues (no silent beat)', () => {
          for (const b of story.beats) {
            const names = tl.hits.filter((h: Hit) => h.beatId === b.id).map((h: Hit) => h.cue).sort();
            const want = ARCH.archetypes[b.archetype].defaultCues.map((c: { name: string }) => c.name).sort();
            expect(names, b.id).toEqual(expect.arrayContaining(want));
          }
        });

        it('the `enter` hit coincides with typing.enterAt (ENTER keypress and boom are one event)', () => {
          expect(tl.typing).toHaveLength(1);
          const ty = tl.typing[0];
          const enter = tl.hits.find((h: Hit) => h.beatId === ty.beatId && h.cue === 'enter');
          expect(enter).toBeDefined();
          expect(ty.enterAt).toBe(enter.t);
          const cmd = rs(n).beats[ty.beatId].slots.command.items[0].text;
          expect(ty.chars).toBe([...cmd].length); // code points (see the non-BMP test below)
          // The last character must be typed before ENTER is pressed.
          expect(ty.t0 + ty.chars * ty.interval).toBeLessThanOrEqual(ty.enterAt);
          expect(ty.interval).toBeGreaterThan(0);
          expect(ty.interval).toBeLessThanOrEqual(0.052);
        });

        it('sections cover [0, N] without gaps or overlaps, in intro→build→peak→outro order', () => {
          const s = tl.sections;
          expect(s[0].t0).toBe(0);
          expect(s.at(-1).t1).toBe(n);
          for (let i = 1; i < s.length; i++) expect(s[i].t0).toBe(s[i - 1].t1);
          for (const x of s) expect(x.t1).toBeGreaterThan(x.t0);
          const order = ['intro', 'build', 'peak', 'outro'];
          const idx = s.map((x: { name: string }) => order.indexOf(x.name));
          expect(idx).toEqual([...idx].sort((a, b) => a - b));
          expect(s[0].name).toBe('intro');
          expect(s.at(-1).name).toBe('outro');
          expect(s.map((x: { name: string }) => x.name)).toContain('build');
        });
      });
    }
  }
});

describe('compileTimeline — rules that encode WHY', () => {
  it('is deterministic and does not mutate its inputs (same storyboard → byte-identical timeline.json)', () => {
    const story = sb(30), res = rs(30), arch = clone(ARCH);
    const before = JSON.stringify([story, res, arch]);
    const a = stableStringify(compileTimeline(story, res, arch, { fps: 60 }));
    const b = stableStringify(compileTimeline(sb(30), rs(30), clone(ARCH), { fps: 60 }));
    expect(a).toBe(b);
    expect(JSON.stringify([story, res, arch])).toBe(before);
  });

  it('beat lengths follow weights (30 s fixture: Σw = 8 → 3.75 s per unit weight)', () => {
    const tl = compileTimeline(sb(30), rs(30), ARCH, { fps: 60 });
    // b7 (w = 2) core window is [22.5, 30]; b6 → b7 is zoom-through so b7 enters 2 grid early.
    expect(tl.beats.at(-1).t0).toBe(22.25);
    expect(tl.beats.at(-1).overlapIn).toBe(0.375);
    // b2 (w = 1) core [3.75, 7.5]; b1 → b2 zoom-through, b2 → b3 cut.
    expect(tl.beats[1].t0).toBe(3.5);
    expect(tl.beats[1].t1).toBe(7.5);
  });

  it('boundaries off the grid round to the nearest 1/16 note', () => {
    // 15 s, weights 1,1,1,1,1.1 → Σw = 5.1 → raw boundaries 2.941, 5.882, 8.824, 11.765.
    const story = sb(15);
    const ws = [1, 1, 1, 1, 1.1];
    story.beats.forEach((b: { weight: number; transitionOut: string }, i: number) => { b.weight = ws[i]; b.transitionOut = 'cut'; });
    const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
    expect(tl.beats.slice(0, 4).map((b: Beat) => b.t1)).toEqual([3.0, 5.875, 8.875, 11.75]);
  });

  it('an exact half-grid tie rounds DOWN (deterministic, never drifts later)', () => {
    // Σw = 15 over 15 s → 1 weight unit = 1 s. Raw boundaries 3.0625, 6.0625, 9.0625, 12.0:
    // the first three sit exactly between two grid points (24.5, 48.5, 72.5 grid units).
    const story = sb(15);
    const ws = [3.0625, 3, 3, 2.9375, 3];
    story.beats.forEach((b: { weight: number; transitionOut: string }, i: number) => { b.weight = ws[i]; b.transitionOut = 'cut'; });
    const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
    expect(tl.beats.slice(0, 4).map((b: Beat) => b.t1)).toEqual([3.0, 6.0, 9.0, 12.0]);
  });

  it('zoom-through overlap straddles the boundary on the grid: incoming starts 2 grid early, outgoing ends 1 grid late', () => {
    // Centred would be ±0.1875 (1.5 grid) — off grid. Each side is rounded with the same
    // ties-down rule: t1 = B + 0.1875 → B + 0.125 ; t0 = B − 0.1875 → B − 0.25.
    const tl = compileTimeline(sb(15), rs(15), ARCH, { fps: 60 });
    // 15 s fixture: Σw=5 → b1 core [0,3]; b1 → b2 is zoom-through.
    expect(tl.beats[0].t1).toBe(3.125);
    expect(tl.beats[1].t0).toBe(2.75);
    // b3 → b4 is a cut: windows abut exactly at the core boundary 9.
    expect(tl.beats[2].t1).toBe(9);
    expect(tl.beats[3].t0).toBe(9);
  });

  it('a beat shorter than max(1.0 s, minWeight-scaled) steals grid steps from its LONGEST neighbour', () => {
    // 15 s, Σw = 8.5: b1 (cold-open, minWeight 0.75) given weight 0.5 → raw 0.882 s → rounds to 0.875 s,
    // below both 1.0 s and 0.75/8.5*15 = 1.32 s. Its only neighbour b2 must give up time.
    const story = sb(15);
    const ws = [0.5, 3, 1, 1, 3];
    story.beats.forEach((b: { weight: number; transitionOut: string }, i: number) => { b.weight = ws[i]; b.transitionOut = 'cut'; });
    const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
    const minB1 = Math.max(1.0, (0.75 / 8.5) * 15);
    expect(tl.beats[0].t1 - tl.beats[0].t0).toBeGreaterThanOrEqual(minB1);
    expect(tl.beats[0].t1 - tl.beats[0].t0).toBeLessThan(minB1 + GRID); // stole only what it needed
    expect(onGrid(tl.beats[0].t1, GRID)).toBe(true);
    // A middle beat steals from the longer of its two neighbours: b3 (kinetic, w 0.5 → below 1.0 s).
    const story2 = sb(15);
    const ws2 = [2, 1, 0.5, 4, 6];
    story2.beats.forEach((b: { weight: number; transitionOut: string }, i: number) => { b.weight = ws2[i]; b.transitionOut = 'cut'; });
    // Σw = 13.5 → unit 1.111: core b3 = [3.333, 3.888] → rounds [3.375, 3.875] = 0.5 s < 1.0 s.
    const tl2 = compileTimeline(story2, rs(15), ARCH, { fps: 60 });
    const b2 = tl2.beats[1], b3 = tl2.beats[2], b4 = tl2.beats[3];
    expect(b3.t1 - b3.t0).toBeGreaterThanOrEqual(1.0);
    expect(b2.t1).toBe(3.375); // shorter neighbour (b2, 1.125 s) untouched
    expect(b4.t0).toBe(b3.t1); // longer neighbour (b4) gave up the time
    expect(b3.t1).toBe(4.375);
  });

  it('fails loud with E_TIMELINE_BUDGET when no neighbour can give time (Rule 12: never a sub-second beat)', () => {
    // 16 beats in 15 s: every beat needs >= 1.0 s, so the minimums alone exceed the film.
    const base = sb(15);
    const beats = [base.beats[0]];
    for (let i = 2; i <= 15; i++) beats.push({ ...base.beats[1], id: `b${i}`, transitionOut: 'cut' });
    beats.push({ ...base.beats[4], id: 'b16' });
    expect(() => compileTimeline({ ...base, beats }, rs(15), ARCH, { fps: 60 }))
      .toThrow(expect.objectContaining({ code: 'E_TIMELINE_BUDGET' }));
  });

  it('storyboard cues override archetype defaults BY NAME and add new names; t = window t0 + at·(t1−t0) snapped', () => {
    const story = sb(15);
    story.beats[0].cues = [{ name: 'enter', at: 0.5, kind: 'slam', amp: 0.8 }, { name: 'extra', at: 0.25, kind: 'pop', amp: 0.2 }];
    const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
    const b1Hits = tl.hits.filter((h: Hit) => h.beatId === 'b1');
    expect(b1Hits.map((h: Hit) => h.cue).sort()).toEqual(['enter', 'extra']); // default `enter` replaced, not duplicated
    const enter = b1Hits.find((h: Hit) => h.cue === 'enter')!;
    expect(enter.kind).toBe('slam');
    expect(enter.amp).toBe(0.8);
    // b1 window [0, 3.125]: 0.5 * 3.125 = 1.5625 → grid 1.5625/0.125 = 12.5 → ties down → 1.5 → frame 90.
    expect(enter.t).toBe(1.5);
    // extra: 0.78125 → 6.25 grid → 0.75 → 45 frames.
    expect(b1Hits.find((h: Hit) => h.cue === 'extra')!.t).toBe(0.75);
    expect(tl.typing[0].enterAt).toBe(1.5);
    // Archetype defaults are merged first, so b1's overriding `enter` (1.5 s) is generated BEFORE
    // `extra` (0.75 s). Engine and score treat hits[] as a time-ordered stream; only the explicit
    // sort puts `extra` first. (Removing the sort in timeline.mjs makes this assertion fail.)
    const ts = tl.hits.map((h: Hit) => h.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    const cues = tl.hits.map((h: Hit) => `${h.beatId}/${h.cue}`);
    expect(cues.indexOf('b1/extra')).toBeLessThan(cues.indexOf('b1/enter'));
  });

  for (const fps of [30, 60]) {
    it(`a cue at 1 on the last beat clamps to the LAST FRAME (${fps} fps), never t = durationS (one past the video)`, () => {
      const story = sb(15);
      story.beats.at(-1).cues = [{ name: 'final', at: 1, kind: 'boom', amp: 1 }];
      const tl = compileTimeline(story, rs(15), ARCH, { fps });
      const fin = tl.hits.find((h: Hit) => h.cue === 'final')!;
      expect(fin.t).toBe((tl.frames - 1) / fps);
      expect(fin.t).toBeLessThan(15);
      expect(validate(TIMELINE_SCHEMA, tl)).toEqual([]);
    });
  }

  it('typing interval is capped at 0.052 s for short commands and squeezed for long ones', () => {
    const short = compileTimeline(sb(15), rs(15), ARCH, { fps: 60 }).typing[0];
    expect(short.interval).toBe(0.052);
    expect(short.t0).toBe(0.45);
    const res = rs(15);
    // 15 s fixture: enter at 2.25 s → room = 2.25 − 0.45 − 0.2 = 1.6 s; 40 chars → 0.04 s each.
    res.beats.b1.slots.command.items[0].text = 'x'.repeat(40);
    const long = compileTimeline(sb(15), res, ARCH, { fps: 60 }).typing[0];
    expect(long.chars).toBe(40);
    expect(long.interval).toBeLessThan(0.052);
    expect(long.interval).toBeCloseTo((long.enterAt - long.t0 - 0.2) / 40, 12);
  });

  it('counts typed chars as code points: a non-BMP emoji is ONE keystroke, so typing still ends before ENTER', () => {
    // '🚀' is 2 UTF-16 units. Counting units would claim 3 chars for 'go🚀' while a code-point
    // typewriter types 3 keystrokes of a 4-unit string — the engine and timeline must agree.
    const res = rs(15);
    res.beats.b1.slots.command.items[0].text = 'go 🚀';
    const ty = compileTimeline(sb(15), res, ARCH, { fps: 60 }).typing[0];
    expect('go 🚀'.length).toBe(5);
    expect(ty.chars).toBe(4);
  });

  it('fails loud with E_TIMELINE_TYPING when the command would type faster than one char per 60 fps frame', () => {
    // 1.6 s of room / 120 chars = 0.0133 s < 1/60 s: several chars would pop in per frame even on
    // --final, i.e. the command "appears" instead of being typed. Rejected at both fps.
    const res = rs(15);
    res.beats.b1.slots.command.items[0].text = 'x'.repeat(120);
    for (const fps of [30, 60]) {
      expect(() => compileTimeline(sb(15), res, ARCH, { fps })).toThrow(expect.objectContaining({ code: 'E_TIMELINE_TYPING', message: expect.stringContaining('b1') }));
    }
    // 96 chars in 1.6 s → exactly 1/60 s each at 60 fps: still allowed (boundary is inclusive).
    res.beats.b1.slots.command.items[0].text = 'x'.repeat(96);
    expect(compileTimeline(sb(15), res, ARCH, { fps: 60 }).typing[0].interval).toBeCloseTo(1 / 60, 12);
  });

  it('fails loud with E_TIMELINE_INPUT (not a misleading timing error) when the typed command is empty', () => {
    const res = rs(15);
    res.beats.b1.slots.command.items[0].text = '';
    expect(() => compileTimeline(sb(15), res, ARCH, { fps: 60 })).toThrow(expect.objectContaining({ code: 'E_TIMELINE_INPUT', message: expect.stringContaining('empty') }));
  });

  it('fails loud with E_TIMELINE_TYPING when ENTER lands before typing can start', () => {
    const story = sb(15);
    story.beats[0].cues = [{ name: 'enter', at: 0.1, kind: 'boom', amp: 1 }];
    expect(() => compileTimeline(story, rs(15), ARCH, { fps: 60 })).toThrow(expect.objectContaining({ code: 'E_TIMELINE_TYPING' }));
  });

  it('fails loud with E_TIMELINE_INPUT when a typing beat has no resolved text, or the archetype is unknown', () => {
    const res = rs(15);
    delete res.beats.b1;
    expect(() => compileTimeline(sb(15), res, ARCH, { fps: 60 })).toThrow(expect.objectContaining({ code: 'E_TIMELINE_INPUT' }));
    const story = sb(15);
    story.beats[1].archetype = 'nope';
    expect(() => compileTimeline(story, rs(15), ARCH, { fps: 60 })).toThrow(expect.objectContaining({ code: 'E_TIMELINE_INPUT' }));
    expect(() => compileTimeline(sb(15), rs(15), ARCH, { fps: 24 })).toThrow(expect.objectContaining({ code: 'E_TIMELINE_INPUT' }));
  });

  it('sections: open→intro, close→outro, body split build/peak at the 60% mark (by core-window midpoint)', () => {
    // 30 s fixture, Σw=8, 3.75 s/unit. Cores: b1[0,3.75] b2[3.75,7.5] b3[7.5,13.125] b4[13.125,15]
    // b5[15,18.75] b6[18.75,22.5] b7[22.5,30]. 60% mark = 18 s → b5 mid 16.875 build, b6 mid 20.625 peak.
    const tl = compileTimeline(sb(30), rs(30), ARCH, { fps: 60 });
    expect(tl.sections).toEqual([
      { name: 'intro', t0: 0, t1: 3.75 },
      { name: 'build', t0: 3.75, t1: 18.75 },
      { name: 'peak', t0: 18.75, t1: 22.5 },
      { name: 'outro', t0: 22.5, t1: 30 },
    ]);
  });
});

describe('cue maps (C14) — one hit per bound item, spread from..to, never stacked within a GRID', () => {
  // A cue map turns "N steps light up in turn" into N audible hits the score can sync to. Two hits
  // closer than one 1/16 note smear into one transient (and double the peak), so collisions are
  // pushed one GRID later; a push past the map's `to` means the beat is too short for N items.
  const frame60 = (g: number) => Math.ceil(g * 60 - 0.5 - 1e-9) / 60; // C8 frame snap, ties down
  const withBody = (archetype: string, variant: string, slot: string, n: number, mut: (s: any) => void = () => {}) => {
    const story = sb(15); // Σw = 5 → 3 s per unit weight; all cuts → b2 window = core [3, 6]
    story.beats.forEach((b: any) => { b.transitionOut = 'cut'; });
    story.beats[1] = { id: 'b2', archetype, variant, weight: 1, bindings: { [slot]: Array.from({ length: n }, (_, i) => `f.feature.${i + 1}`) }, phrases: {}, transitionOut: 'cut' };
    mut(story);
    return story;
  };
  const hitsOf = (tl: any, beatId: string, prefix: string) => tl.hits.filter((h: Hit) => h.beatId === beatId && h.cue.startsWith(prefix + '.'));

  it('expands N items to <name>.<i> at t0 + (from + (to−from)·i/(N−1))·(t1−t0), snapped to GRID', () => {
    const tl = compileTimeline(withBody('flow-graph', 'converge', 'steps', 4), rs(15), ARCH, { fps: 60 });
    const steps = hitsOf(tl, 'b2', 'step');
    // raw 3.45, 3.9, 4.35, 4.8 → grid 3.5, 3.875, 4.375, 4.75
    expect(steps.map((h: Hit) => h.cue)).toEqual(['step.0', 'step.1', 'step.2', 'step.3']);
    expect(steps.map((h: Hit) => h.t)).toEqual([3.5, 3.875, 4.375, 4.75].map(frame60));
    expect(steps.every((h: Hit) => h.kind === 'snap' && h.amp === 0.3)).toBe(true);
    // the archetype's own defaults still fire alongside the map
    expect(tl.hits.filter((h: Hit) => h.beatId === 'b2').map((h: Hit) => h.cue).sort()).toEqual(['converge', 'step.0', 'step.1', 'step.2', 'step.3']);
    expect(validate(TIMELINE_SCHEMA, tl)).toEqual([]);
  });

  it('N = 1 sits at `from` (no division by zero); N = 0 emits nothing', () => {
    const one = compileTimeline(withBody('flow-graph', 'converge', 'steps', 1), rs(15), ARCH, { fps: 60 });
    expect(hitsOf(one, 'b2', 'step').map((h: Hit) => [h.cue, h.t])).toEqual([['step.0', 3.5]]);
    const none = compileTimeline(withBody('flow-graph', 'converge', 'steps', 1, (s) => { s.beats[1].bindings = {}; }), rs(15), ARCH, { fps: 60 });
    expect(hitsOf(none, 'b2', 'step')).toEqual([]);
  });

  it('a hit that snaps onto another hit of the same beat is pushed one GRID later', () => {
    // An extra storyboard cue lands exactly on step.1 (3.875): step.1 moves to 4.0, step.2 (4.375) stays.
    const story = withBody('flow-graph', 'converge', 'steps', 4, (s) => { s.beats[1].cues = [{ name: 'whoosh', at: 0.875 / 3, kind: 'sweep', amp: 0.2 }]; });
    const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
    const t = (cue: string) => tl.hits.find((h: Hit) => h.beatId === 'b2' && h.cue === cue)!.t;
    expect(t('whoosh')).toBe(frame60(3.875));
    expect(t('step.1')).toBe(frame60(4.0));
    expect(t('step.2')).toBe(frame60(4.375));
  });

  it('two FIXED hits (default/storyboard) closer than 1 GRID fail E_TIMELINE naming the beat and both cues', () => {
    // Fixed hits are never pushed (their `at` is authored), so a storyboard cue at 0.85 on a flow-graph
    // beat lands on the same GRID as the default `converge` (5.5 s): two stacked transients, refused.
    const story = withBody('flow-graph', 'converge', 'steps', 2, (s) => { s.beats[1].cues = [{ name: 'whoosh', at: 0.85, kind: 'pop', amp: 0.2 }]; });
    let err: any;
    try { compileTimeline(story, rs(15), ARCH, { fps: 60 }); } catch (e) { err = e; }
    expect(err).toMatchObject({ code: 'E_TIMELINE' });
    expect(err.message).toContain('b2');
    expect(err.message).toContain('whoosh');
    expect(err.message).toContain('converge');
    // Exactly 1 GRID apart (5.375 vs 5.5) is allowed: the boundary is inclusive.
    story.beats[1].cues = [{ name: 'whoosh', at: 2.375 / 3, kind: 'pop', amp: 0.2 }];
    const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
    expect(tl.hits.find((h: Hit) => h.cue === 'whoosh')!.t).toBe(frame60(5.375));
  });

  it('dense maps never stack: every pair of b2 hits is >= 1 GRID apart (up to the ½-frame snap)', () => {
    for (const fps of [30, 60]) {
      const tl = compileTimeline(withBody('orbit-network', 'orbit', 'nodes', 8, (s) => { s.beats[1].weight = 1.5; }), rs(15), ARCH, { fps });
      const ts = tl.hits.filter((h: Hit) => h.beatId === 'b2').map((h: Hit) => h.t).sort((a: number, b: number) => a - b);
      expect(ts.length).toBe(9); // ignite + node.0..7
      for (let i = 1; i < ts.length; i++) expect(ts[i]! - ts[i - 1]!, `fps ${fps} gap ${i}`).toBeGreaterThanOrEqual(GRID - 1 / fps - 1e-9);
    }
  });

  it('fails E_TIMELINE naming the beat when pushes run past the map `to` (beat too short for N items)', () => {
    // b2 = orbit-network with 8 nodes squeezed into ~2.9 s: 0.25·2.9/7 ≈ 0.10 s apart < 1 GRID.
    const story = withBody('orbit-network', 'orbit', 'nodes', 8, (s) => { s.beats[1].weight = 1.25; s.beats[4].weight = 3; });
    let err: any;
    try { compileTimeline(story, rs(15), ARCH, { fps: 60 }); } catch (e) { err = e; }
    expect(err).toMatchObject({ code: 'E_TIMELINE' });
    expect(err.message).toContain('b2');
    expect(err.message).toContain('node.');
    expect(err.fix).toMatch(/weight|fewer/);
    // the same beat with 3 nodes fits — the failure is about N, not the archetype
    story.beats[1].bindings.nodes = story.beats[1].bindings.nodes.slice(0, 3);
    expect(() => compileTimeline(story, rs(15), ARCH, { fps: 60 })).not.toThrow();
  });

  it('a storyboard cue overrides a mapped cue by full name ("step.2"): replaced, not duplicated', () => {
    const story = withBody('flow-graph', 'converge', 'steps', 4, (s) => { s.beats[1].cues = [{ name: 'step.2', at: 0.75, kind: 'boom', amp: 0.9 }]; });
    const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
    const steps = hitsOf(tl, 'b2', 'step');
    expect(steps.map((h: Hit) => h.cue).sort()).toEqual(['step.0', 'step.1', 'step.2', 'step.3']);
    const s2 = steps.find((h: Hit) => h.cue === 'step.2')!;
    expect([s2.t, s2.kind, s2.amp]).toEqual([frame60(3 + 0.75 * 3), 'boom', 0.9]); // 5.25
  });
});

describe('column-wipe (C13/C15) overlap geometry and the overlap-vs-beat guard', () => {
  it('column-wipe overlap = 2 GRID (0.25 s), boundary −1 … +1 GRID; zoom-through stays −2 … +1', () => {
    const story = sb(15); // b1 core [0,3], b2 core [3,6]
    story.beats[0].transitionOut = 'column-wipe';
    story.beats[1].transitionOut = 'zoom-through';
    const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
    const [b1, b2, b3] = tl.beats;
    expect([b1.t1, b2.t0, b1.overlapOut, b2.overlapIn]).toEqual([3.125, 2.875, 0.25, 0.25]);
    expect([b2.t1, b3.t0, b2.overlapOut, b3.overlapIn]).toEqual([6.125, 5.75, 0.375, 0.375]);
    expect(validate(TIMELINE_SCHEMA, tl)).toEqual([]);
  });

  it('back-to-back transitions around the SHORTEST legal beat still leave it a fully-on hold', () => {
    // min beat = 1.0 s core; worst case in = +1 GRID into the core, out = zoom-through −2 GRID → 0.625 s hold.
    for (const into of ['zoom-through', 'column-wipe']) {
      const story = sb(15);
      const ws = [1, 1, 0.5, 2, 3];
      story.beats.forEach((b: any, i: number) => { b.weight = ws[i]; b.transitionOut = 'cut'; });
      story.beats[2].archetype = 'kinetic-text'; story.beats[2].variant = 'punch'; // minWeight 0.5 → 1.0 s floor
      story.beats[1].transitionOut = into;
      story.beats[2].transitionOut = 'zoom-through';
      const tl = compileTimeline(story, rs(15), ARCH, { fps: 60 });
      const b3 = tl.beats[2];
      expect(b3.t1 - b3.overlapOut - (b3.t0 + b3.overlapIn), into).toBeGreaterThanOrEqual(1.0 - 3 * GRID - 1e-9);
    }
  });

  it('assertOverlapsFit: overlaps that eat the whole beat fail E_TIMELINE naming the beat', () => {
    // Unreachable through compileTimeline today (the 1.0 s beat floor > 3 GRID); the guard keeps it that
    // way if MIN_BEAT_S or a transition length ever changes — three beats on screen crashes the engine.
    const beats = [
      { id: 'b1', t0: 0, t1: 3.125, overlapIn: 0, overlapOut: 0.375 },
      { id: 'b2', t0: 2.75, t1: 3.375, overlapIn: 0.375, overlapOut: 0.375 },
      { id: 'b3', t0: 3, t1: 6, overlapIn: 0.375, overlapOut: 0 },
    ];
    let err: any;
    try { assertOverlapsFit(beats); } catch (e) { err = e; }
    expect(err).toMatchObject({ code: 'E_TIMELINE' });
    expect(err.message).toContain('b2');
    beats[1]!.t1 = 3.5; beats[2]!.t0 = 3.125; // 0.75 s window, 0.75 s of overlaps: never alone on screen
    expect(() => assertOverlapsFit(beats)).toThrow(/b2/);
    beats[1]!.t1 = 3.625; beats[2]!.t0 = 3.25;
    expect(() => assertOverlapsFit(beats)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// Shared grep guards (plan Task 4 Step 1). They scan whatever exists right now; directories other
// tasks have not written yet are simply empty. Each guard is self-tested on planted strings so it
// stays meaningful once engine/, archetypes/, lib/score/ are filled.
// Comments are stripped before scanning (a doc comment saying "no Math.random" is not a call).
// ---------------------------------------------------------------------------------------------

function listFiles(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out.sort();
}

const CODE_EXTS = ['.mjs', '.js', '.html'];

// Removes /* block */ and // line comments. `://` (URLs in strings) is not treated as a comment.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

// D10 no-literal-seconds: absolute times must come from timeline.json, never be typed into
// picture/audio code. Scanned: engine/**, archetypes/**/*.mjs, lib/score/** (NOT lib/compile —
// the compiler is the one place allowed to own time constants such as 0.45/0.052/0.2).
// Regexes (plan regex, with the comparison operator widened so `===`/`!==` cannot slip through,
// plus the mirrored `2.5 < t` form):
//   A: /\b(t|time|lt|localT)\s*([<>]=?|[=!]={0,2})\s*(\d+(?:\.\d+)?)\b/g
//   B: /\b(\d+(?:\.\d+)?)\s*([<>]=?|[=!]={0,2})\s*(t|time|lt|localT)\b/g
//   C: /\bat\s*:\s*(\d+(?:\.\d+)?)/g          (cue `at:` literals)
// Allowlist: the numeric literal 0 or 1 (normalised progress bounds, e.g. `t >= 0`, `at: 1`).
// No file is exempt. A line whose `t` is genuinely normalised progress (e.g. an easing breakpoint
// `t < 0.5`) may opt out with the inline marker below ON THAT LINE — the exemption is per line and
// visible in review, so a real seconds literal added elsewhere in the same file is still caught.
const ALLOW_MARKER = 'showreel-allow-normalised-t';
const SECONDS_RES = [
  /\b(?:t|time|lt|localT)\s*(?:[<>]=?|[=!]={0,2})\s*(\d+(?:\.\d+)?)\b/g,
  /\b(\d+(?:\.\d+)?)\s*(?:[<>]=?|[=!]={0,2})\s*(?:t|time|lt|localT)\b/g,
  /\bat\s*:\s*(\d+(?:\.\d+)?)/g,
];
const ALLOWED_NUMS = new Set([0, 1]);
function literalSeconds(raw: string): string[] {
  const hits: string[] = [];
  // Drop marked lines BEFORE stripping comments (the marker itself is a comment).
  const src = stripComments(raw.split('\n').filter((l) => !l.includes(ALLOW_MARKER)).join('\n'));
  for (const re of SECONDS_RES) {
    for (const m of src.matchAll(re)) if (!ALLOWED_NUMS.has(Number(m[1]))) hits.push(m[0]);
  }
  return hits;
}

// D9 purity: draw/score/compile are pure functions of time + seed.
const IMPURE_RE = /Math\.random|Date\.now|performance\.now|new Date\(/g;

describe('grep guard: no literal absolute seconds in engine/, archetypes/, lib/score/ (D10)', () => {
  it('the regex catches planted violations and allows the 0/1 progress bounds', () => {
    expect(literalSeconds('if (t > 2.5) boom();')).toEqual(['t > 2.5']);
    expect(literalSeconds('if (localT === 3) x();')).toHaveLength(1);
    expect(literalSeconds('if (12.2 <= time) x();')).toHaveLength(1);
    expect(literalSeconds('const c = { at: 0.6 };')).toHaveLength(1);
    expect(literalSeconds('lt=4')).toHaveLength(1);
    expect(literalSeconds('if (t >= 0 && t <= 1) k = t; const q = { at: 1 }; let t = 0;')).toEqual([]);
    expect(literalSeconds('const t0 = 3; const set = 5; const at2 = cues.at;')).toEqual([]);
    // Per-line marker exempts only its own line; the next line in the same file is still scanned.
    expect(literalSeconds('const k = t < 0.5 ? a : b; // showreel-allow-normalised-t\nif (t > 2.5) boom();')).toEqual(['t > 2.5']);
    // A marker inside a comment that is not on the offending line does not help.
    expect(literalSeconds('// showreel-allow-normalised-t\nif (t > 2.5) boom();')).toEqual(['t > 2.5']);
  });

  it('scanned files contain zero literal seconds (engine/ must be non-empty: the scan is not vacuous)', () => {
    const engineFiles = listFiles(path.join(TOOLKIT, 'engine'), CODE_EXTS);
    expect(engineFiles.length, 'engine/ moved or renamed? update this guard').toBeGreaterThan(0);
    const files = [
      ...engineFiles,
      ...listFiles(path.join(TOOLKIT, 'archetypes'), ['.mjs']),
      ...listFiles(path.join(TOOLKIT, 'lib', 'score'), CODE_EXTS),
    ];
    console.log(`[no-literal-seconds] scanned ${files.length} file(s)`);
    const bad = files.flatMap((f) => literalSeconds(readFileSync(f, 'utf8')).map((m) => `${path.relative(TOOLKIT, f)}: ${m}`));
    expect(bad).toEqual([]);
  });
});

describe('grep guard: no Math.random / Date.now / performance.now / new Date( (D9 purity)', () => {
  it('the regex catches each banned call', () => {
    for (const s of ['Math.random()', 'Date.now()', 'performance.now()', 'new Date()']) {
      expect(s.match(IMPURE_RE), s).not.toBeNull();
    }
    expect('const rng = mulberry32(seed); const d = dateLike;'.match(IMPURE_RE)).toBeNull();
    // Comments are ignored, live code after a URL string is still scanned.
    expect(stripComments('// no Math.random here\n/* Date.now */ x();').match(IMPURE_RE)).toBeNull();
    expect(stripComments("fetch('http://h/'); Date.now();").match(IMPURE_RE)).not.toBeNull();
  });

  it('engine/, archetypes/, lib/score/, lib/compile/ are clean (lib/compile must be non-empty: the scan is not vacuous)', () => {
    const compileFiles = listFiles(path.join(TOOLKIT, 'lib', 'compile'), CODE_EXTS);
    expect(compileFiles.length).toBeGreaterThan(0);
    const files = [
      ...listFiles(path.join(TOOLKIT, 'engine'), CODE_EXTS),
      ...listFiles(path.join(TOOLKIT, 'archetypes'), ['.mjs']),
      ...listFiles(path.join(TOOLKIT, 'lib', 'score'), CODE_EXTS),
      ...compileFiles,
    ];
    console.log(`[purity] scanned ${files.length} file(s)`);
    const bad = files.flatMap((f) => (stripComments(readFileSync(f, 'utf8')).match(IMPURE_RE) ?? []).map((m) => `${path.relative(TOOLKIT, f)}: ${m}`));
    expect(bad).toEqual([]);
  });
});
