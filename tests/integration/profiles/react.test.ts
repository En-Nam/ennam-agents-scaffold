import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install react profile into empty cwd', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs react SPA agent + commands + skills + figma MCP', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'react', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    expect((await stat(path.join(cwd, '.claude/agents/web-dev-react.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/react-route.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/react-19-suspense-boundaries/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/react-actions-mutations/SKILL.md'))).isFile()).toBe(true);

    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('React 19');
    expect(claude).toContain('Vite');
    // The 'react' profile is a pure SPA — must not include Next.js / Server Components.
    expect(claude.toLowerCase()).not.toContain('next.js 16');

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['context7', 'figma', 'jira', 'serena']);
  });
});
