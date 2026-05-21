import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install qa profile into empty cwd', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennam/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs qa-specific files including test-cases scaffold', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'qa', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    expect((await stat(path.join(cwd, '.claude/agents/qa-tester.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/qa-run.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/qa-report.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, 'test-cases/README.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, 'test-cases/TEMPLATE.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, 'evidence/.gitkeep'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, 'qa/.gitkeep'))).isFile()).toBe(true);

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toContain('chrome-devtools');
  });
});
