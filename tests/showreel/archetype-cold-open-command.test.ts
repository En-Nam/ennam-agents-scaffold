import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { sheetTimes } from '../../templates/showreel/.claude/showreel/render/sheet.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';

// v1.16 showreel — cold-open-command (C9, port of spike s1 "IGNITION"), M2 R5 fixes. Why each guarantee matters:
//   AC3      the tilted terminal is blitted as perspective strips from a 'frame' scratch layer. With
//            imageSmoothingQuality 'high' Chrome's GPU picks the cubic resampler for those slightly scaled strips
//            and fresh pages came out in one of TWO RGBA hashes (1–3 px off by 1 LSB; A/B: 'low'/'medium' and an
//            untilted blit are stable). A film that hashes differently per page cannot be re-rendered or verified,
//            so typing frames of the TILTED panel must hash identically over many fresh pages and 2 launches.
//   palette  a non-violet film must not show the M1 port's tinted greys/whites: zero colour literals, and the
//            palette ROLES only (no P.red/P.amber traffic lights the palette did not pick) — enforced by the ONE
//            toolkit-wide ban in engine-static.test.ts, not by a copy here.
//   bokeh    the R5 sheet showed bokeh discs floating in FRONT of the terminal body, washing over the command:
//            the discs live behind the glass, so they change (almost) no pixel inside the panel body.
//   truth    the command and the caption reach the screen with their exact text; manifest ⊆ resolved.
// The archetype is injected (wrapped by the S.noBokeh probe) by fixtures/archetypes/cold-open-command/page.html.

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const MODULE = path.join(TOOLKIT, 'archetypes', 'cold-open-command.mjs');
const FIX = path.join(HERE, 'fixtures', 'archetypes', 'cold-open-command');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const FACTS = readJ(path.join(FIX, 'facts.json'));
const FPS = 60;
const FRAME = 1 / FPS;

/** The terminal-body probe box for the bokeh test, DERIVED from the module's own panel constants (PW/PH, PCX/PCY)
 * so a geometry change moves the box with the panel instead of silently probing the wrong pixels. Inset by 60 px
 * for the tilt sway, the push-in rise and the bloom halo. Throws if the constants can no longer be found. */
function panelBodyBox(src: string, inset = 60) {
  const size = src.match(/const PW = (\d+), PH = (\d+)/);
  const centre = src.match(/const PCX = (\d+), PCY = (\d+)/);
  if (!size || !centre) throw new Error('cold-open-command.mjs: panel constants PW/PH/PCX/PCY not found — update panelBodyBox');
  const [pw, ph, cx, cy] = [size[1], size[2], centre[1], centre[2]].map(Number) as [number, number, number, number];
  return { x0: cx - pw / 2 + inset, x1: cx + pw / 2 - inset, y0: cy - ph / 2 + inset, y1: cy + ph / 2 - inset };
}

/** Local time at which the panel's tilt has settled to 0 (the perspective-strip path ends), DERIVED from the
 * module's own `settle = clamp(lt / Math.max(FLOOR, E - OFFSET))` (E = local `enter` cue), so moving the settle
 * moves the AC3 probe window instead of letting the probes silently hash an untilted panel. Throws if the
 * formula can no longer be found. */
function settleEnd(src: string, enterLocal: number) {
  const m = src.match(/const settle = clamp\(lt \/ Math\.max\(([\d.]+), E - ([\d.]+)\)\);/);
  if (!m) throw new Error('cold-open-command.mjs: the settle formula changed — update settleEnd');
  return Math.max(Number(m[1]), enterLocal - Number(m[2]));
}

/** 15 s film: cold open (command + caption) → kinetic stack → kinetic punch → lockup. Real resolve + compile
 * (typing schedule, `enter` cue). */
function film() {
  const sb = {
    version: 1, durationS: 15, seed: 7, palette: 'violet',
    beats: [
      { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1, bindings: { command: 'f.command.1' }, phrases: { caption: 'p.open.1' }, transitionOut: 'zoom-through' },
      { id: 'b2', archetype: 'kinetic-text', variant: 'stack', weight: 1, bindings: { lines: ['f.feature.1'] }, phrases: {}, transitionOut: 'cut' },
      { id: 'b3', archetype: 'kinetic-text', variant: 'punch', weight: 1, bindings: { lines: ['f.app.tagline.1'] }, phrases: {}, transitionOut: 'cut' },
      { id: 'b4', archetype: 'lockup-cta', variant: 'center', weight: 1.5, bindings: { name: 'f.app.name.1', command: 'f.command.1' }, phrases: { cta: 'p.cta.1' }, transitionOut: 'cut' },
    ],
  };
  const resolved = resolve(sb, { archetypes: ARCH, facts: FACTS, phrases: PHRASES });
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: FPS });
  const b = timeline.beats.find((x: { id: string }) => x.id === 'b1');
  const ty = timeline.typing.find((x: { beatId: string }) => x.beatId === 'b1');
  const enter = timeline.hits.find((h: { beatId: string; cue: string }) => h.beatId === 'b1' && h.cue === 'enter').t as number;
  const hold = sheetTimes(timeline).find((s: { beatId: string; still: string }) => s.beatId === 'b1' && s.still === 'hold').t as number;
  return { timeline, resolved, b, ty, enter, hold };
}

describe('cold-open-command static guards (D8 text API, D9 canvas roles, palette-only colours, D10)', () => {
  const src = readFileSync(MODULE, 'utf8');

  it('exports {id, layout, draw}; archetypes.json declares the terminal variant, the typed command and the `enter` cue', async () => {
    const mod = (await import(pathToFileURL(MODULE).href)).default;
    expect(mod.id).toBe('cold-open-command');
    expect(typeof mod.layout).toBe('function');
    expect(typeof mod.draw).toBe('function');
    const spec = ARCH.archetypes['cold-open-command'];
    expect(spec.variants).toEqual(['terminal']);
    expect(spec.typing).toBe('command');
    expect(spec.defaultCues).toEqual([expect.objectContaining({ name: 'enter' })]);
  });

  it('the AC3 tilt window is derivable from the module (settleEnd parses its settle formula)', () => {
    expect(settleEnd(src, 2.5)).toBeGreaterThan(2);
    expect(settleEnd(src, 2.5)).toBeLessThan(2.5); // settles BEFORE enter: a probe after it would hash an untilted panel
  });

  // palette (zero colour literals, no DEBT entry, roles only — no P.red/P.amber) and the imageSmoothingQuality
  // 'high' ban (AC3 root cause) are NOT re-checked here: ONE copy of each ban lives in engine-static.test.ts
  // ('palette-only colours' with cold-open-command in its named-hue list, and 'determinism: no
  // imageSmoothingQuality high'), both over every archetype module (Rule 7: one fact, one copy).

  it('draws text only through api.text, makes no canvas of its own, no clocks, no absolute seconds; ENTER comes from the cue', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).not.toMatch(/createElement\(\s*['"]canvas|new\s+OffscreenCanvas|\.getContext\(/);
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(|globalThis|window\./);
    const hits = [...src.matchAll(/\b(t|time|lt|localT)\s*[<>=!]=?\s*(\d+(?:\.\d+)?)\b/g)].filter((m) => m[2] !== '0' && m[2] !== '1');
    expect(hits.map((m) => m[0])).toEqual([]);
    expect(src).toContain("api.cue('enter')");
  });
});

describe.skipIf(!E2E)('cold-open-command in the browser (SHOWREEL_E2E=1)', () => {
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
  }, 180_000);
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  }, 120_000);

  async function serve(f: ReturnType<typeof film>) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-coldopen-'));
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(f.timeline));
    writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(f.resolved));
    copyFileSync(path.join(FIX, 'page.html'), path.join(dir, 'page.html'));
    const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => srv.close());
    return srv.url;
  }
  const launch = () => puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs() });
  async function openPage(browser: any, url: string, page_ = '/build/page.html') {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.goto(`${url}${page_}`, { waitUntil: 'load' });
    await page.waitForFunction('window.SHOWREEL && window.SHOWREEL.ready');
    try {
      await page.evaluate(() => (window as any).SHOWREEL.ready);
    } catch (err) {
      throw new Error(`SHOWREEL.ready rejected: ${(err as Error).message}; page errors: ${errors.join(' | ')}`);
    }
    return page;
  }
  const hashAt = (page: any, t: number, S: number): Promise<string> =>
    page.evaluate(async (t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const h = await crypto.subtle.digest('SHA-256', d);
      return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }, t, S);

  it('AC3 (tilted typing): 3 typing timestamps hash identically over 10 fresh pages in 2 launches, at S=1 and S=6', async () => {
    const f = film();
    const url = await serve(f);
    // the panel is tilted until it settles (settleEnd, read from the module): every probe sits inside that window
    const tiltEnd = f.b.t0 + settleEnd(readFileSync(MODULE, 'utf8'), f.enter - f.b.t0);
    const typed = (k: number) => f.b.t0 + f.ty.t0 + k * f.ty.interval + 0.5 * f.ty.interval;
    const T = [typed(Math.floor(f.ty.chars / 3)), typed(Math.floor((2 * f.ty.chars) / 3)), f.enter - 0.85];
    for (const t of T) expect(t, 'probe inside the tilted window').toBeLessThan(tiltEnd);
    expect(T[1]! - f.b.t0, 'second probe is mid-typing').toBeLessThan(f.ty.t0 + f.ty.chars * f.ty.interval);
    const PAGES = 5; // per launch → 10 fresh pages per timestamp and S
    const hashes: Record<string, string[]> = {};
    for (let launchNo = 0; launchNo < 2; launchNo++) {
      const browser = await launch();
      try {
        for (let p = 0; p < PAGES; p++) for (const S of [1, 6]) for (const t of T) {
          const page = await openPage(browser, url, '/engine/page.html');
          (hashes[`S=${S} t=${t.toFixed(3)}`] ??= []).push(await hashAt(page, t, S));
          await page.close();
        }
      } finally {
        await browser.close();
      }
    }
    const spread = Object.fromEntries(Object.entries(hashes).map(([k, v]) => [k, [...new Set(v)].map((h) => `${h.slice(0, 8)}×${v.filter((x) => x === h).length}`)]));
    for (const [k, v] of Object.entries(hashes)) {
      expect(v.length, k).toBe(2 * PAGES);
      expect(new Set(v).size, `${k}: ${JSON.stringify(spread[k])}`).toBe(1);
    }
    // real, changing frames: every timestamp differs, and S=6 differs from S=1 (motion blur is live)
    expect(new Set(T.map((t) => hashes[`S=1 t=${t.toFixed(3)}`]![0])).size).toBe(T.length);
    expect(T.filter((t) => hashes[`S=1 t=${t.toFixed(3)}`]![0] !== hashes[`S=6 t=${t.toFixed(3)}`]![0]).length).toBe(T.length);
  }, 600_000);

  it('bokeh (R5): the discs sit behind the glass — inside the terminal body they change almost nothing, outside they are live', async () => {
    const f = film();
    const browser = await launch();
    try {
      const page = await openPage(browser, await serve(f));
      // per-pixel max channel diff, frame with bokeh vs the SAME frame without (S.noBokeh), split inside / outside
      // the panel body (box derived from the module's PW/PH/PCX/PCY, shrunk 60 px for the tilt, push and the bloom halo)
      const box = panelBodyBox(readFileSync(MODULE, 'utf8'));
      expect(box.x1 - box.x0 > 400 && box.y1 - box.y0 > 200, `probe box is a real panel area: ${JSON.stringify(box)}`).toBe(true);
      const diff = (t: number) => page.evaluate((t: number, box: { x0: number; x1: number; y0: number; y1: number }) => {
        const S = (window as any).SHOWREEL;
        const c = document.getElementById('stage') as HTMLCanvasElement, g = c.getContext('2d')!;
        S.noBokeh = false; S.renderAt(t, 1); const a = g.getImageData(0, 0, c.width, c.height).data;
        S.noBokeh = true; S.renderAt(t, 1); const b = g.getImageData(0, 0, c.width, c.height).data;
        S.noBokeh = false;
        let inMax = 0, inSum = 0, inN = 0, outMax = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const d = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
          if (x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) { inMax = Math.max(inMax, d); inSum += d; inN++; } else outMax = Math.max(outMax, d);
        }
        return { inMax, inMean: inSum / inN, outMax };
      }, t, box);
      for (const t of [f.hold, f.enter - 0.85, f.enter + 0.2]) {
        const r = await diff(t);
        expect(r.outMax, `t=${t}: the bokeh is drawn at all (probe live)`).toBeGreaterThan(20);
        // behind 95 %-opaque glass a disc shows at ≤ 5 % — a disc in front measured inMax ≈ 30–60
        expect(r.inMax, `t=${t}: ${JSON.stringify(r)}`).toBeLessThanOrEqual(8);
        expect(r.inMean, `t=${t}: ${JSON.stringify(r)}`).toBeLessThan(1.5);
      }
    } finally {
      await browser.close();
    }
  }, 180_000);

  it('truth: the typed command and the caption reach the screen with their exact text; manifest ⊆ resolved', async () => {
    const f = film();
    const browser = await launch();
    try {
      const page = await openPage(browser, await serve(f));
      const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
      expect(fit.b1.command).not.toBeNull();
      expect(fit.b1.caption).not.toBeNull();
      for (const t of [f.hold, f.enter + 0.6, f.b.t1 - f.b.overlapOut - FRAME]) await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), t);
      const man: { text: string; source: string; onScreen: boolean }[] = await page.evaluate(() => (window as any).SHOWREEL.manifest());
      expect(checkManifest(man, f.resolved)).toEqual([]);
      for (const it of [...f.resolved.beats.b1.slots.command.items, ...f.resolved.beats.b1.slots.caption.items]) {
        expect(man.some((m) => m.source === it.id && m.text === it.text && m.onScreen), it.id).toBe(true);
      }
    } finally {
      await browser.close();
    }
  }, 120_000);
});

// Registered only when E2E is off, so a full E2E run reports 0 skipped (Rule 12).
if (!E2E) {
  describe('cold-open-command in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run AC3 (tilted typing), bokeh and truth', () => {});
  });
}
