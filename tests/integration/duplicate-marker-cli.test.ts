import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

// Reviewer flagged that a CLAUDE.md with two scaffold begin markers
// produced a raw Node stack trace from mergeMarker. The CLI now wraps
// scanConflicts in a try/catch and prints a clean `Error: ...` to stderr
// matching the getProfile / --no-prompts conventions. Lock that contract.
describe('duplicate scaffold markers in CLAUDE.md', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 120_000);

  it('exits 2 with a clean stderr message (no Node stack frames)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    // Two begin markers, no matching end-marker pairs that resolve cleanly.
    const malformed = [
      '# Project',
      '',
      '<!-- ennam-agents-scaffold:begin v1.1.0 -->',
      'old block one',
      '<!-- ennam-agents-scaffold:end -->',
      '',
      '<!-- ennam-agents-scaffold:begin v1.0.0 -->',
      'old block two',
      '<!-- ennam-agents-scaffold:end -->',
      '',
    ].join('\n');
    await writeFile(path.join(cwd, 'CLAUDE.md'), malformed, 'utf8');

    const result = await execa(
      'node',
      [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'],
      { cwd, reject: false },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/Error:/);
    expect(result.stderr).toMatch(/Multiple ennam-agents-scaffold begin markers/);
    // No raw Node stack frames in stderr.
    expect(result.stderr).not.toMatch(/at mergeMarker/);
    expect(result.stderr).not.toMatch(/at CAC\./);
  }, 30_000);
});
