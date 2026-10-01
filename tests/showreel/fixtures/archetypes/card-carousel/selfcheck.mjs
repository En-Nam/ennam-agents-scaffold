// Dev tool (not shipped, not a test): the M2 Task 4 self-check sheet. Renders card-carousel stills at S=6
// (enter / hit / hold / exit for the typical-N row and fan beats of the `look` film, plus hold / last of the max-N
// near-maxChars row and fan beats of the `dense` film) next to spike A's
// reference frames (t=3.9 glass chips + selected band, t=8.9 glass counter card), and writes one PNG.
//   SHOWREEL_TOOL_DIR=.showreel-dev/.tool node tests/showreel/fixtures/archetypes/card-carousel/selfcheck.mjs [out.png] [framesDir]
// The spike is used read-only (classic scripts via file URL, renderAt(t, undefined, 6)).
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDep } from '../../../../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../../../../templates/showreel/.claude/showreel/render/browser.mjs';
import { serveFilm, openPage, beatTimes } from './film.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, '.showreel-dev', 'sheets', 'card-carousel-vs-spike.png'));
const FRAMES = process.argv[3] ? path.resolve(process.argv[3]) : null;
const SPIKE = pathToFileURL(path.join(REPO, 'spikes', 'showreel-v0', 'index.html')).href;
const EXE = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((p) => p && existsSync(p));
if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('set SHOWREEL_TOOL_DIR');
if (!EXE) throw new Error('no Chrome found: set SHOWREEL_BROWSER');

const pp = (await loadDep('puppeteer-core', process.cwd())).default;
const udd = mkdtempSync(path.join(os.tmpdir(), 'showreel-selfcheck-udd-'));
const browser = await pp.launch({ executablePath: EXE, headless: true, args: launchArgs(), userDataDir: udd });
const film = await serveFilm('look', { toolDir: process.env.SHOWREEL_TOOL_DIR });
const dense = await serveFilm('dense', { toolDir: process.env.SHOWREEL_TOOL_DIR });
const shot = (page, fn, t) => page.evaluate(fn, t);
try {
  const tiles = [];
  const spike = await browser.newPage();
  await spike.goto(`${SPIKE}`, { waitUntil: 'load' });
  await spike.waitForFunction('window.READY');
  for (const t of [3.9, 8.9]) {
    tiles.push({ label: `spike A t=${t}`, url: await shot(spike, (t) => { window.renderAt(t, undefined, 6); return document.getElementById('stage').toDataURL('image/jpeg', 0.92); }, t) });
  }
  const page = await openPage(browser, film.url);
  const render = (t) => { window.SHOWREEL.renderAt(t, 6); return document.getElementById('stage').toDataURL('image/jpeg', 0.92); };
  for (const [beat, v] of [['b2', 'row'], ['b3', 'fan']]) {
    const T = beatTimes(film.timeline, beat);
    const b = film.timeline.beats.find((x) => x.id === beat);
    for (const k of ['enter', 'hit', 'hold', 'last']) {
      tiles.push({ label: `card-carousel ${v} N=${T.n}  ${k}  local t=${(T[k] - b.t0).toFixed(2)}`, url: await shot(page, render, T[k]) });
    }
  }
  // max N with near-maxChars (32) texts: row 3+3 and fan N=6 at hold (all cards in, before the settle sweep) and
  // on the last fully-on frame — the worst case for text-on-text overlap and legibility
  const dpage = await openPage(browser, dense.url);
  for (const [beat, v] of [['b2', 'row'], ['b3', 'fan']]) {
    const T = beatTimes(dense.timeline, beat);
    const b = dense.timeline.beats.find((x) => x.id === beat);
    for (const k of ['hold', 'last']) {
      tiles.push({ label: `MAX ${v} N=${T.n} 32-char  ${k}  local t=${(T[k] - b.t0).toFixed(2)}`, url: await shot(dpage, render, T[k]) });
    }
  }
  if (FRAMES) {
    mkdirSync(FRAMES, { recursive: true });
    tiles.forEach((t, i) => writeFileSync(path.join(FRAMES, `${String(i).padStart(2, '0')}.jpg`), Buffer.from(t.url.split(',')[1], 'base64')));
  }
  const sheet = await browser.newPage();
  const png = await sheet.evaluate(async (tiles) => {
    const TW = 960, TH = 540, LH = 34, cols = 2, rows = Math.ceil(tiles.length / cols);
    const c = document.createElement('canvas'); c.width = TW * cols; c.height = (TH + LH) * rows;
    const g = c.getContext('2d'); g.fillStyle = 'black'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < tiles.length; i++) {
      const img = new Image(); img.src = tiles[i].url; await img.decode();
      const x = (i % cols) * TW, y = Math.floor(i / cols) * (TH + LH);
      g.drawImage(img, x, y + LH, TW, TH);
      g.fillStyle = 'white'; g.font = '600 20px sans-serif'; g.fillText(tiles[i].label, x + 12, y + 24);
    }
    return c.toDataURL('image/png');
  }, tiles);
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(png.split(',')[1], 'base64'));
  console.log(OUT);
} finally {
  await browser.close();
  await film.close();
  await dense.close();
  rmSync(udd, { recursive: true, force: true });
}
