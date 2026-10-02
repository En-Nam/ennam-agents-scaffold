// Test-local films for the card-carousel archetype (M2 Task 4). Storyboards go through the PRODUCTION
// validate → resolve → compileTimeline path, so cue-map hit names (`card.<i>`) and times are the compiler's,
// never hand-written. The browser cases boot page.html (a test copy of engine/page.html with {...ARCHETYPES,
// 'card-carousel'}); the module is also registered in archetypes/index.mjs (Task 7, rendered by the N-matrix).
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStoryboard } from '../../../../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../../../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../../../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { startServer } from '../../../../../templates/showreel/.claude/showreel/render/server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOOLKIT = path.resolve(HERE, '..', '..', '..', '..', '..', 'templates', 'showreel', '.claude', 'showreel');
export const ARCHETYPE_FILE = path.join(TOOLKIT, 'archetypes', 'card-carousel.mjs');
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
export const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
export const SPEC = ARCH.archetypes['card-carousel'];

function fact(kind, n, display) {
  return {
    id: `f.${kind}.${n}`, kind, value: display, display, unit: null,
    source: { file: 'synthetic', locator: `${kind}/${n}`, extractor: 'test', rule: 'synthetic' },
    hash: 'sha256:0000000000000000',
  };
}

// Near-maxChars (32) cards: wide display glyphs (W/M) and 32-char mono routes/commands.
export const NEAR_MAX = [
  fact('feature', 1, 'Webhooks with Mutual TLS Mapping'),
  fact('route', 1, '/api/v1/warehouses/[id]/movement'),
  fact('command', 2, 'npx prisma migrate deploy --prod'),
  fact('feature', 2, 'Checkout with saved payment card'),
  fact('route', 2, '/dashboard/settings/billing/plan'),
  fact('feature', 3, 'Wishlist sharing with any friend'),
  fact('command', 3, 'npm run test:e2e -- --reporter=x'),
  fact('feature', 4, 'Live inventory sync across shops'),
];
// Shorter, realistic cards (the self-check stills).
export const TYPICAL = [
  fact('feature', 11, 'Saved carts'),
  fact('route', 11, '/checkout'),
  fact('feature', 12, 'Guest checkout'),
  fact('command', 11, 'npm run build'),
  fact('feature', 13, 'Live order tracking'),
  fact('route', 12, '/orders/[id]'),
];
// The R5 sheet's row + fan cards (next fixture, 60 s film): short display titles first, so the first card's title
// is far shorter than the row is wide — the case where a left-aligned title sat out in the frame-edge vignette.
export const R5 = [
  fact('feature', 21, 'One-tap checkout'),
  fact('feature', 22, 'Order tracking'),
  fact('feature', 23, 'Stripe payments'),
  fact('command', 21, 'npm run start'),
  fact('command', 22, 'npx @acme/acme-shop'),
  fact('route', 21, '/products/[id]'),
];
export const FACTS = {
  version: 1,
  minimumGate: { passed: true, missing: [] },
  brand: { name: 'Acme Shop', palette: 'violet', wordmark: 'f.app.name.1' },
  facts: [fact('app.name', 1, 'Acme Shop'), fact('command', 1, 'npm run dev'), ...NEAR_MAX, ...TYPICAL, ...R5],
};
const INPUTS = { archetypes: ARCH, facts: FACTS, phrases: PHRASES };

const open = { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1, bindings: { command: 'f.command.1' }, phrases: {}, transitionOut: 'cut' };
const close = (id) => ({ id, archetype: 'lockup-cta', variant: 'center', weight: 1, bindings: { name: 'f.app.name.1', command: 'f.command.1' }, phrases: { cta: 'p.cta.1' }, transitionOut: 'cut' });
const cards = (id, variant, ids, lead) => ({
  id, archetype: 'card-carousel', variant, weight: 1, bindings: { cards: ids }, phrases: lead ? { lead } : {}, transitionOut: 'cut',
});
const near = (n) => NEAR_MAX.slice(0, n).map((f) => f.id);
const typ = (n) => TYPICAL.slice(0, n).map((f) => f.id);
const { min: MIN, max: MAX } = SPEC.slots.cards;
const MID = Math.ceil((MIN + MAX) / 2);
export const COUNTS = { min: MIN, typical: MID, max: MAX };

/** storyboards: `matrix` = every variant × {min, typical, max} N with near-maxChars texts (30 s);
 *  `dense` = max N in the shortest card beats a 15 s film gives; `look` = typical texts for the self-check. */
export const STORYBOARDS = {
  matrix: {
    version: 1, durationS: 30, seed: 7, palette: 'violet',
    beats: [
      open,
      cards('b2', 'row', near(MIN), 'p.carousel.1'),
      cards('b3', 'row', near(MID)),
      cards('b4', 'row', near(MAX), 'p.carousel.2'),
      cards('b5', 'fan', near(MIN)),
      cards('b6', 'fan', near(MID), 'p.carousel.3'),
      cards('b7', 'fan', near(MAX), 'p.carousel.1'),
      close('b8'),
    ],
  },
  dense: {
    version: 1, durationS: 15, seed: 3, palette: 'amber',
    beats: [open, cards('b2', 'row', near(MAX), 'p.carousel.2'), cards('b3', 'fan', near(MAX), 'p.carousel.3'), close('b4')],
  },
  look: {
    version: 1, durationS: 15, seed: 5, palette: 'violet',
    beats: [open, cards('b2', 'row', typ(MID), 'p.carousel.2'), cards('b3', 'fan', typ(MID), 'p.carousel.3'), close('b4')],
  },
  // `r5` = the R5 sheet's card beats: same texts, ≈4.75 s card beats like the 60 s film's
  r5: {
    version: 1, durationS: 15, seed: 11, palette: 'violet',
    beats: [
      open,
      { ...cards('b2', 'row', ['f.feature.21', 'f.feature.22', 'f.feature.23', 'f.command.1', 'f.command.11'], 'p.carousel.2'), weight: 1.75 },
      { ...cards('b3', 'fan', ['f.command.21', 'f.command.11', 'f.command.22', 'f.route.21', 'f.route.11'], 'p.carousel.3'), weight: 1.75 },
      close('b4'),
    ],
  },
};

/** validate → resolve → compile (60 fps). Throws with every validation error (fail loud). */
export function buildFilm(name) {
  const sb = STORYBOARDS[name];
  const errs = validateStoryboard(sb, INPUTS);
  if (errs.length) throw new Error(`card-carousel fixture "${name}" invalid: ${JSON.stringify(errs)}`);
  const resolved = resolve(sb, INPUTS);
  const timeline = compileTimeline(sb, resolved, ARCH, { fps: 60 });
  return { sb, resolved, timeline };
}

/**
 * Serve a film: temp build dir with timeline/resolved (+ optional mutate) and the test-local page.
 * → { url (page URL), resolved, timeline, close() }
 */
export async function serveFilm(name, { toolDir, mutate } = {}) {
  const f = buildFilm(name);
  mutate?.(f.timeline, f.resolved);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-card-carousel-'));
  writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(f.timeline));
  writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(f.resolved));
  copyFileSync(path.join(HERE, 'page.html'), path.join(dir, 'page.html'));
  const srv = await startServer({ toolkitDir: TOOLKIT, toolDir, buildDir: dir });
  return {
    url: `${srv.url}/build/page.html`, resolved: f.resolved, timeline: f.timeline,
    close: async () => { await srv.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

/** open the page and await SHOWREEL.ready (rejection → error naming the page errors) */
export async function openPage(browser, url, query = '') {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + query, { waitUntil: 'load' });
  await page.waitForFunction('!!(window.SHOWREEL && window.SHOWREEL.ready)'); // !!: a rejected promise must not be awaited by the poll
  try {
    await page.evaluate(() => window.SHOWREEL.ready);
  } catch (err) {
    throw new Error(`SHOWREEL.ready rejected: ${err.message}; page errors: ${errors.join(' | ')}`);
  }
  return page;
}

/** timestamps of a card beat (global s): enter (first card in flight), first (card.0 + 2 frames), hit (card.1 + 2 frames),
 *  half (local progress 0.5), hold (last card's text fully in, before settle), settle (+3 frames), last (last fully-on frame) */
export function beatTimes(timeline, beatId) {
  const b = timeline.beats.find((x) => x.id === beatId);
  const F = 1 / timeline.fps;
  const hit = (cue) => {
    const h = timeline.hits.find((x) => x.beatId === beatId && x.cue === cue);
    if (!h) throw new Error(`no hit ${cue} in ${beatId}`);
    return h.t;
  };
  const n = timeline.hits.filter((x) => x.beatId === beatId && /^card\.\d+$/.test(x.cue)).length;
  const lastCard = hit(`card.${n - 1}`), settle = hit('settle');
  return {
    n,
    enter: hit('card.0') - 0.2,
    first: hit('card.0') + 2 * F,
    hit: hit('card.1') + 2 * F,
    half: b.t0 + 0.5 * (b.t1 - b.t0),
    hold: Math.min(lastCard + 0.33, settle - F),
    settle: settle + 3 * F,
    last: b.t1 - b.overlapOut - F,
  };
}
