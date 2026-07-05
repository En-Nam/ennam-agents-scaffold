import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

const DISCLAIMER = 'KHÔNG phải tuân thủ pháp lý';

// Issue #14 — governance & data-handling policy pack (opt-in + auto-attach).
describe('governance policy pack (POLICY.md)', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('is NOT emitted by default for a code profile', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    await expect(stat(path.join(cwd, 'POLICY.md'))).rejects.toThrow();
  });

  it('is emitted when opted in with --policy, and always carries the loud legal disclaimer', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'next', '--policy', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const policy = await readFile(path.join(cwd, 'POLICY.md'), 'utf8');
    expect(policy).toContain('Governance Policy');
    expect(policy).toContain(DISCLAIMER);
    expect(policy).toContain('Approval gates');
  });

  it('auto-attaches for hr (PII: CVs) without any flag', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'hr', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const policy = await readFile(path.join(cwd, 'POLICY.md'), 'utf8');
    expect(policy).toContain(DISCLAIMER);
  });

  it('auto-attaches for data-analytics without any flag', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'data-analytics', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect((await stat(path.join(cwd, 'POLICY.md'))).isFile()).toBe(true);
  });

  it('never overwrites a user-edited POLICY.md on re-run', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'hr', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const edited = '# Data & Governance Policy — baseline\n\nOur stricter org rules here.\n';
    await writeFile(path.join(cwd, 'POLICY.md'), edited);
    const second = await execa('node', [CLI_ENTRY, 'hr', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(second.exitCode).toBe(0);
    expect(await readFile(path.join(cwd, 'POLICY.md'), 'utf8')).toBe(edited);
  });
});
