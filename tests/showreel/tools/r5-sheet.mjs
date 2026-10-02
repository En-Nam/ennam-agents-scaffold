// Dev tool (not shipped, not a test) — the R5 gate sheet (M2 plan C17): spike A frames next to M2 frames, one row
// per beat-type pairing, both at S=6, every tile labelled. The PO signs M2 off against this sheet.
//   SHOWREEL_TOOL_DIR=.showreel-dev/.tool node tests/showreel/tools/r5-sheet.mjs [buildDir] [out.png] [framesDir]
// buildDir: a real film's build (timeline.json + resolved.json), default .showreel-dev/m2-artifacts/next-60s — the
//           60 s arrangement film on the next fixture that tests/showreel/e2e-full.test.ts keeps (all 8 archetypes).
// The spike is used read-only: classic scripts via file URL, window.renderAt(t, undefined, 6).
// M2 still per row = the FIRST beat of that archetype/variant at its contact-sheet "hold" moment (render/sheet.mjs
// sheetTimes: 0.6 of the beat's solo window), so the pick is mechanical, not cherry-picked.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const TOOLKIT = path.join(REPO, 'templates', 'showreel', '.claude', 'showreel');
const { loadDep } = await import(pathToFileURL(path.join(TOOLKIT, 'lib', 'util', 'tooldeps.mjs')).href);
const { launchArgs } = await import(pathToFileURL(path.join(TOOLKIT, 'render', 'browser.mjs')).href);
const { startServer } = await import(pathToFileURL(path.join(TOOLKIT, 'render', 'server.mjs')).href);
const { sheetTimes } = await import(pathToFileURL(path.join(TOOLKIT, 'render', 'sheet.mjs')).href);

const BUILD = path.resolve(process.argv[2] || path.join(REPO, '.showreel-dev', 'm2-artifacts', 'next-60s'));
const OUT = path.resolve(process.argv[3] || path.join(REPO, '.showreel-dev', 'm2-artifacts', 'r5-m2-vs-spike.png'));
const FRAMES = process.argv[4] ? path.resolve(process.argv[4]) : null;
const SPIKE = pathToFileURL(path.join(REPO, 'spikes', 'showreel-v0', 'index.html')).href;
const S = 6;
const EXE = [process.env.SHOWREEL_BROWSER, process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((p) => p && existsSync(p));
if (!process.env.SHOWREEL_TOOL_DIR) throw new Error('set SHOWREEL_TOOL_DIR (e.g. .showreel-dev/.tool)');
if (!EXE) throw new Error('no Chrome found: set SHOWREEL_BROWSER');
for (const f of ['timeline.json', 'resolved.json']) {
  if (!existsSync(path.join(BUILD, f))) throw new Error(`${BUILD} has no ${f}: run tests/showreel/e2e-full.test.ts with SHOWREEL_E2E_ARTIFACTS first`);
}

// C17 pairings: [archetype, variant filter, spike scene, spike t]
const ROWS = [
  ['cold-open-command', null, 's1', 1.6],
  ['flow-graph', null, 's2', 5.3],
  ['layered-stack', null, 's3', 7.6],
  ['metrics-counter-lock', null, 's3', 8.9],
  ['orbit-network', null, 's4', 10.8],
  ['lockup-cta', null, 's5', 13.4],
  ['kinetic-text', (v) => v !== 'chapter', 's5', 12.9],
  ['card-carousel', null, 's5', 12.9],
  ['kinetic-text', (v) => v === 'chapter', 's5', 12.9],
];

const timeline = JSON.parse(readFileSync(path.join(BUILD, 'timeline.json'), 'utf8'));
const holds = sheetTimes(timeline).filter((s) => s.still === 'hold');
const picks = ROWS.map(([arch, vf, scene, ts]) => {
  const b = timeline.beats.find((x) => x.archetype === arch && (!vf || vf(x.variant)));
  if (!b) throw new Error(`the film in ${BUILD} has no ${arch} beat${vf ? ' (variant filter)' : ''}: the R5 sheet needs all 8 archetypes + a chapter card`);
  const h = holds.find((x) => x.beatId === b.id);
  return { arch, scene, ts, beat: b, t: h.t, label: `M2  ${b.id} ${b.archetype}/${b.variant}  hold  local t=${(h.t - b.t0).toFixed(2)}s  (film t=${h.t.toFixed(2)}s, S=${S})` };
});

const pp = (await loadDep('puppeteer-core', process.cwd())).default;
const udd = mkdtempSync(path.join(os.tmpdir(), 'showreel-r5-udd-'));
const browser = await pp.launch({ executablePath: EXE, headless: true, args: launchArgs(), userDataDir: udd });
const srv = await startServer({ toolkitDir: TOOLKIT, toolDir: process.env.SHOWREEL_TOOL_DIR, buildDir: BUILD });
const grab = (page, expr) => page.evaluate(expr);
try {
  const spike = await browser.newPage();
  await spike.goto(SPIKE, { waitUntil: 'load' });
  await spike.waitForFunction('window.READY === true', { timeout: 60_000 });
  await spike.evaluate(() => document.fonts.ready);
  const m2 = await browser.newPage();
  const errors = [];
  m2.on('pageerror', (e) => errors.push(e.message));
  await m2.goto(`${srv.url}/engine/page.html`, { waitUntil: 'load' });
  await m2.waitForFunction('window.SHOWREEL && window.SHOWREEL.ready', { timeout: 60_000 });
  await m2.evaluate(() => window.SHOWREEL.ready);

  const tiles = [];
  for (const p of picks) {
    const a = await grab(spike, `(() => { window.renderAt(${p.ts}, undefined, ${S}); return document.getElementById('stage').toDataURL('image/jpeg', 0.95); })()`);
    const b = await grab(m2, `(() => { window.SHOWREEL.renderAt(${p.t}, ${S}); return document.getElementById('stage').toDataURL('image/jpeg', 0.95); })()`);
    tiles.push({ url: a, label: `spike A  ${p.scene} t=${p.ts}  (S=${S})  ↔  ${p.arch}` }, { url: b, label: p.label });
  }
  if (errors.length) throw new Error(`engine page errors: ${errors.join(' | ')}`);
  if (FRAMES) {
    mkdirSync(FRAMES, { recursive: true });
    tiles.forEach((t, i) => writeFileSync(path.join(FRAMES, `${String(i >> 1).padStart(2, '0')}-${i % 2 ? 'm2' : 'spike'}.jpg`), Buffer.from(t.url.split(',')[1], 'base64')));
  }
  const sheet = await browser.newPage();
  const png = await sheet.evaluate(async (tiles) => {
    const TW = 960, TH = 540, LH = 40, cols = 2, rows = tiles.length / cols;
    const c = document.createElement('canvas'); c.width = TW * cols + 8; c.height = (TH + LH) * rows;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < tiles.length; i++) {
      const img = new Image(); img.src = tiles[i].url; await img.decode();
      const x = (i % cols) * (TW + 8), y = Math.floor(i / cols) * (TH + LH);
      g.drawImage(img, x, y + LH, TW, TH);
      g.fillStyle = i % 2 ? '#9fe8ff' : '#ffd27a'; g.font = '600 22px sans-serif'; g.fillText(tiles[i].label, x + 12, y + 28);
    }
    return c.toDataURL('image/png');
  }, tiles);
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(png.split(',')[1], 'base64'));
  console.log(JSON.stringify({ ok: true, out: OUT, build: BUILD, rows: picks.map((p) => ({ arch: p.arch, beat: p.beat.id, variant: p.beat.variant, t: p.t, spike: `${p.scene} t=${p.ts}` })) }));
} finally {
  await browser.close();
  await srv.close();
  rmSync(udd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
