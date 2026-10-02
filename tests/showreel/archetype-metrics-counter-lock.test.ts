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
//   no debris    PO R5 (d): spark debris inside the locked digits made the values hard to read at the hold: the
//                spark layer must add ~0 px inside every numeral/unit box from the lock on, yet still burst;
//                and in the composited frame (engine post-FX on) sparks must not bleed light into those boxes.
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

  // PO R5 (d): spark debris sat inside the locked digits at the hold still, making the values harder to read.
  // Probe the SPARK LAYER alone: redraw one card on a bare canvas (no engine post-FX) with api.sparks live vs.
  // a no-op, and diff. Each numeral (and unit) box is the real drawn box — api.counter/api.unit wrapped to
  // measure what they just drew under the live transform (lock punch included). From the impact frame through
  // the whole decay, the sparks change ~0 px inside those boxes — and they still fly (the lock keeps its debris).
  it('PO R5 (d): no spark debris inside the counter numerals — the spark layer adds ~0 px inside every numeral/unit box from the lock on, yet still bursts around them', async () => {
    const f = film();
    const browser = await launch();
    try {
      const page = await openPage(browser, await serve(f));
      // capture each beat's draw params: the fixture's wrapper calls the module's draw by property lookup.
      // A string, not a function: vitest rewrites import() inside test-file functions (would break in the page).
      await page.evaluate(`(async () => {
        const m = (await import('/archetypes/metrics-counter-lock.mjs')).default;
        window.__mclDraw = m.draw; window.__mcl = {};
        m.draw = function (ctx, lt, p, rb, cues) { window.__mcl[p.api.beatId] = { p, rb, cues }; return window.__mclDraw.call(this, ctx, lt, p, rb, cues); };
      })()`);
      for (const bt of [f.b2, f.b3]) {
        const id = bt.b.id;
        await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), bt.hold);
        const n = f.resolved.beats[id].slots.counters.items.length as number;
        // impact (+1 frame), early decay, the 30/60 s films' hold offsets (0.1 / 0.183 s), late decay, this film's hold
        const dls = [FRAME, 0.05, 0.1, 0.183, 0.3, 0.45];
        if (bt.hold > bt.lock) dls.push(bt.hold - bt.lock);
        for (let card = 0; card < n; card++) {
          let burst = 0;
          for (const dl of dls) {
            const lt = bt.lock - bt.b.t0 + dl;
            const r = await page.evaluate((id: string, lt: number, card: number) => {
              const w = window as any;
              const { p, rb, cues } = w.__mcl[id];
              const cd = p.layout.cards[card];
              const L = { ...p.layout, label: null, cards: [cd] };
              let boxes: number[][] = [];
              const boxOf = (ctx: any, m: { width: number; ascent: number; descent: number }, x: number, y: number) => {
                const T = ctx.getTransform(), l = x - m.width / 2, r = x + m.width / 2, t = y - m.ascent, b = y + m.descent;
                const xs = [T.a * l + T.c * t + T.e, T.a * r + T.c * b + T.e], ys = [T.b * l + T.d * t + T.f, T.b * r + T.d * b + T.f];
                boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
              };
              const shot = (sparksOn: boolean) => {
                const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
                const g = c.getContext('2d')!;
                boxes = [];
                const api = {
                  ...p.api,
                  sparks: sparksOn ? p.api.sparks : () => {},
                  counter: (ctx: any, item: any, prog: number, x: number, y: number, o: any) => {
                    const out = p.api.counter(ctx, item, prog, x, y, o);
                    if (prog >= 1 && ctx.globalAlpha * (o.alpha ?? 1) > 0) boxOf(ctx, p.api.measure(ctx, item, { size: o.size, weight: o.weight }), x, y);
                    return out;
                  },
                  unit: (ctx: any, item: any, x: number, y: number, o: any) => {
                    const out = p.api.unit(ctx, item, x, y, o);
                    boxOf(ctx, p.api.measure(ctx, item, { what: 'unit', size: o.size, weight: o.weight, track: o.track }), x, y);
                    return out;
                  },
                };
                w.__mclDraw.call(null, g, lt, { ...p, layout: L, api }, rb, cues);
                return g.getImageData(0, 0, 1920, 1080).data;
              };
              const on = shot(true), off = shot(false);
              const bx = boxes.map(([x0, y0, x1, y1]) => [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)]);
              let inside = 0, outside = 0;
              for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) {
                const i = (y * 1920 + x) * 4;
                const d = Math.max(Math.abs(on[i]! - off[i]!), Math.abs(on[i + 1]! - off[i + 1]!), Math.abs(on[i + 2]! - off[i + 2]!), Math.abs(on[i + 3]! - off[i + 3]!));
                if (d <= 8) continue;
                if (bx.some(([x0, y0, x1, y1]) => x >= x0! && x < x1! && y >= y0! && y < y1!)) inside++;
                else outside++;
              }
              return { inside, outside, boxes: bx.length };
            }, id, lt, card);
            expect(r.boxes, `${id} card ${card} dl=${dl.toFixed(3)}: numeral boxes measured`).toBeGreaterThanOrEqual(1);
            expect(r.inside, `${id} card ${card} dl=${dl.toFixed(3)}: ${r.inside} px of spark debris inside the numeral/unit boxes`).toBe(0);
            if (dl <= 0.1) burst = Math.max(burst, r.outside);
          }
          // the lock still throws debris around the value: a real burst right after the impact
          expect(burst, `${id} card ${card}: spark burst area around the numerals`).toBeGreaterThan(150);
        }
      }
    } finally {
      await browser.close();
    }
  }, 240_000);

  // PO R5 (d), final frame: the probe above checks the raw spark layer; engine post-FX (bloom, glow, grain)
  // could still bleed spark light into the digits of the COMPOSITED frame. Render the full stage at the hold
  // and the 30/60 s films' hold offsets with api.sparks live vs. a no-op (everything else identical, grain is
  // frame-seeded) and require the numeral/unit boxes (manifest bboxes) to stay visually unchanged.
  it('PO R5 (d) composited: with engine post-FX, sparks barely change the numeral/unit boxes of the final frame after the lock', async () => {
    const f = film();
    const browser = await launch();
    try {
      const page = await openPage(browser, await serve(f));
      // string, not a function: vitest rewrites import() inside test-file functions (see the probe above)
      await page.evaluate(`(async () => {
        const m = (await import('/archetypes/metrics-counter-lock.mjs')).default;
        const draw = m.draw; window.__mclNoSparks = false;
        m.draw = function (ctx, lt, p, rb, cues) {
          const q = window.__mclNoSparks ? { ...p, api: { ...p.api, sparks: () => {} } } : p;
          return draw.call(this, ctx, lt, q, rb, cues);
        };
      })()`);
      for (const bt of [f.b2, f.b3]) {
        const id = bt.b.id;
        const ids = new Set<string>(f.resolved.beats[id].slots.counters.items.map((it: any) => it.id));
        const dls = [0.1, 0.183];
        if (bt.hold > bt.lock) dls.push(bt.hold - bt.lock);
        for (const dl of dls) {
          const r = await page.evaluate((t: number, ids: string[]) => {
            const w = window as any;
            const stage = document.getElementById('stage') as HTMLCanvasElement;
            const g = stage.getContext('2d')!;
            const k = stage.width / 1920;
            const shot = (noSparks: boolean) => {
              w.__mclNoSparks = noSparks;
              w.SHOWREEL.renderAt(t, 1);
              const boxes = w.SHOWREEL.manifest().filter((m: any) => m.bbox && ids.some((id) => m.source === `counter:${id}` || m.source === `unit:${id}`)).map((m: any) => m.bbox);
              return { px: g.getImageData(0, 0, stage.width, stage.height).data, boxes };
            };
            const on = shot(false), off = shot(true);
            w.__mclNoSparks = false;
            const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
            let sum = 0, n = 0, max = 0;
            for (const b of off.boxes) {
              const x0 = Math.max(0, Math.floor(b.x * k)), y0 = Math.max(0, Math.floor(b.y * k));
              const x1 = Math.min(stage.width, Math.ceil((b.x + b.w) * k)), y1 = Math.min(stage.height, Math.ceil((b.y + b.h) * k));
              for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const i = (y * stage.width + x) * 4, d = Math.abs(lum(on.px, i) - lum(off.px, i));
                sum += d; n++; max = Math.max(max, d);
              }
            }
            let changed = 0; // whole frame: proves the toggle reaches the composited sparks (test not vacuous)
            for (let i = 0; i < on.px.length; i += 4) if (Math.abs(lum(on.px, i) - lum(off.px, i)) > 8) changed++;
            return { boxes: off.boxes.length, mean: n ? sum / n : 0, max, changed };
          }, bt.lock + dl, [...ids]);
          expect(r.boxes, `${id} dl=${dl.toFixed(3)}: numeral/unit boxes in the manifest`).toBeGreaterThanOrEqual(ids.size);
          // a post-FX halo may lift a few box pixels by a level or two; a streak through a digit lifts it by 50+
          expect(r.mean, `${id} dl=${dl.toFixed(3)}: mean luminance change inside the numeral/unit boxes (max ${r.max.toFixed(1)})`).toBeLessThan(0.5);
          expect(r.max, `${id} dl=${dl.toFixed(3)}: peak luminance change inside the numeral/unit boxes`).toBeLessThan(24);
          if (dl <= 0.1) expect(r.changed, `${id} dl=${dl.toFixed(3)}: sparks visible in the composited frame`).toBeGreaterThan(150);
        }
      }
    } finally {
      await browser.close();
    }
  }, 180_000);

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
