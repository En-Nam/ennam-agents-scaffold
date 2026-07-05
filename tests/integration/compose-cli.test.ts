import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

// Issue #10 (+ #7) — compose multiple profiles in one install via CLI args.
describe('multi-profile composition (CLI args)', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs pm + qa together: both agents, both CLAUDE.md sub-sections, engineering AGENTS.md', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'pm', 'qa', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    // Files from both profiles land.
    expect((await stat(path.join(cwd, '.claude/agents/product-manager.md'))).isFile()).toBe(true);

    // CLAUDE.md carries each profile's section under its own sub-heading.
    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('#### pm');
    expect(claude).toContain('#### qa');

    // Mixed family (qa is engineering) → engineering AGENTS.md.
    const agents = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Think Before Coding');

    // MCP union (both use only the shared catalog here).
    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['context7', 'jira', 'serena']);
  });

  it('composing all-doc-first roles (ba + pm) yields the doc-first AGENTS.md', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'ba', 'pm', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const agents = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Think Before Drafting');
    expect(agents).toContain('Definition of Done');
  });

  it('a duplicate profile arg is de-duped (pm pm behaves like pm)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'pm', 'pm', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);
    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    // Single dedup'd profile → the guided single-profile heading, not a #### sub-heading.
    expect(claude).toContain('Product Manager');
  });

  it('unknown profile in the list fails loud (exit 2)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const res = await execa('node', [CLI_ENTRY, 'pm', 'nope', '--no-prompts'], { cwd, reject: false });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/unknown profile/i);
  });
});
