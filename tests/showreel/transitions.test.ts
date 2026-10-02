import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { rng } from '../../templates/showreel/.claude/showreel/engine/math.mjs';
import { checkTimeline } from '../../templates/showreel/.claude/showreel/engine/core.mjs';
import { validateStoryboard } from '../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import columnWipe from '../../templates/showreel/.claude/showreel/archetypes/transitions/column-wipe.mjs';
import { ARCHETYPES, TRANSITIONS } from '../../templates/showreel/.claude/showreel/archetypes/index.mjs';

// v1.16 showreel M2 — column-wipe transition (D11: overlap transitions zoom-through + column-wipe).
// What matters: it is a real OVERLAP transition (both beats on screen mid-overlap, columns flipping
// left → right), continuous at both ends (no pop: k≈0 is the outgoing beat, k≈1 the incoming), and
// deterministic like every other frame (AC3: same bytes across fresh pages / orders / launches, S=1 and S=6).
// column-wipe is registered in archetypes/index.mjs (Task 7). The probe cases still boot a test twin of the
// engine page (fixtures/transitions/page.html → createEngine overrides), because they inject two opaque PROBE
// archetypes that are not (and must not be) in the shipped registry; the real-film cases and the N-matrix /
// AC3 runs exercise column-wipe through the shipped engine/page.html.

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const PAGE = path.join(HERE, 'fixtures', 'transitions', 'page.html');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const W = 1920, H = 1080, COLS = 6;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any;

// Two opaque probe beats joined by a column-wipe (0.25 s = 2 GRID, centred on the 1.0 s boundary: −1 … +1 GRID).
const PROBE_TIMELINE = {
  version: 1, fps: 60, durationS: 2, frames: 120, seed: 1, palette: 'violet',
  beats: [
    { id: 'b1', archetype: 'probe-out', variant: 'x', t0: 0, t1: 1.125, overlapIn: 0, overlapOut: 0.25, transitionOut: 'column-wipe' },
    { id: 'b2', archetype: 'probe-in', variant: 'x', t0: 0.875, t1: 2, overlapIn: 0.25, overlapOut: 0, transitionOut: 'cut' },
  ],
  hits: [], typing: [], sections: [], music: { bpm: 120, key: 'F#m' },
};
const PROBE_RESOLVED = {
  version: 1,
  beats: { b1: { archetype: 'probe-out', variant: 'x', slots: {} }, b2: { archetype: 'probe-in', variant: 'x', slots: {} } },
  allowed: [],
};

// Synthetic facts for a real 15 s film whose every transition is a column-wipe (incl. one into/out of a chapter card)
function fact(kind: string, n: number, display: string) {
  return { id: `f.${kind}.${n}`, kind, value: display, display, unit: null, source: { file: 'synthetic', locator: `${kind}/${n}`, extractor: 'test', rule: 'synthetic' }, hash: 'sha256:0000000000000000' };
}
const FACTS = {
  version: 1, minimumGate: { passed: true, missing: [] }, brand: { name: 'Acme Shop', palette: 'violet', wordmark: 'f.app.name.1' },
  facts: [
    fact('app.name', 1, 'Acme Shop'), fact('app.tagline', 1, 'Checkout in one click'),
    fact('feature', 1, 'Saved carts'), fact('feature', 2, 'Guest checkout'), fact('feature', 3, 'Order history'),
    fact('command', 1, 'npm run dev'),
  ],
};
const WIPE_STORYBOARD = {
  version: 1, durationS: 15, seed: 7, palette: 'violet',
  beats: [
    { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1.25, bindings: { command: 'f.command.1' }, phrases: { caption: 'p.open.1' }, transitionOut: 'column-wipe' },
    { id: 'b2', archetype: 'kinetic-text', variant: 'chapter', weight: 1, bindings: { lines: 'f.feature.1' }, phrases: { lead: 'p.chapter.1' }, transitionOut: 'column-wipe' },
    { id: 'b3', archetype: 'kinetic-text', variant: 'stack', weight: 1, bindings: { lines: ['f.feature.2', 'f.feature.3'] }, phrases: { lead: 'p.lead.1' }, transitionOut: 'column-wipe' },
    { id: 'b4', archetype: 'lockup-cta', variant: 'center', weight: 1.5, bindings: { name: 'f.app.name.1', tagline: 'f.app.tagline.1', command: 'f.command.1' }, phrases: { cta: 'p.cta.1' }, transitionOut: 'cut' },
  ],
};
const INPUTS = { archetypes: ARCH, facts: FACTS, phrases: PHRASES };

describe('column-wipe module (C9 transition contract)', () => {
  it('exports id "column-wipe" + apply(ctx, k, drawOut, drawIn, api), and its id is a storyboard transition', () => {
    expect(columnWipe.id).toBe('column-wipe');
    expect(columnWipe.apply.length).toBe(5);
    const sb = readJ(path.join(TOOLKIT, 'schema', 'storyboard.schema.json'));
    expect(sb.$defs.beat.properties.transitionOut.enum).toContain('column-wipe');
  });

  it('a storyboard chaining column-wipes validates and compiles to 0.25 s overlaps the engine accepts once registered', () => {
    expect(validateStoryboard(WIPE_STORYBOARD, INPUTS)).toEqual([]);
    const rs = resolve(WIPE_STORYBOARD, INPUTS);
    const tl = compileTimeline(WIPE_STORYBOARD, rs, ARCH, { fps: 60 });
    expect(tl.beats.slice(0, -1).map((b: any) => b.overlapOut)).toEqual([0.25, 0.25, 0.25]);
    const withWipe = { ...TRANSITIONS, [columnWipe.id]: columnWipe };
    expect(checkTimeline(tl, rs, ARCHETYPES, withWipe)).toEqual([]);
    expect(checkTimeline(tl, rs, ARCHETYPES, TRANSITIONS)).toEqual([]); // registered in archetypes/index.mjs (M2 Task 7)
    expect((TRANSITIONS as Record<string, unknown>)['column-wipe']).toBe(columnWipe);
    // without the module the engine refuses the film instead of cutting silently
    const withoutWipe = Object.fromEntries(Object.entries(TRANSITIONS as Record<string, unknown>).filter(([id]) => id !== 'column-wipe'));
    expect(checkTimeline(tl, rs, ARCHETYPES, withoutWipe).join('\n')).toContain('transition "column-wipe" is not registered');
  });
});

const BROWSER_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

describe.skipIf(!E2E)('column-wipe in the engine (SHOWREEL_E2E=1)', () => {
  let puppeteer: any;
  let exe: string;
  const cleanups: (() => Promise<void> | void)[] = [];

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const found = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...BROWSER_CANDIDATES].find((p) => p && existsSync(p));
    if (!found) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    exe = found;
    const mod = await loadDep('puppeteer-core', process.cwd());
    puppeteer = mod.default ?? mod;
  }, 180_000);
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  }, 120_000);

  async function serve(timeline: unknown, resolved: unknown) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-wipe-'));
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline));
    writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(resolved));
    copyFileSync(PAGE, path.join(dir, 'page.html'));
    const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => srv.close());
    return srv.url;
  }
  async function launch() {
    const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs() });
    cleanups.push(() => browser.close().catch(() => {})); // already closed by the test is fine
    return browser;
  }
  async function openPage(browser: any, url: string): Promise<Page> {
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
  const hashAt = (page: Page, t: number, S: number): Promise<string> =>
    page.evaluate(async (t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const h = await crypto.subtle.digest('SHA-256', d);
      return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }, t, S);
  /** mean RGB of a 9×9 patch at the centre of every column, at height y */
  const columnColours = (page: Page, t: number, y: number): Promise<number[][]> =>
    page.evaluate((t: number, y: number, cols: number, w: number) => {
      (window as any).SHOWREEL.renderAt(t, 1);
      const g = (document.getElementById('stage') as HTMLCanvasElement).getContext('2d')!;
      return Array.from({ length: cols }, (_, c) => {
        const d = g.getImageData(Math.round(((c + 0.5) * w) / cols) - 4, y - 4, 9, 9).data;
        const s = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) { s[0] += d[i]!; s[1] += d[i + 1]!; s[2] += d[i + 2]!; }
        return s.map((v) => Math.round(v / 81));
      });
    }, t, y, COLS, W);
  const which = ([r, , b]: number[]) => (r! > 2 * b! + 20 ? 'old' : b! > 2 * r! + 20 ? 'new' : `mixed(${r},${b})`);

  it('mid-overlap shows BOTH beats: left columns already new, right columns still old; ends are continuous', async () => {
    const url = await serve(PROBE_TIMELINE, PROBE_RESOLVED);
    const page = await openPage(await launch(), url);
    const [b1, b2] = PROBE_TIMELINE.beats;
    const F = 1 / PROBE_TIMELINE.fps;
    const mid = (b2!.t0 + b1!.t1) / 2; // k = 0.5
    const half = await columnColours(page, mid, H / 2);
    expect(half.map(which)).toEqual(['new', 'new', 'new', 'old', 'old', 'old']);
    // the split travels: at k=0.3 only the first column has flipped at mid-height, at k=0.7 all but the last
    const ov = b1!.t1 - b2!.t0;
    expect((await columnColours(page, b2!.t0 + 0.3 * ov, H / 2)).map(which)).toEqual(['new', 'old', 'old', 'old', 'old', 'old']);
    expect((await columnColours(page, b2!.t0 + 0.7 * ov, H / 2)).map(which)).toEqual(['new', 'new', 'new', 'new', 'new', 'old']);
    // continuity: first frame of the overlap = outgoing only, last frame before b1 ends = incoming only
    expect((await columnColours(page, b2!.t0 + F / 4, H / 2)).map(which)).toEqual(Array(COLS).fill('old'));
    expect((await columnColours(page, b1!.t1 - F / 4, H / 2)).map(which)).toEqual(Array(COLS).fill('new'));
    // outside the overlap there is exactly one beat
    expect((await columnColours(page, b2!.t0 - F, H / 2)).map(which)).toEqual(Array(COLS).fill('old'));
    expect((await columnColours(page, b1!.t1 + F, H / 2)).map(which)).toEqual(Array(COLS).fill('new'));
  }, 180_000);

  it('wipe direction alternates per column (even columns reveal top-down, odd bottom-up)', async () => {
    const url = await serve(PROBE_TIMELINE, PROBE_RESOLVED);
    const page = await openPage(await launch(), url);
    const [b1, b2] = PROBE_TIMELINE.beats;
    const mid = (b2!.t0 + b1!.t1) / 2; // columns 2 and 3 are mid-wipe here (u ≈ 0.74 and 0.26)
    const top = (await columnColours(page, mid, 120)).map(which);
    const bottom = (await columnColours(page, mid, H - 120)).map(which);
    expect([top[2], bottom[2]]).toEqual(['new', 'old']); // col 2 wipes down: front at ≈0.74 H
    expect([top[3], bottom[3]]).toEqual(['old', 'new']); // col 3 wipes up: front at ≈0.26 H from the bottom
  }, 180_000);

  it('AC3: a film of column-wipes hashes identically across fresh pages, 2 orders, 2 launches, at S=1 and S=6', async () => {
    const rs = resolve(WIPE_STORYBOARD, INPUTS);
    const tl = compileTimeline(WIPE_STORYBOARD, rs, ARCH, { fps: 60 });
    const url = await serve(tl, rs);
    const B = tl.beats;
    const F = 1 / tl.fps;
    const T = [
      (B[1].t0 + B[0].t1) / 2, // cold-open → chapter, mid-wipe
      B[1].t0 + F, // first frames of the chapter wipe
      (B[2].t0 + B[1].t1) / 2, // chapter → stack
      (B[3].t0 + B[2].t1) / 2 + F / 3, // stack → lockup, off the frame grid
    ];
    const order = (seed: number) => { const r = rng(seed); return T.map((t) => [r(), t] as const).sort((a, b) => a[0] - b[0]).map(([, t]) => t); };
    for (const S of [1, 6]) {
      const runs: Record<string, string>[] = [];
      for (const seed of [11, 23]) {
        const browser = await launch();
        const byT: Record<string, string> = {};
        for (const t of order(seed)) byT[t] = await hashAt(await openPage(browser, url), t, S);
        runs.push(byT);
        await browser.close();
      }
      expect(runs[1], `S=${S}`).toEqual(runs[0]);
      expect(new Set(Object.values(runs[0]!)).size, `S=${S}: distinct frames`).toBe(T.length);
    }
  }, 180_000);
});

// Registered only when E2E is off: a full E2E run must report 0 skipped (Rule 12).
if (!E2E) {
  describe('column-wipe in the engine (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run the column-wipe continuity, mid-overlap and determinism checks', () => {});
  });
}
