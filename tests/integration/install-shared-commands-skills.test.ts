import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

/**
 * Locks in the contract that two universal authoring affordances ship with
 * every scaffold install (any profile):
 *   1. `/create-issue` slash command (issue #5) — feedback loop to the scaffold's own repo.
 *   2. `handoff` skill (issue #6) — full-autonomy execution mode keyed off explicit user phrases.
 *
 * Both live in `_shared/.claude/` so every profile inherits them. A regression that drops
 * either file (e.g., a refactor of the shared template directory) gets caught here.
 */
describe('shared commands + skills shipped on fresh install', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 120_000);

  it('fresh install ships .claude/commands/create-issue.md with the hard-coded repo + assignee contract', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const body = await readFile(path.join(cwd, '.claude', 'commands', 'create-issue.md'), 'utf8');

    // The repo is fixed by design — issue #5 explicitly: "/create-issue chỉ tạo issue cho repo này".
    expect(body).toContain('En-Nam/ennam-agents-scaffold');
    // The assignee is fixed by design — issue #5 explicitly: "mặc định hard code assign cho danny-exnodes".
    expect(body).toContain('danny-exnodes');
    // The command must NOT post without explicit user confirmation — guardrail per AGENTS.md Rule 12.
    expect(body).toMatch(/Open this issue\? \(y\/n\)/);
  }, 60_000);

  it('fresh install ships .claude/skills/handoff/SKILL.md with explicit trigger phrases + judge-panel gating', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const body = await readFile(path.join(cwd, '.claude', 'skills', 'handoff', 'SKILL.md'), 'utf8');

    // Trigger phrases are the activation contract — if they drift, Claude won't recognize the handoff
    // and the skill silently never fires (Rule 12 — fail loud means lock these into the test).
    expect(body).toContain('trao toàn quyền');
    expect(body).toContain('full autonomy');

    // Judge panel is the non-negotiable mechanism — without it, autonomy collapses into a single
    // model's first guess. Cap is part of the contract (3 advocates + 1 judge).
    expect(body).toMatch(/3 advocates \+ 1 judge/);

    // Hard stop conditions must remain enumerated — silently dropping them turns this into a
    // free-fire skill, which is exactly what AGENTS.md Rule 12 forbids.
    expect(body).toContain('Hard stop conditions');
  }, 60_000);
});
