import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'next-project');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('idempotency: running scaffold twice', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennam/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('second run with same args reports zero writes', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });

    // First run — install everything
    const first = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toMatch(/Written:\s*[1-9]/);  // at least 1 write happened

    // Second run — should be a no-op
    const second = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toMatch(/Written:\s*0/);
  });

  it('dry-run after install reports zero ops', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });

    await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });

    const dry = await execa('node', [CLI_ENTRY, 'next', '--dry-run', '--no-prompts'], { cwd });
    expect(dry.exitCode).toBe(0);
    // Plan output should show all ops as `skip` (identical)
    expect(dry.stdout).not.toMatch(/\+\s*write/);
  });
});
