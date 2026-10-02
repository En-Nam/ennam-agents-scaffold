import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';
import { fitText, text, counter, unit, manifest, clusters, beginFrame, blit, setBoxRecording } from '../../templates/showreel/.claude/showreel/engine/text.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { parseFontsourceCss, parseUnicodeRange, glyphGapsFor, familyOf, kindOf } from '../../templates/showreel/.claude/showreel/engine/fonts.mjs';
import { rng, hash, ease } from '../../templates/showreel/.claude/showreel/engine/math.mjs';
import { PALETTES, palette, accents } from '../../templates/showreel/.claude/showreel/engine/palettes.mjs';
import { checkTimeline, cueLookup, CAMERA, SAFE_RECT } from '../../templates/showreel/.claude/showreel/engine/core.mjs';
import { makeCanvas } from '../../templates/showreel/.claude/showreel/engine/canvas.mjs';
import { fakeApi } from './helpers/fake-api';
import { ARCHETYPES, TRANSITIONS } from '../../templates/showreel/.claude/showreel/archetypes/index.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';

// v1.16 showreel engine (Task 6) — the static half of the determinism + truth guarantees:
// - D9 (M0 ruling): canvases come ONLY from engine/canvas.mjs makeCanvas(role). Spike s5 created its
//   own blur-sprite canvases and they got a per-run GPU/CPU backing → unstable hashes (M0 root cause).
// - D8 / Rule 13: archetypes never call fillText/strokeText; all text goes through engine/text.mjs,
//   which records the manifest that `check`/`verify` compare against resolved.json.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const FIX = path.join(HERE, 'fixtures', 'engine');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const rel = (f: string) => path.relative(TOOLKIT, f).split(path.sep).join('/');

async function engineSources() {
  return fg(['engine/**/*', 'archetypes/**/*.mjs'], { cwd: TOOLKIT, absolute: true });
}
function offenders(files: string[], re: RegExp) {
  return files.filter((f) => re.test(readFileSync(f, 'utf8'))).map(rel).sort();
}

// A fake 2D context: every glyph is 0.6 em wide (+ letterSpacing). Lets text/fit logic run in Node.
function fakeCtx() {
  const calls: { op: string; str: string; x: number; y: number; font: string }[] = [];
  // m = [a, b, c, d, e, f] current transform (translate/scale/setTransform only), like DOMMatrix 2D
  const st: Record<string, unknown> = { font: '10px x', letterSpacing: '0px', globalAlpha: 1, textAlign: 'left', m: [1, 0, 0, 1, 0, 0] };
  const stack: Record<string, unknown>[] = [];
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(String(st.font))![1]);
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k === 'save') return () => stack.push({ ...t });
      if (k === 'restore') return () => Object.assign(t, stack.pop());
      if (k === 'measureText') return (s: string) => {
        const n = Array.from(s).length;
        const width = n * 0.6 * px() + n * parseFloat(String(t.letterSpacing));
        const left = t.textAlign === 'center' ? width / 2 : t.textAlign === 'right' ? width : 0;
        return { width, actualBoundingBoxLeft: left, actualBoundingBoxRight: width - left, actualBoundingBoxAscent: px() * 0.7, actualBoundingBoxDescent: px() * 0.2 };
      };
      if (k === 'getTransform') return () => { const [a, b, c, d, e, f] = t.m as number[]; return { a, b, c, d, e, f }; };
      if (k === 'setTransform') return (...v: number[]) => { t.m = v; };
      if (k === 'translate') return (x: number, y: number) => { const [a, b, c, d, e, f] = t.m as number[]; t.m = [a, b, c, d, e! + a! * x + c! * y, f! + b! * x + d! * y]; };
      if (k === 'scale') return (x: number, y: number) => { const [a, b, c, d, e, f] = t.m as number[]; t.m = [a! * x, b! * x, c! * y, d! * y, e, f]; };
      if (k === 'fillText' || k === 'strokeText') return (s: string, x: number, y: number) => calls.push({ op: String(k), str: s, x, y, font: String(t.font) });
      return t[k as string];
    },
    set(t, k, v) { t[k as string] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('engine static guards (D9 canvas roles, D8 text API)', () => {
  it('canvas ban: createElement("canvas") / new OffscreenCanvas / .getContext( appear ONLY in engine/canvas.mjs', async () => {
    const files = await engineSources();
    expect(files.length).toBeGreaterThan(5);
    expect(offenders(files, /createElement\(\s*['"]canvas|new\s+OffscreenCanvas|\.getContext\(/)).toEqual(['engine/canvas.mjs']);
  });

  it('text ban: .fillText( / .strokeText( appear ONLY in engine/text.mjs', async () => {
    expect(offenders(await engineSources(), /\.(fill|stroke)Text\(/)).toEqual(['engine/text.mjs']);
  });

  it('purity: no Math.random / Date.now / performance.now / new Date( in engine or archetypes', async () => {
    expect(offenders(await engineSources(), /Math\.random|Date\.now|performance\.now|new Date\(/)).toEqual([]);
  });

  it('no literal absolute seconds (D10, Task 4 shared regex) in engine or archetypes', async () => {
    const files = await engineSources();
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\b(t|time|lt|localT)\s*[<>=!]=?\s*(\d+(?:\.\d+)?)\b/g)) if (m[2] !== '0' && m[2] !== '1') hits.push(`${rel(f)}: ${m[0]}`);
      for (const m of src.matchAll(/\bat\s*:\s*\d/g)) hits.push(`${rel(f)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it('grapheme clusters have ONE implementation (engine/text.mjs, api.clusters): no archetype keeps its own copy', async () => {
    // A fix to combining-mark handling (Vietnamese glyphs) must land once, not per archetype in different shapes.
    expect(offenders(await engineSources(), /function\s+clusters\s*\(/)).toEqual(['engine/text.mjs']);
  });

  it('clusters(): combining marks stay with their base (decomposed Vietnamese), ranges are code points', () => {
    const viet = 'Vie\u0302\u0323t a'; // "Việt a" with circumflex + dot below as two combining marks
    expect(clusters(viet)).toEqual([
      { s: 0, e: 1, ch: 'V' }, { s: 1, e: 2, ch: 'i' }, { s: 2, e: 5, ch: 'e' }, { s: 5, e: 6, ch: 't' },
      { s: 6, e: 7, ch: ' ' }, { s: 7, e: 8, ch: 'a' },
    ]);
    expect(clusters('a😀b').map((c) => [c.s, c.e])).toEqual([[0, 1], [1, 2], [2, 3]]); // code points, not UTF-16 units
    expect(clusters('')).toEqual([]);
  });
});

describe('archetype registry (C9)', () => {
  const ids = Object.keys(readJson(path.join(TOOLKIT, 'archetypes', 'archetypes.json')).archetypes);

  it('every registered archetype exports id/layout/draw and its id is an archetypes.json key', () => {
    for (const [key, mod] of Object.entries(ARCHETYPES as Record<string, { id: string; layout: unknown; draw: unknown }>)) {
      expect(mod.id).toBe(key);
      expect(ids).toContain(key);
      expect(typeof mod.layout).toBe('function');
      expect(typeof mod.draw).toBe('function');
    }
  });

  it('every archetypes/<id>.mjs module is registered under its file name', async () => {
    const files = await fg('archetypes/*.mjs', { cwd: TOOLKIT, absolute: true, ignore: ['archetypes/index.mjs'] });
    for (const f of files) {
      const id = path.basename(f, '.mjs');
      const mod = (await import(pathToFileURL(f).href)).default;
      expect(mod.id, f).toBe(id);
      expect((ARCHETYPES as Record<string, unknown>)[id], `${id} not in archetypes/index.mjs`).toBe(mod);
    }
  });

  // M2 Task 7 registered the 4 M2 archetypes: the registry now EQUALS archetypes.json (no pending ids).
  it('ARCHETYPES keys EQUAL archetypes.json keys (a storyboard can never name an archetype the engine cannot draw)', () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual([...ids].sort());
    for (const id of ['card-carousel', 'flow-graph', 'layered-stack', 'orbit-network']) expect(Object.keys(ARCHETYPES), id).toContain(id);
  });

  it('TRANSITIONS keys EQUAL the storyboard transitionOut enum minus "cut" (every overlap transition can be drawn)', () => {
    const sb = readJson(path.join(TOOLKIT, 'schema', 'storyboard.schema.json'));
    const enumT: string[] = sb.$defs.beat.properties.transitionOut.enum;
    expect(Object.keys(TRANSITIONS).sort()).toEqual(enumT.filter((t) => t !== 'cut').sort());
    expect(Object.keys(TRANSITIONS)).toContain('column-wipe');
  });

  it('zoom-through transition is registered with id + apply(ctx, k, drawOut, drawIn, api)', () => {
    const z = (TRANSITIONS as Record<string, { id: string; apply: (...a: unknown[]) => void }>)['zoom-through'];
    expect(z.id).toBe('zoom-through');
    expect(z.apply.length).toBe(5);
  });

  it('checkTimeline fails loud naming every unregistered archetype (never renders a blank beat)', () => {
    const tl = readJson(path.join(FIX, 'timeline.json'));
    const rs = readJson(path.join(FIX, 'resolved.json'));
    const errs = checkTimeline(tl, rs, {}, TRANSITIONS);
    for (const id of ['cold-open-command', 'kinetic-text', 'metrics-counter-lock', 'lockup-cta']) {
      expect(errs.join('\n')).toContain(`archetype "${id}" is not registered`);
    }
  });

  it('checkTimeline accepts the 30 s fixture and rejects broken overlap / cut-with-overlap / short end', () => {
    const tl = readJson(path.join(FIX, 'timeline.json'));
    const rs = readJson(path.join(FIX, 'resolved.json'));
    const all = Object.fromEntries(['cold-open-command', 'kinetic-text', 'metrics-counter-lock', 'lockup-cta'].map((id) => [id, { id }]));
    expect(checkTimeline(tl, rs, all, TRANSITIONS)).toEqual([]);
    const bad = structuredClone(tl);
    bad.beats[1].t0 = 3.25; // overlap no longer matches b1.overlapOut
    bad.beats[2].transitionOut = 'cut'; // cut with a 0.375 overlap
    bad.beats[7].t1 = 29.5; // film ends early
    const errs = checkTimeline(bad, rs, all, TRANSITIONS).join('\n');
    expect(errs).toContain('b2: t0 must equal b1.t1');
    expect(errs).toContain('b3: transitionOut "cut" with overlapOut 0.375');
    expect(errs).toContain('last beat b8 must end at durationS=30');
  });
});

describe('fixtures conform to the contracts (C7 resolved, C8 timeline)', () => {
  it('timeline.json + resolved.json validate against the shipped schemas', () => {
    const schema = (n: string) => readJson(path.join(TOOLKIT, 'schema', `${n}.schema.json`));
    expect(validate(schema('timeline'), readJson(path.join(FIX, 'timeline.json')))).toEqual([]);
    expect(validate(schema('resolved'), readJson(path.join(FIX, 'resolved.json')))).toEqual([]);
  });
});

describe('text API (D8 / Rule 13)', () => {
  it('text() draws and records the ITEM text, keyed by item id — never a caller string', () => {
    const { ctx, calls } = fakeCtx();
    text(ctx, { id: 'f.command.1', text: 'npm run dev', number: null, unit: null }, 10, 20, { size: 40 });
    expect(calls).toEqual([expect.objectContaining({ op: 'fillText', str: 'npm run dev' })]);
    expect(calls[0].font).toContain('"Showreel Mono"'); // command facts render (and are glyph-checked) in mono
    expect(manifest()).toContainEqual(expect.objectContaining({ text: 'npm run dev', source: 'f.command.1' }));
    expect(() => text(ctx, 'npm run deploy' as never, 0, 0)).toThrow(/resolved item/);
  });

  it('a slice (typing) draws a prefix but records the full resolved text', () => {
    const { ctx, calls } = fakeCtx();
    text(ctx, { id: 'p.open.9', text: 'Én Nam', number: null, unit: null }, 0, 0, { slice: [0, 2] });
    expect(calls[0].str).toBe('Én');
    expect(manifest()).toContainEqual(expect.objectContaining({ text: 'Én Nam', source: 'p.open.9' }));
    expect(manifest().some((m) => m.text === 'Én')).toBe(false);
  });

  it('counter() rolls integers under counter:<id> and LOCKS on the fact display at progress 1', () => {
    const { ctx, calls } = fakeCtx();
    const item = { id: 'f.count.7', text: '42', number: 42, unit: 'routes' };
    counter(ctx, item, 0.5, 0, 0);
    counter(ctx, item, 1.4, 0, 0);
    unit(ctx, item, 0, 0);
    expect(calls.map((c) => c.str)).toEqual(['21', '42', 'routes']);
    const m = manifest();
    expect(m).toContainEqual(expect.objectContaining({ text: '21', source: 'counter:f.count.7' }));
    expect(m).toContainEqual(expect.objectContaining({ text: '42', source: 'f.count.7' }));
    expect(m).toContainEqual(expect.objectContaining({ text: 'routes', source: 'unit:f.count.7' }));
  });

  it('fitText: shrinks to fit, returns null below the minimum (a 90-char command is never clipped silently)', () => {
    const { ctx } = fakeCtx();
    // 0.6 em per glyph: 11 chars at 72 px = 475 px → fits at max
    expect(fitText(ctx, 'npm run dev', 1100, 72, 22, { family: 'mono' })).toBe(72);
    // 64 chars: largest px with 64*0.6*px ≤ 1100 → 28
    expect(fitText(ctx, 'x'.repeat(64), 1100, 72, 22, { family: 'mono' })).toBe(28);
    // 90 chars need ≤ 20.37 px → below the 22 px mono floor → null
    expect(fitText(ctx, 'x'.repeat(90), 1100, 72, 22, { family: 'mono' })).toBeNull();
    // letter-spacing is part of the width (tracking breaks the linear estimate; result must still be exact)
    const px = fitText(ctx, 'x'.repeat(20), 600, 72, 22, { track: 6 })!;
    expect(20 * 0.6 * px + 20 * 6).toBeLessThanOrEqual(600);
    expect(20 * 0.6 * (px + 1) + 20 * 6).toBeGreaterThan(600);
  });
});

describe('manifest bbox (C16) — device-space bounds of every drawn text, for the no-clipping check', () => {
  // The clipping guarantee (M2: every text inside the frame minus a 48 px margin) is only testable if
  // the manifest knows WHERE each string landed after the archetype's and camera's transforms.
  const entry = (source: string) => manifest().find((m: { source: string }) => m.source === source) as { bbox: { x: number; y: number; w: number; h: number } | null };

  it('records the bbox of an api.text call under translate + scale (device space, not user space)', () => {
    beginFrame();
    const { ctx } = fakeCtx();
    ctx.translate(100, 50);
    ctx.scale(2, 2);
    // 10 chars × 0.6 em × 40 px = 240 user px wide; ascent 28, descent 8; left-aligned at (10, 100)
    text(ctx, { id: 'f.feature.77', text: 'abcdefghij', number: null, unit: null }, 10, 100, { size: 40 });
    const { bbox } = entry('f.feature.77');
    // user rect x 10..250, y 72..108 → device x 120..600, y 194..266
    expect(bbox).toEqual({ x: 120, y: 194, w: 480, h: 72 });
  });

  it('stroked text pads the bbox by lineWidth/2 (the outline paints outside the glyph box), fill-only does not', () => {
    beginFrame();
    const { ctx } = fakeCtx();
    ctx.scale(2, 2);
    // 5 × 0.6 × 20 = 60 user px; ascent 14, descent 4 → glyph box x 10..70, y 86..104; lineWidth 6 → pad 3
    text(ctx, { id: 'f.feature.81', text: 'abcde', number: null, unit: null }, 10, 100, { size: 20, mode: 'stroke', lineWidth: 6 });
    expect(entry('f.feature.81').bbox).toEqual({ x: 14, y: 166, w: 132, h: 48 });
    text(ctx, { id: 'f.feature.82', text: 'abcde', number: null, unit: null }, 10, 100, { size: 20, mode: 'both' }); // default lineWidth 2 → pad 1
    expect(entry('f.feature.82').bbox).toEqual({ x: 18, y: 170, w: 124, h: 40 });
    text(ctx, { id: 'f.feature.83', text: 'abcde', number: null, unit: null }, 10, 100, { size: 20, lineWidth: 6 }); // fill: lineWidth unused
    expect(entry('f.feature.83').bbox).toEqual({ x: 20, y: 172, w: 120, h: 36 });
  });

  it('honours textAlign (centre) and unions repeated draws of the same item within one frame', () => {
    beginFrame();
    const { ctx } = fakeCtx();
    const item = { id: 'f.feature.78', text: 'abcde', number: null, unit: null }; // 5 × 0.6 × 20 = 60 px
    text(ctx, item, 500, 100, { size: 20, align: 'center' }); // x 470..530, y 86..104
    text(ctx, item, 500, 300, { size: 20, align: 'center' }); // y 286..304
    expect(entry('f.feature.78').bbox).toEqual({ x: 470, y: 86, w: 60, h: 218 });
  });

  it('a new frame resets bboxes: items not drawn in the latest frame carry bbox null (never a stale box)', () => {
    beginFrame();
    const { ctx } = fakeCtx();
    text(ctx, { id: 'f.feature.79', text: 'gone', number: null, unit: null }, 0, 100, { size: 20 });
    expect(entry('f.feature.79').bbox).not.toBeNull();
    beginFrame();
    text(ctx, { id: 'f.feature.80', text: 'kept', number: null, unit: null }, 0, 100, { size: 20 });
    expect(entry('f.feature.79').bbox).toBeNull();
    expect(entry('f.feature.80').bbox).not.toBeNull();
  });

  it('the bbox feeds offFrame: text pushed past the right edge by the transform is flagged', () => {
    beginFrame();
    const { ctx } = fakeCtx();
    ctx.translate(1700, 0);
    text(ctx, { id: 'f.feature.81', text: 'abcdefghij', number: null, unit: null }, 0, 500, { size: 40 }); // 240 px → x 1700..1940
    text(ctx, { id: 'f.feature.82', text: 'ab', number: null, unit: null }, -800, 500, { size: 40 });
    const flagged = offFrame(manifest()).map((m: { source: string }) => m.source);
    expect(flagged).toContain('f.feature.81');
    expect(flagged).not.toContain('f.feature.82');
  });
});

describe('text sprites + coverage (C16 / D8): sprite text counts only once it is placed in a frame', () => {
  // Build-once 'cache' sprites hold api.text draws made at layout boot, BEFORE any frame. A sprite that is never
  // put on screen must not count as drawn (coverage), and one that is must get a frame-space box (safe area).
  let restoreDoc: (() => void) | null = null;
  beforeAll(() => {
    const g = globalThis as any;
    const had = 'document' in g, prev = g.document;
    // canvas.mjs makeCanvas needs document.createElement: hand it fake canvases whose 2D context is fakeCtx()
    g.document = { createElement: () => { const c: any = { width: 0, height: 0 }; c.getContext = () => { const { ctx } = fakeCtx(); (ctx as any).canvas = c; return ctx; }; return c; }, body: { appendChild() {} } };
    restoreDoc = () => { if (had) g.document = prev; else delete g.document; };
  });
  afterAll(() => restoreDoc?.());
  const entry = (source: string) => manifest().find((m: { source: string }) => m.source === source) as { bbox: { x: number; y: number; w: number; h: number } | null; onScreen: boolean };

  it('text drawn into a cache sprite is recorded WITHOUT a frame box and is NOT on screen until the sprite is blitted', () => {
    beginFrame();
    const sprite = makeCanvas('cache', 400, 100);
    text(sprite.ctx, { id: 'f.feature.90', text: 'abcde', number: null, unit: null }, 20, 60, { size: 20 }); // sprite rect x 20..80, y 46..64
    expect(entry('f.feature.90')).toMatchObject({ bbox: null, onScreen: false });
    // a plain drawImage of the sprite (what a glow / bloom sprite uses) never places its text
    const { ctx } = fakeCtx();
    (ctx as any).drawImage = () => {};
    ctx.drawImage(sprite.canvas as any, 0, 0);
    expect(entry('f.feature.90')).toMatchObject({ bbox: null, onScreen: false });
  });

  it('blit(ctx, sprite, …) maps the sprite text box through the destination rect AND the ctx transform (all drawImage forms)', () => {
    const sprite = makeCanvas('cache', 400, 100);
    text(sprite.ctx, { id: 'f.feature.91', text: 'abcde', number: null, unit: null }, 20, 60, { size: 20 });
    const { ctx } = fakeCtx();
    const drawn: unknown[][] = [];
    (ctx as any).drawImage = (...a: unknown[]) => drawn.push(a);
    beginFrame();
    ctx.translate(100, 200);
    blit(ctx, sprite.canvas, 10, 0); // (dx, dy): sprite x 20..80 → 130..190, y 46..64 → 246..264
    expect(drawn).toHaveLength(1);
    expect(entry('f.feature.91')).toMatchObject({ bbox: { x: 130, y: 246, w: 60, h: 18 }, onScreen: true });
    beginFrame();
    blit(ctx, sprite.canvas, 0, 0, 800, 200); // (dx, dy, dw, dh): ×2 → x 140..260, y 292..328
    expect(entry('f.feature.91').bbox).toEqual({ x: 140, y: 292, w: 120, h: 36 });
    beginFrame();
    blit(ctx, sprite.canvas, 50, 0, 100, 100, 0, 0, 100, 100); // source rect x 50..150: only x 50..80 of the text
    expect(entry('f.feature.91').bbox).toEqual({ x: 100, y: 246, w: 30, h: 18 });
    beginFrame();
    blit(ctx, sprite.canvas, 200, 0, 100, 100, 0, 0, 100, 100); // text entirely outside the source rect
    expect(entry('f.feature.91').bbox).toBeNull();
    expect(() => blit(ctx, sprite.canvas, 1, 2, 3)).toThrow(/2, 4 or 8/);
  });

  it('fully transparent draws (globalAlpha 0) record no box — on a frame or into a sprite', () => {
    beginFrame();
    const { ctx } = fakeCtx();
    (ctx as any).globalAlpha = 0;
    text(ctx, { id: 'f.feature.92', text: 'ghost', number: null, unit: null }, 500, 500, { size: 20 });
    expect(entry('f.feature.92')).toMatchObject({ bbox: null, onScreen: false });
    (ctx as any).globalAlpha = 1;
    text(ctx, { id: 'f.feature.92', text: 'ghost', number: null, unit: null }, 500, 500, { size: 20, alpha: 0 });
    expect(entry('f.feature.92')).toMatchObject({ bbox: null, onScreen: false });
    text(ctx, { id: 'f.feature.92', text: 'ghost', number: null, unit: null }, 500, 500, { size: 20, alpha: 0.01 });
    expect(entry('f.feature.92').onScreen).toBe(true);
  });

  it('while a transition runs (setBoxRecording(false)) no box is recorded: overlap frames are exempt from C16', () => {
    beginFrame();
    const { ctx } = fakeCtx();
    setBoxRecording(false);
    try {
      text(ctx, { id: 'f.feature.93', text: 'wipe', number: null, unit: null }, 1900, 500, { size: 40 }); // would be off-frame
    } finally {
      setBoxRecording(true);
    }
    expect(entry('f.feature.93')).toMatchObject({ bbox: null, onScreen: false });
    expect(offFrame(manifest()).map((m: { source: string }) => m.source)).not.toContain('f.feature.93');
    text(ctx, { id: 'f.feature.93', text: 'wipe', number: null, unit: null }, 1900, 500, { size: 40 });
    expect(offFrame(manifest()).map((m: { source: string }) => m.source)).toContain('f.feature.93');
  });
});

describe('one engine fact, one copy (Rule 7): camera bounds, fact kinds, cue lookup', () => {
  it('CAMERA is the worst case of renderFrame (push 1 + 0.035 + 0.028·1.4, shake (14 + 8)·1.2, roll 0.006·1.2) and SAFE_RECT keeps a point inside the 48 px margin under it', () => {
    expect(CAMERA.pushMax).toBeCloseTo(1.0742, 6);
    expect(CAMERA.shakeMax).toBeCloseTo(26.4, 6);
    expect(CAMERA.rotMax).toBeCloseTo(0.0072, 6);
    // the four corners of SAFE_RECT under the worst push + shake + roll (either sign) stay within [48, W−48]×[48, H−48]
    const { pushMax: p, shakeMax: s, rotMax: r } = CAMERA;
    for (const [x, y] of [[SAFE_RECT.x0, SAFE_RECT.y0], [SAFE_RECT.x1, SAFE_RECT.y0], [SAFE_RECT.x0, SAFE_RECT.y1], [SAFE_RECT.x1, SAFE_RECT.y1]]) {
      for (const sg of [-1, 1]) for (const rs of [-1, 1]) {
        const dx = (x - 960) * p, dy = (y - 540) * p, a = rs * r;
        const X = 960 + sg * s + dx * Math.cos(a) - dy * Math.sin(a), Y = 540 + sg * s + dx * Math.sin(a) + dy * Math.cos(a);
        expect(X).toBeGreaterThanOrEqual(48 - 1e-6); expect(X).toBeLessThanOrEqual(1872 + 1e-6);
        expect(Y).toBeGreaterThanOrEqual(48 - 1e-6); expect(Y).toBeLessThanOrEqual(1032 + 1e-6);
      }
    }
    // and renderFrame reads the same constants (no second literal copy of the camera in core.mjs)
    const core = readFileSync(path.join(TOOLKIT, 'engine', 'core.mjs'), 'utf8');
    expect(core).not.toMatch(/0\.028 \* Math\.min|\* 14 \+ Math\.sin/);
  });

  it('no archetype keeps its own copy of the camera bound, the fact-kind parser or a cue fallback', async () => {
    const files = (await fg(['archetypes/**/*.mjs'], { cwd: TOOLKIT, absolute: true })).filter((f) => !f.endsWith('index.mjs'));
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(offenders(files, /1\.075|1 \+ 0\.035|0\.028 \* (?:Math\.min|1\.4)|\(14 \+ 8\)|CAM_PUSH\s*=\s*[\d(]|CAM_SHAKE\s*=\s*[\d(]|TEXT_L\s*=\s*\d/)).toEqual([]);
    expect(offenders(files, /\^f\\\.\(\.\+\)/)).toEqual([]); // the id → kind parser lives in fonts.mjs (api.kindOf)
    expect(offenders(files, /cues(\[[^\]]+\]|\.\w+)\s*\?\?/)).toEqual([]); // `cues.x ?? guess` hides a broken timeline
    expect(offenders(files, /\bcues\.\w+|\bcues\[/)).toEqual([]); // cue times only via api.cue (throws when missing)
  });

  it('kindOf: fact kind from the item id, null for phrases; familyOf is built on it', () => {
    expect(kindOf({ id: 'f.stack.item.3' })).toBe('stack.item');
    expect(kindOf({ id: 'f.route.12' })).toBe('route');
    expect(kindOf({ id: 'p.cta.1' })).toBeNull();
  });

  it('cueLookup returns the cue time and THROWS naming beat, archetype and cue when it is missing (never a made-up time)', () => {
    const cue = cueLookup({ 'step.0': 1.25, converge: 3 }, 'b4', 'flow-graph');
    expect(cue('step.0')).toBe(1.25);
    expect(() => cue('step.1')).toThrow(/E_ENGINE: beat b4 \(flow-graph\) has no cue "step\.1".*converge, step\.0/);
  });

  // every archetype checks the cues it needs in layout(): a missing one fails the BOOT (all cue names it draws on)
  const it1 = (id: string, text = 'Abc') => ({ id, text, number: null, unit: null });
  const slot = (items: unknown[], source = 'fact') => ({ source, items, fitSizePx: null });
  const CASES: [string, string, Record<string, unknown>, string[]][] = [
    ['flow-graph', 'converge', { steps: slot([it1('f.feature.1'), it1('f.feature.2'), it1('f.feature.3')]), lead: slot([], 'phrase') }, ['step.0', 'step.1', 'step.2', 'converge']],
    ['layered-stack', 'slabs', { layers: slot([it1('f.stack.item.1'), it1('f.stack.item.2'), it1('f.stack.item.3')]), label: slot([], 'phrase') }, ['layer.0', 'layer.1', 'layer.2']],
    ['card-carousel', 'row', { cards: slot([it1('f.feature.1'), it1('f.feature.2'), it1('f.feature.3')]), lead: slot([], 'phrase') }, ['card.0', 'card.1', 'card.2', 'settle']],
    ['orbit-network', 'orbit', { hub: slot([it1('f.app.name.1')]), nodes: slot([it1('f.feature.1'), it1('f.feature.2'), it1('f.feature.3')]) }, ['ignite', 'node.0', 'node.1', 'node.2']],
    ['kinetic-text', 'chapter', { lines: slot([]), lead: slot([it1('p.chapter.1')], 'phrase') }, ['line']],
    ['metrics-counter-lock', 'row', { counters: slot([{ id: 'f.count.1', text: '42', number: 42, unit: 'routes' }]), label: slot([], 'phrase') }, ['lock']],
    ['lockup-cta', 'center', { name: slot([it1('f.app.name.1')]), tagline: slot([]), command: slot([]), cta: slot([], 'phrase') }, ['slam', 'sweep']],
    ['cold-open-command', 'terminal', { command: slot([it1('f.command.1', 'npm run dev')]), caption: slot([], 'phrase') }, ['enter']],
  ];
  it('every registered archetype is in the missing-cue table (a new archetype cannot skip this check)', () => {
    expect(CASES.map((c) => c[0]).sort()).toEqual(Object.keys(ARCHETYPES).sort());
  });
  for (const [id, variant, slots, needed] of CASES) {
    it(`${id}: layout fails loudly naming each missing cue (${needed.join(', ')})`, () => {
      const rb = { archetype: id, variant, slots };
      for (const missing of needed) {
        const cues = Object.fromEntries(needed.filter((n) => n !== missing).map((n, k) => [n, 0.5 + 0.25 * k]));
        expect(() => (ARCHETYPES as any)[id].layout(rb, variant, fakeApi({ cues, beatId: 'b2', archetype: id })), `${id} without ${missing}`)
          .toThrow(new RegExp(`b2 \\(${id}\\) has no cue "${missing.replace('.', '\\.')}"`));
      }
    });
  }
});

// D9 (M2): imageSmoothingQuality 'high' selects Chrome's GPU cubic resampler, which returned one of two
// results per page for slightly scaled blits (cold-open perspective strips: 2 hashes over 10 fresh pages;
// 'low'/'medium'/default were stable). Banned engine-wide so no module reintroduces it. Allow-list, not a
// deny-list: outside comments, EVERY mention of imageSmoothingQuality must be a literal 'low'/'medium' setting
// (`= 'low'` or `imageSmoothingQuality: 'medium'`), so 'high' via Object.assign, a variable, or bracket
// notation fails too — not only the one direct `= 'high'` form.
describe("determinism: no imageSmoothingQuality 'high' anywhere in engine/ or archetypes/", () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const violations = (s: string) => [...stripComments(s).matchAll(/imageSmoothingQuality['"`\]]*\s*[=:]?\s*\S{0,10}/g)]
    .map((m) => m[0]).filter((m) => !/^imageSmoothingQuality\s*[=:]\s*(['"`])(?:low|medium)\1$/.test(m.replace(/[,;)}\s]+$/, '')));
  it('the ban is live: every way of reaching "high" is caught; low / medium and comments are not', () => {
    for (const s of ["ctx.imageSmoothingQuality = 'high'", 'Object.assign(ctx, { imageSmoothingQuality: "high" })',
      "const Q = 'high'; ctx.imageSmoothingQuality = Q;", "ctx['imageSmoothingQuality'] = 'high';", 'c.imageSmoothingQuality=`high`']) {
      expect(violations(s), s).toHaveLength(1);
    }
    for (const s of ["ctx.imageSmoothingQuality = 'low';", 'g.imageSmoothingQuality = "medium"', "Object.assign(c, { imageSmoothingQuality: 'low' })",
      "// imageSmoothingQuality 'high' gave two hashes", "/* imageSmoothingQuality = 'high' */ x = 1;"]) {
      expect(violations(s), s).toEqual([]);
    }
  });
  it('the ban holds over every engine/ and archetypes/ module', async () => {
    const files = await fg(['engine/**/*.mjs', 'archetypes/**/*.mjs'], { cwd: TOOLKIT, absolute: true });
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(violations(readFileSync(f, 'utf8')), rel(f)).toEqual([]);
  });
});

describe('palette-only colours (review focus 4): ONE ban over every archetype + transition module', () => {
  // hex (#fff, #8b6bff), a quoted rgb()/rgba()/hsl() literal (incl. a template `rgba(${…})`), a named CSS colour
  const BANS = [/#[0-9a-fA-F]{3,8}\b/g, /['"`](?:rgba?|hsla?)\(/g, /['"`](?:white|black|red|green|blue|yellow|cyan|magenta|orange|purple|gray|grey|transparent)['"`]/gi];
  const literals = (src: string) => BANS.flatMap((re) => src.match(re) ?? []);
  // No debt left: cold-open-command's 38 M1 literals moved to palette tokens in M2.
  const DEBT: Record<string, number> = {};

  it('the ban is live: it catches every literal form (and not the palette helpers)', () => {
    for (const s of ["fill: '#8b6bff'", "c = '#fff'", "g.fillStyle = 'rgba(255,255,255,0.07)'", 'x = `rgba(${r},0,0,1)`', "'hsl(200, 50%, 50%)'", "s = 'white'", "k = 'Transparent'"]) expect(literals(s), s).toHaveLength(1);
    for (const s of ['rgba(P.text, 0.5)', 'api.rgba(pal.white, a)', "mix(P.primary, P.white, 0.3)", "ctx.globalCompositeOperation = 'lighter'"]) expect(literals(s), s).toEqual([]);
  });

  it('no colour literal in any archetype or transition module (every colour comes from params.palette)', async () => {
    const files = await fg(['archetypes/**/*.mjs'], { cwd: TOOLKIT, absolute: true });
    expect(files.map(rel)).toEqual(expect.arrayContaining(['archetypes/transitions/column-wipe.mjs', 'archetypes/transitions/zoom-through.mjs', 'archetypes/lockup-cta.mjs']));
    for (const f of files) {
      const found = literals(readFileSync(f, 'utf8'));
      const allowed = DEBT[rel(f)] ?? 0;
      expect(found.length, `${rel(f)}: ${found.slice(0, 8).join(' ')}`).toBeLessThanOrEqual(allowed);
    }
  });

  it('M2 archetypes and transitions use the palette ROLES, never a named hue the palette did not pick (P.violet/cyan/amber/magenta/red)', () => {
    for (const f of ['flow-graph', 'layered-stack', 'card-carousel', 'orbit-network', 'transitions/column-wipe', 'transitions/zoom-through', 'lockup-cta', 'kinetic-text', 'cold-open-command']) {
      const src = readFileSync(path.join(TOOLKIT, 'archetypes', `${f}.mjs`), 'utf8');
      // P.mint is the semantic "done" green (check marks, status dots) — allowed; accent colours use api.accents
      expect(src.match(/\b(?:P|pal|palette)\.(?:violet|cyan|amber|magenta|red)\b/g) ?? [], f).toEqual([]);
    }
  });

  it('accents(palette, n): the roles first, then their midpoints — distinct, hex, never a named hue outside the roles', () => {
    for (const [name, P] of Object.entries<any>(PALETTES)) {
      const a = accents(P, 6);
      expect(a.slice(0, 3), name).toEqual([P.primary, P.secondary, P.hot]);
      expect(new Set(a).size, name).toBe(6);
      for (const c of a) expect(c, name).toMatch(/^#[0-9a-f]{6}$/);
      const outside = ['violet', 'cyan', 'amber', 'magenta', 'mint', 'red'].map((h) => P[h]).filter((c) => ![P.primary, P.secondary, P.hot].includes(c));
      for (const c of a) expect(outside, `${name}: ${c}`).not.toContain(c);
      expect(accents(P, 8)[6], name).toBe(P.primary); // cycles beyond 6
    }
    expect(PALETTES.violet.white).toBe('#ffffff');
    expect(PALETTES.violet.black).toBe('#000000');
  });
});

describe('fonts + glyph coverage (D6, review focus 1)', () => {
  const css = readFileSync(path.join(FIX, 'archivo-index.css'), 'utf8');

  it('reproduces EVERY unicode-range subset of the fontsource CSS', () => {
    const faces = parseFontsourceCss(css);
    expect(faces.map((f) => f.file)).toEqual([
      'files/archivo-vietnamese-wght-normal.woff2',
      'files/archivo-latin-ext-wght-normal.woff2',
      'files/archivo-latin-wght-normal.woff2',
    ]);
    expect(faces[0].weight).toBe('100 900');
    expect(parseUnicodeRange('U+0000-00FF,U+0131,U+4??')).toEqual([[0, 255], [0x131, 0x131], [0x400, 0x4ff]]);
  });

  it('Vietnamese app name is covered; ✓ is reported naming char, beat and slot', () => {
    const ranges = parseFontsourceCss(css).flatMap((f) => f.ranges);
    const resolved = { beats: {
      b8: { slots: { name: { items: [{ id: 'f.app.name.1', text: 'Ứng dụng Én Nam ✓', number: null, unit: null }] } } },
      b3: { slots: { counters: { items: [{ id: 'f.count.1', text: '42', number: 42, unit: 'tệp' }] } } },
    } };
    expect(glyphGapsFor(resolved, { display: ranges, mono: ranges })).toEqual([{ char: '✓', beatId: 'b8', slot: 'name' }]);
  });

  it('checks each item against the family it renders in (commands → mono)', () => {
    expect(familyOf({ id: 'f.command.2' })).toBe('mono');
    expect(familyOf({ id: 'f.route.1' })).toBe('mono');
    expect(familyOf({ id: 'f.app.name.1' })).toBe('display');
    expect(familyOf({ id: 'p.cta.1' })).toBe('display');
    const resolved = { beats: { b1: { slots: { command: { items: [{ id: 'f.command.1', text: 'npm run Ω', number: null, unit: null }] } } } } };
    // Ω (U+03A9) is in JetBrains Mono's greek subset but not in Archivo
    expect(glyphGapsFor(resolved, { display: [[0, 255]], mono: [[0, 255], [0x370, 0x3ff]] })).toEqual([]);
    expect(glyphGapsFor(resolved, { display: [[0, 255], [0x370, 0x3ff]], mono: [[0, 255]] })).toEqual([{ char: 'Ω', beatId: 'b1', slot: 'command' }]);
  });
});

describe('math + palettes', () => {
  it('rng is seeded and repeatable (mulberry32 golden), hash is stateless', () => {
    const a = rng(7), b = rng(7);
    const seq = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seq);
    expect(seq[0]).not.toBe(rng(8)());
    expect(hash(3.5)).toBe(hash(3.5));
    expect(ease.outCubic(1)).toBe(1);
  });

  it('violet is the spike palette; all four palettes exist; unknown palette fails loud', () => {
    expect(Object.keys(PALETTES).sort()).toEqual(['amber', 'cyan', 'mint', 'violet']);
    expect(PALETTES.violet.primary).toBe('#8b6bff');
    expect(PALETTES.violet.secondary).toBe('#2ee6d6');
    expect(() => palette('pink')).toThrow(/unknown palette/);
  });
});

describe('render/server.mjs (C12)', () => {
  let srv: { url: string; close: () => Promise<void> };
  let root: string;
  const get = (url: string, method = 'GET') =>
    new Promise<{ status: number; type: string; body: string }>((ok, fail) => {
      const u = new URL(url);
      // raw path: node:http does not normalise "..", so the server sees the traversal attempt as sent
      const req = request({ host: u.hostname, port: u.port, path: url.slice(srv.url.length), method }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => ok({ status: res.statusCode!, type: String(res.headers['content-type'] ?? ''), body }));
      });
      req.on('error', fail);
      req.end();
    });

  beforeAll(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'showreel-srv-'));
    const tool = path.join(root, 'tool');
    const font = path.join(tool, 'node_modules', '@fontsource-variable', 'archivo', 'files');
    mkdirSync(font, { recursive: true });
    writeFileSync(path.join(font, 'a.woff2'), 'wOF2');
    writeFileSync(path.join(tool, 'node_modules', '@fontsource-variable', 'archivo', 'index.css'), '@font-face{}');
    const build = path.join(root, 'build');
    mkdirSync(build);
    writeFileSync(path.join(build, 'timeline.json'), '{}');
    writeFileSync(path.join(root, 'secret.json'), '{"secret":true}');
    srv = await startServer({ toolkitDir: TOOLKIT, toolDir: tool, buildDir: build });
  });
  afterAll(async () => {
    await srv?.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('binds to 127.0.0.1 and serves each mount with the right MIME type', async () => {
    expect(srv.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const cases: [string, string][] = [
      ['/engine/core.mjs', 'text/javascript'],
      ['/engine/page.html', 'text/html'],
      ['/archetypes/archetypes.json', 'application/json'],
      ['/archetypes/transitions/zoom-through.mjs', 'text/javascript'],
      ['/fonts/archivo/index.css', 'text/css'],
      ['/fonts/archivo/files/a.woff2', 'font/woff2'],
      ['/build/timeline.json', 'application/json'],
    ];
    for (const [p, type] of cases) {
      const r = await get(srv.url + p);
      expect(r.status, p).toBe(200);
      expect(r.type, p).toContain(type);
    }
    expect((await get(srv.url + '/archetypes/index.mjs?real=1')).status).toBe(200); // query ignored
  });

  it('path traversal never escapes a mount (403/404, never the file)', async () => {
    for (const p of ['/engine/../../package.json', '/build/../secret.json', '/build/..%2Fsecret.json', '/build/%2e%2e/secret.json',
      '/build/..%5Csecret.json', '/fonts/../../secret.json', '/fonts/..%2F..%2Fsecret.json/x', '/build/C:%5CWindows%5Cwin.ini']) {
      const r = await get(srv.url + p);
      expect([403, 404], p).toContain(r.status);
      expect(r.body, p).not.toContain('secret');
    }
  });

  it('GET/HEAD only; unknown mounts, directories and unlisted extensions are 404', async () => {
    expect((await get(srv.url + '/engine/core.mjs', 'POST')).status).toBe(405);
    expect((await get(srv.url + '/engine/core.mjs', 'HEAD')).status).toBe(200);
    expect((await get(srv.url + '/lib/util/out.mjs')).status).toBe(404);
    expect((await get(srv.url + '/engine/')).status).toBe(404);
    expect((await get(srv.url + '/archetypes/transitions')).status).toBe(404);
    expect((await get(srv.url + '/build/nope.json')).status).toBe(404);
  });
});
