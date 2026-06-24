import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { cp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'existing-claude-md-project');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install into project with existing CLAUDE.md', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennam/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('appends marker block, preserves user content, backs up original', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });
    const before = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const after = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(after).toContain('# My Existing Project');         // user content preserved
    expect(after).toContain('Keep this section untouched');
    expect(after).toMatch(/<!-- ennam-agents-scaffold:begin v/);
    expect(after).toContain('<!-- ennam-agents-scaffold:end -->');
    expect(after).toContain('## Agents Workflow');             // from shared partial
    expect(after).toContain('Stack: Next.js 16');              // from profile partial

    // Backup was created
    const backupDir = path.join(cwd, '.ennam-scaffold-backup');
    const fg = await import('fast-glob');
    const backups = await fg.default('**/CLAUDE.md', { cwd: backupDir, dot: true });
    expect(backups.length).toBe(1);
    const backupContent = await readFile(path.join(backupDir, backups[0]!), 'utf8');
    expect(backupContent).toBe(before);
  });

  it('re-running yields same content (idempotent)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });

    await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const after1 = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');

    await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const after2 = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');

    expect(after2).toBe(after1);
  });
});
