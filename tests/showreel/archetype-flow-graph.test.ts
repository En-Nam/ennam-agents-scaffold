import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, cpSync, rmSync, existsSync, appendFileSync } from 'node:fs';
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
import { extractFacts } from '../../templates/showreel/.claude/showreel/lib/facts/extract.mjs';
import { makeDigest } from '../../templates/showreel/.claude/showreel/lib/facts/digest.mjs';
import { sheetTimes } from '../../templates/showreel/.claude/showreel/render/sheet.mjs';
import { storyboardFromArrangement, type ArrangementBeat } from './helpers/storyboard';
import { fakeApi } from './helpers/fake-api';
import flowGraph from '../../templates/showreel/.claude/showreel/archetypes/flow-graph.mjs';

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
//   (f) truthfulness (orchestrator ruling f / PO R5 (f)): converge + chain draw a DIRECTED path (origin → node 0 →
//       node 1 …), so their fixture films bind README-step facts with a sequence (one collection, ascending);
//       the unordered mixed-kind sets render as variant "cluster", which draws no directed edge, no origin and no
//       moving head — only undirected hub spokes. A cluster that drew a path would assert an order the facts lack.
//   (PO R5 b) no dimmed first node: at the hold every revealed label reads at (near) the brightest label's luma.
// Gated: SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR). The browser cases boot fixtures/archetypes/flow-graph/page.html, a
// test copy of engine/page.html that injects the module and exposes the layouts() probe the R5 scale test reads.
// flow-graph is registered in archetypes/index.mjs (Task 7); the N-matrix renders it through the shipped page.

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const FIX = path.join(HERE, 'fixtures', 'archetypes', 'flow-graph');
const SRC = path.join(TOOLKIT, 'archetypes', 'flow-graph.mjs');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
// the shipped table, unmodified: the fixture films resolve/compile against exactly what users get
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const FACTS = readJ(path.join(FIX, 'facts.json'));
const FPS = 60;
const SAFE = { W: 1920, H: 1080, margin: 48 };

/** Module geometry / timing the browser tests bound against, READ from flow-graph.mjs (not literal copies), so a
 * change to the lead header or the edge lead moves the bounds with it. Throws if a declaration can no longer be
 * found (the static test below runs this without a browser, so drift fails even when SHOWREEL_E2E is off).
 *   leadRuleBottom  bottom of the lead header's brand rule: LEAD_Y + its fillRect offset + its height
 *   edgeLeadGrids   an edge (and its node's pop) starts this many GRIDs before the node's step cue */
function moduleGeometry(src: string) {
  const lead = src.match(/const LEAD_Y = (\d+)\b/);
  const rule = src.match(/ctx\.fillRect\(CX - hw, LEAD_Y \+ (\d+), hw \* 2, (\d+)\)/);
  const edge = src.match(/const edgeT0 = \(i\) => STEP\[i\] - (\d+) \* grid\b/);
  const pop = src.match(/const i = n\.i, pop = edgeT0\(i\)/);
  const hub = src.match(/const HUB_R = (\d+)\b/);
  if (!lead || !rule || !edge || !pop || !hub) throw new Error('flow-graph.mjs: LEAD_Y / lead rule / edgeT0 / node pop / HUB_R changed — update moduleGeometry');
  return { leadRuleBottom: Number(lead[1]) + Number(rule[1]) + Number(rule[2]), edgeLeadGrids: Number(edge[1]), hubR: Number(hub[1]) };
}
const GEO = moduleGeometry(readFileSync(SRC, 'utf8'));
const HUB_R = GEO.hubR;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Browser = any;
type Page = any;
type Entry = { text: string; source: string; bbox: { x: number; y: number; w: number; h: number } | null; onScreen?: boolean };

type Variant = 'converge' | 'chain' | 'cluster';
type BeatId = 'b2' | 'b3' | 'b4';
type Sets = Record<BeatId, readonly string[]>;
// min / typical (ceil of 3..6 midpoint = 5) / max step counts, each with near-maxChars facts. These are UNORDERED
// facts of mixed kinds (no sequence) → the cluster films; the sequential films bind SEQ_SETS below.
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
// sequential films (converge / chain): README ordered steps — one collection, ascending sequence (gaps allowed),
// command + feature kinds, near-maxChars (readme.steps.1) and short (readme.steps.2)
const SEQ_SETS: Sets = {
  b2: ['f.command.11', 'f.feature.12', 'f.command.12'],
  b3: ['f.feature.11', 'f.command.11', 'f.feature.12', 'f.command.12', 'f.feature.13'],
  b4: ['f.feature.11', 'f.command.11', 'f.feature.12', 'f.command.12', 'f.feature.13', 'f.command.13'],
};
const SEQ_SHORT: Sets = {
  b2: ['f.command.14', 'f.feature.14', 'f.command.16'],
  b3: ['f.command.14', 'f.feature.14', 'f.command.15', 'f.command.16', 'f.feature.15'],
  b4: ['f.command.14', 'f.feature.14', 'f.command.15', 'f.command.16', 'f.feature.15', 'f.command.17'],
};
const setsFor = (variant: Variant, short = false): Sets => (variant === 'cluster' ? (short ? SHORT_SETS : STEP_SETS) : short ? SEQ_SHORT : SEQ_SETS);
// leads: "From start to finish" / "How it flows" claim an order (sequential variants only); the cluster heads its
// mixed kinds with phrases true of all of them and silent about order
const LEADS: Record<Variant, { b3: string; b4: string }> = {
  converge: { b3: 'p.flow.3', b4: 'p.flow.2' }, chain: { b3: 'p.flow.3', b4: 'p.flow.2' }, cluster: { b3: 'p.flow.4', b4: 'p.flow.6' },
};

type Cue = { name: string; at: number; kind: string; amp: number };
function storyboard(variant: Variant, palette: string, b3Cues: Cue[] = [], sets: Sets = setsFor(variant)) {
  const flow = (id: BeatId, lead: string | null, transitionOut: string) => ({
    id, archetype: 'flow-graph', variant, weight: 1.25, bindings: { steps: [...sets[id]] },
    ...(lead ? { phrases: { lead } } : {}), transitionOut,
    ...(id === 'b3' && b3Cues.length ? { cues: b3Cues } : {}),
  });
  return {
    version: 1, durationS: 15, seed: 7, palette,
    beats: [
      { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1, bindings: { command: 'f.command.1' }, transitionOut: 'zoom-through' },
      flow('b2', null, 'cut'),
      flow('b3', LEADS[variant].b3, 'cut'),
      flow('b4', LEADS[variant].b4, 'zoom-through'),
      { id: 'b5', archetype: 'lockup-cta', variant: 'center', weight: 1.5, bindings: { name: 'f.app.name.1', command: 'f.command.1' }, transitionOut: 'cut' },
    ],
  };
}

function build(variant: Variant, palette: string, b3Cues: Cue[] = [], sets: Sets = setsFor(variant)) {
  const sb = storyboard(variant, palette, b3Cues, sets);
  const resolved = resolve(sb, { archetypes: ARCH, facts: FACTS, phrases: PHRASES });
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: FPS });
  return { sb, resolved, timeline };
}

const frameAt = (t: number) => Math.round(t * FPS) / FPS;
// C14 override by full name: b3's step.1 (default cue-map at = 0.15 + 0.35 * 1/4 = 0.2375 → 6.125 s on b3's 3 s
// window [5.375, 8.375]) moved 3 GRID later (0.375 → 6.5 s). Overrides must keep the map in index order (validate +
// compile refuse a scrambled reveal), so step.2 and step.3 move along onto the next grid points (0.42 → 6.625 s,
// 0.46 → 6.75 s), still 1 GRID before step.4, which stays at the map's `to` (0.5 → 6.875 s)
const STEP1_LATE: Cue[] = [
  { name: 'step.1', at: 0.375, kind: 'snap', amp: 0.3 },
  { name: 'step.2', at: 0.42, kind: 'snap', amp: 0.3 },
  { name: 'step.3', at: 0.46, kind: 'snap', amp: 0.3 },
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

// The real arrangement films (C15) the e2e-full "next" run renders: the same host tree (tests/fixtures/next-project +
// the js-next app, README and package.json), the same facts extractor and the same deterministic helper at typical
// counts → the same storyboards (and so the same contact sheets) as .showreel-dev/m2-artifacts/next-<N>s.
const REPO_ROOT = path.resolve(HERE, '..', '..');
const ARR: Record<string, ArrangementBeat[]> = readJ(path.join(TOOLKIT, 'archetypes', 'arrangements.json')).arrangements;
const NEXT_DURATIONS = [15, 30, 45, 60] as const;
async function nextFilms(archetypes: any = ARCH) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'showreel-flow-graph-next-'));
  try {
    cpSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'next-project'), cwd, { recursive: true });
    for (const rel of ['app', 'lib', 'README.md', 'package.json']) cpSync(path.join(HERE, 'fixtures', 'facts', 'js-next', rel), path.join(cwd, rel), { recursive: true });
    const { facts } = await extractFacts(cwd);
    const { digest } = makeDigest(facts.facts);
    return NEXT_DURATIONS.map((N) => {
      const sb = storyboardFromArrangement(digest, N, ARR[String(N)]!, archetypes, PHRASES, { count: 'typical' });
      const resolved = resolve(sb, { archetypes, facts, phrases: PHRASES });
      return { N, resolved, timeline: compileTimeline(sb, resolved, archetypes, { fps: FPS }) };
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
/** the contact-sheet "hold" still of a beat (render/sheet.mjs sheetTimes: 0.6 of its solo window) — what R5 reviews */
const sheetHold = (timeline: any, id: string): number => sheetTimes(timeline).find((s: any) => s.beatId === id && s.still === 'hold').t;
/** flow-graph steps that have NOT finished lighting (cue + ½ GRID of the 1-GRID ramp) by the contact-sheet hold */
function unlitAtSheetHold(timeline: any): string[] {
  const grid = 15 / timeline.music.bpm;
  return timeline.beats.filter((b: any) => b.archetype === 'flow-graph').flatMap((b: any) => {
    const hold = sheetHold(timeline, b.id);
    return moments(timeline, b.id).steps.flatMap((s: number, i: number) => (s + 0.5 * grid <= hold + 1e-9 ? [] : [`${timeline.durationS}s ${b.id} step.${i} at ${s.toFixed(3)} s vs sheet hold ${hold.toFixed(3)} s`]));
  });
}

describe('flow-graph — static guarantees (C13, review focus 4)', () => {
  const src = readFileSync(SRC, 'utf8');
  // palette-only colours: one table-driven ban over every archetype module (engine-static.test.ts)

  it('no fillText/strokeText and no canvas creation outside the engine factory', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).not.toMatch(/createElement\(\s*['"]canvas|new\s+OffscreenCanvas|\.getContext\(/);
  });
  it('the lead-rule and edge-lead bounds the browser tests use are read from the module (no stale literal copy)', () => {
    // moduleGeometry throws on drift (module load above); here: the parsed values are real geometry, not NaN/0
    expect(GEO.leadRuleBottom).toBeGreaterThan(100);   // M2: 170 + 26 + 3 = 199, the rule sits in the header band
    expect(GEO.leadRuleBottom).toBeLessThan(400);
    expect(GEO.edgeLeadGrids).toBeGreaterThanOrEqual(1); // M2: 2
  });
  it('reads its step cues from the cue map (step.<i>) and its converge cue, never absolute seconds', () => {
    expect(src).toMatch(/api\.cue\(`step\.\$\{i\}`\)/);
    expect(src).toMatch(/api\.cue\('converge'\)/);
    expect(src).not.toMatch(/cues(\[[^\]]+\]|\.\w+)\s*\?\?/); // no `cues[x] ?? re-derived schedule` (drifts from the score)
  });
  // ruling (f), static half: the browser test below proves structure (no edge, no origin, hub ↔ node links) and that
  // nothing TRAVELS along a spoke — but a STATIC arrowhead / chevron / end dot added to the spoke drawing would pass
  // both. So the cluster's only line drawer, drawLinks, may stroke each spoke whole (trace(…, 1), one stroke, one
  // width) and nothing else: no head sprite, packet, arc, fill, gradient (a brightening toward one end) or extra
  // segment. Negative control: the same guard flags drawEdges (the sequential path: head spot + packets).
  it('ruling (f): drawLinks strokes each spoke whole and draws no head, packet, marker or one-ended gradient', () => {
    const body = (name: string) => {
      const m = src.match(new RegExp(`\\n    function ${name}\\(\\) \\{\\r?\\n([\\s\\S]*?)\\r?\\n    \\}\\r?\\n`));
      if (!m) throw new Error(`flow-graph.mjs: function ${name}() not found — update this guard`);
      return m[1]!;
    };
    const HEAD = /\b(spot|packet|at|sparks|checkMark|rr|shape|drawNode)\(|\.(arc|fill|fillRect|lineTo|moveTo|createLinearGradient|createRadialGradient|drawImage)\(|api\.brand\(/g;
    const links = body('drawLinks');
    expect(links.match(HEAD) ?? [], 'drawLinks: head / packet / marker calls').toEqual([]);
    expect(links.match(/\btrace\(/g)?.length, 'drawLinks: one trace per spoke').toBe(1);
    expect(links, 'drawLinks: every spoke traced to its full length (never a partial, growing line)').toMatch(/trace\(ctx, l\.pts, 1\)/);
    expect(links.match(/\.stroke\(\)/g)?.length, 'drawLinks: one plain stroke per spoke').toBe(1);
    // negative control: the guard really fires on a drawer that has a moving head and packets
    expect((body('drawEdges').match(HEAD) ?? []).length, 'drawEdges (sequential path) trips the guard').toBeGreaterThan(0);
  });
  // review nit: the layout carried fields nothing reads (a cluster spoke's a: -1 / undirected flag; a hub halo
  // sprite built for converge / chain, which have no hub) — dead data that reads as a contract it is not.
  it('layout: cluster spokes are {b, pts} only; the hub halo sprite exists only for cluster', () => {
    const items = ['Sign in', 'Pick a plan', 'Invite the team'].map((text, i) => ({ id: `f.feature.${i + 1}`, kind: 'feature', text, display: text }));
    const rb = { slots: { steps: { items } } };
    const cues = Object.fromEntries([...items.map((_, i) => [`step.${i}`, 0.5 + i]), ['converge', 3.5]]);
    const api = fakeApi({ archetype: 'flow-graph', cues });
    const cl = (flowGraph as any).layout(rb, 'cluster', api);
    expect(cl.links).toHaveLength(3);
    for (const l of cl.links) expect(Object.keys(l).sort()).toEqual(['b', 'pts']);
    expect(cl.SPR.halo).toBeDefined();
    for (const v of ['converge', 'chain']) {
      const L = (flowGraph as any).layout(rb, v, api);
      expect(L.links, v).toEqual([]);
      expect(L.SPR.halo, v).toBeUndefined();
    }
  });
  it('the fixture storyboards resolve and compile: one step.<i> hit per bound step, converge after the last', () => {
    // the shipped table itself lists every variant this file renders (no test-side injection hides a missing one)
    expect(ARCH.archetypes['flow-graph'].variants).toEqual(['converge', 'chain', 'cluster']);
    for (const v of ['converge', 'chain', 'cluster'] as const) {
      const { timeline } = build(v, 'violet');
      for (const id of FLOW_BEATS) {
        const m = moments(timeline, id);
        expect(m.steps.length, `${v} ${id}`).toBe(STEP_SETS[id].length);
        expect(setsFor(v)[id].length, `${v} ${id}: same step count in every variant's set`).toBe(STEP_SETS[id].length);
        expect(m.converge, `${v} ${id}`).toBeGreaterThan(m.lastStep);
        expect(m.hold, `${v} ${id}`).toBeGreaterThan(m.lastStep);
        expect(m.hold, `${v} ${id}`).toBeLessThan(m.converge);
      }
    }
    // the STEP1_LATE film compiles (index order kept) and really moves step.1 ≥ 3 GRID (the cue-binding probe's premise)
    const def = moments(build('converge', 'violet').timeline, 'b3'), late = moments(build('converge', 'violet', STEP1_LATE).timeline, 'b3');
    const grid = 15 / 120;
    expect(late.steps[1]! - def.steps[1]!).toBeGreaterThanOrEqual(3 * grid - 1e-6);
    for (let i = 1; i < late.steps.length; i++) expect(late.steps[i]! - late.steps[i - 1]!, `late step.${i}`).toBeGreaterThanOrEqual(grid - 1 / FPS);
  });
  it('fixture texts are near maxChars (26–28 code points), so (a) exercises the widest legal labels', () => {
    const max = ARCH.archetypes['flow-graph'].slots.steps.maxChars;
    const byId = new Map(FACTS.facts.map((f: any) => [f.id, f.display]));
    for (const id of FLOW_BEATS) for (const f of [...STEP_SETS[id], ...SEQ_SETS[id]]) {
      const n = [...(byId.get(f) as string)].length;
      expect(n, f).toBeLessThanOrEqual(max);
      expect(n, f).toBeGreaterThanOrEqual(max - 2);
    }
  });
  it('ruling (f): a sequential variant (converge / chain) refuses unordered facts; the same facts are valid as cluster', () => {
    // the mixed-kind sets carry no sequence: drawn as a directed path they would assert an order facts.json lacks
    for (const v of ['converge', 'chain'] as const) {
      const sb = storyboard(v, 'violet', [], STEP_SETS);
      expect(() => resolve(sb, { archetypes: ARCH, facts: FACTS, phrases: PHRASES }), `${v} with unordered facts`).toThrow(/E_SLOT_ORDER/);
    }
    expect(() => build('cluster', 'violet')).not.toThrow();
    // the sequential fixture sets really are ordered (one collection, ascending), so the films below are legal
    const byId = new Map<string, any>(FACTS.facts.map((f: any) => [f.id, f]));
    for (const sets of [SEQ_SETS, SEQ_SHORT]) for (const id of FLOW_BEATS) {
      const fs = sets[id].map((x) => byId.get(x)!);
      expect(new Set(fs.map((f) => f.collection)).size, `${id} one collection`).toBe(1);
      for (let k = 1; k < fs.length; k++) expect(fs[k].sequence, `${id} ascending`).toBeGreaterThan(fs[k - 1].sequence);
    }
  });
  it('contact-sheet hold (R5): in the real next 15/30/45/60 s films every flow-graph step has lit by the sheet hold — a cue map ending at 0.6 fails it', async () => {
    // The R5 sheet shows each beat at 0.6 of its solo window; a step cued after that is still dark there, so the
    // sheet shows a half-lit path. The cue map's `to` (0.5) is what keeps the last step before that still.
    const films = await nextFilms();
    const variants = new Set<string>();
    for (const f of films) {
      const flows = f.timeline.beats.filter((b: any) => b.archetype === 'flow-graph');
      expect(flows.length, `${f.N}s has a flow-graph beat`).toBeGreaterThanOrEqual(1);
      for (const b of flows) variants.add(b.variant);
    }
    // which variants the real films use is the storyboard helper's call (ruling f: sequential only with a README
    // step list of ≥ 3); every one of them must be a flow-graph variant this module draws. Coverage note: since
    // arrangements default flow-graph beats to "cluster", these real films are NOT required to contain chain /
    // converge any more (they did before ruling f); the sequential variants' rendering is covered by this file's
    // fixture films (SEQ_SETS / SEQ_SHORT), and "sequential only with a ≥ 3-step sequence collection" is enforced
    // by validate (E_SLOT_ORDER, tested above) and owned by the storyboard helper's tests
    for (const v of variants) expect(['chain', 'cluster', 'converge'], `real-film variant ${v}`).toContain(v);
    expect(films.flatMap((f) => unlitAtSheetHold(f.timeline))).toEqual([]);
    // negative control: the same films compiled with the previous map end (to = 0.6) leave a step dark at the sheet
    // hold in EVERY film — so the check above really depends on the cue map, and would catch a regression
    const old = JSON.parse(JSON.stringify(ARCH));
    for (const m of old.archetypes['flow-graph'].cueMaps) if (m.name === 'step') m.to = 0.6;
    for (const f of await nextFilms(old)) expect(unlitAtSheetHold(f.timeline).length, `${f.N}s with to = 0.6`).toBeGreaterThan(0);
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
  const films: Record<string, { url: string; resolved: any; timeline: any; sets: Sets }> = {};
  const FILMS: [string, string, Variant, Cue[], Sets][] = [
    ['converge', 'violet', 'converge', [], SEQ_SETS], ['chain', 'amber', 'chain', [], SEQ_SETS], ['late', 'violet', 'converge', STEP1_LATE, SEQ_SETS],
    ['cluster', 'violet', 'cluster', [], STEP_SETS],
    ['shortConverge', 'violet', 'converge', [], SEQ_SHORT], ['shortChain', 'amber', 'chain', [], SEQ_SHORT], ['shortCluster', 'amber', 'cluster', [], SHORT_SETS],
  ];
  const STEP_SETS_FOR = (name: string): Sets => films[name]!.sets;

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
      films[name] = { url: srv.url, resolved, timeline, sets };
    }
    // the real next arrangement films (whole film, every archetype) for the contact-sheet hold check
    for (const { N, resolved, timeline } of await nextFilms()) {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-flow-graph-'));
      writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline));
      writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(resolved));
      copyFileSync(path.join(FIX, 'page.html'), path.join(dir, 'page.html'));
      const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
      cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => srv.close());
      films[`next${N}`] = { url: srv.url, resolved, timeline, sets: STEP_SETS };
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

  for (const variant of ['converge', 'chain', 'cluster'] as const) {
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
              for (const f of films[variant].sets[id]) expect(drawn.some((e) => e.source === f), `${id} ${f} has a box at the hold`).toBe(true);
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
    const step1 = films.converge.sets.b3[1];
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
  //   - converge ornament = alternative-route arches (at least one per step) between drawn nodes; chain draws none.
  //   - converge: nodes + arches span ≥ VFILL_MIN of the frame height (the R5 "thin strip of pills" finding).
  const VFILL_MIN = 0.6;
  it('R5 scale: graph spans ≥ 65% of the frame, short labels grow to the fit, the arches fill the frame height', async () => {
    for (const name of ['converge', 'chain', 'cluster', 'shortConverge', 'shortChain', 'shortCluster'] as const) {
      const { url, timeline } = films[name]!;
      const short = name.startsWith('short'), chain = name.endsWith('hain'), cluster = name.endsWith('luster');
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
          if (chain) expect(geo.arcs.length, `${name} ${id}: chain has no arches`).toBe(0);
          else if (cluster) {
            expect(geo.arcs.length, `${name} ${id}: cluster has no alternative-route arches`).toBe(0);
            expect(geo.links.length, `${name} ${id}: one hub spoke per node`).toBe(n);
          } else {
            expect(geo.arcs.length, `${name} ${id}: ≥ 1 arch per step`).toBeGreaterThanOrEqual(n);
            // vertical density (R5 review): the arches fill the band like spike A's option lists (~70% of the frame
            // height), not a thin strip of pills in a mostly empty frame
            const ys = [...geo.nodes.flatMap((d: any) => [d.y - d.h / 2, d.y + d.h / 2]), ...geo.arcs.flatMap((f: any) => f.pts.map((p: number[]) => p[1]))];
            const vfill = (Math.max(...ys) - Math.min(...ys)) / SAFE.H;
            expect(vfill, `${name} ${id}: graph fills ${(100 * vfill).toFixed(1)}% of the frame height`).toBeGreaterThanOrEqual(VFILL_MIN);
            // ... and stays clear of the frame edge (the safe area)
            expect(Math.min(...ys), `${name} ${id}: arch top`).toBeGreaterThanOrEqual(SAFE.margin);
            expect(Math.max(...ys), `${name} ${id}: arch bottom`).toBeLessThanOrEqual(SAFE.H - SAFE.margin);
            // ... and never cut through the lead header's brand rule (GEO.leadRuleBottom, read from the module) on
            // the beats that bind one
            if (id !== 'b2') expect(Math.min(...ys), `${name} ${id}: arch top clear of the lead rule`).toBeGreaterThan(GEO.leadRuleBottom + 10);
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
  //   - ornament only on its arches: the same frame drawn with and without the arches (fixture probe hideBranches) —
  //     every changed pixel lies within CORRIDOR px of an arch curve (its line, glow and riding packets). The R5
  //     sheet showed lane panels with empty hairline rows + pin circles that read as placeholder content; any panel,
  //     row, stub or pin drawn off the arches lands outside the corridor and fails this.
  // measured worst cases (fixtures, S=6): pre-fix 0.774 / 74.8 (short 'Next.js' at x≈284, lavender body) → fixed
  // 0.861 / 118 (28-char label at x≈375)
  const GLYPH_MIN = 0.84, CONTRAST_MIN = 105, CORRIDOR = 12;
  it('R5 rendered: outer labels stay as crisp as the centre at S=6; the ornament draws only its arches', async () => {
    let worstGlyph = { r: Infinity, msg: '' }, worstContrast = { c: Infinity, msg: '' }, worstOff = { off: 0, msg: '' };
    for (const name of ['converge', 'shortConverge', 'chain', 'shortChain', 'cluster', 'shortCluster'] as const) {
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
          // the ornament lines: converge = its arches, cluster = its hub spokes (both hidden by hideBranches)
          const g0 = (await page.evaluate(() => (window as any).SHOWREEL.layouts()))[id];
          const arcs = (name.endsWith('luster') ? g0.links : g0.arcs).map((f: any) => f.pts);
          const diff: { changed: number; off: number; at: string } = await page.evaluate((t: number, raw: number[][][], D: number, id: string) => {
            const S = (window as any).SHOWREEL, c = document.getElementById('stage') as HTMLCanvasElement, g = c.getContext('2d')!;
            const grab = (hide: boolean) => { S.hideBranches = hide; S.renderAt(t, 1); return g.getImageData(0, 0, c.width, c.height).data; };
            const a = grab(false), b = grab(true);
            S.hideBranches = false;
            // arch samples in frame pixels: layout space through the transform the beat drew under (engine camera)
            const m = S.xf[id];
            const arcs = raw.map((pts) => pts.map(([x, y]) => [m.a * x! + m.c * y! + m.e, m.b * x! + m.d * y! + m.f]));
            // distance from (x, y) to the nearest arch segment
            const near = (x: number, y: number) => arcs.some((pts) => pts.some((p, k) => {
              if (!k) return false;
              const q = pts[k - 1]!, dx = p[0]! - q[0]!, dy = p[1]! - q[1]!, L2 = dx * dx + dy * dy || 1;
              const u = Math.max(0, Math.min(1, ((x - q[0]!) * dx + (y - q[1]!) * dy) / L2));
              return Math.hypot(x - q[0]! - u * dx, y - q[1]! - u * dy) <= D;
            }));
            let changed = 0, off = 0, at = '';
            for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
              const i = (y * c.width + x) * 4;
              if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) <= 24) continue;
              changed++;
              if (!near(x, y)) { off++; if (!at) at = `${x},${y}`; }
            }
            return { changed, off, at };
          }, m.hold, arcs, CORRIDOR, id);
          // the arches are really drawn (else the corridor check proves nothing) ...
          expect(diff.changed, `${name} ${id}: arches drawn at the hold`).toBeGreaterThan(200);
          if (diff.off > worstOff.off) worstOff = { off: diff.off, msg: `${name} ${id}: ${diff.off} of ${diff.changed} ornament pixels off the arches (first at ${diff.at})` };
        }
      } finally {
        await page.close();
      }
    }
    // worst case over every lit label of every flow beat (3 / 5 / 6 steps, long + short labels, both variants)
    // (soft: a failure reports all three worst cases at once)
    expect.soft(worstGlyph.r, `glyph ratio ${worstGlyph.r.toFixed(3)} — ${worstGlyph.msg}`).toBeGreaterThanOrEqual(GLYPH_MIN);
    expect.soft(worstContrast.c, `contrast ${worstContrast.c.toFixed(1)} — ${worstContrast.msg}`).toBeGreaterThanOrEqual(CONTRAST_MIN);
    // the ornament draws nothing off its arches: no panel, placeholder row, stub or pin
    expect.soft(worstOff.off, worstOff.msg).toBe(0);
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
          // precondition: the last node has not popped yet (pop = its step − GEO.edgeLeadGrids GRID), so the diff is its ghost
          expect(m.steps[m.steps.length - 1]! - GEO.edgeLeadGrids * grid, `${name} ${id}: last node still a ghost at step.0`).toBeGreaterThan(t + 1 / FPS);
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

  // R5 review (row 2 leftovers): an edge leaving a bright dot with no node at its end, and a node still unlit in the
  // hold still, read as a broken graph. Pinned, per flow beat, both variants, long + short labels:
  //   - structure: every path edge runs from the origin diamond / node i-1's border to node i's border, every arch
  //     from node a's border to node b's border (a, b real nodes) — no edge endpoint in empty space;
  //   - rendered: the instant an edge starts drawing (its node's pop), the node it runs into is already on screen
  //     (label in the manifest with a box), so a moving head never travels toward nothing;
  //   - rendered: at the hold every step node is LIT — the glow band just above / below its pill (middle 60%, arches
  //     hidden, so only the node's own light counts) is brighter than in the same node's popped-but-unlit state
  //     half a GRID before its cue, by ≥ LIT_GAIN luma. A node left unlit at the hold reads the unlit level and fails.
  // The hold here is this file's hold (after the last step cue, before the converge build-up). The contact-sheet
  // hold (render/sheet.mjs, 0.6 of the solo window) — the still R5 actually reviews — is pinned on the real next
  // arrangement films in the next test: with the cue map ending at `to` 0.5 of the beat, the last step lands before
  // it in every film (at 0.6 it landed after it, leaving the last node dark on the sheet).
  // measured worst (fixtures, S=1): +31.5 luma (shortConverge b3 node 0: 67.3 lit vs 35.7 unlit); an unlit node ≈ 0
  const LIT_GAIN = 15;
  /** mean luma of the glow band just above / below node n's pill (middle 60%), arches hidden, at t (S=1). The bands
   * are laid out in LAYOUT space and every sample is mapped to frame pixels through the transform beat `id` drew
   * under at t (S.xf: camera push / drift / shake / roll) — the hold and the unlit frame are drawn under different
   * transforms, so unmapped bands would sample different parts of the node (pill body could enter the band). */
  const glow = async (page: Page, t: number, n: any, id: string): Promise<number> => page.evaluate((t: number, n: any, id: string) => {
    const S = (window as any).SHOWREEL, c = document.getElementById('stage') as HTMLCanvasElement, g = c.getContext('2d')!;
    S.xf = {}; // never a stale transform from an earlier frame
    S.hideBranches = true; S.renderAt(t, 1); S.hideBranches = false;
    const m = S.xf[id];
    if (!m) throw new Error(`no device transform recorded for ${id} at t=${t}`);
    const map = (x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] as const;
    const x0 = n.x - 0.3 * n.w, w = Math.round(0.6 * n.w);
    let s = 0, k = 0;
    for (const y0 of [n.y - n.h / 2 - 14, n.y + n.h / 2 + 4]) {
      // device bbox of the mapped band, read once; then one sample per layout pixel of the band
      const cs = [map(x0, y0), map(x0 + w, y0), map(x0, y0 + 10), map(x0 + w, y0 + 10)];
      const bx = Math.max(0, Math.floor(Math.min(...cs.map((p) => p[0]))) - 1), by = Math.max(0, Math.floor(Math.min(...cs.map((p) => p[1]))) - 1);
      const bw = Math.min(c.width, Math.ceil(Math.max(...cs.map((p) => p[0]))) + 2) - bx, bh = Math.min(c.height, Math.ceil(Math.max(...cs.map((p) => p[1]))) + 2) - by;
      const d = g.getImageData(bx, by, bw, bh).data;
      for (let v = 0; v < 10; v++) for (let u = 0; u < w; u++) {
        const [dx, dy] = map(x0 + u + 0.5, y0 + v + 0.5);
        const px = Math.min(bw - 1, Math.max(0, Math.floor(dx) - bx)), py = Math.min(bh - 1, Math.max(0, Math.floor(dy) - by)), i = (py * bw + px) * 4;
        s += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!; k++;
      }
    }
    return s / k;
  }, t, n, id);
  it('R5 edges + lighting: no edge endpoint without a node; every step node is lit at the hold', async () => {
    const onBorder = (p: number[], n: any) => {
      const [x, y] = p as [number, number], hw = n.w / 2, hh = n.h / 2, e = 0.5;
      return (Math.min(Math.abs(x - (n.x - hw)), Math.abs(x - (n.x + hw))) <= e && Math.abs(y - n.y) <= hh + e)
        || (Math.min(Math.abs(y - (n.y - hh)), Math.abs(y - (n.y + hh))) <= e && Math.abs(x - n.x) <= hw + e);
    };
    let worstGain = { g: Infinity, msg: '' };
    for (const name of ['converge', 'shortConverge', 'chain', 'shortChain', 'cluster', 'shortCluster'] as const) {
      const { url, timeline } = films[name]!;
      const grid = 15 / timeline.music.bpm;
      const page = await openPage(url);
      try {
        for (const id of FLOW_BEATS) {
          const geo = (await page.evaluate(() => (window as any).SHOWREEL.layouts()))[id];
          const nodes = geo.nodes;
          // cluster: no path (next test); every spoke runs from the hub ring to its node's border
          expect(geo.edges.length, `${name} ${id}: one path edge per node (cluster: none)`).toBe(geo.variant === 'cluster' ? 0 : nodes.length);
          for (const l of geo.links) {
            expect(Math.abs(Math.hypot(l.from[0] - geo.hub.x, l.from[1] - geo.hub.y) - HUB_R), `${name} ${id}: spoke ${l.b} starts on the hub ring`).toBeLessThanOrEqual(0.5);
            expect(onBorder(l.to, nodes[l.b]), `${name} ${id}: spoke ${l.b} ends on node ${l.b}`).toBe(true);
          }
          for (const e of geo.edges) {
            const fromOk = e.i === 0 ? Math.hypot(e.from[0] - geo.origin.x, e.from[1] - geo.origin.y) <= 0.5 : onBorder(e.from, nodes[e.i - 1]);
            expect(fromOk, `${name} ${id}: path edge ${e.i} starts on ${e.i ? `node ${e.i - 1}` : 'the origin'}`).toBe(true);
            expect(onBorder(e.to, nodes[e.i]), `${name} ${id}: path edge ${e.i} ends on node ${e.i}`).toBe(true);
          }
          for (const f of geo.arcs) {
            expect(nodes[f.a] && nodes[f.b] && f.a !== f.b, `${name} ${id}: arch ${f.a}→${f.b} joins two nodes`).toBeTruthy();
            expect(onBorder(f.from, nodes[f.a]) && onBorder(f.to, nodes[f.b]), `${name} ${id}: arch ${f.a}→${f.b} ends on both pills`).toBe(true);
          }
          const m = moments(timeline, id);
          for (let i = 0; i < nodes.length; i++) {
            // the earliest frame on which edge i (and node i's arches, which start no earlier) is drawn — or the
            // first solo frame if that is inside the incoming transition (boxes are not recorded while it composites)
            const solo = m.b.t0 + m.b.overlapIn + 1 / FPS;
            const t = Math.max(Math.ceil((m.steps[i]! - GEO.edgeLeadGrids * grid) * FPS - 1e-6) / FPS + 1 / FPS, Math.ceil(solo * FPS - 1e-6) / FPS);
            const man = await renderManifest(page, t);
            expect(man.some((e) => e.source === STEP_SETS_FOR(name)[id][i] && e.bbox), `${name} ${id}: node ${i} on screen when its edge starts (t=${t})`).toBe(true);
          }
          // precondition: the hold is well into every node's light-up (1 GRID ramp from its cue), else "lit" proves nothing
          for (const s of m.steps) expect(s + 0.5 * grid, `${name} ${id}: hold after the light-up`).toBeLessThanOrEqual(m.hold);
          for (let i = 0; i < nodes.length; i++) {
            const lit = await glow(page, m.hold, nodes[i], id), unlit = await glow(page, frameAt(m.steps[i]! - 0.5 * grid), nodes[i], id);
            const gain = lit - unlit;
            if (gain < worstGain.g) worstGain = { g: gain, msg: `${name} ${id} node ${i}: glow ${lit.toFixed(1)} at the hold vs ${unlit.toFixed(1)} unlit` };
          }
        }
      } finally {
        await page.close();
      }
    }
    expect(worstGain.g, worstGain.msg).toBeGreaterThanOrEqual(LIT_GAIN);
  }, 300_000);

  // The R5 row the PO signs off is the contact-sheet hold of a REAL film (tests/showreel/tools/r5-sheet.mjs), not
  // this file's fixture hold. Rendered on the next 15/30/45/60 s arrangement films (whole film, shipped archetypes
  // around the flow beats): at the sheet hold every step node of every flow-graph beat is lit, same LIT_GAIN oracle.
  // The timing half (cue + ½ GRID ≤ sheet hold) is the static test above, with its to = 0.6 negative control.
  // measured (S=1): to 0.5 worst +31.3 luma (30s b3 node 0); the same films at to 0.6 → −7.5 (15s b3 node 4, still dark)
  it('R5 contact-sheet hold: in the real next 15/30/45/60 s films every flow-graph step node is lit at the sheet hold', async () => {
    let worstGain = { g: Infinity, msg: '' }, beats = 0, nodesChecked = 0;
    for (const N of NEXT_DURATIONS) {
      const { url, timeline } = films[`next${N}`]!;
      const grid = 15 / timeline.music.bpm;
      const page = await openPage(url);
      try {
        const geo = await page.evaluate(() => (window as any).SHOWREEL.layouts());
        for (const b of timeline.beats.filter((x: any) => x.archetype === 'flow-graph')) {
          const m = moments(timeline, b.id), hold = sheetHold(timeline, b.id);
          const nodes = geo[b.id]?.nodes;
          expect(nodes?.length, `${N}s ${b.id}: one laid-out node per step`).toBe(m.steps.length);
          // precondition (the static test's claim, per beat): the sheet hold is past every node's light-up
          for (const s of m.steps) expect(s + 0.5 * grid, `${N}s ${b.id}: sheet hold ${hold} after the light-up`).toBeLessThanOrEqual(hold + 1e-9);
          for (let i = 0; i < nodes.length; i++) {
            const lit = await glow(page, hold, nodes[i], b.id), unlit = await glow(page, frameAt(m.steps[i]! - 0.5 * grid), nodes[i], b.id);
            if (lit - unlit < worstGain.g) worstGain = { g: lit - unlit, msg: `${N}s ${b.id} ${b.variant} node ${i}: glow ${lit.toFixed(1)} at the sheet hold (t=${hold.toFixed(3)}) vs ${unlit.toFixed(1)} unlit` };
            nodesChecked++;
          }
          beats++;
        }
      } finally {
        await page.close();
      }
    }
    // every real film carries at least one flow beat (the 60 s one carries both variants): nothing skipped silently
    expect(beats, 'flow-graph beats checked across the 4 films').toBeGreaterThanOrEqual(NEXT_DURATIONS.length + 1);
    expect(nodesChecked).toBeGreaterThanOrEqual(3 * beats);
    console.log(JSON.stringify({ flowGraphSheetHoldLit: { beats, nodes: nodesChecked, worstGain: Math.round(worstGain.g * 10) / 10, at: worstGain.msg } }));
    expect(worstGain.g, worstGain.msg).toBeGreaterThanOrEqual(LIT_GAIN);
  }, 300_000);

  // Ruling (f): a cluster asserts no order. Structure: no directed path edge, no origin, one undirected spoke per node,
  // every spoke hub ↔ node (never node ↔ node, so the links cannot form a chain). Rendered: nothing TRAVELS along a
  // spoke — its own pixels (frame with − without spokes, hideBranches) are the same at the hold and MOVE_FRAMES later
  // (a head or packet riding it would move ~0.2 of its length in that time). Negative control on the same oracle: a
  // converge / chain path edge while its head travels (frame with − without the last node + its edge, hideLastNode)
  // changes between the two frames. (At the hold the lit path stroke saturates the line itself, so the packets riding
  // it are not a usable on-line control.) Measured (S=1): spokes worst Δ 12.4; path edge in flight weakest Δ 134.
  const MOVE_FRAMES = 5;
  const SPOKE_MOVE_MAX = 20, PATH_MOVE_MIN = 40; // max |Δ luma| along the line between the two frames
  /** luma contribution of a line along pts (layout space) at t: max |diff| in a 3×3 box at each sample, u ∈ [u0, u1] */
  const lineProfile = (page: Page, t: number, id: string, pts: number[][], hide: 'hideBranches' | 'hideLastNode', u0: number, u1: number): Promise<number[]> =>
    page.evaluate((t: number, id: string, pts: number[][], hide: string, u0: number, u1: number) => {
      const S = (window as any).SHOWREEL, c = document.getElementById('stage') as HTMLCanvasElement, g = c.getContext('2d')!;
      S.xf = {};
      const grab = (h: boolean) => { S[hide] = h; S.renderAt(t, 1); return g.getImageData(0, 0, c.width, c.height).data; };
      const a = grab(false), b = grab(true);
      S[hide] = false;
      const m = S.xf[id];
      if (!m) throw new Error(`no device transform for ${id} at ${t}`);
      const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      const out: number[] = [];
      const n = pts.length - 1;
      for (let k = 0; k <= 40; k++) {
        const u = u0 + ((u1 - u0) * k) / 40, f = u * n, j = Math.min(n - 1, Math.floor(f)), r = f - j;
        const x = pts[j]![0]! + (pts[j + 1]![0]! - pts[j]![0]!) * r, y = pts[j]![1]! + (pts[j + 1]![1]! - pts[j]![1]!) * r;
        const dx = Math.round(m.a * x + m.c * y + m.e), dy = Math.round(m.b * x + m.d * y + m.f);
        let best = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const i = ((dy + oy) * c.width + (dx + ox)) * 4;
          best = Math.max(best, Math.abs(lum(a, i) - lum(b, i)));
        }
        out.push(best);
      }
      return out;
    }, t, id, pts, hide, u0, u1);
  const moved = (a: number[], b: number[]) => Math.max(...a.map((v, k) => Math.abs(v - b[k]!)));
  it('ruling (f): cluster draws no directed edge, origin or moving head; converge / chain still draw their directed path', async () => {
    let worstSpoke = { r: 0, msg: '' }, weakestHead = { r: Infinity, msg: '' };
    for (const name of ['cluster', 'shortCluster', 'converge', 'chain'] as const) {
      const { url, timeline } = films[name]!;
      const page = await openPage(url);
      try {
        const all = await page.evaluate(() => (window as any).SHOWREEL.layouts());
        for (const id of FLOW_BEATS) {
          const geo = all[id], n = geo.nodes.length, m = moments(timeline, id);
          if (name.endsWith('luster')) {
            expect(geo.variant).toBe('cluster');
            expect(geo.edges, `${name} ${id}: no directed path edge`).toEqual([]);
            expect(geo.origin, `${name} ${id}: no path origin`).toBeNull();
            expect(geo.hub, `${name} ${id}: a hub`).toBeTruthy();
            // a spoke is {b, pts} only: it starts on the hub ring (no source node, nothing to read as "from step a")
            expect(geo.links.every((l: any) => l.keys.join() === 'b,pts'), `${name} ${id}: link objects carry only b + pts`).toBe(true);
            expect(geo.links.every((l: any) => Math.hypot(l.from[0] - geo.hub.x, l.from[1] - geo.hub.y) <= 20), `${name} ${id}: every link starts at the hub`).toBe(true);
            expect(geo.links.map((l: any) => l.b).sort((x: number, y: number) => x - y), `${name} ${id}: one spoke per node, none node ↔ node`).toEqual([...Array(n).keys()]);
            // rendered: nothing moves along a spoke between the hold and MOVE_FRAMES later
            for (const l of geo.links) {
              const p = await lineProfile(page, m.hold, id, l.pts, 'hideBranches', 0.1, 0.9);
              const q = await lineProfile(page, m.hold + MOVE_FRAMES / FPS, id, l.pts, 'hideBranches', 0.1, 0.9);
              // (median, not min: the hub end of a short spoke can sit inside the saturated hub core)
              expect([...p].sort((x, y) => x - y)[p.length >> 1], `${name} ${id}: spoke ${l.b} drawn along its length`).toBeGreaterThan(8);
              const r = moved(p, q);
              if (r > worstSpoke.r) worstSpoke = { r, msg: `${name} ${id} spoke ${l.b}: max Δ ${r.toFixed(1)} over ${MOVE_FRAMES} frames` };
            }
          } else {
            expect(geo.variant).toBe(name);
            expect(geo.links, `${name} ${id}: no spokes`).toEqual([]);
            expect(geo.origin, `${name} ${id}: path origin`).toBeTruthy();
            expect(geo.edges.map((e: any) => e.i), `${name} ${id}: directed edges origin → 0 → … → N-1`).toEqual([...Array(n).keys()]);
            // negative control: the last path edge while its head travels (0.3 GRID into its draw) — the head and the
            // drawn extent advance along it between the two frames, which the cluster oracle above would catch
            const t = frameAt(m.steps[n - 1]! - (GEO.edgeLeadGrids - 0.3) * (15 / timeline.music.bpm));
            const p = await lineProfile(page, t, id, geo.edges[n - 1].pts, 'hideLastNode', 0.1, 0.9);
            const q = await lineProfile(page, t + MOVE_FRAMES / FPS, id, geo.edges[n - 1].pts, 'hideLastNode', 0.1, 0.9);
            const r = moved(p, q);
            if (r < weakestHead.r) weakestHead = { r, msg: `${name} ${id}: path edge ${n - 1} max Δ ${r.toFixed(1)} over ${MOVE_FRAMES} frames` };
          }
        }
      } finally {
        await page.close();
      }
    }
    console.log(JSON.stringify({ flowGraphRulingF: { worstSpoke: worstSpoke.msg, weakestHead: weakestHead.msg } }));
    expect.soft(worstSpoke.r, worstSpoke.msg).toBeLessThanOrEqual(SPOKE_MOVE_MAX);
    expect.soft(weakestHead.r, weakestHead.msg).toBeGreaterThanOrEqual(PATH_MOVE_MIN);
  }, 300_000);

  // PO R5 (b): "no dimmed first node at hold — a dimmed first node reads as disabled, not traversed". Per flow beat, at
  // the hold, S=6, each step label's glyph luma = mean of its bbox pixels brighter than the midpoint of the bbox's 20th
  // and 99th luma percentiles (the strokes, not the pill body). Two oracles:
  //   - archetype (every fixture film: 3 variants × long / short labels, this file's hold): the glyph luma with the
  //     engine vignette divided back out per pixel (constants READ from engine/core.mjs) is ≥ FLAT_MIN × the beat's
  //     brightest — the module draws every revealed node at full title brightness (negative control below: a popped
  //     but not yet lit node, drawn with the dim fill, fails this bound). The vignette itself is engine-owned:
  //     28-char labels in three columns must reach ~600 px off-axis, where it alone leaves ≈ 0.80 of the centre.
  //   - what R5 sees (the real next films at the contact-sheet hold): raw glyph luma ≥ LABEL_LUMA_MIN × the brightest.
  //     Same oracle on HEAD 2662418 (next 60 s b4 converge): 'Next.js' 213 vs 249 = 0.855 — fails LABEL_LUMA_MIN.
  // measured after the fix (S=6): raw sheet hold worst 0.913 (60 s b9 cluster 'Stripe payments'); de-vignetted worst
  // 0.963 (converge b4); the unlit control 0.91–0.94; any lit label dimmed ×0.9 (known-factor control) worst
  // 0.904 (converge b3), so a ≥ 10% dim is caught; a ≤ 5% dim is not guaranteed to be.
  // Open items (not this module's to close): the raw floor LABEL_LUMA_MIN = 0.89 awaits PO sign-off, and raw parity
  // for near-maxChars labels in three columns (≈ 0.80) needs an engine vignette change in engine/core.mjs
  const FLAT_MIN = 0.95, LABEL_LUMA_MIN = 0.89;
  const VIG = (() => {
    const core = readFileSync(path.join(TOOLKIT, 'engine', 'core.mjs'), 'utf8');
    const g = core.match(/vctx\.createRadialGradient\(W \/ 2, H \/ 2, H \* ([\d.]+), W \/ 2, H \/ 2, H \* ([\d.]+)\)/);
    const a = core.match(/rg\.addColorStop\(1, 'rgba\(0,0,0,([\d.]+)\)'\)/);
    if (!g || !a) throw new Error('engine/core.mjs vignette changed — update the PO R5 (b) oracle');
    return { r0: Number(g[1]), r1: Number(g[2]), a: Number(a[1]) };
  })();
  type Core = { source: string; text: string; cx: number; core: number; flat: number };
  /** dim: after rendering, scale the RGB of one label's bbox by k (a node drawn k× dimmer, for the controls) */
  const labelCores = (page: Page, t: number, dim: { source: string; k: number } | null = null): Promise<Core[]> => page.evaluate((t: number, V: { r0: number; r1: number; a: number }, dim: { source: string; k: number } | null) => {
    const S = (window as any).SHOWREEL;
    S.renderAt(t, 6);
    const c = document.getElementById('stage') as HTMLCanvasElement, g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    if (dim) {
      const e = S.manifest().find((x: any) => x.bbox && x.onScreen === true && x.source === dim.source);
      if (!e) throw new Error(`dim control: ${dim.source} not on screen at ${t}`);
      const x0 = Math.round(e.bbox.x), y0 = Math.round(e.bbox.y), w = Math.max(1, Math.round(e.bbox.w)), h = Math.max(1, Math.round(e.bbox.h));
      const img = g.getImageData(x0, y0, w, h);
      for (let i = 0; i < img.data.length; i += 4) for (let j = 0; j < 3; j++) img.data[i + j] = Math.round(img.data[i + j]! * dim.k);
      g.putImageData(img, x0, y0);
    }
    const keep = (px: number, py: number) => 1 - V.a * Math.min(1, Math.max(0, (Math.hypot(px - W / 2, py - H / 2) - V.r0 * H) / ((V.r1 - V.r0) * H)));
    return S.manifest().filter((e: any) => e.bbox && e.onScreen === true && /^f\./.test(e.source)).map((e: any) => {
      const x0 = Math.round(e.bbox.x), y0 = Math.round(e.bbox.y), w = Math.max(1, Math.round(e.bbox.w)), h = Math.max(1, Math.round(e.bbox.h));
      const d = g.getImageData(x0, y0, w, h).data;
      const P: { l: number; k: number }[] = [];
      for (let i = 0; i < d.length; i += 4) {
        const p = i / 4;
        P.push({ l: 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!, k: keep(x0 + (p % w) + 0.5, y0 + Math.floor(p / w) + 0.5) });
      }
      const L = P.map((p) => p.l).sort((a, b) => a - b);
      const q = (f: number) => L[Math.min(L.length - 1, Math.floor(f * L.length))]!;
      const thr = (q(0.2) + q(0.99)) / 2, gl = P.filter((p) => p.l > thr), n = Math.max(1, gl.length);
      return { source: e.source, text: e.text, cx: x0 + w / 2, core: gl.reduce((s, p) => s + p.l, 0) / n, flat: gl.reduce((s, p) => s + p.l / p.k, 0) / n };
    });
  }, t, VIG, dim);
  it('PO R5 (b): no dimmed node at the hold — every step label at full brightness (vignette aside), every variant', async () => {
    let worst = { r: Infinity, msg: '' }, worstFlat = { r: Infinity, msg: '' }, beats = 0;
    const check = (labels: Core[], expectN: number, where: string, raw: boolean) => {
      expect(labels.length, `${where}: every step label measured`).toBeGreaterThanOrEqual(expectN);
      const top = Math.max(...labels.map((l) => l.core)), topF = Math.max(...labels.map((l) => l.flat));
      for (const l of labels) {
        const at = `${where}: '${l.text}'@x${Math.round(l.cx)}`;
        if (raw && l.core / top < worst.r) worst = { r: l.core / top, msg: `${at} core ${l.core.toFixed(0)} vs brightest ${top.toFixed(0)}` };
        if (l.flat / topF < worstFlat.r) worstFlat = { r: l.flat / topF, msg: `${at} de-vignetted ${l.flat.toFixed(0)} vs brightest ${topF.toFixed(0)}` };
      }
      beats++;
    };
    for (const name of ['converge', 'chain', 'cluster', 'shortConverge', 'shortChain', 'shortCluster'] as const) {
      const { url, timeline, sets } = films[name]!;
      const page = await openPage(url);
      try {
        for (const id of FLOW_BEATS) {
          const labels = (await labelCores(page, moments(timeline, id).hold)).filter((l) => sets[id].includes(l.source));
          check(labels, sets[id].length, `${name} ${id} hold`, false);
        }
      } finally {
        await page.close();
      }
    }
    // negative control: half a GRID before its cue the last node of each converge beat has popped but is not lit (dim
    // fill) — the de-vignetted oracle must see it as dimmed, else it could not catch a dimmed node at the hold
    {
      const { url, timeline, sets } = films.converge!;
      const grid = 15 / timeline.music.bpm;
      const page = await openPage(url);
      try {
        for (const id of FLOW_BEATS) {
          const m = moments(timeline, id), last = sets[id][sets[id].length - 1]!;
          const labels = (await labelCores(page, frameAt(m.steps[m.steps.length - 1]! - 0.5 * grid))).filter((l) => sets[id].includes(l.source));
          const unlit = labels.find((l) => l.source === last);
          expect(unlit, `control ${id}: the unlit last node is on screen`).toBeTruthy();
          const r = unlit!.flat / Math.max(...labels.map((l) => l.flat));
          console.log(JSON.stringify({ flowGraphUnlitControl: { id, ratio: Math.round(r * 1000) / 1000 } }));
          expect(r, `control ${id}: an unlit node reads dimmed to the oracle`).toBeLessThan(FLAT_MIN);
        }
      } finally {
        await page.close();
      }
    }
    // known-factor control: at the hold, each lit label in turn drawn DIM_K× dimmer (its bbox pixels scaled after the
    // render) must fall below FLAT_MIN — including the brightest label (then judged against the next brightest). This
    // fixes how much dimming the de-vignetted oracle is guaranteed to catch, independent of the module's unlit style
    const DIM_K = 0.9;
    let weakestDim = { r: 0, msg: '' };
    for (const name of ['converge', 'cluster'] as const) {
      const { url, timeline, sets } = films[name]!;
      const page = await openPage(url);
      try {
        for (const id of FLOW_BEATS) {
          const hold = moments(timeline, id).hold;
          for (const src of sets[id]) {
            const labels = (await labelCores(page, hold, { source: src, k: DIM_K })).filter((l) => sets[id].includes(l.source));
            const d = labels.find((l) => l.source === src)!;
            const r = d.flat / Math.max(...labels.map((l) => l.flat));
            if (r > weakestDim.r) weakestDim = { r, msg: `${name} ${id} '${d.text}' dimmed ×${DIM_K}: de-vignetted ratio ${r.toFixed(3)}` };
          }
        }
      } finally {
        await page.close();
      }
    }
    console.log(JSON.stringify({ flowGraphDimControl: { k: DIM_K, weakestCaught: Math.round(weakestDim.r * 1000) / 1000, at: weakestDim.msg } }));
    expect(weakestDim.r, `a node ×${DIM_K} dimmer must fail the oracle — ${weakestDim.msg}`).toBeLessThan(FLAT_MIN);
    for (const N of NEXT_DURATIONS) {
      const { url, timeline, resolved } = films[`next${N}`]!;
      const page = await openPage(url);
      try {
        for (const b of timeline.beats.filter((x: any) => x.archetype === 'flow-graph')) {
          const ids = resolved.beats[b.id].slots.steps.items.map((it: any) => it.id);
          const labels = (await labelCores(page, sheetHold(timeline, b.id))).filter((l) => ids.includes(l.source));
          check(labels, ids.length, `${N}s ${b.id} ${b.variant} sheet hold`, true);
        }
      } finally {
        await page.close();
      }
    }
    console.log(JSON.stringify({ flowGraphHoldLuma: { beats, worstDeVignetted: Math.round(worstFlat.r * 1000) / 1000, atDeVignetted: worstFlat.msg, worstRawSheetHold: Math.round(worst.r * 1000) / 1000, atRaw: worst.msg } }));
    expect.soft(worstFlat.r, worstFlat.msg).toBeGreaterThanOrEqual(FLAT_MIN);
    expect.soft(worst.r, worst.msg).toBeGreaterThanOrEqual(LABEL_LUMA_MIN);
  }, 300_000);

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
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run fit/clipping, determinism, coverage, cue binding, R5 scale, the rendered contact-sheet hold and the rate check', () => {});
  });
}
