import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import stripAnsi from 'strip-ansi';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

const install = (cwd: string, args: string[]) =>
  execa('node', [CLI_ENTRY, ...args, '--merge-strategy=overwrite', '--no-prompts'], { cwd, reject: false });

async function claudeMd(cwd: string): Promise<string> {
  return readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
}

describe('workflow selection (#26)', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('engineering profile with no --workflow keeps the engineering-full 7-phase text', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await install(cwd, ['next']);
    const c = await claudeMd(cwd);
    expect(c).toContain('### Superpowers Workflow');
    expect(c).toContain('### Task Complexity Guide');
  });

  it('doc-first profile (hr) auto-recommends the doc-first-signoff workflow', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await install(cwd, ['hr']);
    const c = await claudeMd(cwd);
    expect(c).toContain('Doc-First Workflow');
    expect(c).not.toContain('### Superpowers Workflow');
  });

  it('data-analytics auto-recommends the data-insight workflow', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await install(cwd, ['data-analytics']);
    const c = await claudeMd(cwd);
    expect(c).toContain('Data Workflow');
    expect(c).toContain('Question → Query → Validate → Report');
  });

  it('--workflow overrides the recommendation for any profile', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await install(cwd, ['next', '--workflow', 'doc-first-signoff']);
    const c = await claudeMd(cwd);
    expect(c).toContain('Doc-First Workflow');
    expect(c).not.toContain('### Superpowers Workflow');
  });

  it('an unknown --workflow id fails loud with exit 2 and lists the valid ids (CI path)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const res = await install(cwd, ['next', '--workflow', 'bogus']);
    expect(res.exitCode).toBe(2);
    const err = stripAnsi(res.stderr);
    expect(err).toContain('Unknown workflow preset "bogus"');
    expect(err).toContain('engineering-full');
  });

  it('post-install steps point to the doctor and the plugin menu (#24 + #27)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const res = await install(cwd, ['next']);
    const out = stripAnsi(res.stdout);
    expect(out).toContain('--doctor');
    expect(out).toContain('docs/plugins.md');
  });
});
