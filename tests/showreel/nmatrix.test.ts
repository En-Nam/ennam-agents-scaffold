import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { validateStoryboard, slotsFor } from '../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';
import { compatiblePhrases } from './helpers/storyboard';

// v1.16 showreel M2 Task 7 — the N-matrix (review focus 1, global constraint "No clipping").
// EVERY archetype × EVERY variant × {min, typical, max} item count, each item a near-maxChars text
// (maxChars − 2 … maxChars code points, W/M-heavy display and long mono routes/commands), rendered by the
// SHIPPED engine page (engine/page.html → archetypes/index.mjs, i.e. the real registry, not a test injection).
// What it protects: a film the agent can legally write (any count, any length the schema allows) is either
//   - drawn fully inside the 48 px safe area when the beat is fully revealed (local progress 0.5 and the
//     beat's last fully-on frame), with every slot fitting at or above its family minimum (fit not null), or
//   - refused by `check` (fit null → E_TEXT_FIT naming beat + slot).
// It must NEVER be clipped silently. Here every case must FIT (fit not null): the slot limits in
// archetypes.json are the promise to the agent, so a legal storyboard that cannot fit is a toolkit bug.
// Plus D8 coverage: every resolved item of every beat reaches the SCREEN (a frame box, manifest onScreen) by those
// frames (an archetype that silently drops the 6th card, or builds a title sprite it never blits, would pass the
// safe-area check trivially), and the manifest ⊆ resolved. In-flight frames (every 5 %) fail like the contract
// moments: one safe-area policy for every archetype.
// Gated: SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR).

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const FPS = 60;
const SAFE = { W: 1920, H: 1080, margin: 48 };
const COUNTS = ['min', 'typical', 'max'] as const;
type Count = (typeof COUNTS)[number];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Slot = { source: 'fact' | 'phrase'; kinds?: string[]; tags?: string[]; min: number; max: number; maxChars?: number; sequence?: boolean };
type Entry = { text: string; source: string; bbox: { x: number; y: number; w: number; h: number } | null; onScreen: boolean };

const len = (s: string) => [...s].length;
const nOf = (s: Slot, c: Count) => (c === 'min' ? s.min : c === 'max' ? s.max : Math.ceil((s.min + s.max) / 2));

// Wide, realistic-shaped seeds per fact kind (≥ 64 code points), varied per item so neighbours differ.
const LEADS = ['Warehouse', 'Webhook', 'Workflow', 'Movement', 'Mapping', 'Membership', 'Marketplace', 'Middleware'];
const SEED: Record<string, (i: number) => string> = {
  feature: (i) => `${LEADS[i % 8]} Management with Mobile Webhooks and Multi Warehouse Workflows`,
  'stack.item': (i) => `${LEADS[i % 8]} Microsoft Windows WebMatrix Middleware Framework Toolkit`,
  route: (i) => `/api/v1/${LEADS[i % 8]!.toLowerCase()}s/[warehouseId]/movements/[movementId]/webhooks`,
  command: (i) => `npm run migrate:${LEADS[i % 8]!.toLowerCase()} -- --workflow=multi-warehouse --webhooks`,
  'app.tagline': (i) => `${LEADS[i % 8]} workflows with webhooks, mapped for every Windows machine`,
  problem: (i) => `${LEADS[i % 8]} Mismatches Make Monthly Warehouse Movement Reviews Miserable`,
  'app.name': (i) => `${LEADS[i % 8]} Mobile Warehouse Manager Web Workflow`,
};
/** the seed cut at a word-internal position: exactly n code points, or n ± 1 when n would end on a space
 *  (natural text: no padding characters that would make the string artificially wide) */
function near(kind: string, i: number, n: number) {
  const cps = [...SEED[kind]!(i)];
  if (cps.length < n + 1) throw new Error(`seed for ${kind} shorter than ${n + 1}`);
  if (cps[n - 1] !== ' ') return cps.slice(0, n).join('');
  return n % 2 ? cps.slice(0, n - 1).join('') : cps.slice(0, n + 1).join('');
}

type Fact = { id: string; kind: string; value: unknown; display: string; unit: string | null; source: object; hash: string };
function factsRegistry() {
  const facts: Fact[] = [];
  const counters: Record<string, number> = {};
  const add = (kind: string, display: string, extra: Partial<Fact> = {}) => {
    const n = (counters[kind] = (counters[kind] ?? 0) + 1);
    facts.push({
      id: `f.${kind}.${n}`, kind, value: display, display, unit: null,
      source: { file: 'synthetic', locator: `${kind}/${n}`, extractor: 'test', rule: 'synthetic' },
      hash: 'sha256:0000000000000000', ...extra,
    });
    return `f.${kind}.${n}`;
  };
  return { facts, add };
}

/** phrase slot: the LONGEST phrase that is true of every bound fact kind and allowed in the variant (ruling f,
 *  E_PHRASE_KIND). None compatible → an optional slot stays empty; a required one fails loudly here. */
function bindPhrase(s: Slot, c: Count, kinds: string[], variant: string, where: string): string | null {
  if (nOf(s, c) === 0) return null;
  const pool = compatiblePhrases(PHRASES.phrases, s.tags!, kinds, variant);
  if (!pool.length) {
    if ((s.min ?? 0) === 0) return null;
    throw new Error(`${where}: no phrase with tags ${s.tags} is true of kinds ${kinds} in variant ${variant}`);
  }
  return [...pool].sort((a: any, b: any) => len(b.text) - len(a.text))[0]!.id;
}

let stepLists = 0;
/** fact slot at count c: near-maxChars facts. A sequential slot (ruling f) gets one README ordered list:
 *  same collection, ascending sequence — anything else would be an invented order (E_SLOT_ORDER). */
function bindSlot(reg: ReturnType<typeof factsRegistry>, s: Slot, c: Count): string | string[] | null {
  const n = nOf(s, c);
  if (n === 0) return null;
  const list = s.sequence ? `readme.steps.${++stepLists}` : null;
  const ids = Array.from({ length: n }, (_, i) => {
    const kind = s.kinds![i % s.kinds!.length]!;
    const max = s.maxChars!;
    if (list) return reg.add(kind, near(kind, i, max - 1 - (i % 2)), { collection: list, sequence: i + 1 } as Partial<Fact>);
    if (kind === 'count') {
      // max-length integer display, a long code-extracted plural noun as its unit
      const digits = '987654321098765'.slice(0, max - (i % 2));
      return reg.add('count', digits, { value: Number(digits), unit: ['integrations', 'components', 'migrations', 'endpoints'][i % 4]! });
    }
    return reg.add(kind, near(kind, i, max - 1 - (i % 2))); // max−2 … max after the word-boundary nudge
  });
  return s.max === 1 ? ids[0]! : ids;
}

function beat(reg: ReturnType<typeof factsRegistry>, id: string, archetype: string, variant: string, c: Count, weight: number) {
  const bindings: Record<string, string | string[]> = {};
  const phrases: Record<string, string> = {};
  const slots = Object.entries(slotsFor(ARCH.archetypes[archetype], variant) as Record<string, Slot>);
  // facts first, then phrases that are true of what was bound (ruling f)
  for (const [slotId, s] of slots) {
    if (s.source === 'phrase') continue;
    const ref = bindSlot(reg, s, c);
    if (ref !== null) bindings[slotId] = ref;
  }
  const byId = new Map(reg.facts.map((f) => [f.id, f.kind]));
  const kinds = [...new Set(Object.values(bindings).flat().map((fid) => byId.get(fid)!))];
  for (const [slotId, s] of slots) {
    if (s.source !== 'phrase') continue;
    const ref = bindPhrase(s, c, kinds, variant, `${archetype}/${variant} ${id}.${slotId}`);
    if (ref !== null) phrases[slotId] = ref;
  }
  return { id, archetype, variant, weight, bindings, phrases, transitionOut: 'cut', count: c };
}

/** One 30 s film per body archetype × variant: open, X@min, X@typical, X@max, X@max, X@typical (second fact
 *  sets), lockup. 30 s, because the matrix is about LAYOUT: at 15 s a 64-char typed command or 8 orbit-node cues
 *  are refused by the compiler (E_TIMELINE_TYPING / E_TIMELINE) before any pixel is drawn. Open/lockup counts rotate. */
const BODY_COUNTS: Count[] = ['min', 'typical', 'max', 'max', 'typical'];
function film(archetype: string, variant: string, k: number) {
  const reg = factsRegistry();
  const outer = COUNTS[k % 3]!;
  const beats = [
    beat(reg, 'b1', 'cold-open-command', 'terminal', outer, 2),
    ...BODY_COUNTS.map((c, i) => beat(reg, `b${i + 2}`, archetype, variant, c, 3)),
    beat(reg, 'b7', 'lockup-cta', 'center', outer, 2),
  ];
  const counts = Object.fromEntries(beats.map((b) => [b.id, b.count]));
  const sb = { version: 1, durationS: 30, seed: 7, palette: 'violet', beats: beats.map(({ count: _c, ...b }) => b) };
  const facts = { version: 1, minimumGate: { passed: true, missing: [] }, brand: { name: 'Acme Shop', palette: 'violet', wordmark: 'f.app.name.1' }, facts: reg.facts };
  const inputs = { archetypes: ARCH, facts, phrases: PHRASES };
  const errors: unknown[] = validateStoryboard(sb, inputs);
  let resolved: any = null, timeline: any = null;
  if (!errors.length) {
    try {
      resolved = resolve(sb, inputs);
      timeline = compileTimeline(sb, resolved, ARCH, { fps: FPS });
    } catch (e) {
      errors.push({ code: (e as any).code, message: (e as Error).message });
    }
  }
  return { name: `${archetype}/${variant}`, sb, facts, counts, errors, resolved, timeline };
}

const BODY = Object.entries<any>(ARCH.archetypes).filter(([id]) => id !== 'cold-open-command' && id !== 'lockup-cta')
  .flatMap(([id, a]) => (a.variants as string[]).map((v) => [id, v] as const));
const FILMS = BODY.map(([id, v], k) => film(id, v, k));

const frameAt = (t: number) => Math.round(t * FPS) / FPS;
/** progress 0.5 and the last frame on which the beat is alone on screen (before its outgoing overlap) */
const moments = (b: any) => ({ mid: frameAt(b.t0 + 0.5 * (b.t1 - b.t0)), lastOn: (Math.ceil((b.t1 - b.overlapOut) * FPS - 1e-6) - 1) / FPS });

describe('N-matrix storyboards (hermetic precondition)', () => {
  it('covers every archetype and every variant; open + lockup run at min, typical and max too', () => {
    const covered = new Set(FILMS.flatMap((f) => f.sb.beats.map((b) => `${b.archetype}/${b.variant}`)));
    for (const [id, a] of Object.entries<any>(ARCH.archetypes)) for (const v of a.variants) expect(covered.has(`${id}/${v}`), `${id}/${v}`).toBe(true);
    for (const id of ['b1', 'b7']) expect(new Set(FILMS.map((f) => f.counts[id])).size, id).toBe(3);
  });

  it('every film validates, resolves and compiles (a fit/clip result is never masked by an invalid storyboard)', () => {
    for (const f of FILMS) {
      expect(f.errors, f.name).toEqual([]);
      expect(f.timeline, f.name).not.toBeNull();
    }
  });

  it('item counts are exactly min / typical / max and every fact text is within maxChars − 2 … maxChars', () => {
    for (const f of FILMS) {
      const byId = new Map(f.facts.facts.map((x) => [x.id, x.display]));
      for (const b of f.sb.beats) {
        const c = f.counts[b.id] as Count;
        for (const [slotId, s] of Object.entries(slotsFor(ARCH.archetypes[b.archetype], b.variant) as Record<string, Slot>)) {
          const ref = s.source === 'phrase' ? (b.phrases as any)[slotId] : (b.bindings as any)[slotId];
          const ids = ref === undefined ? [] : Array.isArray(ref) ? ref : [ref];
          expect(ids.length, `${f.name} ${b.id}.${slotId} @${c}`).toBe(nOf(s, c));
          if (s.source === 'fact') for (const id of ids) {
            const n = len(byId.get(id)!);
            expect(n, `${f.name} ${b.id}.${slotId} ${id}`).toBeLessThanOrEqual(s.maxChars!);
            expect(n, `${f.name} ${b.id}.${slotId} ${id}`).toBeGreaterThanOrEqual(s.maxChars! - 2);
          }
        }
      }
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

describe.skipIf(!E2E)('N-matrix in the browser (SHOWREEL_E2E=1)', () => {
  let browser: any;
  const cleanups: (() => Promise<void> | void)[] = [];

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const exe = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...BROWSER_CANDIDATES].find((p) => p && existsSync(p));
    if (!exe) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    const mod = await loadDep('puppeteer-core', process.cwd());
    const puppeteer = mod.default ?? mod;
    const udd = mkdtempSync(path.join(os.tmpdir(), 'showreel-nmatrix-udd-'));
    browser = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs(), userDataDir: udd });
    cleanups.push(() => rmSync(udd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), () => browser.close());
  }, 180_000);
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  }, 120_000);

  async function serveFilm(f: (typeof FILMS)[number]) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-nmatrix-'));
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(f.timeline));
    writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(f.resolved));
    const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => srv.close());
    return srv.url;
  }
  async function openPage(url: string) {
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
    return { page, errors };
  }

  for (const f of FILMS) {
    it(`${f.name}: min/typical/max near-maxChars — fit not null, nothing off-frame at progress 0.5 and the last fully-on frame, every item drawn`, async () => {
      if (!f.timeline) throw new Error(`${f.name}: storyboard did not compile — ${JSON.stringify(f.errors)}`);
      const url = await serveFilm(f);
      const { page, errors } = await openPage(url);
      try {
        const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
        const failures: string[] = [];
        const drawn = async (t: number): Promise<Entry[]> => {
          await page.evaluate((t: number) => (window as any).SHOWREEL.renderAt(t, 1), t);
          return (await page.evaluate(() => (window as any).SHOWREEL.manifest()) as Entry[]).filter((e) => e.bbox);
        };
        for (const b of f.timeline!.beats) {
          const rb = f.resolved!.beats[b.id];
          const tag = `${b.id} ${b.archetype}/${b.variant} @${f.counts[b.id]}`;
          for (const [slot, s] of Object.entries<any>(rb.slots)) {
            if (s.items.length && (fit[b.id]?.[slot] ?? null) === null) failures.push(`${tag} ${slot}: fit null (N=${s.items.length})`);
          }
          const m = moments(b);
          // The contract's "fully revealed" moments (progress 0.5, last fully-on frame) MUST be inside the safe
          // area. A sweep of the beat (every 5 %) then feeds the manifest coverage below — a sequential archetype
          // (punch: one line owns the frame at a time) shows each item at its own moment.
          // ONE policy for every archetype (the lockup-cta / kinetic / orbit tests use the same one): a viewer
          // sees every solo frame, so in-flight text past the 48 px margin (slam / reveal overshoot) is a clipped
          // film and FAILS here too — it is never only logged. (All matrix films use cuts: every frame is solo.)
          for (const [name, t] of [['progress 0.5', m.mid], ['lastOn', m.lastOn]] as const) {
            const off = offFrame(await drawn(t), SAFE);
            for (const o of off) failures.push(`${tag} ${name} t=${t}: off-frame "${o.text}" (${o.source}) bbox=${JSON.stringify(o.bbox)}`);
          }
          for (let k = 1; k < 20; k++) {
            const t = frameAt(b.t0 + k * 0.05 * (b.t1 - b.t0));
            if (t >= m.lastOn) break;
            for (const o of offFrame(await drawn(t), SAFE)) failures.push(`${tag} in flight (progress ${(k * 0.05).toFixed(2)}) t=${t}: off-frame "${o.text}" (${o.source}) bbox=${JSON.stringify(o.bbox)}`);
          }
        }
        // D8 coverage + subset, over everything drawn on those frames. Coverage counts only entries that had a
        // frame box in a rendered frame (onScreen): text drawn into a build-once sprite is recorded at layout boot,
        // before any frame, so mere presence in the manifest proves nothing (a never-blitted title would pass).
        const man: Entry[] = await page.evaluate(() => (window as any).SHOWREEL.manifest());
        const sources = new Set(man.filter((e) => e.onScreen === true).map((e) => e.source));
        for (const b of f.timeline!.beats) for (const [slot, s] of Object.entries<any>(f.resolved!.beats[b.id].slots)) {
          for (const item of s.items) if (!sources.has(item.id)) failures.push(`${b.id} ${b.archetype}/${b.variant} @${f.counts[b.id]} ${slot}: ${item.id} never drawn`);
        }
        expect(checkManifest(man, f.resolved), `${f.name}: manifest ⊆ resolved`).toEqual([]);
        expect(errors, `${f.name}: page errors`).toEqual([]);
        expect(failures, f.name).toEqual([]);
      } finally {
        await page.close();
      }
    }, 180_000);
  }
});

// Registered only when E2E is off: a full E2E run must report 0 skipped (Rule 12).
if (!E2E) {
  describe('N-matrix in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run every archetype × {min, typical, max} N × near-maxChars', () => {});
  });
}
