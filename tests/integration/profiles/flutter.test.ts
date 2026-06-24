import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install flutter profile into empty cwd', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs flutter-specific files and merges figma into .mcp.json', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'flutter', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    expect((await stat(path.join(cwd, '.claude/agents/mobile-dev.md'))).isFile()).toBe(true);
    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('Stack: Flutter 3.x');

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(expect.arrayContaining(['serena', 'context7', 'jira', 'figma']));
    expect(mcp.mcpServers).not.toHaveProperty('chrome-devtools');  // not in flutter profile
  });
});
