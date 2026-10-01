// Stand-in for render/browser.mjs, loaded by the GPU probe child (runGpuProbe's
// browserModuleUrl). Behaviour comes from SHOWREEL_FAKE_MODE (inherited env):
//   close-fails — launch + renderer succeed, close() throws (the E_BROWSER leak guard firing)
//   hang        — spawns a fake "browser" whose command line holds a profile under os.tmpdir(),
//                 then never resolves (a wedged connect), so the parent's timeout fires
//   leak        — same fake browser, but returns a renderer and a close() that leaks it
// The fake browser's pid is written to SHOWREEL_FAKE_PID_FILE so the test can check it died.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fakeBrowserProcess() {
  const dir = mkdtempSync(join(tmpdir(), 'showreel-browser-'));
  // detached: like real Edge's launcher, escape the parent's lifetime (on Windows libuv would
  // otherwise kill it with its node parent via a kill-on-close job, hiding the leak).
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', `--user-data-dir=${dir}`], {
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  });
  child.unref();
  writeFileSync(process.env.SHOWREEL_FAKE_PID_FILE, String(child.pid));
}

const page = { evaluate: async () => 'FAKE RENDERER' };

export async function launchBrowser() {
  const mode = process.env.SHOWREEL_FAKE_MODE;
  if (mode === 'close-fails') {
    return {
      kind: 'custom',
      profileDir: null,
      browser: { newPage: async () => page },
      close: async () => { throw new Error('Browser processes still hold X after close: msedge.exe#4242.'); },
    };
  }
  fakeBrowserProcess();
  if (mode === 'hang') {
    setInterval(() => {}, 1000);
    return new Promise(() => {});
  }
  return { kind: 'custom', profileDir: null, browser: { newPage: async () => page }, close: async () => {} };
}
