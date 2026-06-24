import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install devops-azure profile into empty cwd', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs devops-azure agent, azure-* commands, RBAC + bicep-vs-terraform skills, merges github MCP', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'devops-azure', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    expect((await stat(path.join(cwd, '.claude/agents/devops-azure.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/azure-plan.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/azure-policy-check.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/azure-rbac-least-privilege/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/bicep-vs-terraform-decision/SKILL.md'))).isFile()).toBe(true);

    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('DevOps engineer — Azure');

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['context7', 'github', 'jira', 'serena']);
  });
});
