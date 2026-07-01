import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import stripAnsi from 'strip-ansi';

// v1.9.0 — Feature A (issue #4a): the CLI flag must scan-and-exit BEFORE
// the wizard/install flow ever engages. Non-destructive by contract.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('--analyze-claude CLI flag', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 120_000);

  it('scans CLAUDE.md in cwd, prints detected sections + recommendation, exits 0', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(
      path.join(cwd, 'CLAUDE.md'),
      [
        '# My Project',
        '## Session Checkpoint Protocol',
        'Some body text.',
        '## Serena MCP Policy',
        '## Verification',
        '',
      ].join('\n'),
    );
    const result = await execa('node', [CLI_ENTRY, '--analyze-claude'], { cwd, reject: false });
    expect(result.exitCode).toBe(0);
    const out = stripAnsi(result.stdout);
    expect(out).toMatch(/Session Checkpoint Protocol/);
    expect(out).toMatch(/Serena MCP Policy/);
    expect(out).toMatch(/Verification/);
    expect(out).toMatch(/3 potential overlaps/);
    expect(out).toMatch(/Recommendation/);
    // Non-destructive: no wizard should have engaged, no plan lines emitted.
    expect(out).not.toMatch(/\+ write/);
    expect(out).not.toMatch(/Ennam Agents Scaffold v/);
  }, 30_000);

  it('handles a cwd with no CLAUDE.md gracefully (exit 0, friendly message)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const result = await execa('node', [CLI_ENTRY, '--analyze-claude'], { cwd, reject: false });
    expect(result.exitCode).toBe(0);
    const out = stripAnsi(result.stdout);
    expect(out).toMatch(/No CLAUDE\.md/);
    expect(out).toMatch(/Nothing to analyze/);
  }, 30_000);

  it('CLAUDE.md without any overlap headers prints the "no overlap" line', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(path.join(cwd, 'CLAUDE.md'), '# My Project\n## Getting Started\n');
    const result = await execa('node', [CLI_ENTRY, '--analyze-claude'], { cwd, reject: false });
    expect(result.exitCode).toBe(0);
    const out = stripAnsi(result.stdout);
    expect(out).toMatch(/no overlap patterns detected/);
  }, 30_000);
});
