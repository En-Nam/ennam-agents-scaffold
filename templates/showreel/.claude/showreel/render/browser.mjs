// Browser launch (C11, Task 7). Detection order D6 lives in lib/preflight/plan.mjs.
//
// Edge: its launcher process detaches and exits 0 (M0, msedge 154 on Windows), so
// puppeteer.launch loses the browser and leaves it orphaned. Edge therefore always uses
// the connect path: spawn with --remote-debugging-port=0 and a private temp profile, read
// <profile>/DevToolsActivePort, puppeteer.connect(). close() then kills every process whose
// command line holds that temp profile path (nothing else — never the user's own browsers)
// and removes the profile. Chrome/Chromium use puppeteer.launch and fall back to the same
// connect path only if launch fails.
//
// Deliberately does NOT import lib/preflight/probe.mjs: that module pulls in cli.mjs for
// VERSION, and every render-path consumer would then evaluate cli.mjs (circular, fragile).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShowreelError } from '../lib/util/out.mjs';
import { loadDep } from '../lib/util/tooldeps.mjs';
import { BROWSER_FIX, detectBrowser, kindOfPath, launchArgs } from '../lib/preflight/plan.mjs';

export { launchArgs };

const PORT_FILE_TIMEOUT_MS = 15_000;
const EXIT_TIMEOUT_MS = 5_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Edge (any path, including SHOWREEL_BROWSER=…msedge) must not go through puppeteer.launch. */
export function usesConnectPath(exe) {
  return kindOfPath(exe) === 'edge';
}

/** First match of `name` on PATH, or null. */
export function whichSync(name) {
  const r = process.platform === 'win32'
    ? spawnSync('where', [name], { encoding: 'utf8' })
    : spawnSync('sh', ['-c', 'command -v "$1"', 'sh', name], { encoding: 'utf8' });
  const first = r.status === 0 ? String(r.stdout).split(/\r?\n/)[0].trim() : '';
  return first || null;
}

/** Processes (other than this query) whose command line contains `dir`. → [{pid, name}] */
export function listProfileProcesses(dir) {
  if (process.platform === 'win32') {
    const lit = dir.replace(/'/g, "''");
    const ps =
      'Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and ' +
      `$_.CommandLine.Contains('${lit}') } | ForEach-Object { "$($_.ProcessId)\`t$($_.Name)" }`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`process listing failed: ${r.error ? r.error.message : r.stderr}`);
    return parseList(r.stdout);
  }
  const r = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`process listing failed: ${r.error ? r.error.message : r.stderr}`);
  return String(r.stdout)
    .split('\n')
    .map((l) => /^\s*(\d+)\s+(.*)$/.exec(l))
    .filter((m) => m && m[2].includes(dir) && Number(m[1]) !== process.pid)
    .map((m) => ({ pid: Number(m[1]), name: m[2].split(' ')[0] }));
}

function parseList(out) {
  return String(out)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => { const [pid, name] = l.split('\t'); return { pid: Number(pid), name }; });
}

async function killProfile(dir) {
  const deadline = Date.now() + EXIT_TIMEOUT_MS;
  let left = listProfileProcesses(dir);
  while (left.length && Date.now() < deadline) {
    for (const { pid } of left) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    await sleep(100);
    left = listProfileProcesses(dir);
  }
  return left;
}

/**
 * Synchronous variant for callers that cannot await (preflight's GPU probe parent): kill
 * every process whose command line contains `dir`. → processes still alive after timeoutMs.
 */
export function killProfileSync(dir, timeoutMs = EXIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  const nap = new Int32Array(new SharedArrayBuffer(4));
  let left = listProfileProcesses(dir);
  while (left.length && Date.now() < deadline) {
    for (const { pid } of left) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    Atomics.wait(nap, 0, 0, 100);
    left = listProfileProcesses(dir);
  }
  return left;
}

async function cleanupProfile(dir) {
  const left = await killProfile(dir);
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  if (left.length) {
    throw new ShowreelError(
      'E_BROWSER',
      `Browser processes still hold ${dir} after close: ${left.map((p) => `${p.name}#${p.pid}`).join(', ')}.`,
      'Kill those processes, then re-run.',
    );
  }
}

async function connectLaunch(puppeteer, exe, args) {
  const dir = mkdtempSync(join(tmpdir(), 'showreel-browser-'));
  let spawnError = null;
  try {
    const child = spawn(
      exe,
      [...args, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
      { stdio: 'ignore' },
    );
    child.on('error', (e) => { spawnError = e; });
    const portFile = join(dir, 'DevToolsActivePort');
    const deadline = Date.now() + PORT_FILE_TIMEOUT_MS;
    let endpoint = null;
    while (!endpoint) {
      if (spawnError) throw spawnError;
      if (existsSync(portFile)) {
        const [port, path] = readFileSync(portFile, 'utf8').split(/\r?\n/);
        if (/^\d+$/.test(port) && path) endpoint = `ws://127.0.0.1:${port}${path}`;
      }
      if (!endpoint) {
        if (Date.now() > deadline) throw new Error(`no DevToolsActivePort in ${dir} after ${PORT_FILE_TIMEOUT_MS / 1000} s`);
        await sleep(100);
      }
    }
    const browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
    const close = async () => {
      try { await browser.close(); } catch { /* the profile kill below is the guarantee */ }
      await cleanupProfile(dir);
    };
    return { browser, close, profileDir: dir };
  } catch (err) {
    await cleanupProfile(dir).catch(() => {});
    throw err;
  }
}

/**
 * Launch strategy, split out so the routing can be tested with a puppeteer stub.
 * Edge → connect path only. Others → puppeteer.launch; on failure → connect path; if both
 * fail the E_BROWSER message names both errors.
 */
export async function launchWith({ puppeteer, exe, kind, args, connect = connectLaunch }) {
  const first = (e) => String((e && e.message) || e).split('\n')[0];
  try {
    if (usesConnectPath(exe)) return { kind, ...(await connect(puppeteer, exe, args)) };
    let launchErr;
    try {
      const browser = await puppeteer.launch({ executablePath: exe, headless: true, args });
      return { browser, kind, close: () => browser.close(), profileDir: null };
    } catch (e) {
      launchErr = e;
    }
    try {
      return { kind, ...(await connect(puppeteer, exe, args)) };
    } catch (e) {
      throw new Error(`puppeteer.launch failed (${first(launchErr)}); connect fallback failed (${first(e)})`);
    }
  } catch (err) {
    if (err instanceof ShowreelError) throw err;
    throw new ShowreelError('E_BROWSER', `Cannot start ${kind} at ${exe}: ${first(err)}`, BROWSER_FIX);
  }
}

/** → { browser, kind: 'chrome'|'edge'|'chromium'|'custom', close(), profileDir: string|null } */
export async function launchBrowser({ hostRoot, executablePath } = {}) {
  let exe = executablePath;
  let kind;
  if (exe) {
    if (!existsSync(exe)) throw new ShowreelError('E_BROWSER', `Browser not found at ${exe}.`, BROWSER_FIX);
    kind = kindOfPath(exe);
  } else {
    // Minimal detection probe: only what detectBrowser reads (throws ShowreelError itself).
    const found = detectBrowser({
      platform: process.platform,
      env: (name) => process.env[name],
      exists: (p) => existsSync(p),
      which: whichSync,
    });
    if (!found) throw new ShowreelError('E_BROWSER', 'No Chrome, Edge or Chromium found.', BROWSER_FIX);
    exe = found.path;
    kind = found.kind;
  }
  const mod = await loadDep('puppeteer-core', hostRoot);
  const puppeteer = mod.default ?? mod;
  return launchWith({ puppeteer, exe, kind, args: launchArgs() });
}
