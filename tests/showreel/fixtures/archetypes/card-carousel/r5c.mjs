// Dev tool (not shipped, not a test): the PO R5 condition (b) before/after sheet for card-carousel. Renders the
// `r5` film's row + fan beats at S=6 on the contact-sheet hold (render/sheet.mjs sheetTimes 'hold', 0.6 of the
// beat's solo window) and on an impact frame (card.1 hit + 2 frames), left column = the archetype at a git ref
// (default 2662418, served in place of /archetypes/card-carousel.mjs via request interception), right = the
// working tree. Writes one PNG.
//   SHOWREEL_TOOL_DIR=.showreel-dev/.tool node tests/showreel/fixtures/archetypes/card-carousel/r5c.mjs [out.png] [ref]
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDep } from '../../../../../templates/showreel/.claude/showreel/lib/util/tooldeps.mjs';
import { launchArgs } from '../../../../../templates/showreel/.claude/showreel/render/browser.mjs';
import { sheetTimes } from '../../../../../templates/showreel/.claude/showreel/render/sheet.mjs';
import { serveFilm, openPage, beatTimes } from './film.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, '.showreel-dev', 'sheets', 'card-carousel-r5c.png'));
const REF = process.argv[3] || '2662418';
const BEFORE = execFileSync('git', ['show', `${REF}:templates/showreel/.claude/showreel/archetypes/card-carousel.mjs`], { cwd: REPO, encoding: 'utf8' });
const EXE = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((p) => p && existsSync(p));
if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('set SHOWREEL_TOOL_DIR');
if (!EXE) throw new Error('no Chrome found: set SHOWREEL_BROWSER');

const pp = (await loadDep('puppeteer-core', process.cwd())).default;
const udd = mkdtempSync(path.join(os.tmpdir(), 'showreel-r5c-udd-'));
const browser = await pp.launch({ executablePath: EXE, headless: true, args: launchArgs(), userDataDir: udd });
const film = await serveFilm('r5', { toolDir: process.env.SHOWREEL_TOOL_DIR });
const render = (t) => { window.SHOWREEL.renderAt(t, 6); return document.getElementById('stage').toDataURL('image/jpeg', 0.92); };
try {
  const before = await browser.newPage();
  await before.setRequestInterception(true);
  before.on('request', (r) => (new URL(r.url()).pathname === '/archetypes/card-carousel.mjs'
    ? r.respond({ status: 200, contentType: 'text/javascript', body: BEFORE }) : r.continue()));
  const errors = [];
  before.on('pageerror', (e) => errors.push(e.message));
  await before.goto(film.url, { waitUntil: 'load' });
  await before.waitForFunction('!!(window.SHOWREEL && window.SHOWREEL.ready)');
  await before.evaluate(() => window.SHOWREEL.ready).catch((e) => { throw new Error(`before page: ${e.message} ${errors.join(' | ')}`); });
  const after = await openPage(browser, film.url);
  const holds = sheetTimes(film.timeline).filter((s) => s.still === 'hold');
  const tiles = [];
  for (const id of ['b2', 'b3']) {
    const b = film.timeline.beats.find((x) => x.id === id);
    const hold = holds.find((s) => s.beatId === id).t;
    const impact = beatTimes(film.timeline, id).hit;
    for (const [k, t] of [['hold (sheet 0.6)', hold], ['impact card.1+2F', impact]]) {
      for (const [side, page] of [[`before ${REF}`, before], ['after', after]]) {
        tiles.push({ label: `${side}  ${id} ${b.variant}  ${k}  local t=${(t - b.t0).toFixed(2)}`, url: await page.evaluate(render, t) });
      }
    }
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
  rmSync(udd, { recursive: true, force: true });
}
