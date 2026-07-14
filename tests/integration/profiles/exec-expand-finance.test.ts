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
const read = (cwd: string, rel: string) => readFile(path.join(cwd, rel), 'utf8');
const mcpKeys = async (cwd: string) => Object.keys(JSON.parse(await read(cwd, '.mcp.json')).mcpServers).sort();

// #30 (cto/coo/cmo) + #33 (accounting). Each is a doc-first template dir routed to its workflow,
// carrying its guardrails (Rule 9/13).
describe('exec-expand + accounting profiles', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('cto: exec-decision workflow, github MCP, ADR records the decision + trade-off (Rule 9)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    expect((await install(cwd, 'cto')).exitCode).toBe(0);
    expect(await isFile(path.join(cwd, '.claude/agents/cto-advisor.md'))).toBe(true);
    expect(await read(cwd, 'CLAUDE.md')).toContain('### Executive Decision Workflow');
    const adr = await read(cwd, '.claude/commands/cto-adr.md');
    expect(adr).toMatch(/decision/i);
    expect(adr).toMatch(/trade-off/i);
    expect(await mcpKeys(cwd)).toEqual(['context7', 'github', 'jira', 'serena']);
  });

  it('coo: ops-review-cadence workflow, ops review names owner + due date (Rule 9)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    expect((await install(cwd, 'coo')).exitCode).toBe(0);
    expect(await isFile(path.join(cwd, '.claude/agents/ops-lead.md'))).toBe(true);
    expect(await read(cwd, 'CLAUDE.md')).toContain('### Operations Review Cadence');
    const review = await read(cwd, '.claude/commands/coo-ops-review.md');
    expect(review).toMatch(/owner/i);
    expect(review).toMatch(/due date/i);
    expect(await mcpKeys(cwd)).toEqual(['context7', 'github', 'jira', 'serena']);
  });

  it('cmo: exec-decision workflow, Canva remote-http MCP, metrics cite a source (Rule 13)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const res = await install(cwd, 'cmo');
    expect(res.exitCode).toBe(0);
    expect(await isFile(path.join(cwd, '.claude/agents/marketing-lead.md'))).toBe(true);
    expect(await read(cwd, 'CLAUDE.md')).toContain('### Executive Decision Workflow');
    expect(await read(cwd, '.claude/commands/cmo-metrics.md')).toMatch(/source/i);
    // Canva is a remote HTTP MCP — type:http + url, NO command/token.
    const canva = JSON.parse(await read(cwd, '.mcp.json')).mcpServers.canva;
    expect(canva.type).toBe('http');
    expect(canva.url).toMatch(/canva/);
    expect(canva.command).toBeUndefined();
    // printNextSteps must surface the interactive Canva connect step (not an env key).
    expect(res.stdout).toMatch(/Canva/);
  });

  it('accounting: finance-close workflow, autoPolicy, reconcile is evidence-blocking (Rule 13 harness)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    expect((await install(cwd, 'accounting')).exitCode).toBe(0);
    expect(await isFile(path.join(cwd, '.claude/agents/accountant.md'))).toBe(true);
    expect(await isFile(path.join(cwd, '.claude/skills/reconciliation-discipline/SKILL.md'))).toBe(true);
    expect(await read(cwd, 'CLAUDE.md')).toContain('### Financial Close Workflow');
    // autoPolicy → POLICY.md seeded.
    expect(await isFile(path.join(cwd, 'POLICY.md'))).toBe(true);

    // Rule-13 "harness" for a config-emitting tool: the emitted reconcile guidance must mandate
    // tracing to an INDEPENDENT source and BLOCK the close on an unexplained (plugged) difference.
    const reconcile = await read(cwd, '.claude/commands/acct-reconcile.md');
    expect(reconcile).toMatch(/independent/i);
    expect(reconcile).toMatch(/source/i);
    expect(reconcile).toMatch(/block/i);
    const skill = await read(cwd, '.claude/skills/reconciliation-discipline/SKILL.md');
    expect(skill).toMatch(/never/i);
    expect(skill).toMatch(/plugged/i);

    expect(await mcpKeys(cwd)).toEqual(['context7', 'jira', 'serena']);
  });
});
