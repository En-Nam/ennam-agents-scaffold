// usage:
//   node render.mjs stills <outDir> <only|-> t1 t2 ...      -> PNG stills (only = scene id or '-')
//   node render.mjs sheet  <outPng> <only|-> t1 t2 ...      -> one contact-sheet PNG (3 cols)
//   node render.mjs video  <out.mp4> [audio.wav] [fps]      -> full 15s encode (h264, optional audio mux)
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PROJ = 'D:/Projects/EnNam/ennam-agents-scaffold/promo-video';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [mode, outArg, ...rest] = process.argv.slice(2);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(pathToFileURL(path.join(PROJ, 'index.html')).href + '?t=0');
await page.waitForFunction('window.READY === true', { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);

const SAMPLES = Number(process.env.SAMPLES || 1);
const shot = (t, only, type = 'png', q = 0.95) => page.evaluate((t, only, type, q, S) => {
  window.renderAt(t, only || undefined, S);
  return window.ENN.stage.toDataURL(type === 'png' ? 'image/png' : 'image/jpeg', q).split(',')[1];
}, t, only, type, q, SAMPLES);

try {
  if (mode === 'stills' || mode === 'sheet') {
    const only = rest[0] === '-' ? undefined : rest[0];
    const times = rest.slice(1).map(Number);
    if (mode === 'stills') {
      mkdirSync(outArg, { recursive: true });
      for (const t of times) { const b = await shot(t, only); writeFileSync(path.join(outArg, `t${t.toFixed(2)}.png`), Buffer.from(b, 'base64')); }
      console.log('wrote', times.length, 'stills to', outArg);
    } else {
      const tmp = path.join(path.dirname(outArg), '_sheet_tmp'); mkdirSync(tmp, { recursive: true });
      const files = [];
      for (let i = 0; i < times.length; i++) { const f = path.join(tmp, `f${String(i).padStart(3, '0')}.png`); writeFileSync(f, Buffer.from(await shot(times[i], only), 'base64')); files.push(f); }
      const cols = 3, rows = Math.ceil(times.length / cols);
      const r = spawnSync(ffmpegPath, ['-y', '-framerate', '1', '-i', path.join(tmp, 'f%03d.png'), '-vf', `scale=640:-1,drawtext=text='':x=0:y=0,tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', outArg], { encoding: 'utf8' });
      if (r.status !== 0) console.error(r.stderr.slice(-800)); else console.log('sheet ->', outArg, '(times:', times.join(', '), ')');
    }
  } else if (mode === 'video') {
    const audio = rest[0] && existsSync(rest[0]) ? rest[0] : null;
    const fps = Number(rest[1] || 60);
    const dur = await page.evaluate(() => window.TIMELINE.duration);
    const N = Math.round(dur * fps);
    const args = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
    if (audio) args.push('-i', audio);
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart');
    if (audio) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
    args.push(outArg);
    const ff = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let ferr = ''; ff.stderr.on('data', (d) => (ferr += d));
    const done = new Promise((res) => ff.on('close', res));
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const b = await shot(i / fps, undefined, 'jpeg', 0.97);
      if (!ff.stdin.write(Buffer.from(b, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 90 === 0) console.log(`frame ${i}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); const code = await done;
    console.log('ffmpeg exit', code, code ? ferr.slice(-1200) : '');
  }
} finally {
  if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
  await browser.close();
}
