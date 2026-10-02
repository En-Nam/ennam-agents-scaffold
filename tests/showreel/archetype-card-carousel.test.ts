import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';
import {
  ARCHETYPE_FILE, SPEC, COUNTS, NEAR_MAX, STORYBOARDS, buildFilm, serveFilm, openPage, beatTimes,
} from './fixtures/archetypes/card-carousel/film.mjs';

// v1.16 showreel M2 Task 4 — card-carousel archetype (new, spike A glass-card language).
//   (a) min / typical / max cards × both variants with near-maxChars (32) texts: every slot fits (no null),
//       and NO drawn text leaves the 1920×1080 frame minus the 48 px safe margin at local progress 0.5 and on the
//       beat's last fully-on frame (C16). A nudged draw() proves the oracle can fail for this archetype.
//   (b) determinism: 4 timestamps × 2 fresh pages × S=1 and S=6 → identical RGBA hashes (AC3 class).
//   (c) every resolved item reaches the screen by the hold frame; manifest ⊆ resolved (D8 / Rule 13).
//   (d) static: no colour literals (palette only — review focus 4), no fillText/strokeText, no canvas creation.
// The archetype is injected by a test-local page (fixtures/archetypes/card-carousel/page.html), not index.mjs.

const E2E = process.env.SHOWREEL_E2E === '1';
const SRC = readFileSync(ARCHETYPE_FILE, 'utf8');
const CODE = SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // comments may name colours

type Entry = { text: string; source: string; bbox: { x: number; y: number; w: number; h: number } | null };
/* eslint-disable @typescript-eslint/no-explicit-any */
type Browser = any;
type Page = any;

describe('card-carousel — static contract (d)', () => {
  // palette-only colours: one table-driven ban over every archetype module (engine-static.test.ts)

  it('no placeholder text shapes (core.mjs rule, shared with flow-graph): no skeleton bars on cards or ghost slots', () => {
    // a grey bar where a label would be reads as a missing label (R5); the cards carry their real fact text
    expect(CODE).not.toMatch(/skeleton/i);
    // card accents come from the palette roles (api.accents), never a named hue the palette did not pick
    expect(CODE).toMatch(/const accents = api\.accents\(N\)/);
  });

  it('draws text only through api.text, creates canvases only through api.makeCanvas', () => {
    expect(CODE).not.toMatch(/\.(fillText|strokeText)\s*\(/);
    expect(CODE).not.toMatch(/createElement|OffscreenCanvas|getContext/);
    expect(CODE).toMatch(/api\.text\(/);
  });

  it('reads the cue-map hits card.<i> and the settle cue, never absolute times, never a made-up fallback', () => {
    expect(CODE).toMatch(/api\.cue\('card\.' \+ i\)/);
    expect(CODE).toMatch(/api\.cue\('settle'\)/);
    expect(CODE).not.toMatch(/cues(\[[^\]]+\]|\.\w+)\s*\?\?/); // `cues[x] ?? guess` would hide a broken timeline
    expect(SPEC.cueMaps.map((m: any) => m.name)).toEqual(['card']);
    expect(SPEC.defaultCues.map((c: any) => c.name)).toEqual(['settle']);
  });

  it('fixture films: near-maxChars texts are really at maxChars, and the cue map yields one hit per card', () => {
    for (const f of NEAR_MAX) expect([...f.display].length, f.id).toBe(SPEC.slots.cards.maxChars);
    for (const name of Object.keys(STORYBOARDS)) {
      const { timeline, sb } = buildFilm(name);
      for (const b of sb.beats.filter((x: any) => x.archetype === 'card-carousel')) {
        const cues = timeline.hits.filter((h: any) => h.beatId === b.id).map((h: any) => h.cue).sort();
        expect(cues, `${name}.${b.id}`).toEqual([...b.bindings.cards.map((_: string, i: number) => `card.${i}`), 'settle'].sort());
      }
    }
    expect(Object.values(COUNTS)).toEqual([3, 5, 6]);
  });
});

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

describe.skipIf(!E2E)('card-carousel in the browser (SHOWREEL_E2E=1)', () => {
  let puppeteer: any;
  let exe: string;
  const cleanups: (() => Promise<void> | void)[] = [];
  const toolDir = () => process.env.SHOWREEL_TOOL_DIR!;

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const found = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...BROWSERS].find((p) => p && existsSync(p));
    if (!found) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    exe = found;
    const mod = await loadDep('puppeteer-core', process.cwd());
    puppeteer = mod.default ?? mod;
  }, 180_000);
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c();
  }, 120_000);

  async function serve(name: string, mutate?: (tl: any, rs: any) => void) {
    const f = await serveFilm(name, { toolDir: toolDir(), mutate });
    cleanups.push(() => f.close());
    return f;
  }
  async function launch(): Promise<Browser> {
    const udd = mkdtempSync(path.join(os.tmpdir(), 'showreel-card-udd-'));
    const b = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs(), userDataDir: udd });
    cleanups.push(() => rmSync(udd, { recursive: true, force: true }));
    return b;
  }
  const renderAt = (page: Page, t: number, S = 1) => page.evaluate((t: number, S: number) => (window as any).SHOWREEL.renderAt(t, S), t, S);
  const manifest = (page: Page): Promise<Entry[]> => page.evaluate(() => (window as any).SHOWREEL.manifest());
  const hashAt = (page: Page, t: number, S: number): Promise<string> =>
    page.evaluate(async (t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const h = await crypto.subtle.digest('SHA-256', c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
      return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }, t, S);
  const cardBeats = (sb: any) => sb.beats.filter((b: any) => b.archetype === 'card-carousel');

  it('(a) min/typical/max N × row/fan with 32-char cards: fit ok, nothing off-frame at progress 0.5 and the last fully-on frame', async () => {
    for (const name of ['matrix', 'dense']) {
      const film = await serve(name);
      const browser = await launch();
      try {
        const page = await openPage(browser, film.url);
        const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
        for (const b of cardBeats(STORYBOARDS[name])) {
          const slots = film.resolved.beats[b.id].slots;
          // mixed display + mono slot: the engine's slot px is the min over items, floored per family (mono 22)
          expect(fit[b.id].cards, `${name}.${b.id} cards`).not.toBeNull();
          expect(fit[b.id].cards, `${name}.${b.id} cards`).toBeGreaterThanOrEqual(22);
          // the lead the storyboard binds is really resolved (else the conditional check and the coverage loop
          // below would skip it silently)
          expect(slots.lead.items.length, `${name}.${b.id} lead resolved`).toBe(b.phrases?.lead ? 1 : 0);
          if (slots.lead.items.length) expect(fit[b.id].lead, `${name}.${b.id} lead`).toBeGreaterThanOrEqual(28);
          const T = beatTimes(film.timeline, b.id);
          for (const k of ['half', 'last'] as const) {
            await renderAt(page, T[k]);
            const m = await manifest(page);
            const drawn = m.filter((e) => e.bbox);
            expect(drawn.length, `${name}.${b.id} ${k}: drew text`).toBeGreaterThan(0);
            expect(offFrame(m), `${name}.${b.id} ${k} (${b.variant}, N=${b.bindings.cards.length})`).toEqual([]);
          }
          // on the last fully-on frame EVERY card and the lead are on screen (so the check above judged them all)
          const onScreen = new Set((await manifest(page)).filter((e) => e.bbox).map((e) => e.source));
          for (const it of [...slots.cards.items, ...slots.lead.items]) expect(onScreen.has(it.id), `${name}.${b.id} ${it.id} on last frame`).toBe(true);
        }
      } finally {
        await browser.close();
      }
    }
  }, 300_000);

  it('(a) the oracle can fail: the same max-N frame drawn 400 px to the right is reported off-frame', async () => {
    const film = await serve('dense');
    const browser = await launch();
    try {
      const page = await openPage(browser, film.url, '?nudge=400');
      for (const id of ['b2', 'b3']) {
        await renderAt(page, beatTimes(film.timeline, id).last);
        const off = offFrame(await manifest(page));
        expect(off.length, id).toBeGreaterThan(0);
        expect(off.every((e: Entry) => film.resolved.beats[id].slots.cards.items.some((it: any) => it.id === e.source) || film.resolved.beats[id].slots.lead.items.some((it: any) => it.id === e.source))).toBe(true);
      }
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('(a) a card text too wide for the slot reports fit null for that slot only (no silent clip)', async () => {
    const long = 'Webhooks with Mutual TLS Mapping and Webhooks with Mutual TLS Mapping';
    const film = await serve('dense', (_tl, rs) => { rs.beats.b2.slots.cards.items[0].text = long; rs.beats.b3.slots.cards.items[0].text = long; });
    const browser = await launch();
    try {
      const fit = await (await openPage(browser, film.url)).evaluate(() => (window as any).SHOWREEL.fit());
      expect(fit.b2.cards).toBeNull();
      expect(fit.b3.cards).toBeNull();
      expect(fit.b2.lead).toBeGreaterThanOrEqual(28);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('a missing card.<i> or settle cue fails page setup loudly (no made-up time — Rule 12)', async () => {
    const browser = await launch();
    try {
      for (const [beat, cue] of [['b2', 'card.2'], ['b3', 'settle']]) {
        const film = await serve('dense', (tl) => { tl.hits = tl.hits.filter((h: any) => !(h.beatId === beat && h.cue === cue)); });
        await expect(openPage(browser, film.url), `${beat} without ${cue}`).rejects.toThrow(`${beat} (card-carousel) has no cue "${cue}"`);
      }
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('per-card drawn px: fit() is the slot MINIMUM, every card is drawn at ≥ it and ≥ its family floor', async () => {
    // Deviation 1: kindSizes() sizes each card kind on its own (display cards are not dragged down to a 32-char
    // mono route's px), so fit()[beat].cards = min px over the slot, NOT the px every card is drawn at.
    for (const name of ['matrix', 'dense']) {
      const film = await serve(name);
      const browser = await launch();
      try {
        const page = await openPage(browser, film.url);
        const { fit, layouts } = await page.evaluate(() => ({ fit: (window as any).SHOWREEL.fit(), layouts: (window as any).SHOWREEL.layouts }));
        for (const b of cardBeats(STORYBOARDS[name])) {
          const cardsPx = layouts[b.id];
          expect(cardsPx.map((c: any) => c.source), `${name}.${b.id}`).toEqual(b.bindings.cards);
          for (const c of cardsPx) {
            const floor = c.kind === 'route' || c.kind === 'command' ? 22 : 28;
            expect(c.px, `${name}.${b.id} ${c.source}`).toBeGreaterThanOrEqual(Math.max(floor, fit[b.id].cards));
          }
          expect(Math.min(...cardsPx.map((c: any) => c.px)), `${name}.${b.id} fit = min drawn px`).toBe(fit[b.id].cards);
        }
      } finally {
        await browser.close();
      }
    }
  }, 300_000);

  it('(b) determinism: 4 timestamps × 2 fresh pages × S=1 and S=6 hash identically, and the frames differ', async () => {
    const film = await serve('matrix');
    const row = beatTimes(film.timeline, 'b4'), fan = beatTimes(film.timeline, 'b7');
    const T = [row.enter, row.hit, fan.hold, fan.settle];
    const browser = await launch();
    const res: Record<number, string[][]> = { 1: [], 6: [] };
    try {
      for (const S of [1, 6]) {
        for (let run = 0; run < 2; run++) {
          const order = run ? [...T].reverse() : T;
          const byT: Record<number, string> = {};
          for (const t of order) {
            const page = await openPage(browser, film.url);
            byT[t] = await hashAt(page, t, S);
            await page.close();
          }
          res[S].push(T.map((t) => byT[t]));
        }
      }
    } finally {
      await browser.close();
    }
    for (const S of [1, 6]) expect(res[S][1], `S=${S}`).toEqual(res[S][0]);
    expect(new Set(res[1][0]).size).toBe(T.length);
    expect(res[6][0]).not.toEqual(res[1][0]);
  }, 300_000);

  it('(c) every resolved card + lead is drawn by the hold frame; manifest ⊆ resolved', async () => {
    const film = await serve('matrix');
    const browser = await launch();
    try {
      for (const b of cardBeats(STORYBOARDS.matrix)) {
        const page = await openPage(browser, film.url); // fresh page: only THIS beat's draws are in the manifest
        const T = beatTimes(film.timeline, b.id);
        // (cards land by 0.45 of the beat, so the stagger is judged up to the first card's landing, not at half)
        for (const t of [T.enter, T.first]) await renderAt(page, t);
        const before = new Set((await manifest(page)).map((e) => e.source));
        await renderAt(page, T.hold);
        const m = await manifest(page);
        expect(checkManifest(m, film.resolved)).toEqual([]);
        const sources = new Set(m.filter((e) => e.bbox).map((e) => e.source));
        const slots = film.resolved.beats[b.id].slots;
        for (const it of [...slots.cards.items, ...slots.lead.items]) expect(sources.has(it.id), `${b.id} ${it.id} at hold`).toBe(true);
        // cards arrive over time: at least one card was not yet on screen before the hold frame
        expect(slots.cards.items.some((it: any) => !before.has(it.id)), `${b.id} staggered`).toBe(true);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }, 300_000);

  it('R5: from 0.45 of the beat on, every card has landed in its final place — no ghost slot / deck / textless card', async () => {
    // Why: the cue map spreads card.<i> over 0.2…0.7 of the beat, so landing ON the cue left the contact-sheet hold
    // (0.6 of the solo window) with 3 of 5 cards + an empty card + a dashed ghost slot — the set read unfinished.
    // Two checks per frame ≥ 0.45: (1) every card's text is drawn at the place it holds on the last frame (text is
    // drawn only once a card has landed); (2) the ?probe page counts the text-free placeholder draws directly —
    // dashed ghost-slot strokes (row) and unswung-deck card bodies (fan) — and there must be none. A control at
    // the beat's enter frame proves the probe sees them (so a ghost left under a landed card would fail here).
    const probeAt = (page: Page, t: number, id: string): Promise<{ dash: number; deck: number }> =>
      page.evaluate((t: number, id: string) => {
        const S = (window as any).SHOWREEL;
        S.probe = {};
        S.renderAt(t, 1);
        return S.probe[id] ?? { dash: -1, deck: -1 }; // -1: the beat was not drawn at all — fails both checks
      }, t, id);
    for (const name of ['matrix', 'dense', 'look']) {
      const film = await serve(name);
      const browser = await launch();
      try {
        const page = await openPage(browser, film.url, '?probe=1');
        const F = 1 / film.timeline.fps;
        for (const b of cardBeats(STORYBOARDS[name])) {
          const tb = film.timeline.beats.find((x: any) => x.id === b.id);
          const ids: string[] = film.resolved.beats[b.id].slots.cards.items.map((it: any) => it.id);
          const last = beatTimes(film.timeline, b.id).last;
          const early = await probeAt(page, beatTimes(film.timeline, b.id).enter, b.id);
          expect(b.variant === 'fan' ? early.deck : early.dash, `${name}.${b.id} (${b.variant}) probe control: placeholders seen at enter`).toBeGreaterThan(0);
          await renderAt(page, last);
          const final = new Map((await manifest(page)).filter((e) => e.bbox).map((e) => [e.source, e.bbox!]));
          const t45 = Math.ceil((tb.t0 + 0.45 * (tb.t1 - tb.t0)) / F) * F;
          for (let t = t45; t <= last + 1e-9; t += 4 * F) {
            const pr = await probeAt(page, t, b.id);
            const at = new Map((await manifest(page)).filter((e) => e.bbox).map((e) => [e.source, e.bbox!]));
            const label = `${name}.${b.id} (${b.variant}, N=${ids.length}) local t=${(t - tb.t0).toFixed(3)} (${((t - tb.t0) / (tb.t1 - tb.t0)).toFixed(3)} of beat)`;
            expect(pr, `${label}: placeholder draws (dashed ghost slot / unswung deck card)`).toEqual({ dash: 0, deck: 0 });
            for (const id of ids) {
              const bb = at.get(id);
              expect(bb, `${label}: ${id} not landed`).toBeTruthy();
              const fb = final.get(id)!;
              // in its final place: only the idle drift / kick / fan breathe move it (≤ 24 px), never a fly-in
              expect(Math.abs(bb!.x - fb.x) + Math.abs(bb!.y - fb.y), `${label}: ${id} still moving into place`).toBeLessThanOrEqual(24);
            }
          }
        }
      } finally {
        await browser.close();
      }
    }
  }, 300_000);

  it('rate check: S=6 ms/frame (60 frames mid-beat, render + JPEG q0.97) per variant', async () => {
    const film = await serve('matrix');
    const browser = await launch();
    const rates: Record<string, number> = {};
    try {
      const page = await openPage(browser, film.url);
      for (const [id, label] of [['b4', 'row N=6'], ['b7', 'fan N=6']]) {
        const b = film.timeline.beats.find((x: any) => x.id === id);
        const t0 = (b.t0 + b.t1) / 2 - 30 / film.timeline.fps;
        rates[label] = await page.evaluate((t0: number, f: number) => {
          const stage = document.getElementById('stage') as HTMLCanvasElement;
          (window as any).SHOWREEL.renderAt(t0, 6); stage.toDataURL('image/jpeg', 0.97);
          const s = performance.now();
          for (let i = 0; i < 60; i++) { (window as any).SHOWREEL.renderAt(t0 + i * f, 6); stage.toDataURL('image/jpeg', 0.97); }
          return Math.round(((performance.now() - s) / 60) * 10) / 10;
        }, t0, 1 / film.timeline.fps);
      }
      const renderer = await page.evaluate(() => (window as any).SHOWREEL.renderer);
      const line = JSON.stringify({ archetype: 'card-carousel', s6WithJpegMsPerFrame: rates, renderer });
      console.log(line);
      // vitest may not echo console output for passing tests: SHOWREEL_E2E_ARTIFACTS=<dir> keeps the measurement
      if (process.env.SHOWREEL_E2E_ARTIFACTS) appendFileSync(path.join(process.env.SHOWREEL_E2E_ARTIFACTS, 'rates.jsonl'), line + '\n');
      for (const v of Object.values(rates)) expect(v).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, 180_000);
});

// Registered only when E2E is off, so a full E2E run reports 0 skipped (Rule 12).
if (!E2E) {
  describe('card-carousel in the browser (skipped)', () => {
    it.skip('SKIPPED: set SHOWREEL_E2E=1 (+ SHOWREEL_TOOL_DIR) to run fit/off-frame, determinism, manifest, rate', () => {});
  });
}
