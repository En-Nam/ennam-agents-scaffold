// Probe: is GPU hash instability (s5 only) caused by auxiliary sprite canvases taking GPU vs CPU paths?
// variant 'base' = as shipped; 'cpuSprites' = every canvas except #stage gets willReadFrequently:true (CPU-backed).
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';
const URL = pathToFileURL('D:/Projects/EnNam/ennam-agents-scaffold/promo-video/index.html').href + '?t=0';
const ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'];
const T = [9.05, 12.2, 13.0, 14.6]; // 9.05 = stable control
const RUNS = 6, S = Number(process.argv[2] || 6);
for (const variant of ['base', 'cpuSprites']) {
  const seen = Object.fromEntries(T.map((t) => [t, []]));
  for (let run = 0; run < RUNS; run++) {
    const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ARGS });
    const order = T.map((t, i) => [t, (i * (run + 2) + run) % 7]).sort((a, c) => a[1] - c[1]).map(([t]) => t); // varies per run
    for (const t of order) {
      const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
      if (variant === 'cpuSprites') await p.evaluateOnNewDocument(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, opts) {
          if (type === '2d' && this.id !== 'stage') opts = { ...(opts || {}), willReadFrequently: true };
          return orig.call(this, type, opts);
        };
      });
      await p.goto(URL); await p.waitForFunction('window.READY === true'); await p.evaluate(() => document.fonts.ready);
      seen[t].push(await p.evaluate(async (t, S) => {
        window.renderAt(t, undefined, S); const c = window.ENN.stage;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', d))].slice(0, 6).map((x) => x.toString(16).padStart(2, '0')).join('');
      }, t, S));
      await p.close();
    }
    await b.close();
  }
  const line = JSON.stringify({ kind: 's5probe', S, variant, runs: RUNS, distinctPerT: Object.fromEntries(T.map((t) => [t, new Set(seen[t]).size])), hashes: seen });
  console.log(line); appendFileSync('results.jsonl', line + '\n');
}
