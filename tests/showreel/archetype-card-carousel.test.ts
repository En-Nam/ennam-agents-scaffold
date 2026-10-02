import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';
import { sheetTimes } from '../../templates/showreel/.claude/showreel/render/sheet.mjs';
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

  it('R5: from 0.45 of the beat on, every card has landed in its final place at full title opacity — no ghost slot / deck / textless card', async () => {
    // Why: the cue map spreads card.<i> over 0.2…0.7 of the beat, so landing ON the cue left the contact-sheet hold
    // (0.6 of the solo window) with 3 of 5 cards + an empty card + a dashed ghost slot — the set read unfinished.
    // Three checks per frame ≥ 0.45: (1) every card's text is drawn at the place it holds on the last frame (text is
    // drawn only once a card has landed); (2) the ?probe page counts the text-free placeholder draws directly —
    // dashed ghost-slot strokes (row) and unswung-deck card bodies (fan) — and there must be none; (3) every card
    // title is drawn in palette text at effective opacity 1 (no title still mid-wipe or dimmed while its siblings
    // are full — R5: the first title read greyer). A control at the beat's enter frame proves the probe sees the
    // placeholders (so a ghost left under a landed card would fail here). `r5` = the R5 sheet's card beats — added
    // as a regression guard: it was already green at c4af0fa (the R5 ghost/deck symptom came from a stale frame).
    type Probe = { dash: number; deck: number; title: Record<string, number>; shadow?: Record<string, number>; border?: number };
    const probeAt = (page: Page, t: number, id: string): Promise<Probe> =>
      page.evaluate((t: number, id: string) => {
        const S = (window as any).SHOWREEL;
        S.probe = {};
        S.renderAt(t, 1);
        return S.probe[id] ?? { dash: -1, deck: -1, title: {} }; // -1: the beat was not drawn at all — fails all checks
      }, t, id);
    for (const name of ['matrix', 'dense', 'look', 'r5']) {
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
            expect({ dash: pr.dash, deck: pr.deck }, `${label}: placeholder draws (dashed ghost slot / unswung deck card)`).toEqual({ dash: 0, deck: 0 });
            // PO R5 (b): every landed card's frame + tag tile stays "on" whether or not it holds the focus (2662418:
            // a card the focus had moved past fell to border alpha 0.455 — with a violet accent on the violet
            // backdrop that read "disabled")
            expect(pr.border ?? 0, `${label}: weakest card frame / tile border alpha`).toBeGreaterThanOrEqual(0.7);
            for (const id of ids) {
              expect(pr.title[id] ?? 0, `${label}: ${id} title opacity`).toBeGreaterThanOrEqual(0.999);
              // PO R5 (b): no shadow glow under the title — with the engine bloom on top it read as a doubled,
              // ghosted outline on thin mono strokes (2662418 drew every title with shadowBlur 10-24)
              expect(pr.shadow?.[id] ?? 0, `${label}: ${id} title shadowBlur`).toBe(0);
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

  it('R5: row titles read white on screen from 0.45 on — none pushed out into the edge vignette (first title greyer)', async () => {
    // Why: the engine's vignette (post-FX, radial from 0.35 H) darkens the frame edges after the scene is drawn, so
    // white text can only be as bright as its place allows. Fixed 560 px cards put a short first title ("One-tap
    // checkout", "Saved carts") at the left edge of a wide row: on the R5 hold it read grey next to its siblings.
    // Cards now are chips hugging their own title, two columns centred on the frame (PO R5 (b) below), so every
    // title sits near the centre. Pixels, not inference: on every 8th frame
    // from 0.45 to the last fully-on frame, the 90th-percentile luminance inside each card title's drawn bbox must
    // be ≥ 0.88 × the brightest title's in the same frame (the fixed-width layout measured 0.75-0.82 on the first
    // title; now ≥ 0.95, ≥ 0.91 on the settle-hit frame where the engine's aberration dips every title). Relative,
    // because a cue hit's post-FX dims the whole frame; the opacity probe above pins the absolute draw.
    // Proven red against the c4af0fa layout: "look.b2 (0.453 of beat): f.feature.11 title p90 191 vs brightest 255"
    // (0.749 < 0.88). Absolute edge darkening is the engine vignette's (core.mjs), not this archetype's, to fix.
    // Films with short/typical titles (look, r5): the 32-char stress films fill every card to ROW_CW, where the
    // outer titles' ends necessarily reach the vignette — fit, not layout, governs those.
    const REL_MIN = 0.88;
    for (const name of ['look', 'r5']) {
      const film = await serve(name);
      const browser = await launch();
      try {
        const page = await openPage(browser, film.url);
        const F = 1 / film.timeline.fps;
        for (const b of cardBeats(STORYBOARDS[name]).filter((x: any) => x.variant === 'row')) {
          const tb = film.timeline.beats.find((x: any) => x.id === b.id);
          const ids: string[] = film.resolved.beats[b.id].slots.cards.items.map((it: any) => it.id);
          const last = beatTimes(film.timeline, b.id).last;
          const t45 = Math.ceil((tb.t0 + 0.45 * (tb.t1 - tb.t0)) / F) * F;
          for (let t = t45; t <= last + 1e-9; t += 8 * F) {
            const lum: Record<string, number> = await page.evaluate((t: number, ids: string[]) => {
              const S = (window as any).SHOWREEL;
              S.renderAt(t, 1);
              const m = S.manifest();
              const g = (document.getElementById('stage') as HTMLCanvasElement).getContext('2d')!;
              const out: Record<string, number> = {};
              for (const id of ids) {
                const e = m.find((x: any) => x.source === id && x.bbox);
                if (!e) { out[id] = -1; continue; } // not drawn: fails below
                const { x, y, w, h } = e.bbox;
                const d = g.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data;
                const L: number[] = [];
                for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
                L.sort((p, q) => q - p);
                out[id] = Math.round(L[Math.floor(L.length * 0.1)]);
              }
              return out;
            }, t, ids);
            const label = `${name}.${b.id} local t=${(t - tb.t0).toFixed(3)} (${((t - tb.t0) / (tb.t1 - tb.t0)).toFixed(3)} of beat)`;
            const top = Math.max(...ids.map((id) => lum[id]));
            expect(top, `${label}: brightest title p90`).toBeGreaterThan(200); // a frame of dim titles is not "even"
            for (const id of ids) expect(lum[id] / top, `${label}: ${id} title p90 ${lum[id]} vs brightest ${top}`).toBeGreaterThanOrEqual(REL_MIN);
          }
        }
      } finally {
        await browser.close();
      }
    }
  }, 300_000);

  // The engine vignette (core.mjs post-FX): read from the engine source, never copied — if the engine changes it,
  // the parse fails loudly instead of the corrected metric silently dividing out the wrong amount.
  const VIGNETTE = (() => {
    const core = readFileSync(path.join(path.dirname(ARCHETYPE_FILE), '..', 'engine', 'core.mjs'), 'utf8');
    const g = /createRadialGradient\(W \/ 2, H \/ 2, H \* ([\d.]+), W \/ 2, H \/ 2, H \* ([\d.]+)\)/.exec(core);
    const a = /addColorStop\(0, 'rgba\(0,0,0,0\)'\); rg\.addColorStop\(1, 'rgba\(0,0,0,([\d.]+)\)'\)/.exec(core);
    if (!g || !a) throw new Error('core.mjs vignette gradient not found: update the PO R5 (b) test\'s vignette parse');
    return { cx: 960, cy: 540, r0: Number(g[1]) * 1080, r1: Number(g[2]) * 1080, alpha: Number(a[1]) };
  })();

  it('PO R5 (b): at the contact-sheet hold no card reads disabled — every title glyph luma ≥ 0.9 × the brightest, as rendered (row + fan, S=1 + S=6)', async () => {
    // Why: on the R5 sheet (mechanical hold = 0.6 of the beat's solo window, sheetTimes) the first card read
    // "disabled" next to its siblings. The focus highlight may move between cards, but every landed title must read
    // at full contrast. Metric per title: its exact glyph mask (the frame rendered with vs without that one title,
    // SHOWREEL.hide — rotated fan bboxes overlap the neighbours' glyphs), median luma over the mask, relative to the
    // brightest title of the same frame.
    // (1) AS RENDERED — the PO condition, what the viewer sees, engine vignette included. The cause at 2662418 was
    //     the layout: a row of three put the outer titles out where the vignette (radial from 0.35 H) darkens white
    //     type to grey. Now: two columns of chips centred on the frame + a fan whose titles sit near the centre.
    //     Proven red at 2662418 below (the archetype at that commit served in place of the working tree's).
    // (2) VIGNETTE-CORRECTED — archetype-only guard: pixels divided by the vignette's darkening at their place
    //     (parameters parsed from core.mjs above), so a title the archetype itself draws dim is caught wherever it is.
    //     Negative control: ?dimfirst=0.4 (a typical "disabled" opacity) on each beat's first title must be caught.
    const MIN = 0.9;
    type Luma = { raw: Record<string, number>; cor: Record<string, number> };
    const holdLuma = (page: Page, t: number, S: number, ids: string[]): Promise<Luma> =>
      page.evaluate((t: number, S: number, ids: string[], V: typeof VIGNETTE) => {
        const R = (window as any).SHOWREEL;
        const g = (document.getElementById('stage') as HTMLCanvasElement).getContext('2d')!;
        const lumaOf = (d: Uint8ClampedArray) => {
          const L = new Float32Array(d.length / 4);
          for (let i = 0; i < L.length; i++) L[i] = 0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2];
          return L;
        };
        R.hide = null;
        R.renderAt(t, S);
        const boxes: Record<string, number[] | null> = {};
        for (const id of ids) {
          const e = R.manifest().find((x: any) => x.source === id && x.bbox);
          boxes[id] = e ? [Math.round(e.bbox.x), Math.round(e.bbox.y), Math.max(1, Math.round(e.bbox.w)), Math.max(1, Math.round(e.bbox.h))] : null;
        }
        const shown: Record<string, Float32Array> = {};
        for (const id of ids) if (boxes[id]) shown[id] = lumaOf(g.getImageData(...(boxes[id] as [number, number, number, number])).data);
        const out = { raw: {} as Record<string, number>, cor: {} as Record<string, number> };
        const median = (v: number[]) => (v.sort((p, q) => p - q), v.length > 50 ? Math.round(v[v.length >> 1]) : -1);
        for (const id of ids) {
          if (!boxes[id]) { out.raw[id] = out.cor[id] = -1; continue; } // not drawn: fails below
          R.hide = id;
          R.renderAt(t, S);
          const hidden = lumaOf(g.getImageData(...(boxes[id] as [number, number, number, number])).data);
          // glyph mask = the pixels this title changes (> 48 luma). raw = the median of their shown luma; cor = the
          // same divided by the vignette's darkening at each pixel (linear 0 → alpha from r0 to r1 about the centre)
          const raw: number[] = [], cor: number[] = [];
          const [bx, by, bw] = boxes[id] as number[];
          for (let i = 0; i < hidden.length; i++) {
            if (shown[id][i] - hidden[i] <= 48) continue;
            const r = Math.hypot(bx + (i % bw) - V.cx, by + Math.floor(i / bw) - V.cy);
            raw.push(shown[id][i]);
            cor.push(shown[id][i] / (1 - V.alpha * Math.min(1, Math.max(0, (r - V.r0) / (V.r1 - V.r0)))));
          }
          out.raw[id] = median(raw);
          out.cor[id] = median(cor);
        }
        R.hide = null;
        return out;
      }, t, S, ids, VIGNETTE);
    const ratios = (lum: Record<string, number>) => {
      const top = Math.max(...Object.values(lum));
      return Object.fromEntries(Object.entries(lum).map(([id, v]) => [id, v / top]));
    };
    // the archetype as it was at 2662418 (the R5 sheet the PO judged), served in place of the working tree's —
    // the as-rendered check must be red there, else it cannot catch the reported symptom
    const BEFORE_REF = '2662418';
    let before: string;
    try {
      before = execFileSync('git', ['show', `${BEFORE_REF}:templates/showreel/.claude/showreel/archetypes/card-carousel.mjs`], { encoding: 'utf8' });
    } catch (e: any) {
      throw new Error(`PO R5 (b) red-at-${BEFORE_REF} control needs that commit in the local git history (shallow clone?): ${e.message}`);
    }
    const openBefore = async (browser: Browser, url: string): Promise<Page> => {
      const p = await browser.newPage();
      await p.setRequestInterception(true);
      p.on('request', (r: any) => (new URL(r.url()).pathname === '/archetypes/card-carousel.mjs'
        ? r.respond({ status: 200, contentType: 'text/javascript', body: before }) : r.continue()));
      await p.goto(url, { waitUntil: 'load' });
      await p.waitForFunction('!!(window.SHOWREEL && window.SHOWREEL.ready)');
      await p.evaluate(() => (window as any).SHOWREEL.ready);
      return p;
    };
    let redBefore = 0;
    for (const name of ['look', 'r5']) {
      const film = await serve(name);
      const browser = await launch();
      try {
        const page = await openPage(browser, film.url);
        const ctl = await openPage(browser, film.url, '?dimfirst=0.4');
        const old = await openBefore(browser, film.url);
        const holds = sheetTimes(film.timeline).filter((s: any) => s.still === 'hold');
        for (const b of cardBeats(STORYBOARDS[name])) {
          const t = holds.find((s: any) => s.beatId === b.id).t;
          const ids: string[] = film.resolved.beats[b.id].slots.cards.items.map((it: any) => it.id);
          for (const S of [1, 6]) {
            const lum = await holdLuma(page, t, S, ids);
            const label = `${name}.${b.id} (${b.variant}) hold S=${S} ${JSON.stringify(lum)}`;
            expect(Math.max(...Object.values(lum.raw)), `${label}: brightest title as rendered`).toBeGreaterThan(220);
            // (1) as rendered — the PO condition
            for (const [id, r] of Object.entries(ratios(lum.raw))) expect(r, `${label}: ${id} as rendered`).toBeGreaterThanOrEqual(MIN);
            // (2) vignette-corrected — what the archetype draws
            for (const [id, r] of Object.entries(ratios(lum.cor))) expect(r, `${label}: ${id} vignette-corrected`).toBeGreaterThanOrEqual(MIN);
            const ctlLum = await holdLuma(ctl, t, S, ids);
            expect(ratios(ctlLum.cor)[ids[0]], `${label}: control (first title at 0.4 opacity) ${JSON.stringify(ctlLum.cor)} must be caught`).toBeLessThan(MIN);
            const oldLum = await holdLuma(old, t, S, ids);
            if (Math.min(...Object.values(ratios(oldLum.raw))) < MIN) redBefore++;
          }
        }
      } finally {
        await browser.close();
      }
    }
    // measured at 2662418 (S=1, weakest title as rendered): look.b2 row 0.62, look.b3 fan 0.81, r5.b2 row 0.74
    // (One-tap checkout 184 vs 239), r5.b3 fan 0.84; working tree: ≥ 0.91 / 0.94 / 0.91 / 0.96 —
    // every beat × S fails as rendered, so the check provably sees the reported symptom
    expect(redBefore, `as-rendered check red at ${BEFORE_REF} (of 8 beat × S cases)`).toBe(8);
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
