import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { captureJpeg } from '../../templates/showreel/.claude/showreel/render/frames.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';

// v1.16 showreel M2 Task 2 — flow-graph archetype (port of spike s2 part B: install flow graph, the chosen path
// lights step by step, the graph implodes to a point). What these tests protect:
//   (a) no clipping: 3 / 5 / 6 steps of near-maxChars (26–28 char) facts — display AND mono, including a
//       W-heavy display string — fit at or above the family minimum (fit not null) and every drawn text box
//       stays inside the 48 px safe margin at local progress 0.5, at the hold, and on the last fully-on frame.
//       A clipped label is a broken film that `check` would not catch; a null fit fails `check` loudly instead.
//   (b) determinism (D9): same RGBA hash per timestamp across fresh pages and render orders, at S=1 and S=6.
//   (c) truth (D8 / Rule 13): every resolved step + lead reaches the screen by the hold frame, and the
//       manifest ⊆ resolved (the archetype draws only resolved items).
//   (d) palette-only colours + engine-only text: hex literals and fillText/strokeText are banned in the file,
//       so a palette other than violet (the chain film runs on amber) recolours the whole beat.
// Gated: SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR). The browser cases boot fixtures/archetypes/flow-graph/page.html, a
// test copy of engine/page.html that injects the module and exposes the layouts() probe the R5 scale test reads.
// flow-graph is registered in archetypes/index.mjs (Task 7); the N-matrix renders it through the shipped page.

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const FIX = path.join(HERE, 'fixtures', 'archetypes', 'flow-graph');
const SRC = path.join(TOOLKIT, 'archetypes', 'flow-graph.mjs');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const FACTS = readJ(path.join(FIX, 'facts.json'));
const FPS = 60;
const SAFE = { W: 1920, H: 1080, margin: 48 };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Browser = any;
type Page = any;
type Entry = { text: string; source: string; bbox: { x: number; y: number; w: number; h: number } | null; onScreen?: boolean };

// min / typical (ceil of 3..6 midpoint = 5) / max step counts, each with near-maxChars facts
const STEP_SETS = {
  b2: ['f.feature.1', 'f.route.1', 'f.command.2'],
  b3: ['f.feature.2', 'f.stack.item.1', 'f.feature.3', 'f.route.2', 'f.feature.4'],
  b4: ['f.feature.2', 'f.feature.3', 'f.route.1', 'f.feature.4', 'f.command.2', 'f.feature.1'],
} as const;
const FLOW_BEATS = Object.keys(STEP_SETS) as (keyof typeof STEP_SETS)[];
// short real-world labels (stack names, a short route/command): the fit has room, so labels must grow past the
// near-maxChars size instead of staying small in a mostly empty frame (R5: "reads small and sparse")
const SHORT_SETS: Record<keyof typeof STEP_SETS, string[]> = {
  b2: ['f.stack.item.2', 'f.feature.5', 'f.command.3'],
  b3: ['f.stack.item.2', 'f.stack.item.3', 'f.route.3', 'f.feature.6', 'f.command.3'],
  b4: ['f.stack.item.2', 'f.stack.item.3', 'f.stack.item.4', 'f.feature.5', 'f.route.3', 'f.command.3'],
};

type Cue = { name: string; at: number; kind: string; amp: number };
function storyboard(variant: 'converge' | 'chain', palette: string, b3Cues: Cue[] = [], sets: Record<keyof typeof STEP_SETS, readonly string[]> = STEP_SETS) {
  const flow = (id: keyof typeof STEP_SETS, lead: string | null, transitionOut: string) => ({
    id, archetype: 'flow-graph', variant, weight: 1.25, bindings: { steps: [...sets[id]] },
    ...(lead ? { phrases: { lead } } : {}), transitionOut,
    ...(id === 'b3' && b3Cues.length ? { cues: b3Cues } : {}),
  });
  return {
    version: 1, durationS: 15, seed: 7, palette,
    beats: [
      { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1, bindings: { command: 'f.command.1' }, transitionOut: 'zoom-through' },
      flow('b2', null, 'cut'),
      flow('b3', 'p.flow.3', 'cut'),
      flow('b4', 'p.flow.2', 'zoom-through'),
      { id: 'b5', archetype: 'lockup-cta', variant: 'center', weight: 1.5, bindings: { name: 'f.app.name.1', command: 'f.command.1' }, transitionOut: 'cut' },
    ],
  };
}

function build(variant: 'converge' | 'chain', palette: string, b3Cues: Cue[] = [], sets: Record<keyof typeof STEP_SETS, readonly string[]> = STEP_SETS) {
  const sb = storyboard(variant, palette, b3Cues, sets);
  const resolved = resolve(sb, { archetypes: ARCH, facts: FACTS, phrases: PHRASES });
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: FPS });
  return { sb, resolved, timeline };
}

const frameAt = (t: number) => Math.round(t * FPS) / FPS;
// C14 override by full name: b3's step.1 (default cue-map at = 0.15 + 0.45 * 1/4 = 0.2625) moved later. Overrides
// must keep the map in index order (validate + compile refuse a scrambled reveal), so step.2 and step.3 move along
// (defaults 0.375 / 0.4875; step.4 stays at 0.6)
const STEP1_LATE: Cue[] = [
  { name: 'step.1', at: 0.42, kind: 'snap', amp: 0.3 },
  { name: 'step.2', at: 0.47, kind: 'snap', amp: 0.3 },
  { name: 'step.3', at: 0.53, kind: 'snap', amp: 0.3 },
];
/** key local moments of a flow beat, in global seconds on the frame grid */
function moments(timeline: any, id: string) {
  const b = timeline.beats.find((x: any) => x.id === id);
  const grid = 15 / timeline.music.bpm;
  const hits = timeline.hits.filter((h: any) => h.beatId === id);
  const steps = hits.filter((h: any) => /^step\.\d+$/.test(h.cue)).map((h: any) => h.t);
  const converge = hits.find((h: any) => h.cue === 'converge').t;
  const lastStep = Math.max(...steps);
  return {
    b, steps, converge, lastStep,
    mid: frameAt(b.t0 + 0.5 * (b.t1 - b.t0)),
    hold: frameAt(lastStep + 0.5 * (converge - 4 * grid - lastStep)),
    // last frame on which this beat is alone on screen (before its outgoing transition overlap starts)
    lastOn: (Math.ceil((b.t1 - b.overlapOut) * FPS - 1e-6) - 1) / FPS,
  };
}

describe('flow-graph — static guarantees (C13, review focus 4)', () => {
  const src = readFileSync(SRC, 'utf8');
  // palette-only colours: one table-driven ban over every archetype module (engine-static.test.ts)

  it('no fillText/strokeText and no canvas creation outside the engine factory', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).not.toMatch(/createElement\(\s*['"]canvas|new\s+OffscreenCanvas|\.getContext\(/);
  });
  it('reads its step cues from the cue map (step.<i>) and its converge cue, never absolute seconds', () => {
    expect(src).toMatch(/api\.cue\(`step\.\$\{i\}`\)/);
    expect(src).toMatch(/api\.cue\('converge'\)/);
    expect(src).not.toMatch(/cues(\[[^\]]+\]|\.\w+)\s*\?\?/); // no `cues[x] ?? re-derived schedule` (drifts from the score)
  });
  it('the fixture storyboards resolve and compile: one step.<i> hit per bound step, converge after the last', () => {
    for (const v of ['converge', 'chain'] as const) {
      const { timeline } = build(v, 'violet');
      for (const id of FLOW_BEATS) {
        const m = moments(timeline, id);
        expect(m.steps.length, `${v} ${id}`).toBe(STEP_SETS[id].length);
        expect(m.converge, `${v} ${id}`).toBeGreaterThan(m.lastStep);
        expect(m.hold, `${v} ${id}`).toBeGreaterThan(m.lastStep);
        expect(m.hold, `${v} ${id}`).toBeLessThan(m.converge);
      }
    }
  });
  it('fixture texts are near maxChars (26–28 code points), so (a) exercises the widest legal labels', () => {
    const max = ARCH.archetypes['flow-graph'].slots.steps.maxChars;
    const byId = new Map(FACTS.facts.map((f: any) => [f.id, f.display]));
    for (const id of FLOW_BEATS) for (const f of STEP_SETS[id]) {
      const n = [...(byId.get(f) as string)].length;
      expect(n, f).toBeLessThanOrEqual(max);
      expect(n, f).toBeGreaterThanOrEqual(max - 2);
    }
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

describe.skipIf(!E2E)('flow-graph in the browser (SHOWREEL_E2E=1)', () => {
  let puppeteer: any;
  let exe: string;
  let browser: Browser;
  const cleanups: (() => Promise<void> | void)[] = [];
  const films: Record<string, { url: string; resolved: any; timeline: any }> = {};
  const FILMS = [
    ['converge', 'violet', 'converge', [], STEP_SETS], ['chain', 'amber', 'chain', [], STEP_SETS], ['late', 'violet', 'converge', STEP1_LATE, STEP_SETS],
    ['shortConverge', 'violet', 'converge', [], SHORT_SETS], ['shortChain', 'amber', 'chain', [], SHORT_SETS],
  ] as const;

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const found = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...BROWSER_CANDIDATES].find((p) => p && existsSync(p));
    if (!found) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    exe = found;
    const mod = await loadDep('puppeteer-core', process.cwd());
    puppeteer = mod.default ?? mod;
    for (const [name, palette, variant, cues, sets] of FILMS) {
      const { resolved, timeline } = build(variant, palette, [...cues], sets);
      const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-flow-graph-'));
      writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline));
      writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(resolved));
      copyFileSync(path.join(FIX, 'page.html'), path.join(dir, 'page.html'));
      const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
      cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => srv.close());
      films[name] = { url: srv.url, resolved, timeline };
    }
    browser = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs() });
    cleanups.push(() => browser.close());
  }, 180_000);
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  }, 120_000);

  async function openPage(url: string): Promise<Page> {
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
  const renderManifest = async (page: Page, t: number): Promise<Entry[]> => {
    await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), t);
    return page.evaluate(() => (window as any).SHOWREEL.manifest());
  };
  const hashAt = (page: Page, t: number, S: number): Promise<string> =>
    page.evaluate(async (t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const h = await crypto.subtle.digest('SHA-256', d);
      return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }, t, S);

  for (const variant of ['converge', 'chain'] as const) {
    it(`(a) ${variant}: 3/5/6 near-maxChars steps fit (not null) and stay inside the safe area at progress 0.5, the hold and the last fully-on frame`, async () => {
      const { url, timeline, resolved } = films[variant];
      const page = await openPage(url);
      try {
        const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
        for (const id of FLOW_BEATS) {
          expect(fit[id].steps, `${id} steps fit`).not.toBeNull();
          // one px for the whole slot: every set mixes display facts in, so the shared px must hold the
          // DISPLAY minimum (28) — a mono-driven 27 px would draw the display labels below their floor
          expect(fit[id].steps, `${id} steps px ≥ display min`).toBeGreaterThanOrEqual(28);
          // b2 binds no lead, b3 / b4 bind one: assert presence first, so the conditional fit check cannot pass
          // silently if resolve() ever dropped a lead
          expect(resolved.beats[id].slots.lead.items.length, `${id} lead resolved`).toBe(id === 'b2' ? 0 : 1);
          if (resolved.beats[id].slots.lead.items.length) expect(fit[id].lead, `${id} lead fit`).not.toBeNull();
          const m = moments(timeline, id);
          for (const [name, t] of [['mid', m.mid], ['hold', m.hold], ['lastOn', m.lastOn]] as const) {
            const man = await renderManifest(page, t);
            const drawn = man.filter((e) => e.bbox);
            expect(offFrame(drawn, SAFE), `${variant} ${id} ${name} t=${t}`).toEqual([]);
            if (name === 'hold') {
              // the oracle judged real boxes: every step of this beat is on screen at the hold, with a box
              for (const f of STEP_SETS[id]) expect(drawn.some((e) => e.source === f), `${id} ${f} has a box at the hold`).toBe(true);
            }
          }
        }
      } finally {
        await page.close();
      }
    }, 120_000);

    it(`(c) ${variant}: every resolved step + lead is in the manifest by the hold frame; manifest ⊆ resolved`, async () => {
      const { url, timeline, resolved } = films[variant];
      const page = await openPage(url);
      try {
        for (const id of FLOW_BEATS) await renderManifest(page, moments(timeline, id).hold);
        const man: Entry[] = await page.evaluate(() => (window as any).SHOWREEL.manifest());
        // on screen in a rendered frame (onScreen), not merely recorded: sprite text is recorded at layout boot
        const sources = new Set(man.filter((e) => e.onScreen === true).map((e) => e.source));
        // the expected leads are really resolved (b2 none, b3 / b4 one), so the loop below cannot skip them silently
        expect(FLOW_BEATS.map((id) => resolved.beats[id].slots.lead.items.length)).toEqual([0, 1, 1]);
        for (const id of FLOW_BEATS) for (const [slot, s] of Object.entries(resolved.beats[id].slots) as [string, any][]) {
          for (const item of s.items) expect(sources.has(item.id), `${id}.${slot} ${item.id} drawn by the hold`).toBe(true);
        }
        // every manifest text is exactly the resolved text for its id (Rule 13)
        expect(checkManifest(man, resolved)).toEqual([]);
      } finally {
        await page.close();
      }
    }, 120_000);
  }

  it('cue binding: overriding step.1 by name (C14) moves when step.1 appears — draw() follows the cue map, not its fallback', async () => {
    const def = moments(films.converge.timeline, 'b3'), late = moments(films.late.timeline, 'b3');
    const grid = 15 / films.converge.timeline.music.bpm;
    // precondition: the override really moved the compiled hit by >= 3 GRID (else the probe proves nothing)
    expect(late.steps[1]! - def.steps[1]!).toBeGreaterThanOrEqual(3 * grid - 1e-6);
    const probe = frameAt(def.steps[1]! + 1 / FPS), after = frameAt(late.steps[1]! + 1 / FPS);
    const step1 = STEP_SETS.b3[1];
    const has = async (film: string, t: number) => {
      const page = await openPage(films[film]!.url);
      try { return (await renderManifest(page, t)).some((e) => e.source === step1 && e.bbox); } finally { await page.close(); }
    };
    // default film: step.1's label is on screen just after its default hit
    expect(await has('converge', probe), 'default: step.1 label drawn at its hit').toBe(true);
    // overridden film, same instant: the node has not popped yet (pop = step.1 - 2 GRID > probe) — a draw()
    // that ignored cues["step.1"] (typo, discarded value, fallback) would still draw it here
    expect(await has('late', probe), 'override: step.1 label NOT drawn before its moved hit').toBe(false);
    expect(await has('late', after), 'override: step.1 label drawn at its moved hit').toBe(true);
  }, 120_000);

  // R5 (spike A s2 vs M2): M2 read small and sparse — tiny labels, a narrow graph in a mostly empty frame, and grey
  // skeleton boxes that looked like missing labels. What this pins, per flow beat (3 / 5 / 6 steps, both variants):
  //   - the step pills span ≥ 65% of the frame width, also when every label is short (no narrow cluster);
  //   - short labels take the room the fit allows (≥ 40 px, well above the 28 px display floor), and still sit
  //     inside the safe area at progress 0.5, the hold and the last fully-on frame;
  //   - the paths not taken are boxless branches (zero-size port geometry), at least one per step, so nothing on
  //     screen reads as an empty label slot; the chain variant draws none.
  //   - converge: nodes + branches span ≥ VFILL_MIN of the frame height (measured pre-fix: see VFILL_MIN).
  const VFILL_MIN = 0.6;
  it('R5 scale: graph spans ≥ 65% of the frame, short labels grow to the fit, paths not taken are boxless branches', async () => {
    for (const name of ['converge', 'chain', 'shortConverge', 'shortChain'] as const) {
      const { url, timeline } = films[name]!;
      const short = name.startsWith('short'), chain = name.endsWith('hain');
      const page = await openPage(url);
      try {
        for (const id of FLOW_BEATS) {
          const m = moments(timeline, id);
          for (const [when, t] of [['mid', m.mid], ['hold', m.hold], ['lastOn', m.lastOn]] as const) {
            const drawn = (await renderManifest(page, t)).filter((e) => e.bbox);
            if (short) expect(offFrame(drawn, SAFE), `${name} ${id} ${when} t=${t}`).toEqual([]);
          }
          const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
          const geo = (await page.evaluate(() => (window as any).SHOWREEL.layouts()))[id];
          expect(geo, `${name} ${id}: layout probed`).toBeTruthy();
          const n = geo.nodes.length;
          expect(n, `${name} ${id}`).toBe(STEP_SETS[id].length);
          const x0 = Math.min(...geo.nodes.map((d: any) => d.x - d.w / 2)), x1 = Math.max(...geo.nodes.map((d: any) => d.x + d.w / 2));
          expect(x1 - x0, `${name} ${id}: graph width ${Math.round(x1 - x0)} px`).toBeGreaterThanOrEqual(0.65 * SAFE.W);
          expect(geo.px, `${name} ${id}: layout px = fitted px`).toBe(fit[id].steps);
          if (short) expect(fit[id].steps, `${name} ${id}: short labels grow to the fit`).toBeGreaterThanOrEqual(40);
          if (chain) expect(geo.decoys.length, `${name} ${id}: chain has no branches`).toBe(0);
          else {
            expect(geo.decoys.length, `${name} ${id}: ≥ 1 branch per step`).toBeGreaterThanOrEqual(n);
            // vertical density (R5 review): the lanes + branches fill the band like spike A's option lists (~70% of
            // the frame height), not a thin strip of pills in a mostly empty frame
            const ys = [...geo.nodes, ...geo.decoys].flatMap((d: any) => [d.y - d.h / 2, d.y + d.h / 2]);
            const vfill = (Math.max(...ys) - Math.min(...ys)) / SAFE.H;
            expect(vfill, `${name} ${id}: graph fills ${(100 * vfill).toFixed(1)}% of the frame height`).toBeGreaterThanOrEqual(VFILL_MIN);
            // structural (layout data); the rendered pixels are pinned by the 'R5 rendered' test below
            for (const d of geo.decoys) expect([d.w, d.h], `${name} ${id}: branch is boxless`).toEqual([0, 0]);
          }
        }
      } finally {
        await page.close();
      }
    }
  }, 180_000);

  // R5 review (rendered output, not layout data):
  //   - legibility: every lit label at the hold, S=6, reads as white text on a dark pill wherever it sits. The engine
  //     vignette (radial, post) darkens off-axis labels and the bloom lifts a tinted pill body, so a wide graph with
  //     lavender bodies left the outer labels grey-on-lavender while the centre stayed crisp. Pinned per label:
  //     glyph luma (top 10% of its manifest bbox) ≥ GLYPH_MIN · the beat's centre-most label, and glyph − body
  //     (body = 10–40th percentile of the bbox) ≥ CONTRAST_MIN. Measured identical at S=1 and S=6 (not motion blur).
  //   - boxless branches: the same frame drawn with and without the branch stubs (fixture probe hideBranches) —
  //     every changed pixel column is a thin run (a line + a port dot), never the vertical extent of a box or panel.
  // measured worst cases (fixtures, S=6): pre-fix 0.774 / 74.8 (short 'Next.js' at x≈284, lavender body) → fixed
  // 0.861 / 118 (28-char label at x≈375); branch runs 13 px (port dot), a box around a branch is ≥ PH tall
  const GLYPH_MIN = 0.84, CONTRAST_MIN = 105, RUN_MAX = 18;
  it('R5 rendered: outer labels stay as crisp as the centre at S=6; the paths not taken draw no boxes', async () => {
    let worstGlyph = { r: Infinity, msg: '' }, worstContrast = { c: Infinity, msg: '' }, worstRun = { run: 0, msg: '' };
    for (const name of ['converge', 'shortConverge', 'chain', 'shortChain'] as const) {
      const { url, timeline } = films[name]!;
      const page = await openPage(url);
      try {
        for (const id of FLOW_BEATS) {
          const m = moments(timeline, id);
          const labels: { text: string; cx: number; glyph: number; body: number }[] = await page.evaluate((t: number) => {
            const S = (window as any).SHOWREEL;
            S.renderAt(t, 6);
            const g = (document.getElementById('stage') as HTMLCanvasElement).getContext('2d')!;
            return S.manifest().filter((e: any) => e.bbox && /^f\./.test(e.source)).map((e: any) => {
              const { x, y, w, h } = e.bbox;
              const d = g.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data;
              const L: number[] = [];
              for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
              L.sort((a, b) => a - b);
              const avg = (a: number, b: number) => { const s = L.slice(Math.floor(a * L.length), Math.max(Math.floor(a * L.length) + 1, Math.floor(b * L.length))); return s.reduce((u, v) => u + v, 0) / s.length; };
              return { text: e.text, cx: x + w / 2, glyph: avg(0.9, 1), body: avg(0.1, 0.4) };
            });
          }, m.hold);
          expect(labels.length, `${name} ${id}: every step label measured`).toBe(STEP_SETS[id].length);
          const centre = labels.reduce((a, b) => (Math.abs(b.cx - 960) < Math.abs(a.cx - 960) ? b : a));
          const fmt = (l: any) => `${l.text}@x${Math.round(l.cx)} glyph ${Math.round(l.glyph)} body ${Math.round(l.body)}`;
          for (const l of labels) {
            const r = l.glyph / centre.glyph, c = l.glyph - l.body;
            if (r < worstGlyph.r) worstGlyph = { r, msg: `${name} ${id}: ${fmt(l)} vs centre ${fmt(centre)}` };
            if (c < worstContrast.c) worstContrast = { c, msg: `${name} ${id}: ${fmt(l)}` };
          }
          if (name.endsWith('hain')) continue;
          const diff: { changed: number; maxRun: number; at: number } = await page.evaluate((t: number) => {
            const S = (window as any).SHOWREEL, c = document.getElementById('stage') as HTMLCanvasElement, g = c.getContext('2d')!;
            const grab = (hide: boolean) => { S.hideBranches = hide; S.renderAt(t, 1); return g.getImageData(0, 0, c.width, c.height).data; };
            const a = grab(false), b = grab(true);
            S.hideBranches = false;
            let changed = 0, maxRun = 0, at = -1;
            for (let x = 0; x < c.width; x++) {
              let run = 0;
              for (let y = 0; y < c.height; y++) {
                const i = (y * c.width + x) * 4;
                const on = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > 24;
                if (on) { changed++; run++; if (run > maxRun) { maxRun = run; at = x; } } else run = 0;
              }
            }
            return { changed, maxRun, at };
          }, m.hold);
          // the branches are really drawn (else the run check proves nothing) ...
          expect(diff.changed, `${name} ${id}: branch stubs drawn at the hold`).toBeGreaterThan(200);
          if (diff.maxRun > worstRun.run) worstRun = { run: diff.maxRun, msg: `${name} ${id}: tallest branch pixel run ${diff.maxRun} px at x=${diff.at}` };
        }
      } finally {
        await page.close();
      }
    }
    // worst case over every lit label of every flow beat (3 / 5 / 6 steps, long + short labels, both variants)
    // (soft: a failure reports all three worst cases at once)
    expect.soft(worstGlyph.r, `glyph ratio ${worstGlyph.r.toFixed(3)} — ${worstGlyph.msg}`).toBeGreaterThanOrEqual(GLYPH_MIN);
    expect.soft(worstContrast.c, `contrast ${worstContrast.c.toFixed(1)} — ${worstContrast.msg}`).toBeGreaterThanOrEqual(CONTRAST_MIN);
    // nothing the branches draw is taller than a port dot: no box, panel or placeholder bar
    expect.soft(worstRun.run, worstRun.msg).toBeLessThanOrEqual(RUN_MAX);
  }, 240_000);

  // R5 review (chain enter still): a future node's ghost slot drawn as a dashed rectangle read as an empty label
  // slot. A ghost is structure only — its two port dots where the edges attach — so nothing crosses the middle of
  // the slot until the real label pops. Pinned on the frame of step.0 (every ghost laid, the last node not popped):
  // the same frame with / without the last node (fixture probe hideLastNode); in the middle 60% of that node's
  // width, a box outline changes about half the columns (dashes), port dots change none.
  const GHOST_MID_MAX = 0.05;
  it('R5 chain ghosts: a future node is two port dots, not an empty box', async () => {
    for (const name of ['chain', 'shortChain'] as const) {
      const { url, timeline } = films[name]!;
      const grid = 15 / timeline.music.bpm;
      const page = await openPage(url);
      try {
        for (const id of FLOW_BEATS) {
          const m = moments(timeline, id);
          const t = frameAt(m.steps[0]!);
          // precondition: the last node has not popped yet (pop = its step − 2 GRID), so the diff is its ghost
          expect(m.steps[m.steps.length - 1]! - 2 * grid, `${name} ${id}: last node still a ghost at step.0`).toBeGreaterThan(t + 1 / FPS);
          const last = (await page.evaluate(() => (window as any).SHOWREEL.layouts()))[id].nodes.at(-1);
          const res: { inRect: number; midCols: number; cols: number } = await page.evaluate((t: number, n: any) => {
            const S = (window as any).SHOWREEL, c = document.getElementById('stage') as HTMLCanvasElement, g = c.getContext('2d')!;
            const x0 = Math.round(n.x - n.w / 2 - 16), y0 = Math.round(n.y - n.h / 2 - 16), w = Math.round(n.w + 32), h = Math.round(n.h + 32);
            const grab = (hide: boolean) => { S.hideLastNode = hide; S.renderAt(t, 1); return g.getImageData(x0, y0, w, h).data; };
            const a = grab(false), b = grab(true);
            S.hideLastNode = false;
            const m0 = Math.round(16 + 0.2 * n.w), m1 = Math.round(16 + 0.8 * n.w);
            let inRect = 0, midCols = 0;
            for (let x = 0; x < w; x++) {
              let col = 0;
              for (let y = 0; y < h; y++) {
                const i = (y * w + x) * 4;
                if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > 24) { inRect++; col++; }
              }
              if (x >= m0 && x < m1 && col) midCols++;
            }
            return { inRect, midCols, cols: m1 - m0 };
          }, t, last);
          // the ghost is really drawn (else "no box" proves nothing) ...
          expect(res.inRect, `${name} ${id}: ghost of the last node drawn at step.0`).toBeGreaterThan(30);
          // ... and nothing of it crosses the middle of the slot
          expect(res.midCols / res.cols, `${name} ${id}: ${res.midCols}/${res.cols} middle columns drawn by the ghost`).toBeLessThanOrEqual(GHOST_MID_MAX);
        }
      } finally {
        await page.close();
      }
    }
  }, 180_000);

  it('(b) determinism: 4 timestamps × 2 fresh pages (2 render orders) × S=1 and S=6 → identical RGBA hashes', async () => {
    const A = films.converge, B = films.chain;
    const mA4 = moments(A.timeline, 'b4'), mA3 = moments(A.timeline, 'b3'), mB4 = moments(B.timeline, 'b4');
    const shots = [
      { film: A, t: frameAt(mA3.steps[2] + 2 / FPS) },       // a step lock (ring + sparks + flash)
      { film: A, t: frameAt(mA4.converge + 3 / FPS) },       // the implosion core: rays, shock rings, iris
      { film: B, t: mB4.hold },                              // chain hold, packets on every edge (amber)
      { film: B, t: frameAt(mB4.converge + 3 / FPS) },       // chain lock: check + burst ring
    ];
    const run = async (order: number[], S: number) => {
      const out: string[] = [];
      for (const k of order) {
        const page = await openPage(shots[k]!.film.url);
        out[k] = await hashAt(page, shots[k]!.t, S);
        await page.close();
      }
      return out;
    };
    const res: Record<number, string[][]> = {};
    for (const S of [1, 6]) res[S] = [await run([0, 1, 2, 3], S), await run([3, 1, 0, 2], S)];
    for (const S of [1, 6]) expect(res[S]![1], `S=${S}`).toEqual(res[S]![0]);
    // frames differ per timestamp and motion blur changes them (a frozen or blank renderer cannot pass)
    expect(new Set(res[1]![0]).size).toBe(4);
    expect(res[1]![0].filter((h, i) => h !== res[6]![0][i]).length).toBeGreaterThanOrEqual(3);
  }, 300_000);

  // budget, derived from the binding decision (showreel-addon-v1.16, AC7 + render estimate): a 30 s film end to end in
  // ≤ 15 min only if the final render (1800 frames at S=6, one page) stays ≲ 5 min → 300 000 / 1800 ≈ 166 ms/frame incl.
  // JPEG capture. A beat that alone ate that whole budget would break AC7; the measured value is in the message
  const RATE_BUDGET_MS = 166;
  it('rate check: S=6 ms/frame over 60 frames mid-beat (render only, and with JPEG q0.97 capture), typical N', async () => {
    const { url, timeline } = films.converge;
    const m = moments(timeline, 'b3');
    const page = await openPage(url);
    try {
      const render = await page.evaluate((t0: number, fr: number) => {
        const c = (document.getElementById('stage') as HTMLCanvasElement).getContext('2d')!;
        (window as any).SHOWREEL.renderAt(t0, 6); c.getImageData(0, 0, 1, 1); // warm-up
        const s = performance.now();
        for (let i = 0; i < 60; i++) { (window as any).SHOWREEL.renderAt(t0 + i * fr, 6); c.getImageData(0, 0, 1, 1); }
        return (performance.now() - s) / 60;
      }, m.mid - 0.5, 1 / FPS);
      await captureJpeg(page, m.mid, 6); // warm-up
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) await captureJpeg(page, m.mid - 0.5 + i / FPS, 6);
      const ms = (performance.now() - t0) / 60;
      const rate = `S=6 ${Math.round(render * 10) / 10} ms/frame render, ${Math.round(ms * 10) / 10} ms/frame with JPEG q0.97`;
      const line = JSON.stringify({ flowGraphRate: { samples: 6, frames: 60, msPerFrame: Math.round(render * 10) / 10, withJpegMsPerFrame: Math.round(ms * 10) / 10 } });
      console.log(line);
      if (process.env.SHOWREEL_E2E_ARTIFACTS) appendFileSync(path.join(process.env.SHOWREEL_E2E_ARTIFACTS, 'rates.jsonl'), line + '\n');
      expect(render, rate).toBeGreaterThan(0);
      expect(ms, `${rate} (budget ${RATE_BUDGET_MS})`).toBeLessThan(RATE_BUDGET_MS);
    } finally {
      await page.close();
    }
  }, 120_000);
});

// Registered only when E2E is off: a full E2E run must report 0 skipped (Rule 12).
if (!E2E) {
  describe('flow-graph in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run fit/clipping, determinism, coverage, cue binding, R5 scale and the rate check', () => {});
  });
}
