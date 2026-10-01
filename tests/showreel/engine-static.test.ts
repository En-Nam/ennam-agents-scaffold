import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';
import { fitText, text, counter, unit, manifest, clusters } from '../../templates/showreel/.claude/showreel/engine/text.mjs';
import { parseFontsourceCss, parseUnicodeRange, glyphGapsFor, familyOf } from '../../templates/showreel/.claude/showreel/engine/fonts.mjs';
import { rng, hash, ease } from '../../templates/showreel/.claude/showreel/engine/math.mjs';
import { PALETTES, palette } from '../../templates/showreel/.claude/showreel/engine/palettes.mjs';
import { checkTimeline } from '../../templates/showreel/.claude/showreel/engine/core.mjs';
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
  const st: Record<string, unknown> = { font: '10px x', letterSpacing: '0px', globalAlpha: 1 };
  const stack: Record<string, unknown>[] = [];
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(String(st.font))![1]);
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k === 'save') return () => stack.push({ ...t });
      if (k === 'restore') return () => Object.assign(t, stack.pop());
      if (k === 'measureText') return (s: string) => {
        const n = Array.from(s).length;
        return { width: n * 0.6 * px() + n * parseFloat(String(t.letterSpacing)), actualBoundingBoxAscent: px() * 0.7, actualBoundingBoxDescent: px() * 0.2 };
      };
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

  it('ARCHETYPES keys EQUAL archetypes.json keys (a storyboard can never name an archetype the engine cannot draw)', () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual([...ids].sort());
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
    expect(manifest()).toContainEqual({ text: 'npm run dev', source: 'f.command.1' });
    expect(() => text(ctx, 'npm run deploy' as never, 0, 0)).toThrow(/resolved item/);
  });

  it('a slice (typing) draws a prefix but records the full resolved text', () => {
    const { ctx, calls } = fakeCtx();
    text(ctx, { id: 'p.open.9', text: 'Én Nam', number: null, unit: null }, 0, 0, { slice: [0, 2] });
    expect(calls[0].str).toBe('Én');
    expect(manifest()).toContainEqual({ text: 'Én Nam', source: 'p.open.9' });
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
    expect(m).toContainEqual({ text: '21', source: 'counter:f.count.7' });
    expect(m).toContainEqual({ text: '42', source: 'f.count.7' });
    expect(m).toContainEqual({ text: 'routes', source: 'unit:f.count.7' });
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
