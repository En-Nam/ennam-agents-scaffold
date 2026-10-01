import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
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
// Gated: SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR). The archetype is injected through a test-local page
// (fixtures/archetypes/flow-graph/page.html) so it does not depend on archetypes/index.mjs registration.

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
type Entry = { text: string; source: string; bbox: { x: number; y: number; w: number; h: number } | null };

// min / typical (ceil of 3..6 midpoint = 5) / max step counts, each with near-maxChars facts
const STEP_SETS = {
  b2: ['f.feature.1', 'f.route.1', 'f.command.2'],
  b3: ['f.feature.2', 'f.stack.item.1', 'f.feature.3', 'f.route.2', 'f.feature.4'],
  b4: ['f.feature.2', 'f.feature.3', 'f.route.1', 'f.feature.4', 'f.command.2', 'f.feature.1'],
} as const;
const FLOW_BEATS = Object.keys(STEP_SETS) as (keyof typeof STEP_SETS)[];

type Cue = { name: string; at: number; kind: string; amp: number };
function storyboard(variant: 'converge' | 'chain', palette: string, b3Cues: Cue[] = []) {
  const flow = (id: keyof typeof STEP_SETS, lead: string | null, transitionOut: string) => ({
    id, archetype: 'flow-graph', variant, weight: 1.25, bindings: { steps: [...STEP_SETS[id]] },
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

function build(variant: 'converge' | 'chain', palette: string, b3Cues: Cue[] = []) {
  const sb = storyboard(variant, palette, b3Cues);
  const resolved = resolve(sb, { archetypes: ARCH, facts: FACTS, phrases: PHRASES });
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: FPS });
  return { sb, resolved, timeline };
}

const frameAt = (t: number) => Math.round(t * FPS) / FPS;
// C14 override by full name: b3's step.1 (default cue-map at = 0.15 + 0.45 * 1/4 = 0.2625) moved later
const STEP1_LATE: Cue[] = [{ name: 'step.1', at: 0.45, kind: 'snap', amp: 0.3 }];
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
  const HEX = /#[0-9a-fA-F]{3,8}\b/;

  it('the hex ban regex is live (it catches spike constants and short forms)', () => {
    expect(HEX.test("fill: '#8b6bff'")).toBe(true);
    expect(HEX.test("c = '#fff'")).toBe(true);
  });
  it('no hex colour literals in flow-graph.mjs: every colour comes from params.palette', () => {
    expect(src.match(new RegExp(HEX.source, 'g')) ?? []).toEqual([]);
  });
  it('no fillText/strokeText and no canvas creation outside the engine factory', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).not.toMatch(/createElement\(\s*['"]canvas|new\s+OffscreenCanvas|\.getContext\(/);
  });
  it('reads its step cues from the cue map (step.<i>) and its converge cue, never absolute seconds', () => {
    expect(src).toMatch(/cues\[`step\.\$\{i\}`\]/);
    expect(src).toMatch(/cues\.converge/);
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
  const FILMS = [['converge', 'violet', 'converge', []], ['chain', 'amber', 'chain', []], ['late', 'violet', 'converge', STEP1_LATE]] as const;

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const found = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...BROWSER_CANDIDATES].find((p) => p && existsSync(p));
    if (!found) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    exe = found;
    const mod = await loadDep('puppeteer-core', process.cwd());
    puppeteer = mod.default ?? mod;
    for (const [name, palette, variant, cues] of FILMS) {
      const { resolved, timeline } = build(variant, palette, [...cues]);
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
  }, 60_000);
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  });

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
        const sources = new Set(man.map((e) => e.source));
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

  it('rate check: S=6 ms/frame over 60 frames mid-beat (JPEG q0.97), typical N', async () => {
    const { url, timeline } = films.converge;
    const m = moments(timeline, 'b3');
    const page = await openPage(url);
    try {
      await captureJpeg(page, m.mid, 6); // warm-up
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) await captureJpeg(page, m.mid - 0.5 + i / FPS, 6);
      const ms = (performance.now() - t0) / 60;
      console.log(JSON.stringify({ flowGraphRate: { samples: 6, frames: 60, msPerFrame: Math.round(ms * 10) / 10 } }));
      expect(ms).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 120_000);
});
