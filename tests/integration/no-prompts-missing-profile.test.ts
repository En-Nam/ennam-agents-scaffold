import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('--no-prompts without a profile arg', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 120_000);

  it('fails with exit code 2 and a clear stderr message (wizard MUST NOT engage in CI mode)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const result = await execa('node', [CLI_ENTRY, '--no-prompts'], { cwd, reject: false });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/profile is required/);
  }, 30_000);
});
