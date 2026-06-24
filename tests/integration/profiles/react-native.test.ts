import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install react-native profile into empty cwd', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs RN+Expo agent + rn-* commands + worklet + new-arch skills + figma MCP', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'react-native', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    expect((await stat(path.join(cwd, '.claude/agents/mobile-dev-rn.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/rn-screen.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/rn-build.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/rn-new-architecture-discipline/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/rn-reanimated-worklets/SKILL.md'))).isFile()).toBe(true);

    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('Expo SDK 52');
    expect(claude).toContain('New Architecture');

    // Agent must explicitly forbid native build file edits (BA AC-4 + adversarial review #1).
    const agent = await readFile(path.join(cwd, '.claude/agents/mobile-dev-rn.md'), 'utf8');
    expect(agent.toLowerCase()).toContain('podfile');
    expect(agent.toLowerCase()).toContain('build.gradle');

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['context7', 'figma', 'jira', 'serena']);
  });
});
