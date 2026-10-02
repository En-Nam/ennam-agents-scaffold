import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { rng } from '../../templates/showreel/.claude/showreel/engine/math.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';
import { familyOf } from '../../templates/showreel/.claude/showreel/engine/fonts.mjs';
import { validateStoryboard } from '../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { storyboardFromArrangement, type ArrangementBeat, type DigestFact } from './helpers/storyboard';

// v1.16 showreel engine — browser half (gated: SHOWREEL_E2E=1, SHOWREEL_TOOL_DIR=<dir with puppeteer-core +
// fontsource>, browser via SHOWREEL_BROWSER / CHROME_PATH / a known install path).
//   AC3  frames are byte-identical (RGBA SHA-256) per timestamp across fresh pages, different render
//        orders and separate browser launches, at S=1 and S=6, on the GPU path (D9 / M0 ruling).
//        Two films: the M1 fixture (4 M1 archetypes, zoom-through, cut) and an M2 film compiled from the
//        45 s arrangement (all 8 archetypes incl. the kinetic chapter card, zoom-through AND column-wipe).
//   D8   every drawn string is in the manifest and the manifest ⊆ resolved (Rule 13: the oracle is
//        proven to catch a forged draw, so a manifest that records nothing or echoes cannot pass).
//   fit  a 90-char command reports fit null → `check` fails instead of clipping (review focus 2).
//   D6   Vietnamese renders in the shipped font; ✓ is reported by glyphGaps (review focus 1).
//   GPU-less hosts are detectable from SHOWREEL.renderer (SwiftShader) → --final falls back to S=1.

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const FIX = path.join(HERE, 'fixtures', 'engine');
const TIMELINE = JSON.parse(readFileSync(path.join(FIX, 'timeline.json'), 'utf8'));
const RESOLVED = JSON.parse(readFileSync(path.join(FIX, 'resolved.json'), 'utf8'));
const FRAME = 1 / TIMELINE.fps;

// M2 film (Task 7): the 45 s recommended arrangement (C15) — every archetype, two chapter cards, two
// column-wipes, four zoom-throughs — bound to synthetic facts through the PRODUCTION validate → resolve →
// compile path, so the cue-map hit names/times are the compiler's, never hand-written.
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const ARRANGEMENT_45: ArrangementBeat[] = readJ(path.join(TOOLKIT, 'archetypes', 'arrangements.json')).arrangements['45'];
function synthFact(kind: string, n: number, display: string, extra: Record<string, unknown> = {}) {
  return {
    id: `f.${kind}.${n}`, kind, value: display as unknown, display, unit: null as string | null,
    source: { file: 'synthetic', locator: `${kind}/${n}`, extractor: 'test', rule: 'synthetic' },
    hash: 'sha256:0000000000000000', ...extra,
  };
}
const M2_FACTS = {
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
function buildM2Film() {
  const digest: DigestFact[] = M2_FACTS.facts.map((f) => ({ id: f.id, kind: f.kind, display: f.display, unit: f.unit }));
  const sb = storyboardFromArrangement(digest, 45, ARRANGEMENT_45, ARCH, PHRASES);
  const inputs = { archetypes: ARCH, facts: M2_FACTS, phrases: PHRASES };
  const errors = validateStoryboard(sb, inputs);
  const resolved = resolve(sb, inputs);
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: 60 });
  return { sb, errors, resolved, timeline };
}
const M2 = buildM2Film();

type Item = { id: string; text: string; number: number | null; unit: string | null };
type Resolved = { beats: Record<string, { archetype: string; slots: Record<string, { items: Item[] }> }> };
type Entry = { text: string; source: string | null };
/* eslint-disable @typescript-eslint/no-explicit-any */
type Browser = any;
type Page = any;

const BROWSER_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

// Oracle for manifest ⊆ resolved = Task 3's lib/truth/manifest.mjs checkManifest — the SAME function `check`/
// `verify` use, so a source the engine records but the pipeline rejects (e.g. `unit:<factId>`) fails here too.

describe('AC3 M2 film (hermetic precondition of the gated AC3 run)', () => {
  it('the 45 s arrangement film validates and covers all 8 archetypes, the chapter variant and both overlap transitions', () => {
    expect(M2.errors).toEqual([]);
    const archs = new Set(M2.timeline.beats.map((b: any) => b.archetype));
    expect([...archs].sort()).toEqual(Object.keys(ARCH.archetypes).sort());
    expect(M2.timeline.beats.some((b: any) => b.archetype === 'kinetic-text' && b.variant === 'chapter')).toBe(true);
    const outs = new Set(M2.timeline.beats.filter((b: any) => b.overlapOut > 0).map((b: any) => b.transitionOut));
    expect([...outs].sort()).toEqual(['column-wipe', 'zoom-through']);
  });
});

describe.skipIf(!E2E)('showreel engine in the browser (SHOWREEL_E2E=1)', () => {
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

  /** temp build dir with the fixture (optionally mutated; default the M1 film) + a server for it */
  async function serve(mutate?: (tl: any, rs: any) => void, film: { timeline: any; resolved: any } = { timeline: TIMELINE, resolved: RESOLVED }) {
    const tl = structuredClone(film.timeline), rs = structuredClone(film.resolved);
    mutate?.(tl, rs);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-engine-'));
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(tl));
    writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(rs));
    const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => srv.close());
    return { url: srv.url, resolved: rs as Resolved };
  }
  const launch = (extra: string[] = []): Promise<Browser> =>
    puppeteer.launch({ executablePath: exe, headless: true, args: [...launchArgs(), ...extra] });

  async function openPage(browser: Browser, url: string): Promise<Page> {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.goto(`${url}/engine/page.html`, { waitUntil: 'load' });
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

  // M1 film — 13 timestamps over the 4 M1 archetypes (+ both variants of kinetic-text and metrics), both
  // zoom-through overlaps, both sides of a cut, the ENTER impact (chromatic-aberration path), the lockup slam
  // (blur-filtered TITLE cache sprites — the M0 root cause) and the lockup sweep (scratch-layer re-light).
  const B = Object.fromEntries(TIMELINE.beats.map((b: any) => [b.id, b]));
  const mid = (id: string) => (B[id].t0 + B[id].t1) / 2;
  const T = [
    TIMELINE.hits[0].t + 3 * FRAME, // b1 ENTER impact
    (B.b2.t0 + B.b1.t1) / 2, // zoom-through b1→b2
    mid('b2'),
    B.b3.t0 - FRAME, // last frame before the cut b2|b3
    B.b3.t0, // first frame after the cut
    mid('b3'),
    (B.b4.t0 + B.b3.t1) / 2, // zoom-through b3→b4
    mid('b4'),
    mid('b5'),
    mid('b6'),
    B.b8.t0 + 0.8, // lockup just after the slam
    TIMELINE.hits.find((h: any) => h.cue === 'sweep').t + 2 * FRAME, // lockup light sweep
    TIMELINE.hits.find((h: any) => h.beatId === 'b4').t + FRAME, // kinetic punch slam: ~240 device-px glyphs
  ]; // (large GPU glyphs were order-dependent until text.mjs moved them to CPU sprites — this pins that)

  // M2 film (45 s arrangement) — every M2 archetype at a hold AND at a signature hit (step lock, converge
  // implosion, layer thud, card snap, orbit ignite), both chapter cards, both column-wipe overlaps and the
  // zoom-throughs out of flow-graph and card-carousel.
  const M2B = M2.timeline.beats as any[];
  const by = (arch: string, variant?: string, nth = 0) => M2B.filter((b) => b.archetype === arch && (!variant || b.variant === variant))[nth]!;
  const m2mid = (b: any) => (b.t0 + b.t1) / 2;
  const m2hit = (b: any, cue: string) => {
    const h = M2.timeline.hits.find((x: any) => x.beatId === b.id && x.cue === cue);
    if (!h) throw new Error(`M2 film: no hit "${cue}" in ${b.id} (${b.archetype})`);
    return h.t as number;
  };
  const overlapMid = (b: any) => { const n = M2B[M2B.indexOf(b) + 1]; return (n.t0 + b.t1) / 2; };
  const wipes = M2B.filter((b) => b.transitionOut === 'column-wipe' && b.overlapOut > 0);
  const zooms = M2B.filter((b) => b.transitionOut === 'zoom-through' && b.overlapOut > 0);
  const flow = by('flow-graph'), stack = by('layered-stack'), cards = by('card-carousel'), orbit = by('orbit-network');
  const T2 = [
    m2mid(by('kinetic-text', 'chapter', 0)), // chapter card hold
    m2hit(by('kinetic-text', 'chapter', 1), 'line') + 2 * FRAME, // second chapter card: title landing on its cue
    overlapMid(wipes[0]), // column-wipe #1
    overlapMid(wipes[1]), // column-wipe #2
    overlapMid(zooms.find((b) => b.archetype === 'flow-graph')), // zoom-through flow-graph → next
    overlapMid(zooms.find((b) => b.archetype === 'card-carousel')), // zoom-through card-carousel → next
    m2hit(flow, 'step.2') + 2 * FRAME, // flow-graph step lock (ring + sparks)
    m2hit(flow, 'converge') + 3 * FRAME, // flow-graph implosion core
    m2mid(stack), // layered-stack hold
    m2hit(stack, 'layer.1') + 2 * FRAME, // layered-stack slab thud
    m2mid(cards), // card-carousel (fan) hold
    m2hit(cards, 'card.2') + 2 * FRAME, // card-carousel card snap
    m2hit(orbit, 'ignite') + 3 * FRAME, // orbit-network brain-core ignite
    m2mid(orbit), // orbit-network hold: badges orbiting, packets
  ];
  type Shot = { film: 'm1' | 'm2'; t: number };
  const SHOTS: Shot[] = [...T.map((t) => ({ film: 'm1' as const, t })), ...T2.map((t) => ({ film: 'm2' as const, t }))];
  const shuffled = (seed: number) => { const r = rng(seed); return SHOTS.map((_, i) => [r(), i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i); };

  it('AC3: RGBA SHA-256 per timestamp is identical across fresh pages, 2 orders, 2 launches, at S=1 and S=6 (all 8 archetypes, both transitions)', async () => {
    const urls = { m1: (await serve()).url, m2: (await serve(undefined, M2)).url };
    expect(SHOTS.length).toBeGreaterThanOrEqual(16);
    for (const t of T2) expect(Number.isFinite(t), 'every M2 timestamp resolved from the compiled timeline').toBe(true);
    const orders = [shuffled(11), shuffled(23)];
    expect(orders[0]).not.toEqual(orders[1]);
    // the orders interleave the films: fresh pages of BOTH films share one browser in every launch
    expect(new Set(orders[0]!.slice(0, 8).map((i) => SHOTS[i]!.film)).size).toBe(2);
    const result: Record<number, string[][]> = { 1: [], 6: [] };
    let renderer = '';
    for (const S of [1, 6]) {
      for (const order of orders) {
        const browser = await launch();
        const byShot: string[] = [];
        try {
          for (const i of order) {
            const page = await openPage(browser, urls[SHOTS[i]!.film]);
            renderer ||= await page.evaluate(() => (window as any).SHOWREEL.renderer);
            byShot[i] = await hashAt(page, SHOTS[i]!.t, S);
            await page.close();
          }
        } finally {
          await browser.close();
        }
        result[S]!.push(byShot);
      }
    }
    console.log(JSON.stringify({ ac3: { renderer, shots: SHOTS, S1: result[1]![0], S6: result[6]![0] } }));
    if (/SwiftShader/i.test(renderer)) console.warn('[AC3] ran on SwiftShader, NOT the GPU path — rerun on a GPU host for the M1 evidence');
    for (const S of [1, 6]) SHOTS.forEach((s, i) => expect(result[S]![1]![i], `S=${S} ${s.film} t=${s.t}`).toBe(result[S]![0]![i]));
    // the frames actually change over time and with motion blur (a blank or frozen renderer cannot pass)
    expect(new Set(result[1]![0]).size).toBe(SHOTS.length);
    expect(SHOTS.filter((_, i) => result[1]![0]![i] !== result[6]![0]![i]).length).toBeGreaterThanOrEqual(SHOTS.length - 2);
  }, 1_200_000);

  it('AC3: a page that has read back many frames still hashes like a fresh page (GPU backing stays pinned)', async () => {
    // Chrome de-accelerates a canvas after ~100 getImageData readbacks unless willReadFrequently is EXPLICITLY
    // false; the GPU→CPU backing switch changes the pixels (M0 failure class). Measured: with the default
    // context this test fails (different hash after 120 reads); with makeCanvas' explicit false it passes.
    const { url } = await serve();
    const t = mid('b3');
    const browser = await launch();
    try {
      const fresh = await hashAt(await openPage(browser, url), t, 6);
      const page = await openPage(browser, url);
      for (let i = 0; i < 120; i++) await hashAt(page, T[i % T.length], 1);
      expect(await hashAt(page, t, 6)).toBe(fresh);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('manifest ⊆ resolved after rendering every beat midpoint and end; the oracle catches a forged draw', async () => {
    const { url, resolved } = await serve();
    const browser = await launch();
    try {
      const page = await openPage(browser, url);
      for (const b of TIMELINE.beats) for (const t of [(b.t0 + b.t1) / 2, b.t1 - FRAME]) await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), t);
      const manifest: Entry[] = await page.evaluate(() => (window as any).SHOWREEL.manifest());
      expect(checkManifest(manifest, resolved)).toEqual([]);
      // every resolved item (and every unit) reached the screen — an engine that draws nothing passes ⊆ trivially
      const sources = new Set(manifest.map((m) => m.source));
      for (const [beatId, b] of Object.entries(resolved.beats)) for (const [slot, s] of Object.entries(b.slots)) for (const it of s.items) {
        expect(sources.has(it.id), `${beatId}.${slot} ${it.id} never drawn`).toBe(true);
        if (it.unit) expect(sources.has('unit:' + it.id), `${beatId}.${slot} unit of ${it.id} never drawn`).toBe(true);
      }
      // counters rolled through intermediate integers before locking (the roll is real, not a static display)
      expect(manifest.some((m) => m.source === 'counter:f.count.1' && Number(m.text) < 42)).toBe(true);
      // Rule 13: the manifest records what was DRAWN. A draw of altered text under a real id must surface.
      // (string expression: vitest would rewrite a dynamic import() inside a serialised function)
      await page.evaluate(`(async () => {
        const m = await import('/engine/text.mjs');
        const c = document.getElementById('stage').getContext('2d');
        m.text(c, { id: 'f.command.1', text: 'npm run deploy --prod', number: null, unit: null }, 0, 0);
        m.counter(c, { id: 'f.count.1', text: '42', number: 43, unit: 'routes' }, 0.999, 0, 0);
      })()`);
      const forged = checkManifest(await page.evaluate(() => (window as any).SHOWREEL.manifest()), resolved);
      expect(forged).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: 'npm run deploy --prod', source: 'f.command.1', reason: 'mismatch' }),
        expect.objectContaining({ text: '43', source: 'counter:f.count.1', reason: 'out-of-range' }),
      ]));
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('textfit: every slot gets a size; a 90-char command reports null for that slot (no silent clip)', async () => {
    const long = 'npx --yes @acme/super-long-scoped-package-name@latest init --template enterprise --force-x';
    expect(long.length).toBe(90);
    const ok = await serve();
    const tooLong = await serve((_tl, rs) => {
      rs.beats.b1.slots.command.items[0].text = long;
      rs.beats.b8.slots.command.items[0].text = long;
    });
    const browser = await launch();
    try {
      const fitOk = await (await openPage(browser, ok.url)).evaluate(() => (window as any).SHOWREEL.fit());
      for (const [beatId, b] of Object.entries(ok.resolved.beats)) for (const [slot, s] of Object.entries(b.slots)) {
        if (!s.items.length) continue;
        // per-family floor (display 28, mono 22): display text must never slide down to the mono floor
        expect(fitOk[beatId]?.[slot], `${beatId}.${slot}`).toBeGreaterThanOrEqual(familyOf(s.items[0]) === 'mono' ? 22 : 28);
      }
      const page = await openPage(browser, tooLong.url);
      const fitLong = await page.evaluate(() => (window as any).SHOWREEL.fit());
      expect(fitLong.b1.command).toBeNull();
      expect(fitLong.b8.command).toBeNull();
      expect(fitLong.b1.caption).toBe(fitOk.b1.caption); // only the offending slot fails
      await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), mid('b1')); // still renders (check, not render, fails)
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('textfit: a code-extracted unit too wide for its counter card reports null for the slot (no silent clip)', async () => {
    const longUnit = 'end-to-end integration scenario'.slice(0, 30);
    expect(longUnit.length).toBe(30);
    // 4-counter row: the narrowest card. Control proves the null comes from the unit, not from 4 counters.
    const four = (unitOf3: string) => (_tl: any, rs: any) => {
      const it = rs.beats.b3.slots.counters.items;
      it.push({ id: 'f.count.4', text: '7', number: 7, unit: 'pages' }, { id: 'f.count.5', text: '3', number: 3, unit: unitOf3 });
    };
    const ok = await serve(four('hooks'));
    const bad = await serve(four(longUnit));
    const browser = await launch();
    try {
      const fitOk = await (await openPage(browser, ok.url)).evaluate(() => (window as any).SHOWREEL.fit());
      expect(fitOk.b3.counters).toBeGreaterThanOrEqual(28);
      const page = await openPage(browser, bad.url);
      const fitBad = await page.evaluate(() => (window as any).SHOWREEL.fit());
      expect(fitBad.b3.counters).toBeNull();
      expect(fitBad.b3.label).toBe(fitOk.b3.label); // only the offending slot fails
      expect(fitBad.b5.counters).toBe(fitOk.b5.counters); // and only in its beat
      await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), mid('b3')); // still renders
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('glyphs: Vietnamese app name renders in Showreel Display; only ✓ is reported, naming beat and slot', async () => {
    const vi = await serve((_tl, rs) => { rs.beats.b8.slots.name.items[0].text = 'Ứng dụng Én Nam ✓'; });
    const plain = await serve();
    const browser = await launch();
    try {
      expect(await (await openPage(browser, plain.url)).evaluate(() => (window as any).SHOWREEL.glyphGaps())).toEqual([]);
      const page = await openPage(browser, vi.url);
      expect(await page.evaluate(() => (window as any).SHOWREEL.glyphGaps())).toEqual([{ char: '✓', beatId: 'b8', slot: 'name' }]);
      const loaded = await page.evaluate(() => [...(document as any).fonts].filter((f: FontFace) => f.status === 'loaded').map((f: FontFace) => f.family));
      expect(loaded.filter((f: string) => /Showreel Display/.test(f)).length).toBe(3); // vietnamese + latin-ext + latin
      expect(loaded.filter((f: string) => /Showreel Mono/.test(f)).length).toBe(6);
      expect(await page.evaluate(() => document.fonts.check('700 40px "Showreel Display"', 'Ứng dụng Én Nam'))).toBe(true);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('GPU-less detection: with --disable-gpu the renderer string names SwiftShader', async () => {
    const { url } = await serve();
    const cpu = await launch(['--disable-gpu']);
    const gpu = await launch();
    try {
      const rCpu: string = await (await openPage(cpu, url)).evaluate(() => (window as any).SHOWREEL.renderer);
      const rGpu: string = await (await openPage(gpu, url)).evaluate(() => (window as any).SHOWREEL.renderer);
      console.log(JSON.stringify({ renderer: { default: rGpu, disableGpu: rCpu } }));
      expect(rCpu).toMatch(/SwiftShader/);
      expect(rGpu.length).toBeGreaterThan(0);
    } finally {
      await cpu.close();
      await gpu.close();
    }
  }, 120_000);

  it('rate check: S=6 ms/frame per archetype (60 frames mid-beat), all 8 archetypes, logged for the commit body', async () => {
    const browser = await launch();
    const rates: Record<string, number> = {};
    const jpeg: Record<string, number> = {};
    let real: string[] = [];
    try {
      for (const film of [{ timeline: TIMELINE, resolved: RESOLVED }, M2]) {
        const { url, resolved } = await serve(undefined, film);
        const page = await openPage(browser, url);
        real = await page.evaluate("import('/archetypes/index.mjs').then((m) => Object.keys(m.ARCHETYPES))");
        for (const b of film.timeline.beats) {
          const arch = resolved.beats[b.id].archetype;
          if (rates[arch] !== undefined) continue;
          const t0 = (b.t0 + b.t1) / 2 - 30 * FRAME;
          // render-only (1-px readback as a GPU flush) and render + production JPEG q0.97 capture
          const [ms, msJpeg] = await page.evaluate((t0: number, f: number) => {
            const stage = document.getElementById('stage') as HTMLCanvasElement;
            const c = stage.getContext('2d')!;
            const now = () => performance.now();
            (window as any).SHOWREEL.renderAt(t0, 6); c.getImageData(0, 0, 1, 1); // warm-up
            let s = now();
            for (let i = 0; i < 60; i++) { (window as any).SHOWREEL.renderAt(t0 + i * f, 6); c.getImageData(0, 0, 1, 1); }
            const render = (now() - s) / 60;
            s = now();
            for (let i = 0; i < 60; i++) { (window as any).SHOWREEL.renderAt(t0 + i * f, 6); stage.toDataURL('image/jpeg', 0.97); }
            return [render, (now() - s) / 60];
          }, t0, FRAME);
          rates[arch] = Math.round(ms * 10) / 10;
          jpeg[arch] = Math.round(msJpeg * 10) / 10;
        }
        await page.close();
      }
      console.log(JSON.stringify({ rateS6msPerFrame: rates, rateS6withJpegMsPerFrame: jpeg, realArchetypes: real }));
      expect(Object.keys(rates).sort()).toEqual([...real].sort()); // every shipped archetype was measured
      for (const v of Object.values(rates)) expect(v).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, 300_000);
});

// Registered only when E2E is off: a full E2E run must report 0 skipped (Rule 12), so a
// skipped real case can never hide behind this placeholder.
if (!E2E) {
  describe('showreel engine in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run AC3 determinism, manifest, textfit, glyphs, GPU-less', () => {});
  });
}
