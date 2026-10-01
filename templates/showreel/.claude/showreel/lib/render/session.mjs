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
      page.on('pageerror', (e) => errors.push(msg(e)));
      await page.goto(`${srv.url}/engine/page.html`, { waitUntil: 'load' });
      await page.waitForFunction('window.SHOWREEL && window.SHOWREEL.ready');
      try {
        await page.evaluate(() => window.SHOWREEL.ready);
      } catch (err) {
        throw new ShowreelError(
          'E_ENGINE',
          `The engine page failed to start: ${msg(err)}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
          'Re-run: node .claude/showreel/cli.mjs check — if it persists (fonts missing?), run preflight; otherwise report a toolkit bug.',
        );
      }
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
