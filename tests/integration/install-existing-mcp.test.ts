import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { cp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'existing-mcp-project');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install into project with existing .mcp.json', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 120_000);

  it('deep-merges user mcp config with scaffold (user wins on overlaps)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const merged = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));

    // User's custom server preserved
    expect(merged.mcpServers['my-custom-server'].command).toBe('my-bin');
    // User's serena.command preserved (user wins on overlap)
    expect(merged.mcpServers.serena.command).toBe('my-custom-serena');
    // Scaffold adds context7 and jira (user didn't have them)
    expect(merged.mcpServers).toHaveProperty('context7');
    expect(merged.mcpServers).toHaveProperty('jira');
    // Profile additions (chrome-devtools, figma) merged in
    expect(merged.mcpServers).toHaveProperty('chrome-devtools');
    expect(merged.mcpServers).toHaveProperty('figma');

    // Backup of original
    const backupDir = path.join(cwd, '.ennam-scaffold-backup');
    const fg = await import('fast-glob');
    const backups = await fg.default('**/.mcp.json', { cwd: backupDir, dot: true });
    expect(backups.length).toBe(1);
  }, 60_000);

  it('idempotent: second run produces same .mcp.json', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });

    await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const after1 = await readFile(path.join(cwd, '.mcp.json'), 'utf8');

    await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const after2 = await readFile(path.join(cwd, '.mcp.json'), 'utf8');

    expect(after2).toBe(after1);
  }, 60_000);
});
