import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install devops-docker profile into empty cwd', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs devops-docker agent, docker/komodo/tailscale commands, 4 skills, merges github MCP', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'devops-docker', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    expect((await stat(path.join(cwd, '.claude/agents/devops-docker.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/docker-stack.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/docker-up.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/tailscale-route.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/komodo-sync.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/docker-socket-proxy-acl/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/tailscale-sidecar-pattern/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/compose-stack-discipline/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/komodo-resource-sync-gitops/SKILL.md'))).isFile()).toBe(true);

    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toMatch(/DevOps.*Docker/i);

    // Architecture coherence: the agent must mention the three load-bearing components.
    const agent = await readFile(path.join(cwd, '.claude/agents/devops-docker.md'), 'utf8');
    expect(agent).toMatch(/docker-socket-proxy/i);
    expect(agent).toMatch(/Komodo/i);
    expect(agent).toMatch(/Tailscale/i);

    // Boundaries section must forbid the 3 architecture anti-patterns explicitly
    // (adversarial-review finding: refiner ensured all three are named).
    expect(agent).toMatch(/var\/run\/docker\.sock/);
    expect(agent).toMatch(/:latest/);
    expect(agent).toMatch(/Watchtower/);

    // Agent file size budget — rubric ≤2048 bytes. Hard regression guard.
    const agentSize = (await stat(path.join(cwd, '.claude/agents/devops-docker.md'))).size;
    expect(agentSize).toBeLessThanOrEqual(2048);

    // compose-stack-discipline skill must encode the discipline triplet.
    const composeSkill = await readFile(path.join(cwd, '.claude/skills/compose-stack-discipline/SKILL.md'), 'utf8');
    expect(composeSkill).toMatch(/healthcheck/i);
    expect(composeSkill).toMatch(/restart/i);
    expect(composeSkill).toMatch(/:latest/);

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toContain('github');
    expect(Object.keys(mcp.mcpServers)).toContain('serena');
  });
});
