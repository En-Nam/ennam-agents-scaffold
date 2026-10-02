import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { resolve as resolveStoryboard } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';
import orbitNetwork from '../../templates/showreel/.claude/showreel/archetypes/orbit-network.mjs';
import { ease } from '../../templates/showreel/.claude/showreel/engine/math.mjs';
import { fakeApi, sinkCtx } from './helpers/fake-api';

// v1.16 M2 Task (orbit-network) — port of spike A s4 "Army" (brain-core ignites, badges pop onto a tilted 3D
// orbit, beams + packets, memory ring). Why each guard matters:
//   (a) text fit + safe area: a badge or the hub label that leaves the 48-px safe area is a clipped film; at
//       min / typical / max node counts with near-maxChars facts, fit stays above the family floor and offFrame
//       is empty at progress 0.5, at the last fully-on frame and across the beat (bboxes proven non-null).
//   (b) AC3 determinism: the archetype is a pure function of local time on the GPU path (fresh pages, two
//       launches, two orders, S=1 and S=6) — the 3D sort, cache glow sprite and packets carry no state.
//   (c) Rule 13: every resolved item (hub + every node) is ON SCREEN at the hold frame, and the manifest stays
//       ⊆ resolved (checkManifest — the same oracle `check` uses).
//   (d) palette carry + text API: no colour literals (hex or numeric rgb) and no fillText/strokeText in the file.
//   (e) R5 legibility (row 5: pulse rings crossed every badge label at the hold, 'Tailwind CSS' sat on the sphere
//       edge): from a node's pop + 0.15 s on, its label never overlaps the brain-core disc, NO later draw call
//       (ring, beam, pulse, spark, relay, another badge, …) on the scene canvas changes the label's pixels once the
//       label is drawn, and no opaque badge PILL (drawn after the hub label) overlaps the hub label. Window: up to
//       lastOn only — the rest of the exit collapse is deliberately excluded: there the badges converge on each other
//       and into the singularity, so legibility is not a goal. NOTE the exit's draw ORDER did change vs HEAD c4af0fa
//       (badges now draw after the singularity and the HUD, and a back badge over front memory cells / beams) — an
//       accepted visual change, recorded at the module's scene section; this window does not cover the collapse.
// The browser cases boot a test-local copy of the engine page (fixtures/archetypes/orbit-network/page.html); the
// module is also registered in archetypes/index.mjs (Task 7) and the N-matrix renders it via engine/page.html.

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TOOLKIT = path.join(REPO, 'templates', 'showreel', '.claude', 'showreel');
const FIX = path.join(HERE, 'fixtures', 'archetypes', 'orbit-network');
const SRC = path.join(TOOLKIT, 'archetypes', 'orbit-network.mjs');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCHETYPES = readJson(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJson(path.join(TOOLKIT, 'phrases.json'));
const FACTS = readJson(path.join(FIX, 'facts.json'));
const SPEC = ARCHETYPES.archetypes['orbit-network'];
const FPS = 60, FRAME = 1 / FPS, GRID = 0.125;
const SHEET = path.join(REPO, '.showreel-dev', 'sheets', 'orbit-network-vs-spike.png');

// (e) brain-core on-screen radius bound (beat px) at ONE time t, re-derived from the brain's construction — not read
// back from the module's own clearance R, and not one worst-case constant: the ignition swell (pulseEnergy up to
// its 1.5 cap) and the post-ignite spread (up to 3.5×) make the core far larger right after `ignite`, so a fixed
// r = 222 was looser than the module there. Every module expression copied here is pinned verbatim by the static
// 'core-disc expressions' guard, so a change there fails instead of leaving this bound stale.
const CORE = { cx: 960, cy: 500, foc: 2200, sph: 200, jitter: 1.03, tremble: 4.5 };
const exDecay = (dt: number, k: number) => (dt >= 0 ? Math.exp(-dt * k) : 0);
function coreBound(t: number, ign: number, pops: number[]) {
  let e = 0.8 * exDecay(t - ign, 6);
  for (const p of pops) e += 0.15 * exDecay(t - p, 9) * 1.3;
  const pulse = Math.min(e, 1.5), bt = t - ign;
  const spread = bt < 0 ? 1 : 1 + 2.5 * (1 - ease.spring(Math.min(1, Math.max(0, bt / 0.75)), 7));
  const swell = 1 + 0.075 * pulse;                                       // Rs / SPH ≤ swell ((1 − U⁴)·ramp ≤ 1)
  const r3 = CORE.sph * swell * Math.max(1, spread) * CORE.jitter;       // outermost shell node, 3D radius
  const persp = 1 / Math.sqrt(1 - (r3 / CORE.foc) ** 2);                 // largest on-screen radius of a sphere point
  const dot = (1.7 + 2 + 3.4 * 1.2 + 0.6) * (CORE.foc / (CORE.foc - r3)) * swell; // node dot: d ≤ 1, lit ≤ 1.2, twinkle ≤ 1
  return { r: r3 * persp + dot + CORE.tremble, pulse, spread };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Item = { id: string; text: string };
type Entry = { text: string; source: string; bbox: { x: number; y: number; w: number; h: number } | null };

const NODE_IDS = ['f.stack.item.1', 'f.feature.1', 'f.route.1', 'f.stack.item.2', 'f.feature.2', 'f.route.2', 'f.stack.item.3', 'f.feature.3'];
const COUNTS = { min: SPEC.slots.nodes.min, typical: Math.ceil((SPEC.slots.nodes.min + SPEC.slots.nodes.max) / 2), max: SPEC.slots.nodes.max };

/** 15 s film around one orbit-network beat (b2). extra = a kinetic beat before the lockup (shorter b2). */
function film(n: number, { weight = 1.5, out = 'zoom-through', extra = false, hub = 'f.app.name.1', cues = [] as any[] } = {}) {
  const beats: any[] = [
    { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1, bindings: { command: 'f.command.1' }, phrases: {}, transitionOut: 'zoom-through' },
    { id: 'b2', archetype: 'orbit-network', variant: 'orbit', weight, bindings: { hub, nodes: NODE_IDS.slice(0, n) }, phrases: {}, transitionOut: out, ...(cues.length ? { cues } : {}) },
    { id: 'b3', archetype: 'kinetic-text', variant: 'stack', weight: 1, bindings: { lines: ['f.app.tagline.1'] }, phrases: {}, transitionOut: 'cut' },
  ];
  if (extra) beats.push({ id: 'b4', archetype: 'kinetic-text', variant: 'punch', weight: 1, bindings: { lines: ['f.feature.1'] }, phrases: {}, transitionOut: 'cut' });
  beats.push({ id: `b${beats.length + 1}`, archetype: 'lockup-cta', variant: 'center', weight: 1.25, bindings: { name: 'f.app.name.1', tagline: 'f.app.tagline.1' }, phrases: {}, transitionOut: 'cut' });
  const sb = { version: 1, durationS: 15, seed: 7, palette: 'violet', beats };
  const resolved = resolveStoryboard(sb, { archetypes: ARCHETYPES, facts: FACTS, phrases: PHRASES });
  const timeline = compileTimeline(sb, resolved, ARCHETYPES, { fps: FPS });
  const b2 = timeline.beats.find((b: any) => b.id === 'b2');
  const hit = (cue: string) => timeline.hits.find((h: any) => h.beatId === 'b2' && h.cue === cue).t;
  return { sb, resolved, timeline, b2, hit };
}
type Film = ReturnType<typeof film>;

describe('orbit-network static guards (palette carry, text API)', () => {
  const src = readFileSync(SRC, 'utf8');
  it('module exports id/layout/draw and the id is an archetypes.json key with the C13 slots', () => {
    expect(orbitNetwork.id).toBe('orbit-network');
    expect(typeof orbitNetwork.layout).toBe('function');
    expect(typeof orbitNetwork.draw).toBe('function');
    expect(Object.keys(SPEC.slots).sort()).toEqual(['hub', 'nodes']);
  });
  // no colour literals: one table-driven ban over every archetype module (engine-static.test.ts)
  it('badge colours are palette roles or mixes of roles (api.accents), and the orbit phase has ONE spin constant', () => {
    expect(src).toMatch(/const cycle = api\.accents\(N\)/);
    expect(src).not.toMatch(/P\.(violet|cyan|amber|magenta|red)\b/);
    // the badge phase is anchored to the archetype's own army flare, not to a reviewer's sample moment
    expect(src).not.toMatch(/0\.576/);
    expect(src).not.toMatch(/0\.62 \* \(/); // the spin rate is never a second literal copy
    expect(src).toMatch(/ph0 = .*ORBIT_W \* \(T\.army - T\.ign\)/);
    expect(src).toMatch(/orbitSpin = \(u\) => ORBIT_W \*/);
  });
  it('a missing cue (`ignite` or a `node.<i>`) fails layout loudly naming it — no re-derived schedule', () => {
    const items = NODE_IDS.slice(0, 3).map((id) => ({ id, text: 'x', number: null, unit: null }));
    const rb = { archetype: 'orbit-network', variant: 'orbit', slots: { hub: { source: 'fact', items: [{ id: 'f.app.name.1', text: 'Acme', number: null, unit: null }], fitSizePx: null }, nodes: { source: 'fact', items, fitSizePx: null } } };
    const all = { ignite: 0.5, 'node.0': 1, 'node.1': 1.25, 'node.2': 1.5 };
    for (const missing of ['ignite', 'node.2']) {
      const cues: Record<string, number> = { ...all };
      delete cues[missing];
      expect(() => orbitNetwork.layout(rb, 'orbit', fakeApi({ cues, beatId: 'b2', archetype: 'orbit-network' })), missing).toThrow(new RegExp(`has no cue "${missing.replace('.', '\\.')}"`));
    }
    expect(src).not.toMatch(/cues(\[[^\]]+\]|\.\w+)\s*\?\?/);
  });
  it('no direct text drawing: fillText/strokeText never appear (all text goes through api.text)', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).toMatch(/api\.text\(/);
  });
  // (e) cross-check: coreBound (top of file) copies these module expressions — the WHOLE pulseEnergy (ignition term,
  // per-pop term, cap), the spread spring, the core radius, the shell jitter, the node-dot size and the pre-collapse
  // tremble. If one changes, this fails and points at the stale copy instead of letting the (e) bound drift.
  it('core-disc expressions still match the (e) legibility bound (coreBound)', () => {
    const m = src.match(/const CX = (\d+), CY = (\d+), FOC = (\d+), SPH = (\d+);/);
    expect(m, 'CX/CY/FOC/SPH declaration').toBeTruthy();
    expect(m!.slice(1).map(Number)).toEqual([CORE.cx, CORE.cy, CORE.foc, CORE.sph]);
    for (const expr of [
      'const ex = (dt, decay) => (dt >= 0 ? Math.exp(-dt * decay) : 0);',
      'let e = 0.8 * ex(u - T.ign, 6);',                                      // ignition swell
      'for (const pt of T.pop) e += 0.15 * ex(u - pt, 9) * 1.3;',             // per-pop swell
      'return Math.min(e, 1.5);',                                              // cap
      'Rs: SPH * (1 + 0.075 * pulseEnergy(u)) * (1 - Math.pow(exitU(u), 4)) * clamp(bt / 0.12),',
      'spread: 1 + 2.5 * (1 - ease.spring(clamp(bt / 0.75), 7)),',
      'const x = q[0] * k, y = q[1] * k, z = q[2] * k;',                       // nodes at Rs · spread · |q|
      'const r = (1.7 + 2 * d + 3.4 * l + 0.6 * tw) * S[i] * (Rs / SPH) * nIn;',
      'return Math.min(l, 1.2);',                                              // lit ≤ 1.2
      'const cx = CX + (hash(fr) - 0.5) * 9 * U, cy = CY + (hash(fr + 7) - 0.5) * 9 * U;', // tremble ≤ 4.5 px
    ]) expect(src, expr).toContain(expr);
    expect(src).toMatch(/k = 0\.96 \+ 0\.07 \* rn\(\);/);                        // shell |q| ≤ 1.03 (inner shell ≤ 0.74)
    expect(src).toContain('const q = nodes[i], k = Rs * spread;');
    // the bound is time-dependent where it must be: right after ignite it is far above the settled core
    const settled = coreBound(10, 0, [1]).r, early = coreBound(0.05, 0, [0.04]).r; // spread ≈ 2.4 at 0.05 s
    expect(settled).toBeGreaterThan(CORE.sph * CORE.jitter);
    expect(settled).toBeLessThan(240);
    expect(early).toBeGreaterThan(settled * 1.5);
  });
  // (e) cross-check: the pill probe (fixtures/archetypes/orbit-network/page.html) identifies a badge pill by its
  // rr() radius 30 and height CHIP_H 82; if the chip geometry changes, the probe would silently record nothing.
  it('the badge pill is the chip rr(…, 30) of height CHIP_H = 82 the (e) pill probe keys on', () => {
    expect(src).toMatch(/const CHIP_H = 82,/);
    expect(src).toContain('rr(ctx, -w / 2, -h / 2, w, h, 30); ctx.fillStyle = P.ink2; ctx.fill();');
    expect(readFileSync(path.join(FIX, 'page.html'), 'utf8')).toContain('if (r === 30 && h === 82)');
  });
  // Rule 12: pose() pushes a badge out along the ray from the core until its label clears it. If no push up to
  // 1024× clears (a corrupt pose — e.g. a NaN chip width from a broken measure), it must throw, not return a
  // badge flung off-frame. Positive control: the same frame with sane widths draws.
  it('a badge pose that cannot clear the brain-core fails loudly (no silent off-frame fling)', () => {
    const items = NODE_IDS.slice(0, 3).map((id) => ({ id, text: 'Some node label', number: null, unit: null }));
    const rb = { archetype: 'orbit-network', variant: 'orbit', slots: { hub: { source: 'fact', items: [{ id: 'f.app.name.1', text: 'Acme', number: null, unit: null }], fitSizePx: null }, nodes: { source: 'fact', items, fitSizePx: null } } };
    const cues = { ignite: 0.5, 'node.0': 1, 'node.1': 1.25, 'node.2': 1.5 };
    const api = fakeApi({ cues, beatId: 'b2', archetype: 'orbit-network', dur: 4 });
    const L = orbitNetwork.layout(rb, 'orbit', api);
    const draw = (layout: any) => orbitNetwork.draw(sinkCtx(), 2, { api, layout, dur: 4 }, rb, cues);
    expect(() => draw(L)).not.toThrow();
    const corrupt = { ...L, chips: L.chips.map((c: any) => ({ ...c, w: NaN })) };
    expect(() => draw(corrupt)).toThrow(/orbit-network: badge \d cannot clear the brain-core/);
  });
  it('fixture texts are near maxChars (20 for nodes, 24 for hub), so the fit cases are worst-case', () => {
    const byId = new Map(FACTS.facts.map((f: any) => [f.id, f]));
    for (const id of NODE_IDS) expect([...(byId.get(id) as any).display].length, id).toBeGreaterThanOrEqual(18);
    expect([...(byId.get('f.app.name.1') as any).display].length).toBe(SPEC.slots.hub.maxChars);
  });
});

describe.skipIf(!E2E)('orbit-network in the browser (SHOWREEL_E2E=1)', () => {
  let puppeteer: any;
  let exe: string;
  const cleanups: (() => Promise<void> | void)[] = [];

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const candidates = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    const found = candidates.find((p) => p && existsSync(p));
    if (!found) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    exe = found;
    const mod = await loadDep('puppeteer-core', process.cwd());
    puppeteer = mod.default ?? mod;
  }, 180_000);
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  }, 120_000);

  async function serve(f: Film) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-orbit-'));
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
  const renderManifest = (page: any, t: number): Promise<Entry[]> =>
    page.evaluate((t: number) => { (window as any).SHOWREEL.renderAt(t, 1); return (window as any).SHOWREEL.manifest(); }, t);
  const hashAt = (page: any, t: number, S: number): Promise<string> =>
    page.evaluate(async (t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const h = await crypto.subtle.digest('SHA-256', d);
      return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }, t, S);
  const b2Items = (f: Film): Item[] => [...f.resolved.beats.b2.slots.hub.items, ...f.resolved.beats.b2.slots.nodes.items];
  // last frame on which the beat is alone AND its text is fully on: the outgoing overlap starts at
  // t1 − overlapOut; the archetype's exit sends the text into the singularity from dur − 2 GRID.
  const lastOn = (f: Film) => Math.min(f.b2.t1 - f.b2.overlapOut, f.b2.t1 - 2 * GRID) - FRAME;

  const CASES = {
    min: () => film(COUNTS.min, { weight: SPEC.minWeight, extra: true }), // shortest realistic beat (5-beat 15 s film)
    typical: () => film(COUNTS.typical, { weight: 1.5, out: 'cut' }),
    max: () => film(COUNTS.max, { weight: 2 }),
  };

  it('(a)+(c) min / typical / max N with near-maxChars texts: fit above the floor, every item on screen, nothing off the safe area', async () => {
    const browser = await launch();
    const report: Record<string, unknown> = {};
    try {
      for (const [name, make] of Object.entries(CASES)) {
        const f = make();
        const n = f.resolved.beats.b2.slots.nodes.items.length;
        expect(n, name).toBe(COUNTS[name as keyof typeof COUNTS]);
        const page = await openPage(browser, await serve(f));
        const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
        expect(fit.b2.hub, `${name} hub fit`).toBeGreaterThanOrEqual(28);
        expect(fit.b2.nodes, `${name} nodes fit`).toBeGreaterThanOrEqual(28); // display + mono items share one px
        const dur = f.b2.t1 - f.b2.t0;
        const alone = (t: number) => t >= f.b2.t0 + f.b2.overlapIn && t < f.b2.t1 - f.b2.overlapOut;
        const keys = { half: f.b2.t0 + 0.5 * dur, hold: f.b2.t0 + 0.6 * dur, lastOn: lastOn(f) };
        for (const [k, t] of Object.entries(keys)) {
          expect(alone(t), `${name} ${k} is a solo frame`).toBe(true);
          const m = await renderManifest(page, t);
          // (c) every resolved item is drawn IN this frame (bbox non-null) — offFrame below cannot pass vacuously
          for (const it of b2Items(f)) {
            const e = m.find((x) => x.source === it.id && x.text === it.text);
            expect(e?.bbox, `${name} @${k}: ${it.id} "${it.text}" not on screen`).toBeTruthy();
          }
          expect(offFrame(m), `${name} @${k}`).toEqual([]);
        }
        // sweep the whole solo window (ignite, pops, relays, exit collapse): never off the safe area
        let checked = 0;
        for (let k = 0; k <= 40; k++) {
          const t = f.b2.t0 + (k / 40) * dur;
          if (!alone(t)) continue;
          expect(offFrame(await renderManifest(page, t)), `${name} sweep t=${t.toFixed(3)}`).toEqual([]);
          checked++;
        }
        expect(checked).toBeGreaterThan(30);
        // (c) Rule 13: manifest ⊆ resolved after all of the above
        expect(checkManifest(await page.evaluate(() => (window as any).SHOWREEL.manifest()), f.resolved)).toEqual([]);
        report[name] = { n, durS: dur, fit: fit.b2, pops: n };
        await page.close();
      }
      // the fit check can fail: a hub that cannot fit at the 28-px floor reports null (check fails, no silent clip)
      const long = film(COUNTS.typical);
      (long.resolved.beats.b2.slots.hub.items[0] as any).text = 'Northwind Commerce Suite '.repeat(6).trim();
      const page = await openPage(browser, await serve(long));
      const fitLong = await page.evaluate(() => (window as any).SHOWREEL.fit());
      expect(fitLong.b2.hub).toBeNull();
      expect(fitLong.b2.nodes).toBeGreaterThanOrEqual(28); // only the offending slot fails
    } finally {
      await browser.close();
    }
    console.log(JSON.stringify({ orbitNetworkCases: report }));
  }, 300_000);

  it('C14 cue names: moving the compiled `node.2` hit moves badge 2 (the picture follows the hit by name)', async () => {
    // A storyboard override can no longer reorder a cue map (validate + compile refuse it: badges pop in index
    // order), so the proof moves the COMPILED hit itself: if draw() read anything but cues["node.2"], badge 2
    // would keep its default pop time. (A missing `node.<i>` fails the boot — the static fail-loud test.)
    const base = CASES.typical();
    const late = CASES.typical();
    const h = late.timeline.hits.find((x: any) => x.beatId === 'b2' && x.cue === 'node.2');
    h.t = Math.round((h.t + 0.6) * FPS) / FPS;
    const id = NODE_IDS[2]!;
    const h2 = (f: Film) => f.hit('node.2');
    expect(h2(late)).toBeGreaterThan(h2(base) + 0.5);
    const drawn = async (page: any, t: number) => (await renderManifest(page, t)).filter((e) => e.source === id && e.bbox);
    const browser = await launch();
    try {
      const pb = await openPage(browser, await serve(base));
      const pl = await openPage(browser, await serve(late));
      const probe = h2(late) - 2 * FRAME; // default badge 2 has long popped; the overridden one has not
      expect((await drawn(pb, probe)).length, 'default film: badge 2 on screen').toBeGreaterThan(0);
      expect((await drawn(pl, probe)).length, 'override: badge 2 not yet popped').toBe(0);
      expect((await drawn(pl, h2(late) + 0.2)).length, 'override: badge 2 popped after its hit').toBeGreaterThan(0);
      // the other badges keep their compiled hits: badge 1 is on screen in both films at the probe
      for (const pg of [pb, pl]) expect((await renderManifest(pg, probe)).some((e) => e.source === NODE_IDS[1] && e.bbox)).toBe(true);
    } finally {
      await browser.close();
    }
  }, 120_000);

  // (e) R5 legibility. Three oracles per sampled frame (S=1, so one render = one draw of each label):
  //   1. geometry: the manifest bbox of every live node label (device px) vs the brain-core disc. The disc radius is
  //      coreBound(t) (top of file: re-derived from the brain's construction AT t — ignition swell, spread, jitter,
  //      perspective, node dot, tremble — every copied expression pinned by the static guard), and the disc is mapped
  //      to device px through the transform the beat actually drew under at t (fixture probe S.xf: camera push,
  //      drift, shake, roll), so no shake slack is guessed. Only 1 px of bbox rounding slack.
  //   2. pixels: every 2D draw call on the stage's scene layer is wrapped; once a label's fillText has run, any
  //      later call that moves a pixel of that label's bbox by more than OVERDRAW_TH (of 255) is a violation —
  //      so a ring/beam/pulse drawn over the label fails, whatever shape it is. Under-drawing is fine: the badge
  //      is an opaque pill, so anything the scene drew before it cannot show through the label.
  //      Scope: ONLY the canvas that ran the label's fillText (the scene layer, where every ring/beam/pulse is
  //      drawn). Anything composited over that region later from another canvas (a stage-level bloom pass, a HUD
  //      blitted via drawImage onto a different canvas) is NOT covered by this oracle.
  //   3. hub lane: pose() pushes badges outward with no lane re-check, and the opaque pills now draw AFTER the hub
  //      label, so a pill pushed into the lower lane would cover resolved hub text (Rule 13) — oracle 2 tracks node
  //      labels only. Every badge PILL drawn in the frame (fixture probe S.pills: the pill's device-px rect) must be
  //      disjoint from every hub-label manifest box; checked on every sampled frame where the hub is drawn.
  const OVERDRAW_TH = 24;
  type Xf = { a: number; b: number; c: number; d: number; e: number; f: number };
  type Box = { x: number; y: number; w: number; h: number };
  /** render t (S=1) with the probes reset first, so a beat that was not drawn cannot leave a stale transform */
  const probeFrame = (page: any, t: number): Promise<{ m: Entry[]; xf: Xf | undefined; pills: Box[] }> =>
    page.evaluate((t: number) => {
      const S = (window as any).SHOWREEL;
      S.xf = {}; S.pills = {};
      S.renderAt(t, 1);
      return { m: S.manifest(), xf: S.xf.b2, pills: S.pills.b2 ?? [] };
    }, t);
  const OVERDRAW = `(() => {
    if (window.__overdraw) return;
    const P = CanvasRenderingContext2D.prototype;
    let W = null;
    const grab = (ctx, L) => ctx.getImageData(L.x, L.y, L.w, L.h).data;
    for (const op of ['fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'strokeText', 'putImageData', 'clearRect']) {
      const orig = P[op];
      P[op] = function (...a) {
        const r = orig.apply(this, a);
        if (!W) return r;
        let self = null;
        if (op === 'fillText') { self = W.labels.find((l) => l.text === a[0]) || null; if (self) { W.canvas = this.canvas; self.snap = grab(this, self); } }
        if (this.canvas !== W.canvas) return r;
        for (const L of W.labels) {
          if (!L.snap || L === self) continue;
          const now = grab(this, L);
          let n = 0, max = 0;
          for (let k = 0; k < now.length; k += 4) {
            const d = Math.max(Math.abs(now[k] - L.snap[k]), Math.abs(now[k + 1] - L.snap[k + 1]), Math.abs(now[k + 2] - L.snap[k + 2]));
            if (d > max) max = d;
            if (d > ${OVERDRAW_TH}) n++;
          }
          if (n > 0 && W.out.length < 40) W.out.push({ label: L.text, op, px: n, maxDelta: max, comp: this.globalCompositeOperation, style: String(op.indexOf('stroke') === 0 ? this.strokeStyle : this.fillStyle).slice(0, 32) });
          L.snap = now;
        }
        return r;
      };
    }
    window.__overdraw = (labels, t) => {
      W = { canvas: null, out: [], labels: labels.map((l) => {
        const x = Math.floor(l.bbox.x), y = Math.floor(l.bbox.y);
        return { text: l.text, x, y, w: Math.ceil(l.bbox.x + l.bbox.w) - x, h: Math.ceil(l.bbox.y + l.bbox.h) - y, snap: null };
      }) };
      const cur = W;
      try { window.SHOWREEL.renderAt(t, 1); } finally { W = null; }
      return { violations: cur.out, drawn: cur.labels.filter((l) => l.snap).length };
    };
  })()`;

  it('(e) R5 legibility: from pop + 0.15 s on, no node label touches the core disc, nothing is drawn over a label, no pill covers the hub label', async () => {
    const browser = await launch();
    const snapF = (t: number) => Math.round(t * FPS) / FPS;
    const report: Record<string, unknown> = {};
    try {
      for (const name of ['typical', 'max'] as const) {
        const f = CASES[name]();
        const page = await openPage(browser, await serve(f));
        await page.evaluate(OVERDRAW);
        const nodes: Item[] = f.resolved.beats.b2.slots.nodes.items;
        const pops = nodes.map((_, i) => f.hit(`node.${i}`));
        const a = f.b2.t0 + f.b2.overlapIn, z = f.b2.t1 - f.b2.overlapOut, end = lastOn(f);
        const hold = snapF(a + 0.6 * (z - a)); // the R5 / contact-sheet hold moment (render/sheet.mjs sheetTimes)
        const from = pops[0]! + 0.15;
        const times = new Set<number>([hold, hold - 3 * FRAME, hold + 3 * FRAME, ...pops.map((p) => snapF(p + 0.15) + FRAME)]);
        for (let k = 0; k <= 16; k++) times.add(snapF(from + (k / 16) * (end - from)));
        const ign = f.hit('ignite'), hubId = f.resolved.beats.b2.slots.hub.items[0].id;
        const sphereHits: string[] = [], over: unknown[] = [], laneHits: string[] = [];
        let frames = 0, labels = 0, hubFrames = 0, pillsChecked = 0, maxR = 0;
        for (const t of [...times].sort((x, y) => x - y)) {
          if (t > end || t < a) continue;
          const live = nodes.filter((_, i) => t >= pops[i]! + 0.15);
          if (!live.length) continue;
          const { m, xf, pills } = await probeFrame(page, t);
          expect(xf, `${name} t=${t.toFixed(3)}: the beat drew (device transform recorded)`).toBeTruthy();
          const boxes = live.map((it) => {
            const e = m.find((x) => x.source === it.id && x.text === it.text);
            expect(e?.bbox, `${name} t=${t.toFixed(3)}: label "${it.text}" not drawn`).toBeTruthy();
            return { text: it.text, bbox: e!.bbox! };
          });
          // 1. core disc at t, mapped through the beat's actual device transform
          const { r } = coreBound(t, ign, pops);
          const cx = xf!.a * CORE.cx + xf!.c * CORE.cy + xf!.e, cy = xf!.b * CORE.cx + xf!.d * CORE.cy + xf!.f;
          const rDev = r * Math.sqrt(Math.abs(xf!.a * xf!.d - xf!.b * xf!.c)) + 1;
          maxR = Math.max(maxR, rDev);
          for (const { text, bbox: b } of boxes) {
            const dx = Math.max(b.x - cx, 0, cx - (b.x + b.w)), dy = Math.max(b.y - cy, 0, cy - (b.y + b.h));
            const d = Math.hypot(dx, dy);
            if (d < rDev) sphereHits.push(`t=${t.toFixed(3)} "${text}" ${d.toFixed(0)} px from the core centre (< ${rDev.toFixed(0)})`);
          }
          // 3. hub lane: no opaque pill over any hub-label box
          const hub = m.filter((x) => x.source === hubId && x.bbox).map((x) => x.bbox!);
          expect(pills.length, `${name} t=${t.toFixed(3)}: a pill per live badge recorded`).toBeGreaterThanOrEqual(live.length);
          if (hub.length) {
            hubFrames++;
            for (const p of pills) {
              pillsChecked++;
              for (const h of hub) {
                if (p.x < h.x + h.w && h.x < p.x + p.w && p.y < h.y + h.h && h.y < p.y + p.h) {
                  laneHits.push(`t=${t.toFixed(3)} pill [${p.x.toFixed(0)},${p.y.toFixed(0)} ${p.w.toFixed(0)}x${p.h.toFixed(0)}] over hub box [${h.x.toFixed(0)},${h.y.toFixed(0)} ${h.w.toFixed(0)}x${h.h.toFixed(0)}]`);
                }
              }
            }
          }
          const res = await page.evaluate((ls: unknown, t: number) => (window as any).__overdraw(ls, t), boxes, t);
          expect(res.drawn, `${name} t=${t.toFixed(3)}: every live label's fillText was observed`).toBe(boxes.length);
          for (const v of res.violations) over.push({ t: Number(t.toFixed(3)), ...v });
          frames++; labels += boxes.length;
        }
        expect(frames, `${name}: frames checked`).toBeGreaterThanOrEqual(14);
        expect(labels, `${name}: labels checked`).toBeGreaterThan(frames * 3);
        expect(hubFrames, `${name}: frames with the hub label drawn (lane oracle live)`).toBeGreaterThanOrEqual(8);
        expect(over, `${name}: draw calls over a drawn label`).toEqual([]);
        expect(sphereHits, `${name}: labels on the brain-core disc`).toEqual([]);
        expect(laneHits, `${name}: badge pills over the hub label`).toEqual([]);
        report[name] = { frames, labels, hubFrames, pillsChecked, maxCoreRadiusPx: Math.round(maxR) };
        await page.close();
      }
    } finally {
      await browser.close();
    }
    console.log(JSON.stringify({ orbitNetworkLegibility: report }));
  }, 600_000);

  it('(b) determinism: 4 timestamps x fresh pages x 2 launches (2 orders) x S=1/S=6 hash identically', async () => {
    const f = CASES.typical();
    const url = await serve(f);
    const n = f.resolved.beats.b2.slots.nodes.items.length;
    const T = [f.hit('ignite') + 2 * FRAME, f.hit(`node.${n - 1}`) + FRAME, f.b2.t0 + 0.6 * (f.b2.t1 - f.b2.t0), f.b2.t1 - 1.5 * GRID];
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
        result[S].push(byT);
      }
    }
    for (const S of [1, 6]) for (const t of T) expect(result[S][1][t], `S=${S} t=${t}`).toBe(result[S][0][t]);
    expect(new Set(T.map((t) => result[1][0][t])).size).toBe(T.length); // frames change over time
    expect(T.filter((t) => result[1][0][t] !== result[6][0][t]).length).toBe(T.length); // motion blur is real
  }, 300_000);

  it('rate check + self-check sheet: S=6 ms/frame (60 frames mid-beat, JPEG q0.97); spike s4 vs orbit-network stills', async () => {
    const f = CASES.typical();
    const url = await serve(f);
    const n = f.resolved.beats.b2.slots.nodes.items.length;
    const dur = f.b2.t1 - f.b2.t0;
    const browser = await launch();
    try {
      const page = await openPage(browser, url);
      const t0 = f.b2.t0 + 0.5 * dur - 30 * FRAME;
      const [ms, msJpeg] = await page.evaluate((t0: number, fr: number) => {
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
      const rate = { orbitNetworkRateS6msPerFrame: Math.round(ms * 10) / 10, withJpegQ097: Math.round(msJpeg * 10) / 10, renderer: await page.evaluate(() => (window as any).SHOWREEL.renderer) };
      console.log(JSON.stringify(rate));
      mkdirSync(path.dirname(SHEET), { recursive: true });
      writeFileSync(SHEET.replace(/\.png$/, '-rate.json'), JSON.stringify(rate) + '\n'); // vitest may swallow console output
      expect(ms).toBeGreaterThan(0);

      // stills: M2 at enter / hit / hold / exit (S=6) next to spike A s4 at the matching moments (S=6)
      const still = async (p: any, fn: string) => p.evaluate(fn);
      const m2At = async (t: number) => still(page, `(() => { window.SHOWREEL.renderAt(${t}, 6); return document.getElementById('stage').toDataURL('image/png'); })()`);
      const rows: [string, number, string, number][] = [
        ['enter (ignite + 0.15 s)', 9.45, 'enter', f.hit('ignite') + 0.15],
        ['hit (pop mid)', 10.05 + 2 * FRAME, 'hit', f.hit(`node.${Math.floor(n / 2)}`) + 2 * FRAME],
        ['hold (army, R5 ref t=10.8)', 10.8, 'hold', f.b2.t0 + 0.576 * dur],
        ['exit (singularity)', 11.95, 'exit', f.b2.t1 - 2 * GRID],
      ];
      const spike = await browser.newPage();
      await spike.setViewport({ width: 1920, height: 1080 });
      await spike.goto(pathToFileURL(path.join(REPO, 'spikes', 'showreel-v0', 'index.html')).href, { waitUntil: 'load' });
      await spike.waitForFunction('window.READY === true');
      const cells: { label: string; url: string }[] = [];
      for (const [sl, st, ml, mt] of rows) {
        cells.push({ label: `spike A s4 t=${st.toFixed(2)} — ${sl}`, url: await still(spike, `(() => { window.renderAt(${st}, undefined, 6); return document.getElementById('stage').toDataURL('image/png'); })()`) });
        cells.push({ label: `M2 orbit-network N=${n} lt=${(mt - f.b2.t0).toFixed(2)}/${dur.toFixed(2)} — ${ml}`, url: await m2At(mt) });
      }
      // max N (8 badges, wider/steeper orbit) at the hold moment — eyeballed here, not only asserted
      const fMax = CASES.max();
      const dMax = fMax.b2.t1 - fMax.b2.t0, tMax = fMax.b2.t0 + 0.576 * dMax;
      const pMax = await openPage(browser, await serve(fMax));
      cells.push({ label: 'spike A s4 t=10.80 — hold (reference)', url: cells[4]!.url });
      cells.push({ label: `M2 orbit-network N=${COUNTS.max} lt=${(tMax - fMax.b2.t0).toFixed(2)}/${dMax.toFixed(2)} — hold (max N)`,
        url: await still(pMax, `(() => { window.SHOWREEL.renderAt(${tMax}, 6); return document.getElementById('stage').toDataURL('image/png'); })()`) });
      const sheet = await browser.newPage();
      await sheet.setContent('<html><body style="margin:0;background:black"></body></html>');
      const png: string = await sheet.evaluate(async (cells: { label: string; url: string }[]) => {
        const cw = 960, ch = 540, lab = 36;
        const cv = document.createElement('canvas');
        cv.width = cw * 2; cv.height = (ch + lab) * (cells.length / 2);
        const g = cv.getContext('2d')!;
        g.fillStyle = 'black'; g.fillRect(0, 0, cv.width, cv.height);
        for (let i = 0; i < cells.length; i++) {
          const img = new Image(); img.src = cells[i]!.url; await img.decode();
          const x = (i % 2) * cw, y = Math.floor(i / 2) * (ch + lab);
          g.fillStyle = 'white'; g.font = '22px sans-serif'; g.fillText(cells[i]!.label, x + 12, y + 26);
          g.drawImage(img, x, y + lab, cw, ch);
        }
        return cv.toDataURL('image/png');
      }, cells);
      mkdirSync(path.dirname(SHEET), { recursive: true });
      writeFileSync(SHEET, Buffer.from(png.split(',')[1]!, 'base64'));
      expect(existsSync(SHEET)).toBe(true);
    } finally {
      await browser.close();
    }
  }, 300_000);
});

// Registered only when E2E is off: a full E2E run must report 0 skipped (Rule 12).
if (!E2E) {
  describe('orbit-network in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run fit/safe-area, determinism, manifest, rate + sheet', () => {});
  });
}
