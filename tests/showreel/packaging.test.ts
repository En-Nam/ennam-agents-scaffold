import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fg from 'fast-glob';

// v1.16 showreel — packaging guards. The installer copies templates as UTF-8 text and the
// npm tarball is the only delivery channel, so a binary, a node_modules dir, a floating
// dependency or a file dropped by `npm pack` would ship a broken toolkit to every user.
// See mem:decisions/showreel-addon-v1.16 (D1, B1, B6).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const ADDON = path.join(REPO_ROOT, 'templates', 'showreel');
const TOOLKIT = path.join(ADDON, '.claude', 'showreel');
const CLI = path.join(TOOLKIT, 'cli.mjs');

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const runCli = (args: string[], nodeArgs: string[] = []) =>
  spawnSync(process.execPath, [...nodeArgs, CLI, ...args], { encoding: 'utf8' });

describe('showreel packaging', () => {
  it('every toolkit .mjs parses (root lint is TS-only, so this is their syntax gate)', async () => {
    const files = await fg('**/*.mjs', { cwd: ADDON, dot: true, absolute: true });
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(() => execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }), f).not.toThrow();
    }
  });

  it('ships no node_modules / .tool and nothing binary (the installer is UTF-8 text only)', async () => {
    expect(await fg('**/{node_modules,.tool}/**', { cwd: ADDON, dot: true })).toEqual([]);
    const files = await fg('**/*', { cwd: ADDON, dot: true, absolute: true });
    for (const f of files) {
      const text = new TextDecoder('utf-8').decode(readFileSync(f));
      expect(text.includes('\uFFFD'), `${f} is not valid UTF-8`).toBe(false);
      expect(text.includes('\u0000'), `${f} contains NUL bytes`).toBe(false);
    }
  });

  it('deps lockfile matches the manifest and every pin is exact (B6: no floating deps)', () => {
    const manifest = readJson(path.join(TOOLKIT, 'deps', 'manifest.json'));
    const lock = readJson(path.join(TOOLKIT, 'deps', 'lock.json'));
    expect(lock.packages[''].dependencies).toEqual(manifest.dependencies);
    expect(manifest.dependencies).toEqual({
      'puppeteer-core': '25.12.0',
      'ffmpeg-static': '5.3.0',
      '@fontsource-variable/archivo': '5.3.0',
      '@fontsource-variable/jetbrains-mono': '5.3.0',
    });
    for (const [name, pin] of Object.entries(manifest.dependencies as Record<string, string>)) {
      expect(pin, name).toMatch(/^\d+\.\d+\.\d+$/);
      expect(lock.packages[`node_modules/${name}`]?.version, name).toBe(pin);
    }
  });

  // B1 (`npm pack` keeps every templates/showreel file) lives in
  // tests/integration/profiles/showreel.test.ts: the pack needs that file's fresh build
  // (packages/cli/templates is the tsup copy).

  it('cli.mjs `version` prints one JSON line; an unknown command fails loud with exit 1', () => {
    const v = runCli(['version']);
    expect(v.status).toBe(0);
    expect(v.stdout).toBe('{"ok":true,"cmd":"version","version":"1.0.0"}\n');

    const bad = runCli(['nope']);
    expect(bad.status).toBe(1);
    const out = JSON.parse(bad.stdout);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe('E_USAGE');
    expect(out.error.fix).toMatch(/cli\.mjs/);
  });

  it('cli.mjs refuses Node below 22.12 with an actionable E_NODE before loading anything', () => {
    const fake = "data:text/javascript,Object.defineProperty(process.versions,'node',{value:'20.11.0'})";
    const r = runCli(['version'], ['--import', fake]);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.error.code).toBe('E_NODE');
    expect(out.error.message).toContain('20.11.0');
    expect(out.error.fix).toContain('node .claude/showreel/cli.mjs preflight');
  });

  it('the Node floor has ONE definition (lib/util/version.mjs) — cli.mjs and preflight cannot drift (Rule 7)', async () => {
    const version = await import(pathToFileURL(path.join(TOOLKIT, 'lib/util/version.mjs')).href);
    const plan = await import(pathToFileURL(path.join(TOOLKIT, 'lib/preflight/plan.mjs')).href);
    expect(version.NODE_FLOOR).toEqual([22, 12]);
    expect(plan.NODE_FLOOR).toBe(version.NODE_FLOOR);
    expect(plan.nodeTooOld).toBe(version.nodeTooOld);
    for (const rel of ['cli.mjs', 'lib/preflight/plan.mjs']) {
      const src = readFileSync(path.join(TOOLKIT, rel), 'utf8');
      expect(src, rel).not.toMatch(/NODE_FLOOR\s*=|function nodeTooOld|22\.12/);
    }
  });

  it('every dispatched command is implemented — no speculative E_NOT_IMPLEMENTED path (Rule 2)', async () => {
    const src = readFileSync(CLI, 'utf8');
    expect(src).not.toContain('E_NOT_IMPLEMENTED');
    const loaders = [...src.matchAll(/^\s*(\w+): \(\) => import\('\.\/(lib\/[^']+)'\)/gm)];
    expect(loaders.map((m) => m[1]).sort()).toEqual(['check', 'facts', 'preflight', 'render', 'verify']);
    for (const m of loaders) {
      const mod = await import(pathToFileURL(path.join(TOOLKIT, m[2]!)).href);
      expect(typeof mod.run, m[1]).toBe('function');
    }
  });

  it('cli.mjs VERSION matches the toolkit README "Toolkit version:" line (B4 handshake source)', () => {
    // VERSION lives in the dependency-free lib/util/version.mjs; cli.mjs re-exports it.
    expect(readFileSync(CLI, 'utf8')).toMatch(/^import \{ VERSION(?:, \w+)* \} from '\.\/lib\/util\/version\.mjs';$[\s\S]*^export \{ VERSION \};$/m);
    const cliVersion = /export const VERSION = '([^']+)'/.exec(readFileSync(path.join(TOOLKIT, 'lib/util/version.mjs'), 'utf8'))?.[1];
    const readmeVersion = /^Toolkit version: (\S+)$/m.exec(readFileSync(path.join(ADDON, 'README.md'), 'utf8'))?.[1];
    expect(cliVersion).toBe('1.0.0');
    expect(readmeVersion).toBe(cliVersion);
  });

  it('toolkit README THIRD-PARTY section names deps/ as the dependency manifest (PO condition, M1 scope call 2)', () => {
    const readme = readFileSync(path.join(ADDON, 'README.md'), 'utf8');
    const thirdParty = readme.slice(readme.indexOf('## THIRD-PARTY'));
    expect(thirdParty).toContain('.claude/showreel/deps/');
    for (const dep of ['puppeteer-core', 'ffmpeg-static', '@fontsource-variable/archivo', '@fontsource-variable/jetbrains-mono']) {
      expect(thirdParty, dep).toContain(dep);
    }
  });
});
