// Real probes for preflightPlan (Task 7): node version, fs, PATH lookup, child processes,
// platform, uid. Kept thin — every decision lives in plan.mjs so it can be tested with mocks.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toolDir } from '../util/tooldeps.mjs';
import { killProfileSync, whichSync } from '../../render/browser.mjs';
// TODO(orchestrator): VERSION should live in a tiny module both cli.mjs and this file import;
// importing cli.mjs here is a dynamic-import cycle (cli -> cmd -> probe -> cli) that only works
// because cli is fully evaluated first. render/browser.mjs no longer depends on this file.
import { VERSION } from '../../cli.mjs';

const TOOLKIT_DIR = fileURLToPath(new URL('../../', import.meta.url));
const BROWSER_MJS = pathToFileURL(join(TOOLKIT_DIR, 'render/browser.mjs')).href;

// Runs in a child node process so preflightPlan stays synchronous. Prints one JSON line,
// only AFTER close() — a close() failure (e.g. the E_BROWSER leak guard) must not be hidden
// behind an already-printed renderer.
const GPU_SCRIPT = `
const [browserUrl, hostRoot, exe] = process.argv.slice(1);
const msg = (e) => String((e && e.message) || e).split('\\n')[0];
let b;
let out;
try {
  const { launchBrowser } = await import(browserUrl);
  b = await launchBrowser({ hostRoot, executablePath: exe });
  const page = await b.browser.newPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'no-webgl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
  out = { renderer };
} catch (e) {
  out = { error: msg(e) };
}
if (b) {
  try { await b.close(); } catch (e) { out = { error: 'close failed: ' + msg(e) }; }
}
process.stdout.write(JSON.stringify(out) + '\\n');
`;

/**
 * Run the GPU probe in a child node process whose TEMP/TMP/TMPDIR point at a scratch dir the
 * parent owns. Every browser profile the child creates (connect path and puppeteer.launch
 * both use os.tmpdir()) therefore sits under that dir, so after the child exits — normally,
 * on error, or killed by the timeout — the parent kills any process whose command line still
 * names the scratch dir and removes it. Leftovers that survive the kill are reported as an error.
 * `browserModuleUrl` is injectable for tests (a fake browser module).
 */
export function runGpuProbe({ hostRoot, exe, browserModuleUrl = BROWSER_MJS, timeoutMs = 90_000 }) {
  const scratch = mkdtempSync(join(tmpdir(), 'showreel-gpu-'));
  let r;
  let left = [];
  let cleanupError = null;
  try {
    r = spawnSync(process.execPath, ['--input-type=module', '-e', GPU_SCRIPT, browserModuleUrl, hostRoot, exe], {
      encoding: 'utf8',
      timeout: timeoutMs,
      env: { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch },
    });
  } finally {
    try { left = killProfileSync(scratch); } catch (e) { cleanupError = String(e.message || e); }
    try { rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* reported via `left` */ }
  }
  const leak = cleanupError
    ? `could not check for leftover browser processes under ${scratch} (${cleanupError})`
    : left.length
      ? `browser processes still hold ${scratch}: ${left.map((p) => `${p.name}#${p.pid}`).join(', ')}`
      : null;
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  if (timedOut) {
    return { error: `GPU probe timed out after ${timeoutMs / 1000} s; ${leak ?? 'leftover browser processes were killed'}` };
  }
  const line = String(r.stdout || '').trim().split(/\r?\n/).pop();
  let parsed = null;
  try {
    const j = JSON.parse(line);
    if (typeof j.renderer === 'string' || typeof j.error === 'string') parsed = j;
  } catch { /* fall through */ }
  if (leak) return { error: parsed && parsed.error ? `${parsed.error}; ${leak}` : leak };
  if (parsed) return parsed;
  return { error: `GPU probe exited ${r.status}${r.error ? ` (${r.error.message})` : ''}: ${String(r.stderr || '').trim().split(/\r?\n/).slice(-2).join(' | ')}` };
}

export function realProbe(hostRoot, { expect = null } = {}) {
  const tool = toolDir(hostRoot);
  return {
    platform: process.platform,
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    nodeVersion: process.versions.node,
    execPath: process.execPath,
    toolkitVersion: VERSION,
    expectVersion: expect,
    hostRoot,
    toolkitDir: TOOLKIT_DIR,
    toolDir: tool,
    env: (name) => process.env[name],
    exists: (p) => existsSync(p),
    fileHash: (p) => {
      try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; }
    },
    writeFile: (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); },
    copyFile: (src, dst) => { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); },
    which: whichSync,
    run: (cmd, args, { cwd } = {}) => {
      // npm is npm.cmd on Windows and needs a shell; everything else is spawned directly.
      const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && cmd === 'npm' });
      return { status: r.error ? -1 : r.status, stdout: r.stdout || '', stderr: r.error ? String(r.error.message) : r.stderr || '' };
    },
    ffmpegStaticPath: () => {
      try { return createRequire(join(tool, 'node_modules/'))('ffmpeg-static') || null; } catch { return null; }
    },
    gpuRenderer: (browser) => runGpuProbe({ hostRoot, exe: browser.path }),
  };
}
