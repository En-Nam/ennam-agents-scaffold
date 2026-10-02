import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { sheetTimes } from '../../templates/showreel/.claude/showreel/render/sheet.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';

// v1.16 showreel — metrics-counter-lock (C9, port of spike s3's slot counter), R5 fix. Why each guarantee matters:
//   palette      a non-violet film must not show violet/white literals: every colour comes from params.palette.
//   containment  the R5 sheet showed the lock rings spilling over the neighbouring cards (busy, unreadable):
//                every lock flourish must stay inside ITS OWN card. Probed per card in isolation (no engine
//                post-FX): the pixels the lock changes (lock live vs. deferred) all lie inside that card.
//   pop          containment must not kill the lock: the lock visibly changes a lot of pixels inside the card.
//   weight       the spike's single counter reads big and confident; a row of 3 short counts must not shrink to
//                a small number floating in a large card (cap height ≥ 40 % of the card height), and the grid's
//                short cards must be filled to their height fit (cap height ≥ 52 % of the 340 px card).
//   truth / fit  every counter, unit and the label reach the screen inside the safe area; manifest ⊆ resolved.
//   AC3          frames are byte-identical across fresh pages and launches at S=1 and S=6.
// The archetype is injected (wrapped, for the probe) by fixtures/archetypes/metrics-counter-lock/page.html.

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const MODULE = path.join(TOOLKIT, 'archetypes', 'metrics-counter-lock.mjs');
const FIX = path.join(HERE, 'fixtures', 'archetypes', 'metrics-counter-lock');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const FACTS = readJ(path.join(FIX, 'facts.json'));
const SPEC = ARCH.archetypes['metrics-counter-lock'];
const FPS = 60;
const FRAME = 1 / FPS;
const COUNT_IDS: string[] = FACTS.facts.filter((f: { kind: string }) => f.kind === 'count').map((f: { id: string }) => f.id);

/** 15 s film: cold open → metrics row (3 counters) → metrics grid (4 counters) → lockup. Real resolve + compile. */
function film() {
  const sb = {
    version: 1, durationS: 15, seed: 7, palette: 'violet',
    beats: [
      { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1, bindings: { command: 'f.command.1' }, phrases: { caption: 'p.open.1' }, transitionOut: 'zoom-through' },
      { id: 'b2', archetype: 'metrics-counter-lock', variant: 'row', weight: 1.25, bindings: { counters: COUNT_IDS.slice(0, 3) }, phrases: { label: 'p.metrics.3' }, transitionOut: 'cut' },
      { id: 'b3', archetype: 'metrics-counter-lock', variant: 'grid', weight: 1.25, bindings: { counters: COUNT_IDS.slice(0, 4) }, phrases: { label: 'p.metrics.2' }, transitionOut: 'cut' },
      { id: 'b4', archetype: 'lockup-cta', variant: 'center', weight: 1.5, bindings: { name: 'f.app.name.1', command: 'f.command.1' }, phrases: { cta: 'p.cta.1' }, transitionOut: 'cut' },
    ],
  };
  const resolved = resolve(sb, { archetypes: ARCH, facts: FACTS, phrases: PHRASES });
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: FPS });
  const beat = (id: string) => {
    const b = timeline.beats.find((x: { id: string }) => x.id === id);
    const lock = timeline.hits.find((h: { beatId: string; cue: string }) => h.beatId === id && h.cue === 'lock').t as number;
    const hold = sheetTimes(timeline).find((s: { beatId: string; still: string }) => s.beatId === id && s.still === 'hold').t as number;
    return { b, lock, hold, half: b.t0 + 0.5 * (b.t1 - b.t0), lastOn: b.t1 - b.overlapOut - FRAME };
  };
  return { timeline, resolved, b2: beat('b2'), b3: beat('b3') };
}

describe('metrics-counter-lock static guards (D8 text API, D9 canvas roles, palette-only colours, D10)', () => {
  const src = readFileSync(MODULE, 'utf8');

  it('exports {id, layout, draw} and archetypes.json declares row/grid with the `lock` cue', async () => {
    const mod = (await import(pathToFileURL(MODULE).href)).default;
    expect(mod.id).toBe('metrics-counter-lock');
    expect(typeof mod.layout).toBe('function');
    expect(typeof mod.draw).toBe('function');
    expect(SPEC.variants).toEqual(['row', 'grid']);
    expect(SPEC.defaultCues).toEqual([expect.objectContaining({ name: 'lock' })]);
  });

  // palette-only colours: one table-driven ban over every archetype module (engine-static.test.ts)

  it('draws text only through api.text/counter/unit and makes no canvas of its own; no clocks, no absolute seconds', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).not.toMatch(/createElement\(\s*['"]canvas|new\s+OffscreenCanvas|\.getContext\(/);
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(/);
    const hits = [...src.matchAll(/\b(t|time|lt|localT)\s*[<>=!]=?\s*(\d+(?:\.\d+)?)\b/g)].filter((m) => m[2] !== '0' && m[2] !== '1');
    expect(hits.map((m) => m[0])).toEqual([]);
    expect(src).toContain("api.cue('lock')");
  });
});

describe.skipIf(!E2E)('metrics-counter-lock in the browser (SHOWREEL_E2E=1)', () => {
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
    const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-metrics-'));
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(f.timeline));
    writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(f.resolved));
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

  it('containment (R5): every lock flourish stays inside its own card — rings, halo, sparks, flare never reach a neighbour or the gap — and the lock still pops', async () => {
    const f = film();
    const browser = await launch();
    try {
      const page = await openPage(browser, await serve(f));
      for (const bt of [f.b2, f.b3]) {
        const id = bt.b.id;
        // from the snap to the end of the flourish, including the R5 hold still
        const probes = [bt.lock + 2 * FRAME, bt.lock + 0.1, bt.hold, bt.lock + 0.3, bt.lock + 0.5].map((t) => t - bt.b.t0);
        await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), bt.hold);
        const n = (await page.evaluate((id: string) => (window as any).SHOWREEL.layout(id).cards.length, id)) as number;
        expect(n, id).toBe(f.resolved.beats[id].slots.counters.items.length);
        for (let card = 0; card < n; card++) {
          for (const lt of probes) {
            // 3 px margin: the card's own hairline border brightens on the lock (antialiased edge)
            const r = await page.evaluate((id: string, lt: number, card: number) => (window as any).SHOWREEL.probe(id, lt, card, 3), id, lt, card);
            expect(r.outside, `${id} card ${card} lt=${lt.toFixed(3)}: ${r.outside} px changed outside the card (up to ${r.far} px out)`).toBe(0);
          }
          // the pop survives containment: right after the snap the lock lights a real area of the card
          const pop = await page.evaluate((id: string, lt: number, card: number) => (window as any).SHOWREEL.probe(id, lt, card, 3), id, probes[1]!, card);
          expect(pop.inside, `${id} card ${card}: lock pop area`).toBeGreaterThan(0.15 * pop.card.w * pop.card.h);
        }
      }
    } finally {
      await browser.close();
    }
  }, 240_000);

  it('weight: short counts read big — cap height ≥ 40 % of the card (row of 3), ≥ 52 % of the 340 px grid card (grid of 4)', async () => {
    const f = film();
    const browser = await launch();
    try {
      const page = await openPage(browser, await serve(f));
      const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
      // grid cards are short (340 px): the counter must fill them up to the height fit (number + unit line),
      // not sit at a fixed small cap — 52 % fails the old 240 px cap (0.72·240/340 ≈ 0.51)
      for (const [bt, floor] of [[f.b2, 0.4], [f.b3, 0.52]] as const) {
        const id = bt.b.id;
        await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), bt.hold);
        const L = await page.evaluate((id: string) => (window as any).SHOWREEL.layout(id), id);
        expect(L.px, id).toBe(fit[id].counters);
        expect(0.72 * L.px, `${id}: px ${L.px} in ${L.cards[0].h} px cards`).toBeGreaterThanOrEqual(floor * L.cards[0].h);
      }
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('fit / clipping / truth: fit ok, nothing off-frame at progress 0.5 and the last fully-on frame, every counter + unit + label drawn with its exact text, no overlaps', async () => {
    const f = film();
    const browser = await launch();
    try {
      const page = await openPage(browser, await serve(f));
      const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
      for (const bt of [f.b2, f.b3]) {
        const id = bt.b.id;
        expect(fit[id].counters, `${id} counters fit`).not.toBeNull();
        expect(fit[id].label, `${id} label fit`).not.toBeNull();
        for (const [what, t] of [['progress 0.5', bt.half], ['last fully-on frame', bt.lastOn]] as const) {
          const drawn = await drawnAt(page, t);
          expect(drawn.length, `${id} ${what}`).toBeGreaterThan(0);
          expect(offFrame(drawn), `${id} ${what}`).toEqual([]);
        }
        const final = await drawnAt(page, bt.lastOn);
        const slots = f.resolved.beats[id].slots;
        const want = [
          ...slots.counters.items.map((it: any) => [it.id, it.text]),
          ...slots.counters.items.map((it: any) => [`unit:${it.id}`, it.unit]),
          ...slots.label.items.map((it: any) => [it.id, it.text]),
        ].sort();
        const got = final.map((m) => [m.source.startsWith('counter:') ? m.source.slice(8) : m.source, m.text]).sort();
        expect(got, id).toEqual(want);
        for (let i = 0; i < final.length; i++) for (let j = i + 1; j < final.length; j++) {
          const a = final[i]!.bbox, b = final[j]!.bbox;
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(hit, `${id}: "${final[i]!.text}" overlaps "${final[j]!.text}"`).toBe(false);
        }
      }
      expect(checkManifest(await page.evaluate(() => (window as any).SHOWREEL.manifest()), f.resolved)).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 180_000);

  it('AC3: enter / lock snap / hold / last-on hashes are identical across fresh pages and 2 launches at S=1 and S=6', async () => {
    const f = film();
    const url = await serve(f);
    const T = [f.b2.b.t0 + 0.5, f.b2.lock + 3 * FRAME, f.b2.hold, f.b3.lock + 3 * FRAME, f.b3.lastOn];
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
        result[S]!.push(byT);
      }
    }
    for (const S of [1, 6]) for (const t of T) expect(result[S]![1]![t], `S=${S} t=${t}`).toBe(result[S]![0]![t]);
    expect(new Set(T.map((t) => result[1]![0]![t])).size).toBe(T.length);
  }, 300_000);

  it('rate check: S=6 ms/frame over 60 frames around the lock, render only and with JPEG q0.97 capture', async () => {
    const f = film();
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
      }, f.b2.lock - 20 * FRAME, FRAME);
      const line = JSON.stringify({ metricsCounterLockRateS6: { renderer, msPerFrame: Math.round(ms * 10) / 10, withJpegMsPerFrame: Math.round(msJpeg * 10) / 10 } });
      console.log(line);
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
  describe('metrics-counter-lock in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run containment, weight, fit/clipping, AC3 and the rate check', () => {});
  });
}
