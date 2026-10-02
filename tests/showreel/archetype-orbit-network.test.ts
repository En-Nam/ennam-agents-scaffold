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
// The archetype is injected through a test-local page (fixtures/archetypes/orbit-network/page.html) so this
// task does not touch archetypes/index.mjs (the orchestrator registers it after the fan-out).

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
  it('no colour literals: no #hex, no numeric rgb()/rgba() — every colour comes from params.palette', () => {
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(src.match(/rgba?\(\s*\d/g) ?? []).toEqual([]);
    // the guard can fail: the spike scene it was ported from is full of both
    const spike = readFileSync(path.join(REPO, 'spikes', 'showreel-v0', 'scenes', 's4.js'), 'utf8');
    expect((spike.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length).toBeGreaterThan(0);
    expect((spike.match(/rgba?\(\s*\d/g) ?? []).length).toBeGreaterThan(0);
  });
  it('no direct text drawing: fillText/strokeText never appear (all text goes through api.text)', () => {
    expect(src).not.toMatch(/\.(fill|stroke)Text\(/);
    expect(src).toMatch(/api\.text\(/);
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

  it('C14 cue names: overriding `node.2` later moves badge 2 (the picture follows the compiled hit, not the private fallback)', async () => {
    // the archetype's `??` fallback equals the compiler's cue-map formula, so only an override can prove the
    // module reads `node.<i>` by name: a misnamed cue would keep badge 2 at its default pop time.
    const base = CASES.typical();
    const late = film(COUNTS.typical, { weight: 1.5, out: 'cut', cues: [{ name: 'node.2', at: 0.55, kind: 'pop', amp: 0.15 }] });
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
