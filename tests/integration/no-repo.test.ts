import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('no-repo auto-detect: scaffold into a dir without .git', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennam/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('skips .gitignore when target dir has no .git', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    // Deliberately do NOT git-init: this is what the test is for.

    const { exitCode, stdout } = await execa(
      'node',
      [CLI_ENTRY, 'qa', '--merge-strategy=overwrite', '--no-prompts'],
      { cwd },
    );
    expect(exitCode).toBe(0);

    // Scaffold did run — other files exist
    expect((await stat(path.join(cwd, 'CLAUDE.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.mcp.json'))).isFile()).toBe(true);

    // .gitignore was skipped — file does not exist
    await expect(stat(path.join(cwd, '.gitignore'))).rejects.toThrow();

    // The skip reason is surfaced in the plan output
    expect(stdout).toContain('No .git detected');

    // Next-steps must NOT tell the user to run `git diff` in a non-git dir.
    expect(stdout).not.toMatch(/Review changes: git diff/);
    expect(stdout).toMatch(/no \.git detected|git init/i);
  });
});
