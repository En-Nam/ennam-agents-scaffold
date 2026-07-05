import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

// Issue #8 — org-context base layer. ORG.md ships in _shared, so every profile
// emits it, and it is user-owned (skip-if-exists) after the first seed.
describe('org-context base layer (ORG.md)', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('seeds ORG.md for a dev profile and references it from the CLAUDE.md managed block', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const org = await readFile(path.join(cwd, 'ORG.md'), 'utf8');
    expect(org).toContain('Organization Context');
    expect(org).toContain('Glossary');

    // The shared CLAUDE.md managed block must point agents at ORG.md.
    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('ORG.md');
    expect(claude).toContain('Org Context');
  });

  it('seeds ORG.md for a non-dev role profile too (shared across every role)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'hr', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect((await stat(path.join(cwd, 'ORG.md'))).isFile()).toBe(true);
  });

  it('never overwrites a user-filled ORG.md on re-run, even with --merge-strategy=overwrite', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });

    // User fills in their org context.
    const filled = '# Organization Context\n\n## Company\n- Name: Acme Corp\n';
    await writeFile(path.join(cwd, 'ORG.md'), filled);

    // Re-run with the most aggressive strategy — ORG.md must be left untouched.
    const second = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(second.exitCode).toBe(0);
    expect(await readFile(path.join(cwd, 'ORG.md'), 'utf8')).toBe(filled);
  });
});
