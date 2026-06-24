import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install local-root profile into empty cwd', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs local-root profile files', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    const { exitCode } = await execa('node', [CLI_ENTRY, 'local-root', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    // CLAUDE.md is the load-bearing artifact for this profile
    const claudeMd = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    // Orchestrator-specific section (from profile partial)
    expect(claudeMd).toContain('Stack: Orchestration Root');
    expect(claudeMd).toContain("The Orchestrator's Job");
    // Shared sections (from _shared partial)
    expect(claudeMd).toContain('Session Boot Protocol');
    expect(claudeMd).toContain('Serena MCP Protocol');
    // Next.js block must NOT leak into other profiles
    expect(claudeMd).not.toContain('BEGIN:nextjs-agent-rules');

    // AGENTS.md is shipped from _shared and includes Rule 13
    const agentsMd = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('Rule 13');

    // .mcp.json from shared baseline
    expect((await stat(path.join(cwd, '.mcp.json'))).isFile()).toBe(true);
  });

  it('is idempotent â€” second run is a no-op for CLAUDE.md', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    await execa('node', [CLI_ENTRY, 'local-root', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const after1 = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');

    await execa('node', [CLI_ENTRY, 'local-root', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const after2 = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');

    expect(after2).toBe(after1);
  });
});
