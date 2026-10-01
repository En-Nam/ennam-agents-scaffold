import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';

// v1.16 showreel M2 Task 3 — layered-stack (port of spike s3 slabs). Why each guarantee matters:
//   palette   a non-violet film must not show violet slabs: every colour comes from params.palette (no hex
//             literal, no numeric rgb() literal in the module — review focus 4).
//   cues      each slab THUDS on its compiled cue-map hit `layer.<i>` (C14): picture and score share one clock,
//             so an override of `layer.0` must move the picture, not just the sound.
//   clipping  2 / 4 / 5 layers of 24-char (maxChars) facts stay inside the 48 px safe area at local progress
//             0.5 and on the beat's last fully-on frame; tags never overlap each other or the label.
//   truth     every resolved layer + the label reach the screen; manifest ⊆ resolved (D8 / Rule 13).
//   fit       a layer too long for its tag reports fit null → `check` fails instead of clipping.
//   AC3       frames are byte-identical across fresh pages and launches at S=1 and S=6.
// The archetype is injected with a test-local page (fixtures/archetypes/layered-stack/page.html), so this
// test does not depend on archetypes/index.mjs (the orchestrator registers the module after the fan-out).

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const MODULE = path.join(TOOLKIT, 'archetypes', 'layered-stack.mjs');
const FIX = path.join(HERE, 'fixtures', 'archetypes', 'layered-stack');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const FACTS = readJ(path.join(FIX, 'facts.json'));
const SPEC = ARCH.archetypes['layered-stack'];
const FPS = 60;
const FRAME = 1 / FPS;
const LAYER_IDS: string[] = FACTS.facts.filter((f: { kind: string }) => f.kind === 'stack.item').map((f: { id: string }) => f.id);
// the longest `stack` phrase = the worst case for the label
const LABEL_ID: string = PHRASES.phrases
  .filter((p: { tags: string[] }) => p.tags.includes('stack'))
  .sort((a: { text: string }, b: { text: string }) => b.text.length - a.text.length)[0].id;
const N_MIN: number = SPEC.slots.layers.min;
const N_MAX: number = SPEC.slots.layers.max;
const N_TYPICAL = Math.ceil((N_MIN + N_MAX) / 2);

type Cue = { name: string; at: number; kind: string; amp: number };
/** 15 s film: cold open → layered-stack (zoom-through in and out) → kinetic punch → lockup. Real resolve + compile. */
function film(n: number, { cues, palette = 'violet' }: { cues?: Cue[]; palette?: string } = {}) {
  const sb = {
    version: 1, durationS: 15, seed: 7, palette,
    beats: [
      { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1, bindings: { command: 'f.command.1' }, phrases: { caption: 'p.open.1' }, transitionOut: 'zoom-through' },
      { id: 'b2', archetype: 'layered-stack', variant: 'slabs', weight: 1.25, bindings: { layers: LAYER_IDS.slice(0, n) }, phrases: { label: LABEL_ID }, transitionOut: 'zoom-through', ...(cues ? { cues } : {}) },
      { id: 'b3', archetype: 'kinetic-text', variant: 'punch', weight: 0.75, bindings: { lines: ['f.feature.1'] }, phrases: {}, transitionOut: 'cut' },
      { id: 'b4', archetype: 'lockup-cta', variant: 'center', weight: 1.5, bindings: { name: 'f.app.name.1', command: 'f.command.1' }, phrases: { cta: 'p.cta.1' }, transitionOut: 'cut' },
    ],
  };
  const resolved = resolve(sb, { archetypes: ARCH, facts: FACTS, phrases: PHRASES });
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: FPS });
  const b2 = timeline.beats.find((b: { id: string }) => b.id === 'b2');
  const hits = timeline.hits.filter((h: { beatId: string }) => h.beatId === 'b2');
  return { timeline, resolved, b2, hits, lastOn: b2.t1 - b2.overlapOut - FRAME, half: b2.t0 + 0.5 * (b2.t1 - b2.t0) };
}

describe('layered-stack static guards (D8 text API, D9 canvas roles, palette-only colours, D10)', () => {
  const src = readFileSync(MODULE, 'utf8');

  it('exports {id, layout, draw} under its file name and archetypes.json declares it with the `layer` cue map', async () => {
    const mod = (await import(pathToFileURL(MODULE).href)).default;
    expect(mod.id).toBe('layered-stack');
    expect(typeof mod.layout).toBe('function');
    expect(typeof mod.draw).toBe('function');
    expect(SPEC.variants).toEqual(['slabs']);
    expect(SPEC.cueMaps).toEqual([expect.objectContaining({ name: 'layer', per: 'layers' })]);
  });

  it('tag panels of adjacent layers cannot overlap: the tag pitch is at least the tag height', async () => {
    // the browser no-overlap check judges text bboxes only; the glass panels are taller than their text
    const { GEOM } = await import(pathToFileURL(MODULE).href);
    expect(GEOM.TAG_H).toBeGreaterThan(0);
    expect(GEOM.TAG_PITCH).toBeGreaterThanOrEqual(GEOM.TAG_H);
  });

  it('every colour comes from params.palette: no hex literal and no numeric rgb()/rgba() literal in the module', () => {
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(src.match(/rgba?\(\s*\d/g) ?? []).toEqual([]);
    // named CSS colours would dodge both bans
    expect(src.match(/['"](white|black|red|green|blue|yellow|cyan|magenta|orange|purple|gray|grey)['"]/gi) ?? []).toEqual([]);
  });

  it('draws text only through api.text (no fillText/strokeText) and makes no canvas of its own', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).not.toMatch(/createElement\(\s*['"]canvas|new\s+OffscreenCanvas|\.getContext\(/);
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(/);
  });

  it('no literal absolute seconds (D10, same regex as engine-static) and slab timing reads the `layer.<i>` cues', () => {
    const hits = [...src.matchAll(/\b(t|time|lt|localT)\s*[<>=!]=?\s*(\d+(?:\.\d+)?)\b/g)].filter((m) => m[2] !== '0' && m[2] !== '1');
    expect(hits.map((m) => m[0])).toEqual([]);
    expect(src).not.toMatch(/\bat\s*:\s*\d/);
    expect(src).toContain('cues[`layer.${k}`]');
  });
});

describe.skipIf(!E2E)('layered-stack in the browser (SHOWREEL_E2E=1)', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let puppeteer: any;
  let exe: string;
  const cleanups: (() => Promise<void> | void)[] = [];
  const CANDIDATES = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const found = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...CANDIDATES].find((p) => p && existsSync(p));
    if (!found) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    exe = found;
    const mod = await loadDep('puppeteer-core', process.cwd());
    puppeteer = mod.default ?? mod;
  });
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  });

  async function serve(f: ReturnType<typeof film>, mutate?: (rs: any) => void) {
    const rs = structuredClone(f.resolved);
    mutate?.(rs);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-layered-stack-'));
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(f.timeline));
    writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(rs));
    copyFileSync(path.join(FIX, 'page.html'), path.join(dir, 'page.html'));
    const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => srv.close());
    return srv.url;
  }
  const launch = () => puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs() });
  async function openPage(browser: any, url: string) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.goto(`${url}/build/page.html`, { waitUntil: 'load' });
    await page.waitForFunction('window.SHOWREEL && window.SHOWREEL.ready');
    try {
      await page.evaluate(() => (window as any).SHOWREEL.ready);
    } catch (err) {
      throw new Error(`SHOWREEL.ready rejected: ${(err as Error).message}; page errors: ${errors.join(' | ')}`);
    }
    return page;
  }
  /** render t at S, return the manifest entries drawn in THAT frame (bbox non-null) */
  const drawnAt = (page: any, t: number, S = 1): Promise<{ text: string; source: string; bbox: { x: number; y: number; w: number; h: number } }[]> =>
    page.evaluate((t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      return (window as any).SHOWREEL.manifest().filter((m: any) => m.bbox);
    }, t, S);
  const hashAt = (page: any, t: number, S: number): Promise<string> =>
    page.evaluate(async (t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const h = await crypto.subtle.digest('SHA-256', d);
      return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }, t, S);
  const intersects = (a: any, b: any) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it(`(a)+(c) N = ${N_MIN} / ${N_TYPICAL} / ${N_MAX} layers of ${SPEC.slots.layers.maxChars}-char facts: fit ok, nothing off-frame at progress 0.5 and the last fully-on frame, every item drawn, no overlaps`, async () => {
    const browser = await launch();
    try {
      for (const n of [N_MIN, N_TYPICAL, N_MAX]) {
        const f = film(n);
        const layers = f.resolved.beats.b2.slots.layers.items;
        expect(layers.length, `N=${n}`).toBe(n);
        for (const it of layers) expect([...it.text].length, it.id).toBe(SPEC.slots.layers.maxChars); // near-maxChars: AT maxChars
        expect(f.hits.map((h: any) => h.cue)).toEqual(layers.map((_: unknown, i: number) => `layer.${i}`)); // one thud per layer (C14)
        const page = await openPage(browser, await serve(f));
        const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
        expect(fit.b2.layers, `N=${n} layers fit`).toBeGreaterThanOrEqual(28);
        expect(fit.b2.label, `N=${n} label fit`).toBeGreaterThanOrEqual(28);
        for (const [what, t] of [['progress 0.5', f.half], ['last fully-on frame', f.lastOn]] as const) {
          const drawn = await drawnAt(page, t);
          expect(drawn.length, `N=${n} ${what}: something is drawn`).toBeGreaterThan(0);
          expect(offFrame(drawn), `N=${n} ${what}`).toEqual([]);
        }
        // (c) on the last fully-on frame EVERY layer and the label are on screen (drawn in that very frame)
        const final = await drawnAt(page, f.lastOn);
        const ids = [...layers.map((it: any) => it.id), LABEL_ID];
        expect(final.map((m) => m.source).sort(), `N=${n}`).toEqual([...ids].sort());
        for (const m of final) expect(m.text, m.source).toBe([...layers, ...f.resolved.beats.b2.slots.label.items].find((it: any) => it.id === m.source).text);
        for (let i = 0; i < final.length; i++) for (let j = i + 1; j < final.length; j++) {
          expect(intersects(final[i].bbox, final[j].bbox), `N=${n}: "${final[i].text}" overlaps "${final[j].text}"`).toBe(false);
        }
        expect(checkManifest(await page.evaluate(() => (window as any).SHOWREEL.manifest()), f.resolved)).toEqual([]);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }, 240_000);

  it('cue map: overriding `layer.0` later moves the first slab + its tag (the picture follows the compiled hit, not a private clock)', async () => {
    const base = film(N_TYPICAL);
    const late = film(N_TYPICAL, { cues: [{ name: 'layer.0', at: 0.28, kind: 'thud', amp: 0.5 }] });
    const h0 = (f: ReturnType<typeof film>) => f.hits.find((h: any) => h.cue === 'layer.0').t;
    expect(h0(late)).toBeGreaterThan(h0(base) + 0.4);
    const probe = h0(base) + 0.4; // the default first tag has finished typing here; the overridden one has not landed
    const first = LAYER_IDS[0];
    const browser = await launch();
    try {
      const pb = await openPage(browser, await serve(base));
      const pl = await openPage(browser, await serve(late));
      expect((await drawnAt(pb, probe)).map((m) => m.source)).toContain(first);
      expect((await drawnAt(pl, probe)).map((m) => m.source)).not.toContain(first);
      expect((await drawnAt(pl, h0(late) + 0.4)).map((m) => m.source)).toContain(first);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('fit: a layer too long for its tag reports null for that slot (check fails), the label is unaffected', async () => {
    const f = film(N_TYPICAL);
    const long = 'Distributed Event Sourcing Pipeline Layer'; // 41 chars, beyond maxChars 24
    const browser = await launch();
    try {
      const ok = await (await openPage(browser, await serve(f))).evaluate(() => (window as any).SHOWREEL.fit());
      const page = await openPage(browser, await serve(f, (rs) => { rs.beats.b2.slots.layers.items[2].text = long; }));
      const bad = await page.evaluate(() => (window as any).SHOWREEL.fit());
      expect(ok.b2.layers).toBeGreaterThanOrEqual(28);
      expect(bad.b2.layers).toBeNull();
      expect(bad.b2.label).toBe(ok.b2.label);
      await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), f.lastOn); // still renders; `check` is what fails
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('(b) AC3: enter / progress 0.5 / hit / last-on hashes are identical across fresh pages and 2 launches at S=1 and S=6', async () => {
    const f = film(N_TYPICAL);
    const url = await serve(f);
    const T = [f.hits[0].t - 0.1, f.half, f.hits[f.hits.length - 1].t + 3 * FRAME, f.lastOn];
    const result: Record<number, Record<string, string>[]> = { 1: [], 6: [] };
    for (const S of [1, 6]) {
      for (const order of [T, [...T].reverse()]) {
        const browser = await launch();
        const byT: Record<string, string> = {};
        try {
          for (const t of order) {
            const page = await openPage(browser, url);
            byT[t] = await hashAt(page, t, S);
            await page.close();
          }
        } finally {
          await browser.close();
        }
        result[S].push(byT);
      }
    }
    for (const S of [1, 6]) for (const t of T) expect(result[S][1][t], `S=${S} t=${t}`).toBe(result[S][0][t]);
    expect(new Set(T.map((t) => result[1][0][t])).size).toBe(T.length); // frames change over the beat (not blank/frozen)
    expect(T.filter((t) => result[1][0][t] !== result[6][0][t]).length).toBeGreaterThanOrEqual(T.length - 1); // S=6 is real motion blur
  }, 300_000);

  it('rate check: S=6 ms/frame over 60 frames mid-beat, render only and with JPEG q0.97 capture', async () => {
    const f = film(N_TYPICAL);
    const browser = await launch();
    try {
      const page = await openPage(browser, await serve(f));
      const renderer: string = await page.evaluate(() => (window as any).SHOWREEL.renderer);
      const [ms, msJpeg] = await page.evaluate((t0: number, fr: number) => {
        const stage = document.getElementById('stage') as HTMLCanvasElement;
        const c = stage.getContext('2d')!;
        (window as any).SHOWREEL.renderAt(t0, 6); c.getImageData(0, 0, 1, 1); // warm-up
        let s = performance.now();
        for (let i = 0; i < 60; i++) { (window as any).SHOWREEL.renderAt(t0 + i * fr, 6); c.getImageData(0, 0, 1, 1); }
        const render = (performance.now() - s) / 60;
        s = performance.now();
        for (let i = 0; i < 60; i++) { (window as any).SHOWREEL.renderAt(t0 + i * fr, 6); stage.toDataURL('image/jpeg', 0.97); }
        return [render, (performance.now() - s) / 60];
      }, f.half - 30 * FRAME, FRAME);
      const line = JSON.stringify({ layeredStackRateS6: { renderer, msPerFrame: Math.round(ms * 10) / 10, withJpegMsPerFrame: Math.round(msJpeg * 10) / 10 } });
      console.log(line);
      // vitest may not echo console output for passing tests: SHOWREEL_E2E_ARTIFACTS=<dir> keeps the measurement
      if (process.env.SHOWREEL_E2E_ARTIFACTS) appendFileSync(path.join(process.env.SHOWREEL_E2E_ARTIFACTS, 'rates.jsonl'), line + '\n');
      expect(ms).toBeGreaterThan(0);
      expect(msJpeg).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, 120_000);
});

// Registered only when E2E is off, so a full E2E run reports 0 skipped (Rule 12).
if (!E2E) {
  describe('layered-stack in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run fit/clipping, cue map, AC3 and the rate check', () => {});
  });
}
