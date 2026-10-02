// One browser + the local engine server for check / render / verify (Task 8).
// The engine page loads /build/timeline.json + /build/resolved.json from the host build dir (C10/C12).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShowreelError } from '../util/out.mjs';
import { paths } from '../util/paths.mjs';
import { startServer } from '../../render/server.mjs';
import { launchBrowser } from '../../render/browser.mjs';

const TOOLKIT_DIR = fileURLToPath(new URL('../../', import.meta.url));
const msg = (e) => String((e && e.message) || e).split('\n')[0];
/** How long the engine modules may take to import and set window.SHOWREEL (puppeteer's default, made explicit). */
export const ENGINE_BOOT_MS = 30_000;
const ENGINE_FIX = 'Re-run: node .claude/showreel/cli.mjs check — if it persists (fonts missing?), run preflight; otherwise report a toolkit bug.';

/**
 * Navigate `page` to the engine and wait for SHOWREEL.ready. Any failure — an engine/archetype module
 * that never sets window.SHOWREEL (syntax error, 404, top-level throw → boot timeout) or a rejected
 * ready — is E_ENGINE carrying the page errors and console errors seen so far (the failing module's name).
 */
export async function bootEngine(page, url, errors, consoleErrors = [], timeoutMs = ENGINE_BOOT_MS) {
  const seen = () => [...errors, ...consoleErrors];
  const fail = (what, err) => new ShowreelError(
    'E_ENGINE',
    `The engine page failed to start (${what}): ${msg(err)}${seen().length ? `; page errors: ${seen().join(' | ')}` : ''}`,
    ENGINE_FIX,
  );
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction('window.SHOWREEL && window.SHOWREEL.ready', { timeout: timeoutMs });
  } catch (err) {
    throw fail(`window.SHOWREEL never appeared within ${timeoutMs} ms`, err);
  }
  try {
    await page.evaluate(() => window.SHOWREEL.ready);
  } catch (err) {
    throw fail('SHOWREEL.ready rejected', err);
  }
}

/**
 * Run `fn(session)` and close the session afterwards WITHOUT letting a close() failure replace the
 * error already in flight (Rule 12): when fn threw, a close failure is appended to that error and the
 * original is rethrown; when fn succeeded, the close failure itself is thrown.
 */
export async function useSession(session, fn) {
  let failure = null;
  let result;
  try {
    result = await fn(session);
  } catch (err) {
    failure = err;
  }
  try {
    await session.close();
  } catch (closeErr) {
    if (!failure) throw closeErr;
    const note = `; closing the browser also failed: ${msg(closeErr)}`;
    if (failure instanceof Error) {
      failure.message += note;
      if (typeof failure.stack === 'string') failure.stack += `\n${note.slice(2)}`;
    }
  }
  if (failure) throw failure;
  return result;
}

/** → {page(): Promise<{page, renderer, errors}>, kind, close()} */
export async function openSession(hostRoot) {
  const p = paths(hostRoot);
  const srv = await startServer({ toolkitDir: TOOLKIT_DIR, toolDir: p.tool, buildDir: join(hostRoot, p.build) });
  let b;
  try {
    b = await launchBrowser({ hostRoot });
  } catch (err) {
    await srv.close();
    throw err;
  }
  return {
    kind: b.kind,
    /** A fresh engine page with SHOWREEL.ready resolved. `errors` collects later page errors (fail loud). */
    async page() {
      const page = await b.browser.newPage();
      const errors = [];
      const consoleErrors = []; // only reported when boot fails (a 404 module import is a console error, not a pageerror)
      page.on('pageerror', (e) => errors.push(msg(e)));
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(msg(m.text())); });
      await bootEngine(page, `${srv.url}/engine/page.html`, errors, consoleErrors);
      const renderer = await page.evaluate(() => window.SHOWREEL.renderer);
      return { page, renderer, errors };
    },
    async close() {
      try {
        await b.close();
      } finally {
        await srv.close();
      }
    },
  };
}
