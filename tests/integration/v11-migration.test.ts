import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

// Locks the v1.1 -> v1.2 upgrade contract:
//  - CLAUDE.md scaffold-managed block is REPLACED (no stale
//    `chrome-devtools-mcp:` skill references remain).
//  - .mcp.json's `chrome-devtools` server PERSISTS (mergeJson is user-wins;
//    the scaffold cannot silently drop user keys), but a clear post-install
//    WARNING is printed so the user knows to remove it manually.
describe('v1.1 -> v1.2 migration: stale chrome-devtools handling', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 120_000);

  it('replaces v1.1 marker block AND warns about stale chrome-devtools .mcp.json entry', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    // v1.1-style .mcp.json with chrome-devtools server registered
    const v11Mcp = {
      mcpServers: {
        'chrome-devtools': { command: 'npx', args: ['-y', 'chrome-devtools-mcp'] },
        'my-thing': { command: 'foo' },
      },
    };
    await writeFile(path.join(cwd, '.mcp.json'), JSON.stringify(v11Mcp, null, 2), 'utf8');

    // v1.1-style CLAUDE.md with a scaffold marker block referencing the deprecated skill
    const v11Claude = [
      '# My Project',
      '',
      '<!-- ennam-agents-scaffold:begin v1.1.0 -->',
      '## Old block',
      '',
      'Use `chrome-devtools-mcp:performance-trace` for LCP debugging.',
      'See also `chrome-devtools-mcp:troubleshooting`.',
      '<!-- ennam-agents-scaffold:end -->',
      '',
    ].join('\n');
    await writeFile(path.join(cwd, 'CLAUDE.md'), v11Claude, 'utf8');

    // Seed .claude/settings.json so the json-merge has a sane base
    await mkdir(path.join(cwd, '.claude'), { recursive: true });

    const result = await execa(
      'node',
      [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'],
      { cwd, reject: false },
    );
    expect(result.exitCode).toBe(0);

    // CLAUDE.md: scaffold-managed block REPLACED — no chrome-devtools-mcp: reference remains.
    const claudeAfter = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claudeAfter).not.toMatch(/chrome-devtools-mcp:/);
    // The new v1.2.x block should be in place (any patch version).
    expect(claudeAfter).toMatch(/<!-- ennam-agents-scaffold:begin v1\.\d+\.\d+ -->/);
    expect(claudeAfter).toMatch(/<!-- ennam-agents-scaffold:end -->/);

    // .mcp.json: chrome-devtools entry PERSISTS (documented user-wins behavior).
    const mcpAfter = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(mcpAfter.mcpServers).toHaveProperty('chrome-devtools');
    // User's other custom server is preserved.
    expect(mcpAfter.mcpServers).toHaveProperty('my-thing');
    // Scaffold's own servers added.
    expect(mcpAfter.mcpServers).toHaveProperty('serena');
    expect(mcpAfter.mcpServers).toHaveProperty('context7');

    // The CLI printed a migration warning so the user knows to clean up manually.
    expect(result.stdout).toMatch(/chrome-devtools/);
    expect(result.stdout).toMatch(/v1\.2 no longer ships chrome-devtools-mcp/);
  }, 60_000);

  it('clean install (no pre-existing chrome-devtools) prints NO warning', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    const result = await execa(
      'node',
      [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'],
      { cwd, reject: false },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/v1\.2 no longer ships chrome-devtools-mcp/);

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(mcp.mcpServers).not.toHaveProperty('chrome-devtools');
  }, 60_000);
});
