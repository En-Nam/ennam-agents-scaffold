import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import stripAnsi from 'strip-ansi';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('--doctor CLI (#27)', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('passes (exit 0) on a fresh install with all keys set; --json is machine-readable', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const env = { ...process.env, JIRA_URL: 'https://x.atlassian.net', JIRA_TOKEN: 't', FIGMA_TOKEN: 'f' };
    const res = await execa('node', [CLI_ENTRY, '--doctor', '--json'], { cwd, env, reject: false });
    expect(res.exitCode).toBe(0);
    const payload = JSON.parse(res.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.errors).toBe(0);
    expect(Array.isArray(payload.findings)).toBe(true);
  });

  it('fails (exit 1) when a required key is unset, and stays read-only in an empty dir', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    // No install here — an empty dir. Doctor must report the missing .mcp.json as an error,
    // write nothing, and exit 1.
    const res = await execa('node', [CLI_ENTRY, '--doctor'], { cwd, reject: false });
    expect(res.exitCode).toBe(1);
    expect(stripAnsi(res.stdout)).toMatch(/error/i);
    // read-only guarantee: doctor created no files in the empty dir
    expect(await readdir(cwd)).toEqual([]);
  });
});
