import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

/**
 * Regression for the silent-exit bug: under `npx`, the bin in
 * `node_modules/.bin/ennam-agents-scaffold` is a symlink to the real
 * `dist/index.js`. The pre-fix `isMain` guard compared `process.argv[1]`
 * (the symlink) against `import.meta.url` (the realpath) — they never matched,
 * so `cli.parse()` never ran and the process exited 0 having done nothing.
 *
 * This test simulates the npx invocation shape on POSIX systems by creating
 * a symlink and invoking the CLI THROUGH the symlink. The fix realpaths
 * both sides before comparing, so cli.parse() now runs and `--help` prints.
 *
 * Windows symlink creation requires admin or developer mode; on Windows the
 * shim is a `.cmd` file that invokes `node "<real-path>" %*` so argv[1] is
 * already the realpath — the bug never triggered. Skip the symlink-shaped
 * simulation there.
 */
describe('isMain guard tolerates symlinked bin (npx)', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it.skipIf(process.platform === 'win32')('invocation via a symlinked entry runs cli.parse()', async () => {
    const { path: binDir } = await tmpDir({ unsafeCleanup: true });
    const symlinkPath = path.join(binDir, 'ennam-agents-scaffold');
    await symlink(CLI_ENTRY, symlinkPath);

    // --help is the cheapest proof that cli.parse() actually ran (cac handles it).
    // Before the fix this would exit 0 with empty stdout.
    const { exitCode, stdout } = await execa('node', [symlinkPath, '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Usage:\s*\$\s*ennam-agents-scaffold/);
    expect(stdout).toContain('--dry-run');
  });

  it('direct invocation still works (sanity)', async () => {
    const { exitCode, stdout } = await execa('node', [CLI_ENTRY, '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Usage:\s*\$\s*ennam-agents-scaffold/);
  });

  it.skipIf(process.platform === 'win32')('invocation via a node_modules/.bin shaped symlink (npx shape)', async () => {
    // Reproduce the exact directory layout npx creates: a `node_modules/.bin/`
    // sibling to the package's real `dist/` directory.
    const { path: root } = await tmpDir({ unsafeCleanup: true });
    const binDir = path.join(root, 'node_modules', '.bin');
    const pkgDir = path.join(root, 'node_modules', '@ennamjsc', 'agents-scaffold', 'dist');
    await mkdir(binDir, { recursive: true });
    await mkdir(pkgDir, { recursive: true });

    // Stage the real entry inside the simulated package dir.
    const realEntry = path.join(pkgDir, 'index.js');
    await writeFile(realEntry, await import('node:fs/promises').then(fs => fs.readFile(CLI_ENTRY, 'utf8')));

    // Stage the rest of dist alongside (the entry imports its package.json).
    const distDir = path.dirname(CLI_ENTRY);
    const fs = await import('node:fs/promises');
    for (const f of await fs.readdir(distDir)) {
      if (f === 'index.js') continue;
      await fs.copyFile(path.join(distDir, f), path.join(pkgDir, f));
    }
    // The CLI reads `../package.json` from its own dir — copy that too.
    await fs.copyFile(
      path.join(REPO_ROOT, 'packages', 'cli', 'package.json'),
      path.join(pkgDir, '..', 'package.json'),
    );

    const linkPath = path.join(binDir, 'ennam-agents-scaffold');
    await symlink(realEntry, linkPath);

    const { exitCode, stdout } = await execa('node', [linkPath, '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--dry-run');
  });
});
