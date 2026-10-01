// M0 bench for /showreel — measures spike A (promo-video/, read-only) render cost, parallelism, hash stability.
// usage: node bench.mjs <rate|par|hash|full> [--exe chrome|edge] [--gpu on|off]
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';
import path from 'node:path';

const PROJ = 'D:/Projects/EnNam/ennam-agents-scaffold/promo-video';
const EXES = {
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
};
const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const exeName = opt('exe', 'chrome');
const gpu = opt('gpu', 'on');
const RIG_ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'];
const URL = pathToFileURL(path.join(PROJ, 'index.html')).href + '?t=0';
const out = (o) => { const line = JSON.stringify({ mode, exe: exeName, gpu, ...o }); console.log(line); appendFileSync('results.jsonl', line + '\n'); };

async function launch(gpuMode = gpu) {
  const args = [...RIG_ARGS, ...(gpuMode === 'off' ? ['--disable-gpu'] : [])];
  return puppeteer.launch({ executablePath: EXES[exeName], headless: 'new', args });
}
async function openPage(browser) {
  const page = await browser.newPage();
  if (opt('cpuSprites') === '1') await page.evaluateOnNewDocument(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (ty, op) { if (ty === '2d' && this.id !== 'stage') op = { ...(op || {}), willReadFrequently: true }; return o.call(this, ty, op); }; });
  if (opt('cpuTitle') === '1') await page.evaluateOnNewDocument(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (ty, op) { if (ty === '2d' && /s5.js:(6[1-9]|7[0-9]):/.test(new Error().stack)) op = { ...(op || {}), willReadFrequently: true }; return o.call(this, ty, op); }; });
  if (false) await page.evaluateOnNewDocument(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (ty, op) { if (ty === '2d' && this.id !== 'stage') op = { ...(op || {}), willReadFrequently: true }; return o.call(this, ty, op); }; });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto(URL);
  await page.waitForFunction('window.READY === true', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function gpuInfo(page) {
  return page.evaluate(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return 'no-webgl';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (e) { return 'err:' + e.message; }
  });
}
// One output frame exactly as the shipped pipeline does it: renderAt(t, all scenes, S) + JPEG readback.
// Returns in-page render-only ms (excludes readback) and the base64 payload length.
const frame = (page, t, S) => page.evaluate((t, S) => {
  const a = performance.now();
  window.renderAt(t, undefined, S);
  const r = performance.now() - a;
  const b = window.ENN.stage.toDataURL('image/jpeg', 0.97).split(',')[1];
  return { r, n: b.length };
}, t, S);

const SCENES = { s1: [0.2, 2.7], s2: [3.0, 5.5], s3: [6.0, 8.5], s4: [9.3, 11.8], s5: [12.3, 14.8] }; // 2.5 s each
const FPS = 60;
const frameTimes = ([a, b]) => { const ts = []; for (let i = Math.round(a * FPS); i < Math.round(b * FPS); i++) ts.push(i / FPS); return ts; };

if (mode === 'rate') {
  // ms per sample-render at S=1 and S=6 over each 2.5 s scene window at 60 fps (150 frames).
  const browser = await launch();
  const page = await openPage(browser);
  out({ kind: 'env', browser: await browser.version(), renderer: await gpuInfo(page), node: process.version });
  for (const S of [1, 6]) {
    for (const [id, win] of Object.entries(SCENES)) {
      const ts = frameTimes(win);
      for (let i = 0; i < 10; i++) await frame(page, ts[i], S); // warm-up (JIT, caches)
      let renderSum = 0; const t0 = performance.now();
      for (const t of ts) renderSum += (await frame(page, t, S)).r;
      const wall = performance.now() - t0;
      out({ kind: 'rate', S, scene: id, frames: ts.length,
        msPerSampleRender: +(renderSum / (ts.length * S)).toFixed(2),
        msPerFrameRenderOnly: +(renderSum / ts.length).toFixed(2),
        msPerFrameWall: +(wall / ts.length).toFixed(2),
        readbackMsPerFrame: +((wall - renderSum) / ts.length).toFixed(2) });
    }
  }
  await browser.close();
}

if (mode === 'par') {
  // Throughput of P concurrent pages (one browser) vs P browsers, S=6, heaviest+lightest windows mixed (300 frames).
  const S = Number(opt('S', 6));
  const ts = [...frameTimes(SCENES.s3), ...frameTimes(SCENES.s5)];
  const configs = opt('configs') ? JSON.parse(opt('configs')) : [['pages', 1], ['pages', 2], ['pages', 4], ['browsers', 2], ['browsers', 4]];
  for (const [how, P] of configs) {
    const browsers = how === 'pages' ? [await launch()] : await Promise.all(Array.from({ length: P }, () => launch()));
    const pages = await Promise.all(Array.from({ length: P }, (_, i) => openPage(browsers[how === 'pages' ? 0 : i])));
    await Promise.all(pages.map(async (p) => { for (let i = 0; i < 10; i++) await frame(p, ts[i], S); }));
    const t0 = performance.now();
    await Promise.all(pages.map(async (p, k) => { for (let i = k; i < ts.length; i += P) await frame(p, ts[i], S); }));
    const wall = performance.now() - t0;
    out({ kind: 'par', S, how, P, frames: ts.length, wallS: +(wall / 1000).toFixed(2), fps: +(ts.length / (wall / 1000)).toFixed(2), msPerFrame: +(wall / ts.length).toFixed(2) });
    await Promise.all(browsers.map((b) => b.close()));
  }
}

if (mode === 'hash') {
  // RGBA SHA-256 for 12 timestamps (2 per scene + 2 in overlaps), each in a FRESH page, run-specific order.
  const T = [0.5, 1.9, 2.8, 3.9, 5.8, 7.3, 9.05, 9.6, 10.9, 12.2, 13.0, 14.6];
  const perm = (run) => T.map((t, i) => [t, ((i + 1) * [7, 5, 3, 11, 2, 6][(run - 1) % 6] + run) % 13]).sort((a, b) => a[1] - b[1]).map(([t]) => t);
  const runs = Number(opt('runs', 2));
  for (const S of [1, 6]) {
    for (let run = 1; run <= runs; run++) {
      const browser = await launch();
      const order = perm(run);
      const res = {};
      for (const t of order) {
        const page = await openPage(browser);
        res[t] = await page.evaluate(async (t, S) => {
          window.renderAt(t, undefined, S);
          const c = window.ENN.stage; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          const h = await crypto.subtle.digest('SHA-256', d);
          return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
        }, t, S);
        await page.close();
      }
      out({ kind: 'hash', S, run, cpuSprites: opt('cpuSprites') === '1', cpuTitle: opt('cpuTitle') === '1', order, byT: Object.fromEntries(T.map((t) => [t, res[t]])) });
      await browser.close();
    }
  }
}

if (mode === 'readback') {
  // Per-frame wall cost of the capture format (S=1, scene s4 window, 90 frames): JPEG q0.97 vs PNG vs raw RGBA.
  const browser = await launch();
  const page = await openPage(browser);
  const ts = frameTimes(SCENES.s4).slice(0, 90);
  const fmts = {
    jpeg97: (t) => page.evaluate((t) => { window.renderAt(t, undefined, 1); return window.ENN.stage.toDataURL('image/jpeg', 0.97).length; }, t),
    png: (t) => page.evaluate((t) => { window.renderAt(t, undefined, 1); return window.ENN.stage.toDataURL('image/png').length; }, t),
    // raw RGBA read in page, shipped to Node as base64 (what a lossless pipe would need)
    rawRgbaB64: (t) => page.evaluate((t) => {
      window.renderAt(t, undefined, 1); const c = window.ENN.stage;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      return btoa(s).length;
    }, t),
    // raw RGBA read but NOT transferred: isolates GPU->CPU readback from encode+CDP transfer
    rawRgbaNoXfer: (t) => page.evaluate((t) => { window.renderAt(t, undefined, 1); const c = window.ENN.stage; return c.getContext('2d').getImageData(0, 0, 4, 4).data.length + c.getContext('2d').getImageData(0, 0, c.width, c.height).data.length; }, t),
  };
  for (const [name, fn] of Object.entries(fmts)) {
    for (let i = 0; i < 5; i++) await fn(ts[i]);
    const t0 = performance.now(); let bytes = 0;
    for (const t of ts) bytes += await fn(t);
    const wall = performance.now() - t0;
    out({ kind: 'readback', fmt: name, frames: ts.length, msPerFrameWall: +(wall / ts.length).toFixed(2), avgPayloadKB: Math.round(bytes / ts.length / 1024) });
  }
  await browser.close();
}

if (mode === 'psnr') {
  // PSNR (RGB, 8-bit) of GPU vs SwiftShader reference, and GPU run A vs GPU run B, S from --S.
  const S = Number(opt('S', 6));
  const T = [0.5, 3.9, 7.3, 9.05, 10.9, 13.0];
  const grab = async (gpuMode) => {
    const browser = await launch(gpuMode); const res = {};
    for (const t of T) {
      const page = await openPage(browser);
      res[t] = Buffer.from(await page.evaluate((t, S) => {
        window.renderAt(t, undefined, S); const c = window.ENN.stage;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = '';
        for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
        return btoa(s);
      }, t, S), 'base64');
      await page.close();
    }
    await browser.close(); return res;
  };
  const psnr = (a, b) => {
    let se = 0, n = 0, maxd = 0, diffPx = 0;
    for (let i = 0; i < a.length; i += 4) {
      let px = false;
      for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; se += d * d; n++; if (d) px = true; if (Math.abs(d) > maxd) maxd = Math.abs(d); }
      if (px) diffPx++;
    }
    const mse = se / n;
    return { psnrDb: mse === 0 ? Infinity : +(10 * Math.log10(255 * 255 / mse)).toFixed(2), maxAbsDiff: maxd, diffPxPct: +(100 * diffPx / (a.length / 4)).toFixed(3) };
  };
  const gA = await grab('on'), gB = await grab('on'), ref = await grab('off');
  for (const t of T) out({ kind: 'psnr', S, t, gpuVsRef: psnr(gA[t], ref[t]), gpuAvsGpuB: psnr(gA[t], gB[t]) });
}

if (mode === 'psnrbad') {
  // Does a PSNR bar separate "real divergence" from GPU LSB noise? Reference = SwiftShader clean.
  // Bad cases: fallback font (Bahnschrift/Cascadia missing), +1 frame time shift; GPU clean as the noise baseline.
  const S = 6, T = [0.5, 3.9, 7.3, 9.05, 10.9, 13.0];
  const grab = async (gpuMode, variant) => {
    const browser = await launch(gpuMode); const res = {};
    for (const t of T) {
      const page = await openPage(browser);
      res[t] = Buffer.from(await page.evaluate((t, S, variant) => {
        if (variant === 'font') { window.ENN.fonts.display = "'Segoe UI',sans-serif"; window.ENN.fonts.mono = 'Consolas,monospace'; window.ENN.fonts.ui = "'Arial',sans-serif"; }
        window.renderAt(variant === 'shift' ? t + 1 / 60 : t, undefined, S); const c = window.ENN.stage;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = '';
        for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
        return btoa(s);
      }, t, S, variant), 'base64');
      await page.close();
    }
    await browser.close(); return res;
  };
  const psnr = (a, b) => { let se = 0, n = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; se += d * d; n++; } const m = se / n; return m === 0 ? 'inf' : +(10 * Math.log10(65025 / m)).toFixed(2); };
  const ref = await grab('off', 'clean');
  const cases = { gpuClean: await grab('on', 'clean'), refFont: await grab('off', 'font'), gpuFont: await grab('on', 'font'), refShift1f: await grab('off', 'shift'), gpuShift1f: await grab('on', 'shift') };
  for (const t of T) out({ kind: 'psnrbad', S, t, ...Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, psnr(v[t], ref[t])])) });
}

if (mode === 'full') {
  // Full 15 s @60 fps end-to-end like render.mjs video (S from --S), frames piped to ffmpeg libx264 slow crf14.
  const S = Number(opt('S', 6));
  const browser = await launch();
  const page = await openPage(browser);
  const N = 15 * FPS;
  const ff = spawn(ffmpegPath, ['-y', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high', 'full.mp4'], { stdio: ['pipe', 'ignore', 'ignore'] });
  const done = new Promise((r) => ff.on('close', r));
  const t0 = performance.now(); let renderSum = 0;
  for (let i = 0; i < N; i++) {
    const r = await page.evaluate((t, S) => { const a = performance.now(); window.renderAt(t, undefined, S); const r = performance.now() - a; return { r, b: window.ENN.stage.toDataURL('image/jpeg', 0.97).split(',')[1] }; }, i / FPS, S);
    renderSum += r.r;
    if (!ff.stdin.write(Buffer.from(r.b, 'base64'))) await new Promise((res) => ff.stdin.once('drain', res));
  }
  const tFrames = performance.now() - t0;
  ff.stdin.end(); const code = await done;
  const total = performance.now() - t0;
  out({ kind: 'full', S, cpuSprites: opt('cpuSprites') === '1', cpuTitle: opt('cpuTitle') === '1', frames: N, ffmpegExit: code, framesLoopS: +(tFrames / 1000).toFixed(1), totalS: +(total / 1000).toFixed(1), msPerSampleRender: +(renderSum / (N * S)).toFixed(2), msPerFrameWall: +(tFrames / N).toFixed(2) });
  await browser.close();
}
