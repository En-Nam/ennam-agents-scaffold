import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

const install = (cwd: string, profile: string) =>
  execa('node', [CLI_ENTRY, profile, '--merge-strategy=overwrite', '--no-prompts'], { cwd });
const isFile = async (p: string) => (await stat(p)).isFile();

// #29 — Executive/Design proof-wave profiles (all doc-first). Each ships an agent + ~4 commands
// + skills, routes to its recommended workflow (#31 presets), and carries its guardrails (Rule 9).
describe('executive + design proof-wave profiles', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('ceo: agent + commands + skills; exec-decision workflow; autoPolicy; board-deck cites sources (Rule 13)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    expect((await install(cwd, 'ceo')).exitCode).toBe(0);

    expect(await isFile(path.join(cwd, '.claude/agents/ceo-advisor.md'))).toBe(true);
    expect(await isFile(path.join(cwd, '.claude/commands/ceo-board-deck.md'))).toBe(true);
    expect(await isFile(path.join(cwd, '.claude/commands/ceo-okr.md'))).toBe(true);

    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('Chief Executive');
    expect(claude).toContain('### Executive Decision Workflow'); // recommendedWorkflow: exec-decision

    // autoPolicy → POLICY.md seeded (board material = MNPI).
    expect(await isFile(path.join(cwd, 'POLICY.md'))).toBe(true);

    // Rule 9 — the board-deck command must forbid recalled numbers, citing sources instead.
    const deck = await readFile(path.join(cwd, '.claude/commands/ceo-board-deck.md'), 'utf8');
    expect(deck).toMatch(/never invent/i);
    expect(deck).toMatch(/source/i);

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['context7', 'jira', 'serena']);
  });

  it('ciso: security-incident workflow; github MCP; autoPolicy; control-map is evidence-derived (Rule 13)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    expect((await install(cwd, 'ciso')).exitCode).toBe(0);

    expect(await isFile(path.join(cwd, '.claude/agents/security-officer.md'))).toBe(true);
    expect(await isFile(path.join(cwd, '.claude/commands/ciso-control-map.md'))).toBe(true);
    expect(await isFile(path.join(cwd, '.claude/skills/incident-response/SKILL.md'))).toBe(true);

    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('Chief Information Security Officer');
    expect(claude).toContain('### Security Incident Workflow'); // recommendedWorkflow: security-incident
    expect(await isFile(path.join(cwd, 'POLICY.md'))).toBe(true);

    const controlMap = await readFile(path.join(cwd, '.claude/commands/ciso-control-map.md'), 'utf8');
    expect(controlMap).toMatch(/evidence/i);

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['context7', 'github', 'jira', 'serena']);
  });

  it('design: doc-first-signoff workflow; figma MCP; NO autoPolicy; a11y checks WCAG contrast (Rule 9)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    expect((await install(cwd, 'design')).exitCode).toBe(0);

    expect(await isFile(path.join(cwd, '.claude/agents/design-lead.md'))).toBe(true);
    expect(await isFile(path.join(cwd, '.claude/commands/design-a11y.md'))).toBe(true);
    expect(await isFile(path.join(cwd, '.claude/skills/accessibility-review/SKILL.md'))).toBe(true);

    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('Design / UX');
    expect(claude).toContain('### Doc-First Workflow'); // no bespoke preset → generic doc-first

    // autoPolicy is false for design → no POLICY.md by default.
    await expect(stat(path.join(cwd, 'POLICY.md'))).rejects.toThrow();

    const a11y = await readFile(path.join(cwd, '.claude/commands/design-a11y.md'), 'utf8');
    expect(a11y).toMatch(/WCAG/);
    expect(a11y).toMatch(/contrast/i);

    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['context7', 'figma', 'jira', 'serena']);
  });
});
