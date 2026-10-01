// Preflight decision logic (Task 7). Pure apart from the injected probe: every filesystem,
// process and environment access goes through `probe` (real one: probe.mjs; tests mock it).
// Order: node → version → gitignore → deps → ffmpeg → browser → gpu. Each step is reported
// in `steps`; a step that cannot run because an earlier one failed is 'skipped', never 'ok'.
import { join, basename } from 'node:path';
import { ShowreelError } from '../util/out.mjs';

export const NODE_FLOOR = [22, 12];
export const GPU_NOTICE = 'no GPU detected — motion blur reduced (S=1)';
export const BROWSER_FIX = 'Install Google Chrome or set SHOWREEL_BROWSER=/path/to/chrome';
const RERUN = 'node .claude/showreel/cli.mjs preflight';
const NODE_FIX = `Install Node 22.12+ (e.g. nvm install 22) and re-run: ${RERUN}`;
const VERSION_FIX =
  'Re-run the scaffolder to upgrade the toolkit: npx @ennamjsc/agents-scaffold@latest <your-roles> showreel --merge-strategy=overwrite';
const DEPS_FIX = `Check access to the npm registry (behind a proxy? set HTTPS_PROXY=http://<proxy>:<port>), then re-run: ${RERUN}`;
const FFMPEG_FIX =
  'Set FFMPEG_BIN=/path/to/ffmpeg, or set FFMPEG_BINARIES_URL to a reachable ffmpeg-static binaries mirror ' +
  `(and HTTPS_PROXY if behind a proxy), then re-run: ${RERUN}`;

// B1: nested .gitignore files are stripped by npm pack, so preflight writes them at runtime.
const GITIGNORES = [
  ['showreel/.gitignore', 'build/\n*.mp4\n'],
  ['.claude/showreel/.gitignore', '.tool/\n'],
];

export function nodeTooOld(version) {
  const [major, minor] = String(version).split('.').map(Number);
  if (major !== NODE_FLOOR[0]) return major < NODE_FLOOR[0];
  return minor < NODE_FLOOR[1];
}

/** C11 launch args. `--no-sandbox` only when SHOWREEL_NO_SANDBOX=1 or running as root. */
export function launchArgs({ env = process.env, uid = typeof process.getuid === 'function' ? process.getuid() : null } = {}) {
  const noSandbox = env.SHOWREEL_NO_SANDBOX === '1' || uid === 0;
  return [
    ...(noSandbox ? ['--no-sandbox'] : []),
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--force-color-profile=srgb',
  ];
}

/** Browser kind from the binary name. Edge must be recognised wherever its path came from (it needs the connect path). */
export function kindOfPath(p) {
  const name = basename(String(p).replace(/\\/g, '/')).toLowerCase();
  if (/msedge|microsoft[ -]edge/.test(name)) return 'edge';
  if (/chromium/.test(name)) return 'chromium';
  if (/chrome/.test(name)) return 'chrome';
  return 'custom';
}

function defaultPaths(platform, env) {
  if (platform === 'win32') {
    const pf = env('PROGRAMFILES') || 'C:\\Program Files';
    const pf86 = env('PROGRAMFILES(X86)') || 'C:\\Program Files (x86)';
    const local = env('LOCALAPPDATA');
    const chrome = [pf, pf86, local].filter(Boolean).map((d) => `${d}\\Google\\Chrome\\Application\\chrome.exe`);
    const edge = [pf86, pf, local].filter(Boolean).map((d) => `${d}\\Microsoft\\Edge\\Application\\msedge.exe`);
    return { chrome, edge };
  }
  if (platform === 'darwin') {
    return {
      chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    };
  }
  return {
    chrome: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'],
    edge: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge'],
  };
}

const PATH_NAMES = [['chromium', 'chromium'], ['chromium-browser', 'chromium'], ['google-chrome', 'chrome']];

/**
 * D6 order: SHOWREEL_BROWSER → CHROME_PATH → Chrome per-OS → Edge per-OS → chromium/chromium-browser/google-chrome on PATH.
 * Returns {kind, path, source} or null. An explicit env var pointing at a missing file throws
 * ShowreelError('E_BROWSER') instead of silently falling through to another browser.
 */
export function detectBrowser(probe) {
  for (const name of ['SHOWREEL_BROWSER', 'CHROME_PATH']) {
    const p = probe.env(name);
    if (!p) continue;
    if (!probe.exists(p)) {
      throw new ShowreelError('E_BROWSER', `${name} is set to ${p}, but no file exists there.`, BROWSER_FIX);
    }
    return { kind: kindOfPath(p), path: p, source: name };
  }
  const { chrome, edge } = defaultPaths(probe.platform, probe.env);
  for (const p of chrome) if (probe.exists(p)) return { kind: 'chrome', path: p, source: 'chrome-default' };
  for (const p of edge) if (probe.exists(p)) return { kind: 'edge', path: p, source: 'edge-default' };
  for (const [name, kind] of PATH_NAMES) {
    const p = probe.which(name);
    if (p) return { kind, path: p, source: 'PATH' };
  }
  return null;
}

function tail(text) {
  const s = String(text || '').trim();
  return s ? `: ${s.split(/\r?\n/).slice(-3).join(' | ')}` : '';
}

/** → {ok, steps, errors:[{code,message,fix}], browser, ffmpeg, gpuNotice, renderer} */
export function preflightPlan(probe) {
  const steps = [];
  const errors = [];
  const result = () => ({ ok: errors.length === 0, steps, errors, browser, ffmpeg, gpuNotice, renderer });
  let browser = null;
  let ffmpeg = null;
  let gpuNotice = null;
  let renderer = null;
  const step = (name, status, detail) => steps.push(detail === undefined ? { name, status } : { name, status, detail });
  const failStep = (name, code, message, fix) => { step(name, 'fail'); errors.push({ code, message, fix }); };

  // 1. Node floor — refuse before any side effect.
  if (nodeTooOld(probe.nodeVersion)) {
    failStep('node', 'E_NODE', `Node ${probe.nodeVersion} is too old for the showreel toolkit (needs >= ${NODE_FLOOR.join('.')}).`, NODE_FIX);
    return result();
  }
  step('node', 'ok', probe.nodeVersion);

  // 2. Version handshake (B4) — a skewed toolkit must not install or render anything.
  if (probe.expectVersion != null && probe.expectVersion !== probe.toolkitVersion) {
    failStep('version', 'E_VERSION', `Toolkit is ${probe.toolkitVersion} but ${probe.expectVersion} is required.`, VERSION_FIX);
    return result();
  }
  step('version', 'ok', probe.toolkitVersion);

  // 3. Nested .gitignore files, only when absent (B1).
  const written = [];
  for (const [rel, text] of GITIGNORES) {
    const p = join(probe.hostRoot, rel);
    if (!probe.exists(p)) { probe.writeFile(p, text); written.push(rel); }
  }
  step('gitignore', written.length ? 'written' : 'ok', written);

  // 4. Deps: npm ci into the tool dir when never installed or the shipped lock changed.
  const tool = probe.toolDir;
  const lockSrc = join(probe.toolkitDir, 'deps/lock.json');
  const installed = probe.exists(join(tool, 'node_modules/.package-lock.json'));
  const lockHash = probe.fileHash(lockSrc);
  let depsOk = true;
  if (installed && lockHash !== null && probe.fileHash(join(tool, 'package-lock.json')) === lockHash) {
    step('deps', 'ok', tool);
  } else {
    probe.copyFile(join(probe.toolkitDir, 'deps/manifest.json'), join(tool, 'package.json'));
    probe.copyFile(lockSrc, join(tool, 'package-lock.json'));
    const r = probe.run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: tool });
    if (r.status === 0) {
      step('deps', 'installed', tool);
    } else {
      depsOk = false;
      failStep('deps', 'E_DEPS', `npm ci in ${tool} failed (exit ${r.status})${tail(r.stderr)}`, DEPS_FIX);
    }
  }

  // 5. ffmpeg: FFMPEG_BIN → ffmpeg-static (repair once via its install.js).
  const ffBin = probe.env('FFMPEG_BIN');
  let ffPath = null;
  let ffSource = null;
  if (ffBin) {
    if (probe.exists(ffBin)) { ffPath = ffBin; ffSource = 'FFMPEG_BIN'; }
    else failStep('ffmpeg', 'E_FFMPEG', `FFMPEG_BIN is set to ${ffBin}, but no file exists there.`, FFMPEG_FIX);
  } else if (!depsOk) {
    step('ffmpeg', 'skipped', 'deps not installed');
  } else {
    const p = probe.ffmpegStaticPath();
    if (p && !probe.exists(p)) {
      const r = probe.run(probe.execPath, [join(tool, 'node_modules/ffmpeg-static/install.js')], { cwd: tool });
      if (r.status !== 0 || !probe.exists(p)) {
        failStep('ffmpeg', 'E_FFMPEG', `ffmpeg-static binary is missing at ${p} and the repair download failed${tail(r.stderr)}`, FFMPEG_FIX);
      } else { ffPath = p; ffSource = 'ffmpeg-static'; }
    } else if (p) {
      ffPath = p; ffSource = 'ffmpeg-static';
    } else {
      failStep('ffmpeg', 'E_FFMPEG', `ffmpeg-static is installed in ${tool} but reports no binary for this platform.`, FFMPEG_FIX);
    }
  }
  if (ffPath) {
    const r = probe.run(ffPath, ['-version'], {});
    if (r.status === 0) { ffmpeg = { path: ffPath, source: ffSource }; step('ffmpeg', 'ok', ffPath); }
    else failStep('ffmpeg', 'E_FFMPEG', `ffmpeg at ${ffPath} does not run (exit ${r.status})${tail(r.stderr)}`, FFMPEG_FIX);
  }

  // 6. Browser detection (D6).
  let found = null;
  try {
    found = detectBrowser(probe);
    if (found) {
      browser = { ...found, args: launchArgs({ env: { SHOWREEL_NO_SANDBOX: probe.env('SHOWREEL_NO_SANDBOX') }, uid: probe.uid }) };
      step('browser', 'ok', `${browser.kind} ${browser.path}`);
    } else {
      failStep('browser', 'E_BROWSER', 'No Chrome, Edge or Chromium found (checked SHOWREEL_BROWSER, CHROME_PATH, default install paths, PATH).', BROWSER_FIX);
    }
  } catch (e) {
    // Only our own E_* errors become a step failure; anything else (e.g. fs EACCES) is a bug
    // or environment fault that must surface loudly as E_INTERNAL via the cli, not as code undefined.
    if (!(e instanceof ShowreelError)) throw e;
    failStep('browser', e.code, e.message, e.fix);
  }

  // 7. GPU probe: launch the browser for real and read the WebGL renderer.
  if (!browser) {
    step('gpu', 'skipped', 'no browser');
  } else if (!depsOk) {
    step('gpu', 'skipped', 'deps not installed');
  } else {
    const r = probe.gpuRenderer(browser);
    if (r.error) {
      const b = browser;
      browser = null;
      failStep('gpu', 'E_BROWSER', `${b.kind} at ${b.path} was found but failed to launch: ${r.error}`, BROWSER_FIX);
    } else {
      renderer = r.renderer;
      if (/swiftshader/i.test(renderer)) gpuNotice = GPU_NOTICE;
      step('gpu', 'ok', renderer);
    }
  }
  return result();
}
