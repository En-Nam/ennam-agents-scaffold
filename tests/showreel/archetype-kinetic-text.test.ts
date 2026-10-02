import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { sheetTimes } from '../../templates/showreel/.claude/showreel/render/sheet.mjs';
import { validateStoryboard } from '../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';
import kineticText from '../../templates/showreel/.claude/showreel/archetypes/kinetic-text.mjs';

// v1.16 M2 — kinetic-text punch + chapter as TITLE MOMENTS (R5 row "kinetic punch (and chapter)" vs spike A s5).
// Why each guard matters:
//   (a) no clip at ANY frame: the punch slam overshoots (scale > 1) — with 3 lines of 47–48 chars the old module
//       pushed the line past the 48 px safe margin around progress 0.4 (N-matrix transient log). A film is a film
//       at every frame, not only at the contract's two sample moments, so the whole solo window of every punch beat
//       is swept (every 5 % of the beat AND every frame) and offFrame must stay empty — with the lines proven drawn.
//   (b) title moment: at the R5 hold moment (0.6 of the solo window, C17) the punch line owns the frame in large
//       display type (each line is fitted on its own, a long sibling line no longer shrinks a short one) and the
//       lead phrase is the spaced accent line above it — the spike's ÉN NAM / S C A F F O L D hierarchy.
//   (c) chapter title card: the fact line is the spaced accent line under the title, and a lattice mark sits
//       above the title (spike s5 mark), so the card reads as a title card, not a caption.
//   (d) AC3 determinism of the punch (glow sprites are build-once cache canvases; nothing carries state).
//   (e) palette carry + text API: no colour literals, no direct fillText (Rule 13: every string via api.text).
//   (f) the S=6 rate stays under a loose ceiling.
// Plus a dev artefact (SHOWREEL_SHEETS=1 only): before/after sheet (spike | old | new) + rate, in .showreel-dev/sheets.

const E2E = process.env.SHOWREEL_E2E === '1';
const SHEETS = process.env.SHOWREEL_SHEETS === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TOOLKIT = path.join(REPO, 'templates', 'showreel', '.claude', 'showreel');
const FIX = path.join(HERE, 'fixtures', 'archetypes', 'kinetic-text');
const SRC = path.join(TOOLKIT, 'archetypes', 'kinetic-text.mjs');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const MAX_LINE = ARCH.archetypes['kinetic-text'].slots.lines.maxChars as number;
const FPS = 60, FRAME = 1 / FPS;
const SAFE = { W: 1920, H: 1080, margin: 48 };
const SHEET = path.join(REPO, '.showreel-dev', 'sheets', 'kinetic-text-r5fix.png');

/* eslint-disable @typescript-eslint/no-explicit-any */
type Entry = { text: string; source: string; bbox: { x: number; y: number; w: number; h: number } | null };

function fact(kind: string, n: number, display: string) {
  return { id: `f.${kind}.${n}`, kind, value: display, display, unit: null, source: { file: 'synthetic', locator: `${kind}/${n}`, extractor: 'test', rule: 'synthetic' }, hash: 'sha256:0000000000000000' };
}
// near-maxChars W/M-heavy lines (natural words, no padding): the widest legal punch lines
const LONG = [
  'Mobile Warehouse Webhooks for Multi Market Moves', // 48
  'Workflow Mapping for Warehouse Movement Webhooks', // 48
  'Membership Management with Mobile Web Workflows.', // 48
  'Marketplace Middleware for Warehouse Workflows.', // 47
  'Webhook Mapping with Mobile Warehouse Movements', // 47
  'Windows Workflows for Membership Mobile Markets', // 47
  'Movement Mapping with Mobile Webhook Workflows.', // 47
];
const FACTS = {
  version: 1, minimumGate: { passed: true, missing: [] }, brand: { name: 'Acme Shop', palette: 'violet', wordmark: 'f.app.name.1' },
  facts: [
    fact('app.name', 1, 'Acme Shop'), fact('command', 1, 'npm run dev'),
    // the R5 film's punch (b2) and chapter (b3) content, verbatim
    fact('app.tagline', 1, 'Acme Shop is a storefront for tiny teams.'), fact('app.tagline', 2, 'Checkout in one tap.'),
    fact('feature', 1, 'One-tap checkout'),
    ...LONG.map((t, i) => fact('feature', i + 2, t)),
  ],
};
const INPUTS = { archetypes: ARCH, facts: FACTS, phrases: PHRASES };
const LONGEST_LEAD = [...PHRASES.phrases.filter((p: any) => p.tags.includes('lead'))].sort((a: any, b: any) => b.text.length - a.text.length)[0].id;

const open = (w: number) => ({ id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: w, bindings: { command: 'f.command.1' }, phrases: {}, transitionOut: 'zoom-through' });
const lockup = (id: string, w: number) => ({ id, archetype: 'lockup-cta', variant: 'center', weight: w, bindings: { name: 'f.app.name.1', tagline: 'f.app.tagline.1' }, phrases: {}, transitionOut: 'cut' });
/** the R5 row's beats (60 s next film b2 punch + b3 chapter, same texts) in a 15 s film */
const R5 = {
  version: 1, durationS: 15, seed: 7, palette: 'violet',
  beats: [
    open(1),
    { id: 'b2', archetype: 'kinetic-text', variant: 'punch', weight: 1.25, bindings: { lines: ['f.app.tagline.1', 'f.app.tagline.2'] }, phrases: { lead: 'p.lead.2' }, transitionOut: 'cut' },
    { id: 'b3', archetype: 'kinetic-text', variant: 'chapter', weight: 1, bindings: { lines: 'f.feature.1' }, phrases: { lead: 'p.chapter.3' }, transitionOut: 'cut' },
    lockup('b4', 1.25),
  ],
};
/** worst-case punches: 3 × 48 chars + longest lead, 3 × 47 chars, 1 × 48 chars, plus a long+short pair and a lone
 *  short line (30 s / 7 beats, the N-matrix film shape — E_BUDGET wants 7–8 beats at 30 s) */
const punch = (id: string, lines: string[], lead?: string) =>
  ({ id, archetype: 'kinetic-text', variant: 'punch', weight: 3, bindings: { lines }, phrases: lead ? { lead } : {}, transitionOut: 'cut' });
const MAXF = {
  version: 1, durationS: 30, seed: 7, palette: 'violet',
  beats: [
    open(2),
    punch('b2', ['f.feature.2', 'f.feature.3', 'f.feature.4'], LONGEST_LEAD),
    punch('b3', ['f.feature.5', 'f.feature.6', 'f.feature.7']),
    punch('b4', ['f.feature.8']),
    punch('b5', ['f.app.tagline.1', 'f.app.tagline.2'], 'p.lead.2'),
    punch('b6', ['f.app.tagline.2']),
    lockup('b7', 2),
  ],
};
function build(sb: any) {
  const resolved = resolve(sb, INPUTS);
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: FPS });
  return { sb, resolved, timeline, beat: (id: string) => timeline.beats.find((b: any) => b.id === id) };
}
type Film = ReturnType<typeof build>;
const solo = (b: any) => [b.t0 + b.overlapIn, b.t1 - b.overlapOut] as const;
const still = (f: Film, id: string, which: 'enter' | 'hold' | 'exit') => sheetTimes(f.timeline).find((s: any) => s.beatId === id && s.still === which)!.t as number;

describe('kinetic-text static guards (palette carry, text API) + fixtures', () => {
  const src = readFileSync(SRC, 'utf8');
  it('module exports id/layout/draw; the variants are stack, punch, chapter', () => {
    expect(kineticText.id).toBe('kinetic-text');
    expect(typeof kineticText.layout).toBe('function');
    expect(typeof kineticText.draw).toBe('function');
    expect(ARCH.archetypes['kinetic-text'].variants).toEqual(['stack', 'punch', 'chapter']);
  });
  // no colour literals: one table-driven ban over every archetype module (engine-static.test.ts)
  it('no direct text drawing: fillText/strokeText never appear (all text goes through api.text)', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).toMatch(/api\.text\(/);
  });
  it('slam cap and slam draw share the echo/chroma constants (retuning the draw cannot drift the cap)', () => {
    const cap = src.split('\n').find((l) => l.includes('const sMax'))!;
    expect(cap).toMatch(/ECHO_MAX/);
    expect(cap).toMatch(/CHROMA/);
    expect(cap).not.toMatch(/\+\s*\d/); // no bare px literals added to the extents
    expect(src).toMatch(/of ECHOES\)/);
    expect(src.match(/CHROMA \* ch/g) ?? []).toHaveLength(2);
    // the guard can fail: the pre-fix module hard-coded the echo offsets in the draw
    expect(readFileSync(path.join(FIX, 'kinetic-text-before.mjs'), 'utf8')).not.toMatch(/of ECHOES\)/);
  });
  it('layouts read the frame size from api.W/api.H (no hard-coded 1920/1080 — a resized stage would mis-centre)', () => {
    // also the derived half-frame constants (960/540) — a pre-computed centre is the same bug
    expect(src).not.toMatch(/\b(1920|1080|960|540)\b/);
    // the guard can fail: the pre-fix module hard-coded the frame size
    expect(readFileSync(path.join(FIX, 'kinetic-text-before.mjs'), 'utf8')).toMatch(/\b(1920|1080)\b/);
  });
  it('fixture films validate; worst-case lines are maxChars − 1 … maxChars', () => {
    for (const t of LONG) expect([...t].length, t).toBeGreaterThanOrEqual(MAX_LINE - 1);
    for (const t of LONG) expect([...t].length, t).toBeLessThanOrEqual(MAX_LINE);
    expect(validateStoryboard(R5, INPUTS)).toEqual([]);
    expect(validateStoryboard(MAXF, INPUTS)).toEqual([]);
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

describe.skipIf(!E2E)('kinetic-text punch + chapter title moments in the browser (SHOWREEL_E2E=1)', () => {
  let browser: any;
  const cleanups: (() => Promise<void> | void)[] = [];
  const r5 = build(R5), maxf = build(MAXF);

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const exe = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...BROWSER_CANDIDATES].find((p) => p && existsSync(p));
    if (!exe) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    const mod = await loadDep('puppeteer-core', process.cwd());
    const puppeteer = mod.default ?? mod;
    const udd = mkdtempSync(path.join(os.tmpdir(), 'showreel-kinetic-udd-'));
    browser = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs(), userDataDir: udd });
    cleanups.push(() => rmSync(udd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), () => browser.close());
  }, 180_000);
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  }, 120_000);

  /** serve a film; withBefore also stages the frozen pre-fix module for fixtures/…/page-before.html */
  async function serve(f: Film, withBefore = false) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-kinetic-'));
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(f.timeline));
    writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(f.resolved));
    if (withBefore) {
      copyFileSync(path.join(FIX, 'page-before.html'), path.join(dir, 'page.html'));
      copyFileSync(path.join(FIX, 'kinetic-text-before.mjs'), path.join(dir, 'kinetic-text-before.mjs'));
    }
    const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => srv.close());
    return srv.url;
  }
  async function openPage(url: string, pagePath = '/engine/page.html') {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.goto(`${url}${pagePath}`, { waitUntil: 'load' });
    await page.waitForFunction('window.SHOWREEL && window.SHOWREEL.ready');
    try {
      await page.evaluate(() => (window as any).SHOWREEL.ready);
    } catch (err) {
      throw new Error(`SHOWREEL.ready rejected: ${(err as Error).message}; page errors: ${errors.join(' | ')}`);
    }
    return page;
  }
  const manifestAt = (page: any, t: number): Promise<Entry[]> =>
    page.evaluate((t: number) => { (window as any).SHOWREEL.renderAt(t, 1); return (window as any).SHOWREEL.manifest(); }, t);
  const box = (m: Entry[], source: string) => m.find((e) => e.source === source && e.bbox)?.bbox ?? null;
  /** tracking of a drawn single-line string in em, estimated from its bbox against the font's own metrics */
  const trackEm = (page: any, text: string, weight: number, b: { w: number; h: number }): Promise<number> =>
    page.evaluate((text: string, weight: number, bw: number, bh: number) => {
      const c = document.createElement('canvas').getContext('2d')!;
      c.font = `${weight} 100px "Showreel Display"`;
      const m = c.measureText(text);
      const px = (100 * bh) / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
      const natural = ((m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * px) / 100;
      return (bw - natural) / ([...text].length - 1) / px;
    }, text, weight, b.w, b.h);

  it('(a) punch never leaves the 48 px safe area — every 5 % of the beat and every frame of the solo window, worst-case lines', async () => {
    const report: Record<string, unknown> = {};
    for (const [name, f, ids] of [['max', maxf, ['b2', 'b3', 'b4', 'b5', 'b6']], ['r5', r5, ['b2']]] as const) {
      const page = await openPage(await serve(f));
      const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
      for (const id of ids) {
        const b = f.beat(id);
        const [a, z] = solo(b);
        const lines = f.resolved.beats[id].slots.lines.items.map((i: any) => i.id);
        expect(fit[id].lines, `${name} ${id} lines fit`).toBeGreaterThanOrEqual(28);
        const times = new Set<number>();
        for (let k = 0; k <= 20; k++) times.add(Math.round((b.t0 + k * 0.05 * (b.t1 - b.t0)) * FPS) / FPS);
        for (let n = Math.ceil(a * FPS); n / FPS < z; n++) times.add(n / FPS);
        const off: string[] = [];
        const seen = new Set<string>();
        let checked = 0, maxW = 0;
        for (const t of [...times].sort((x, y) => x - y)) {
          if (t < a || t >= z) continue;
          const m = await manifestAt(page, t);
          for (const e of m) if (e.bbox && lines.includes(e.source)) { seen.add(e.source); maxW = Math.max(maxW, e.bbox.w); }
          for (const o of offFrame(m, SAFE)) off.push(`t=${t.toFixed(4)} (lt ${(t - b.t0).toFixed(3)}) "${o.text}" bbox=${JSON.stringify(o.bbox)}`);
          checked++;
        }
        expect(off, `${name} ${id}: off the safe area`).toEqual([]);
        // not vacuous: the sweep saw every line drawn, and it covered the beat frame by frame
        expect([...seen].sort(), `${name} ${id}: every line drawn during the sweep`).toEqual([...lines].sort());
        expect(checked).toBeGreaterThan((z - a) * FPS - 2);
        report[`${name}/${id}`] = { frames: checked, widestLineBboxPx: Math.round(maxW) };
      }
      expect(checkManifest(await page.evaluate(() => (window as any).SHOWREEL.manifest()), f.resolved)).toEqual([]);
      await page.close();
    }
    console.log(JSON.stringify({ kineticPunchSweep: report }));
  }, 600_000);

  it('(b) R5 punch hold is a title moment: the line is large display type, the lead is the spaced accent line above it', async () => {
    const page = await openPage(await serve(r5));
    const t = still(r5, 'b2', 'hold');
    const m = await manifestAt(page, t);
    const hero = box(m, 'f.app.tagline.2'), lead = box(m, 'p.lead.2');
    expect(hero, 'hero line on screen at hold').toBeTruthy();
    expect(lead, 'lead on screen at hold').toBeTruthy();
    expect(box(m, 'f.app.tagline.1'), 'one line owns the frame').toBeNull();
    // large display type: a 20-char line fitted on its own (≥ ~110 px glyphs, one row or a two-tier block),
    // not shrunk to its 41-char sibling (old: one ~80 px strip, 818 × 79)
    expect(hero!.h, `hero bbox ${JSON.stringify(hero)}`).toBeGreaterThanOrEqual(100);
    expect(hero!.w).toBeGreaterThanOrEqual(700);
    expect(hero!.w * hero!.h, 'visual mass of the hero').toBeGreaterThanOrEqual(150_000);
    // hierarchy: the accent line sits above the hero, clearly subordinate, centred with it
    expect(lead!.y + lead!.h).toBeLessThanOrEqual(hero!.y);
    expect(hero!.h).toBeGreaterThanOrEqual(2 * lead!.h);
    expect(Math.abs(lead!.x + lead!.w / 2 - (hero!.x + hero!.w / 2))).toBeLessThan(40);
    // spaced accent style: tracking ≥ 0.25 em (the old dim lead was ~0.12 em)
    const tr = await trackEm(page, 'Under the hood', 700, lead!);
    expect(tr, `lead tracking ${tr.toFixed(3)} em`).toBeGreaterThanOrEqual(0.25);
    await page.close();
  }, 180_000);

  it('(c) chapter is a title card: spaced accent fact line under the title, lattice mark above it', async () => {
    const page = await openPage(await serve(r5));
    const t = still(r5, 'b3', 'hold');
    const m = await manifestAt(page, t);
    const title = box(m, 'p.chapter.3'), line = box(m, 'f.feature.1');
    expect(title).toBeTruthy();
    expect(line).toBeTruthy();
    expect(line!.y).toBeGreaterThan(title!.y + title!.h * 0.8);
    const tr = await trackEm(page, 'One-tap checkout', 600, line!);
    expect(tr, `line tracking ${tr.toFixed(3)} em`).toBeGreaterThanOrEqual(0.25);
    // the mark: bright stroked geometry centred above the title (nothing but the mark lives in that box)
    const brightAbove = (p: any, b: { y: number }) => p.evaluate((x0: number, y0: number, w: number, h: number) => {
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(x0, y0, w, h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.max(d[i]!, d[i + 1]!, d[i + 2]!) >= 170) n++;
      return n;
    }, 960 - 70, Math.round(b.y - 175), 140, 95);
    const bright = await brightAbove(page, title!);
    expect(bright, 'bright mark pixels above the title').toBeGreaterThanOrEqual(150);
    // the pixel guard can fail: the pre-fix card (rule above the title, no mark) stays under the threshold
    const old = await openPage(await serve(r5, true), '/build/page.html');
    const oldTitle = box(await manifestAt(old, t), 'p.chapter.3');
    const oldBright = await brightAbove(old, oldTitle!);
    expect(oldBright, `pre-fix card: ${oldBright} bright px`).toBeLessThan(150);
    await old.close();
    await page.close();
  }, 180_000);

  it('(d) AC3: punch frames (slam, hold) hash identically in fresh pages, both orders, at S=1 and S=6', async () => {
    const url = await serve(r5);
    const b = r5.beat('b2');
    const cue = r5.timeline.hits.find((h: any) => h.beatId === 'b2' && h.cue === 'line');
    const T = [cue.t + 2 * FRAME, still(r5, 'b2', 'hold'), b.t1 - 2 * FRAME];
    const hash = (p: any, t: number, S: number): Promise<string> => p.evaluate(async (t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const h = await crypto.subtle.digest('SHA-256', d);
      return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }, t, S);
    for (const S of [1, 6]) {
      const fwd: string[] = [], rev: string[] = [];
      for (const t of T) { const p = await openPage(url); fwd.push(await hash(p, t, S)); await p.close(); }
      for (const t of [...T].reverse()) { const p = await openPage(url); rev.unshift(await hash(p, t, S)); await p.close(); }
      expect(rev, `S=${S}`).toEqual(fwd);
      expect(new Set(fwd).size, `S=${S} frames differ over time`).toBe(T.length);
    }
  }, 300_000);

  it('(f) rate: the punch hold renders at S=6 within a loose budget (< 120 ms/frame render-only)', async () => {
    const newPage = await openPage(await serve(r5));
    // 60 frames around the punch hold at S=6, render-only and with a JPEG q0.97 encode (what `render` pays)
    const t0 = still(r5, 'b2', 'hold') - 30 * FRAME;
    const [ms, msJpeg] = await newPage.evaluate((t0: number, fr: number) => {
      const stage = document.getElementById('stage') as HTMLCanvasElement;
      const c = stage.getContext('2d')!;
      const now = () => performance.now();
      (window as any).SHOWREEL.renderAt(t0, 6); c.getImageData(0, 0, 1, 1);
      let s = now();
      for (let i = 0; i < 60; i++) { (window as any).SHOWREEL.renderAt(t0 + i * fr, 6); c.getImageData(0, 0, 1, 1); }
      const render = (now() - s) / 60;
      s = now();
      for (let i = 0; i < 60; i++) { (window as any).SHOWREEL.renderAt(t0 + i * fr, 6); stage.toDataURL('image/jpeg', 0.97); }
      return [render, (now() - s) / 60];
    }, t0, FRAME);
    const rate = { kineticPunchRateS6msPerFrame: Math.round(ms * 10) / 10, withJpegQ097: Math.round(msJpeg * 10) / 10, renderer: await newPage.evaluate(() => (window as any).SHOWREEL.renderer) };
    console.log(JSON.stringify(rate));
    expect(ms).toBeGreaterThan(0);
    // loose ceiling (measured ~34–40 ms on the dev box): catches a build-once sprite regressing to per-frame work
    expect(ms, `S=6 render ${ms.toFixed(1)} ms/frame`).toBeLessThan(120);
    if (SHEETS) {
      mkdirSync(path.dirname(SHEET), { recursive: true });
      writeFileSync(SHEET.replace(/\.png$/, '-rate.json'), JSON.stringify(rate) + '\n');
    }
    await newPage.close();
  }, 180_000);

  // dev artefact, registered only with SHOWREEL_SHEETS=1: a plain E2E run has no file side effects and does not
  // depend on spikes/showreel-v0 (and, being unregistered rather than skipped, still reports 0 skipped)
  if (SHEETS) it('before/after sheet: spike s5 | old | new at enter / hold / exit (S=6), R5 punch + chapter + max N', async () => {
    const newPage = await openPage(await serve(r5));
    const oldPage = await openPage(await serve(r5, true), '/build/page.html');
    const newMax = await openPage(await serve(maxf));
    const oldMax = await openPage(await serve(maxf, true), '/build/page.html');
    const shot = (p: any, expr: string): Promise<string> => p.evaluate(expr);
    const m2 = (p: any, t: number) => shot(p, `(() => { window.SHOWREEL.renderAt(${t}, 6); return document.getElementById('stage').toDataURL('image/jpeg', 0.92); })()`);
    const spike = await browser.newPage();
    await spike.setViewport({ width: 1920, height: 1080 });
    await spike.goto(pathToFileURL(path.join(REPO, 'spikes', 'showreel-v0', 'index.html')).href, { waitUntil: 'load' });
    await spike.waitForFunction('window.READY === true', { timeout: 60_000 });
    const sp = (t: number) => shot(spike, `(() => { window.renderAt(${t}, undefined, 6); return document.getElementById('stage').toDataURL('image/jpeg', 0.92); })()`);
    const rows: [string, number, any, any, number][] = [];
    for (const [id, v] of [['b2', 'punch'], ['b3', 'chapter']] as const) {
      for (const [w, st] of [['enter', 12.3], ['hold', 12.9], ['exit', 13.4]] as const) {
        rows.push([`R5 ${id} ${v} ${w}`, st, oldPage, newPage, still(r5, id, w)]);
      }
    }
    rows.push(['max N b2 punch (3x48 + lead) hold', 12.9, oldMax, newMax, still(maxf, 'b2', 'hold')]);
    const cells: { label: string; url: string }[] = [];
    for (const [label, st, po, pn, t] of rows) {
      cells.push({ label: `spike A s5 t=${st}`, url: await sp(st) });
      cells.push({ label: `OLD ${label} t=${t.toFixed(2)}`, url: await m2(po, t) });
      cells.push({ label: `NEW ${label} t=${t.toFixed(2)}`, url: await m2(pn, t) });
    }
    const sheet = await browser.newPage();
    await sheet.setContent('<html><body style="margin:0;background:black"></body></html>');
    const png: string = await sheet.evaluate(async (cells: { label: string; url: string }[]) => {
      const cw = 640, ch = 360, lab = 30, cols = 3;
      const cv = document.createElement('canvas');
      cv.width = cw * cols; cv.height = (ch + lab) * Math.ceil(cells.length / cols);
      const g = cv.getContext('2d')!;
      g.fillStyle = 'black'; g.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < cells.length; i++) {
        const img = new Image(); img.src = cells[i]!.url; await img.decode();
        const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + lab);
        g.fillStyle = 'white'; g.font = '18px sans-serif'; g.fillText(cells[i]!.label, x + 10, y + 21);
        g.drawImage(img, x, y + lab, cw, ch);
      }
      return cv.toDataURL('image/png');
    }, cells);
    writeFileSync(SHEET, Buffer.from(png.split(',')[1]!, 'base64'));
    expect(existsSync(SHEET)).toBe(true);
    for (const p of [newPage, oldPage, newMax, oldMax, spike, sheet]) await p.close();
  }, 300_000);
});

// Registered only when E2E is off: a full E2E run must report 0 skipped (Rule 12).
if (!E2E) {
  describe('kinetic-text title moments in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run the safe-area sweep, title-moment, chapter card, determinism, rate + sheet', () => {});
  });
}
