import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDep } from '../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../templates/showreel/.claude/showreel/render/browser.mjs';
import { startServer } from '../../templates/showreel/.claude/showreel/render/server.mjs';
import { validateStoryboard } from '../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';

// v1.16 showreel M2 — kinetic-text `chapter` variant (D11 chapter cards; C13 variantSlots: lead 1 tagged
// `chapter`, lines 0..1). A chapter card is a section title: the phrase owns the frame, the optional fact
// line sits under it. What must hold: both shapes (0 and 1 line) fit and draw, nothing is clipped or
// off the safe area while the card is up (C16, 48 px margin, incl. a near-maxChars line), the title lands
// before the line, every drawn string traces to resolved.json (D8), and frames stay deterministic (AC3).

const E2E = process.env.SHOWREEL_E2E === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const MAX_LINE = ARCH.archetypes['kinetic-text'].slots.lines.maxChars as number;

function fact(kind: string, n: number, display: string) {
  return { id: `f.${kind}.${n}`, kind, value: display, display, unit: null, source: { file: 'synthetic', locator: `${kind}/${n}`, extractor: 'test', rule: 'synthetic' }, hash: 'sha256:0000000000000000' };
}
// near-maxChars line, wide glyphs (W/M) so the width budget is actually exercised
const LONG = 'Warehouse-wide MWMW inventory sync, every minute';
const FACTS = {
  version: 1, minimumGate: { passed: true, missing: [] }, brand: { name: 'Acme Shop', palette: 'violet', wordmark: 'f.app.name.1' },
  facts: [fact('app.name', 1, 'Acme Shop'), fact('feature', 1, LONG), fact('command', 1, 'npm run dev')],
};
// the longest chapter phrase = the widest title the toolkit can be asked to draw
const CHAPTERS = PHRASES.phrases.filter((p: { tags: string[] }) => p.tags.includes('chapter'));
const LONGEST_CHAPTER = [...CHAPTERS].sort((a: { text: string }, b: { text: string }) => b.text.length - a.text.length)[0].id;
const SHORTEST_CHAPTER = [...CHAPTERS].sort((a: { text: string }, b: { text: string }) => a.text.length - b.text.length)[0].id;

const STORYBOARD = {
  version: 1, durationS: 15, seed: 7, palette: 'violet',
  beats: [
    { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1.25, bindings: { command: 'f.command.1' }, phrases: { caption: 'p.open.1' }, transitionOut: 'cut' },
    // 0 lines: the title alone
    { id: 'b2', archetype: 'kinetic-text', variant: 'chapter', weight: 1, bindings: {}, phrases: { lead: LONGEST_CHAPTER }, transitionOut: 'cut' },
    // 1 near-maxChars line under the title
    { id: 'b3', archetype: 'kinetic-text', variant: 'chapter', weight: 1, bindings: { lines: 'f.feature.1' }, phrases: { lead: SHORTEST_CHAPTER }, transitionOut: 'zoom-through' },
    { id: 'b4', archetype: 'lockup-cta', variant: 'center', weight: 1.5, bindings: { name: 'f.app.name.1', command: 'f.command.1' }, phrases: { cta: 'p.cta.1' }, transitionOut: 'cut' },
  ],
};
const INPUTS = { archetypes: ARCH, facts: FACTS, phrases: PHRASES };

describe('chapter storyboard fixture (C13 variantSlots)', () => {
  it('uses a near-maxChars line and validates with 0 and with 1 line', () => {
    expect([...LONG].length).toBe(MAX_LINE);
    expect(LONGEST_CHAPTER).not.toBe(SHORTEST_CHAPTER);
    expect(validateStoryboard(STORYBOARD, INPUTS)).toEqual([]);
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

/* eslint-disable @typescript-eslint/no-explicit-any */
type Entry = { text: string; source: string; bbox: { x: number; y: number; w: number; h: number } | null };

describe.skipIf(!E2E)('kinetic-text chapter in the browser (SHOWREEL_E2E=1)', () => {
  let browser: any;
  let page: any;
  let dir: string;
  let close: () => Promise<void> = async () => {};
  const resolved = resolve(STORYBOARD, INPUTS);
  const tl = compileTimeline(STORYBOARD, resolved, ARCH, { fps: 60 });
  const F = 1 / tl.fps;
  const beat = (id: string) => tl.beats.find((b: any) => b.id === id);
  const ids = (id: string) => Object.values(resolved.beats[id].slots as Record<string, { items: { id: string }[] }>).flatMap((s) => s.items.map((i) => i.id));

  async function openPage(url: string) {
    const p = await browser.newPage();
    const errors: string[] = [];
    p.on('pageerror', (e: Error) => errors.push(e.message));
    await p.goto(`${url}/engine/page.html`, { waitUntil: 'load' });
    await p.waitForFunction('window.SHOWREEL && window.SHOWREEL.ready');
    try {
      await p.evaluate(() => (window as any).SHOWREEL.ready);
    } catch (err) {
      throw new Error(`SHOWREEL.ready rejected: ${(err as Error).message}; page errors: ${errors.join(' | ')}`);
    }
    return p;
  }
  let url: string;

  beforeAll(async () => {
    if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('SHOWREEL_E2E=1 needs SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
    const exe = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, ...BROWSER_CANDIDATES].find((p) => p && existsSync(p));
    if (!exe) throw new Error('no Chrome found: set SHOWREEL_BROWSER=/path/to/chrome');
    const mod = await loadDep('puppeteer-core', process.cwd());
    const puppeteer = mod.default ?? mod;
    dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-chapter-'));
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(tl));
    writeFileSync(path.join(dir, 'resolved.json'), JSON.stringify(resolved));
    const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR!, buildDir: dir });
    url = srv.url;
    close = () => srv.close();
    browser = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs() });
    page = await openPage(url);
  });
  afterAll(async () => {
    await browser?.close();
    await close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const manifestAt = async (t: number): Promise<Entry[]> => page.evaluate((t: number) => {
    (window as any).SHOWREEL.renderAt(t, 1);
    return (window as any).SHOWREEL.manifest();
  }, t);
  const drawnIn = (m: Entry[]) => m.filter((e) => e.bbox).map((e) => e.source).sort();

  it('fit: title and the near-maxChars line fit their slots (no null → `check` would pass)', async () => {
    const fit = await page.evaluate(() => (window as any).SHOWREEL.fit());
    expect(typeof fit.b2.lead).toBe('number');
    expect(typeof fit.b3.lead).toBe('number');
    expect(typeof fit.b3.lines).toBe('number');
  });

  for (const id of ['b2', 'b3']) {
    it(`${id}: at local progress 0.5 and the last fully-on frame every item is drawn, inside the 48 px safe area, and traceable`, async () => {
      const b = beat(id);
      for (const t of [b.t0 + 0.5 * (b.t1 - b.t0), b.t1 - b.overlapOut - F]) {
        const m = await manifestAt(t);
        expect(drawnIn(m), `${id} t=${t}`).toEqual(ids(id).sort()); // exactly this card's strings, nothing else
        expect(offFrame(m), `${id} t=${t}`).toEqual([]);
        expect(checkManifest(m, resolved), `${id} t=${t}`).toEqual([]);
      }
    });
  }

  it('0-line card draws only the title; 1-line card draws title + line, the title clearly dominant', async () => {
    const b2 = beat('b2'), b3 = beat('b3');
    expect(drawnIn(await manifestAt((b2.t0 + b2.t1) / 2))).toEqual([LONGEST_CHAPTER]);
    const m = await manifestAt((b3.t0 + b3.t1) / 2);
    const title = m.find((e) => e.source === SHORTEST_CHAPTER)!.bbox!;
    const line = m.find((e) => e.source === 'f.feature.1')!.bbox!;
    expect(title.h).toBeGreaterThan(1.8 * line.h);
    expect(line.y).toBeGreaterThan(title.y + title.h * 0.8); // the line sits under the title
  });

  it('the title lands on cue `line` and the fact line only after it', async () => {
    const b3 = beat('b3');
    const cue = tl.hits.find((h: any) => h.beatId === 'b3' && h.cue === 'line');
    expect(cue).toBeDefined();
    expect(drawnIn(await manifestAt(cue.t - F))).not.toContain(SHORTEST_CHAPTER);
    const justAfter = drawnIn(await manifestAt(cue.t + F));
    expect(justAfter).toContain(SHORTEST_CHAPTER);
    expect(justAfter).not.toContain('f.feature.1');
    expect(drawnIn(await manifestAt(b3.t1 - b3.overlapOut - F))).toContain('f.feature.1');
  });

  it('AC3: chapter frames hash identically in a fresh page, at S=1 and S=6', async () => {
    const b3 = beat('b3');
    const cue = tl.hits.find((h: any) => h.beatId === 'b3' && h.cue === 'line');
    const T = [cue.t + 3 * F, (b3.t0 + b3.t1) / 2];
    const hash = (p: any, t: number, S: number): Promise<string> => p.evaluate(async (t: number, S: number) => {
      (window as any).SHOWREEL.renderAt(t, S);
      const c = document.getElementById('stage') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const h = await crypto.subtle.digest('SHA-256', d);
      return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }, t, S);
    for (const S of [1, 6]) {
      const a = [], b = [];
      for (const t of T) a.push(await hash(await openPage(url), t, S));
      for (const t of [...T].reverse()) b.unshift(await hash(await openPage(url), t, S));
      expect(b, `S=${S}`).toEqual(a);
      expect(a[0]).not.toBe(a[1]);
    }
  });
});
