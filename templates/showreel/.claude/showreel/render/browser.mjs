// Browser launch (C11). M1 Task 1 = minimal: explicit path / SHOWREEL_BROWSER / CHROME_PATH only.
// Task 7 adds per-OS Chrome + Edge detection and the Edge connect path.
import { existsSync } from 'node:fs';
import { ShowreelError } from '../lib/util/out.mjs';
import { loadDep } from '../lib/util/tooldeps.mjs';

const BROWSER_FIX = 'Install Google Chrome or set SHOWREEL_BROWSER=/path/to/chrome';

export function launchArgs() {
  const noSandbox = process.env.SHOWREEL_NO_SANDBOX === '1' || (typeof process.getuid === 'function' && process.getuid() === 0);
  return [
    ...(noSandbox ? ['--no-sandbox'] : []),
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--force-color-profile=srgb',
  ];
}

export async function launchBrowser({ hostRoot, executablePath } = {}) {
  const exe = executablePath ?? process.env.SHOWREEL_BROWSER ?? process.env.CHROME_PATH;
  if (!exe) throw new ShowreelError('E_BROWSER', 'No browser configured (SHOWREEL_BROWSER / CHROME_PATH unset).', BROWSER_FIX);
  if (!existsSync(exe)) throw new ShowreelError('E_BROWSER', `Browser not found at ${exe}.`, BROWSER_FIX);
  const mod = await loadDep('puppeteer-core', hostRoot);
  const puppeteer = mod.default ?? mod;
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs() });
  return { browser, kind: 'custom', close: () => browser.close() };
}
