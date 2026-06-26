import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install game-unity profile into empty cwd', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs 3 agents, 3 commands, 4 skills, GDD + art-bible + perf-budget templates, Editor-templates, LFS rules, Unity MCP', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'game-unity', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    // 3 agents
    expect((await stat(path.join(cwd, '.claude/agents/gameplay-engineer.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/agents/asset-pipeline.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/agents/build-and-test.md'))).isFile()).toBe(true);

    // 3 commands
    expect((await stat(path.join(cwd, '.claude/commands/unity-greybox.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/unity-build-android.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/commands/unity-content-gate.md'))).isFile()).toBe(true);

    // 4 skills + Tripo fixture
    expect((await stat(path.join(cwd, '.claude/skills/unity-mcp-setup/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/unity-2.5d-conventions/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/perf-budget-check/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/asset-pipeline-tripo3d/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, '.claude/skills/asset-pipeline-tripo3d/fixtures/tripo-image-to-model-success.json'))).isFile()).toBe(true);

    // GDD + art-bible + perf-budget (rendered from .hbs)
    expect((await stat(path.join(cwd, 'GDD.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, 'art-bible.md'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, 'docs/perf-budget.md'))).isFile()).toBe(true);

    // Editor templates (NOT auto-installed into Assets/Editor — user copies)
    expect((await stat(path.join(cwd, 'Editor-templates/EnnamPreflight.cs'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, 'Editor-templates/EnnamPerf.cs'))).isFile()).toBe(true);
    expect((await stat(path.join(cwd, 'Editor-templates/README.md'))).isFile()).toBe(true);

    // README
    expect((await stat(path.join(cwd, 'README.md'))).isFile()).toBe(true);

    // CLAUDE.md has both game-specific marker blocks
    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toMatch(/Unity 2\.5D mobile/i);
    expect(claude).toMatch(/<!-- BEGIN:game-unity-workflow -->/);
    expect(claude).toMatch(/<!-- END:game-unity-workflow -->/);
    expect(claude).toMatch(/<!-- BEGIN:game-unity-agent-rules -->/);
    expect(claude).toMatch(/<!-- END:game-unity-agent-rules -->/);
    // 8-phase workflow with Content Gates (Phase 6)
    expect(claude).toMatch(/Content Gates/i);
    expect(claude).toMatch(/Design.*Art.*Feel.*Perf/);

    // .mcp.json merged: serena + context7 + jira + unity (CoplayDev)
    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(expect.arrayContaining(['context7', 'jira', 'serena', 'unity']));
    expect(mcp.mcpServers.unity.command).toBe('uvx');
    expect(mcp.mcpServers.unity.args).toContain('coplay-mcp-server');

    // .gitattributes (from _shared/.gitattributes.append) has LFS rules
    expect((await stat(path.join(cwd, '.gitattributes'))).isFile()).toBe(true);
    const gitattrs = await readFile(path.join(cwd, '.gitattributes'), 'utf8');
    expect(gitattrs).toMatch(/\*\.fbx\s+filter=lfs/);
    expect(gitattrs).toMatch(/\*\.png\s+filter=lfs/);
    expect(gitattrs).toMatch(/\*\.wav\s+filter=lfs/);
    // Unity Smart Merge text formats MUST NOT be LFS — assert absence.
    expect(gitattrs).not.toMatch(/\*\.unity\s+filter=lfs/);
    expect(gitattrs).not.toMatch(/\*\.prefab\s+filter=lfs/);

    // .gitignore: `_shared/.gitignore.append` only appends to an EXISTING .gitignore
    // (matches the scaffold's append-lines kind, see types.ts FileKind). Empty cwd has
    // no prior .gitignore, so this profile install does not create one. The .append
    // mechanism is exercised in tests/integration/install-existing-claude-md.test.ts.

    // Architectural coherence: gameplay-engineer must explicitly forbid asset/build work
    const gameplay = await readFile(path.join(cwd, '.claude/agents/gameplay-engineer.md'), 'utf8');
    expect(gameplay).toMatch(/asset-pipeline/);
    expect(gameplay).toMatch(/build-and-test/);

    // asset-pipeline agent must say NEVER auto-fallback Tripo → Meshy
    const assetAgent = await readFile(path.join(cwd, '.claude/agents/asset-pipeline.md'), 'utf8');
    expect(assetAgent).toMatch(/NEVER auto-fallback/i);
  });
});
