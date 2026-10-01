import { describe, it, expect } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dir as tmpDir } from 'tmp-promise';
import { getProfile } from '../../packages/cli/src/profiles.js';
import { enumerateProfiles } from '../../packages/cli/src/enumerate.js';
import type { ProfileDef } from '../../packages/cli/src/types.js';
import { recommendWorkflow } from '../../packages/cli/src/workflow.js';
import { classifyFile } from '../../packages/cli/src/classify.js';
import { buildCatalog } from '../../packages/cli/src/list.js';

// v1.15 — `automation` is a stack-agnostic ADD-ON composed onto any role
// (`npx … hr automation`). It must never change the role it is added to:
// an HR user who opts into automation guidance still gets HR's workflow.
// See mem:decisions/automation-profile-v1.15.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.resolve(HERE, '..', '..', 'templates', 'automation');
const read = (rel: string) => readFile(path.join(TPL, rel), 'utf8');

describe('automation profile — composition neutrality', () => {
  it('is registered as an augmentation with a warn-only Claude Code floor', () => {
    const p = getProfile('automation');
    expect(p.augmentation).toBe(true);
    expect(p.minClaudeCodeVersion).toBe('2.1.246');
    expect(p.ruleFamily).toBeUndefined();
  });

  it('does not change the workflow recommended for the role it is added to', () => {
    for (const role of ['hr', 'ceo', 'data-analytics', 'next', 'ba']) {
      const alone = recommendWorkflow([getProfile(role)]);
      expect(recommendWorkflow([getProfile(role), getProfile('automation')])).toBe(alone);
      expect(recommendWorkflow([getProfile('automation'), getProfile(role)])).toBe(alone);
    }
  });

  it('alone, falls back to the default (engineering) recommendation', () => {
    expect(recommendWorkflow([getProfile('automation')])).toBe('engineering-full');
  });

  it('lists under the Add-on role (not "Other")', () => {
    expect(buildCatalog().find(e => e.name === 'automation')?.role).toBe('Add-on');
  });

  it('.claude/loop.md is user-owned after the first seed (skip-if-exists)', () => {
    expect(classifyFile('.claude/loop.md')).toBe('skip-if-exists');
  });
});

describe('add-on overlay contract (fail loud, Rule 12)', () => {
  // An add-on is static guidance on top of a role. A partial would silently be dropped
  // by the overlay, and a path the role ships would be silently shadowed — both must throw.
  async function fakeAddOn(files: Record<string, string>): Promise<ProfileDef> {
    const { path: dir } = await tmpDir({ unsafeCleanup: true });
    for (const [rel, body] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await writeFile(path.join(dir, rel), body);
    }
    return { name: 'fake-addon', description: '', templateDir: dir, extraMcp: [], augmentation: true };
  }

  // The contract must hold whether the add-on joins one role or a multi-role compose.
  const ROLE_SETS: Array<[string, string[]]> = [['one role', ['next']], ['two roles', ['ba', 'pm']]];

  for (const [label, roles] of ROLE_SETS) {
    it(`${label}: overlays add-on files, keeping the plan sorted`, async () => {
      const entries = await enumerateProfiles([...roles.map(getProfile), await fakeAddOn({ 'notes/x.md': 'x' })]);
      const paths = entries.map(e => e.relPath);
      expect(paths).toContain('notes/x.md');
      expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    });

    it(`${label}: throws when an add-on ships a partial`, async () => {
      const addOn = await fakeAddOn({ '.claude/settings.json.partial.hbs': '{}' });
      await expect(enumerateProfiles([...roles.map(getProfile), addOn])).rejects.toThrow(/must not ship partials/);
    });

    it(`${label}: throws when an add-on ships a path the install already has (_shared AGENTS.md)`, async () => {
      const addOn = await fakeAddOn({ 'AGENTS.md': 'mine' });
      await expect(enumerateProfiles([...roles.map(getProfile), addOn])).rejects.toThrow(/collides with the selected role\(s\) on AGENTS\.md/);
    });
  }
});

describe('automation profile — guidance content discipline', () => {
  it('ships guidance only: no CLAUDE.md partial (zero per-session tokens), no settings, no MCP', async () => {
    for (const rel of ['CLAUDE.md.partial.hbs', '.claude/settings.json.partial.hbs', '.mcp.json.partial.hbs']) {
      await expect(read(rel)).rejects.toThrow();
    }
  });

  it('skill: lazy-loaded via a WHEN trigger, never pins a model', async () => {
    const t = await read('.claude/skills/ennam-automation/SKILL.md');
    expect(t).toMatch(/^---\nname: ennam-automation\ndescription: Use WHEN /);
    // Shipping a model id would override the user's choice (mem:decisions/no-hardcoded-model).
    expect(t).not.toMatch(/claude-(opus|sonnet|haiku|fable)|ANTHROPIC_DEFAULT_HAIKU_MODEL=/i);
  });

  it('skill: /goal guidance bounds cost and matches how the evaluator actually works', async () => {
    const t = await read('.claude/skills/ennam-automation/SKILL.md');
    // An unbounded goal is the main cost-runaway risk on the user's own account.
    expect(t).toMatch(/or stop after \d+ turns/);
    // The evaluator only reads the transcript — evidence must be PRINTED, not just written to Serena.
    expect(t).toMatch(/does not run commands or read files/i);
    expect(t).toMatch(/\/goal clear/);
    // A resumed session restores an active goal.
    expect(t).toMatch(/resume/i);
  });

  it('skill: Serena stays the mailbox — scheduled/goal results are checkpointed, not left in the transcript', async () => {
    const t = await read('.claude/skills/ennam-automation/SKILL.md');
    expect(t).toMatch(/checkpoint/i);
    expect(t).toMatch(/7 days/);
  });

  it('loop.md: report-only default that forbids irreversible actions', async () => {
    const t = await read('.claude/loop.md');
    expect(t).toMatch(/INDEX/);
    expect(t).toMatch(/comms\/active/);
    expect(t).toMatch(/checkpoint/i);
    // The point of shipping it: an unattended loop must never push, delete or force anything,
    // and "report-only" must be literal — it reports in-progress work instead of continuing it.
    expect(t).toMatch(/Do NOT push, force-push, delete/);
    expect(t).toMatch(/Do not edit code/);
    expect(t).toMatch(/Do not continue it/);
    expect(t).not.toMatch(/local edits/i);
  });

  it('runbook: flags the billing + trust traps of headless runs and keeps Channels out', async () => {
    const t = await read('README.md');
    expect(t).toMatch(/--bare/);
    expect(t).toMatch(/ANTHROPIC_API_KEY/);
    expect(t).toMatch(/research preview/i);
    expect(t).toMatch(/scheduled_tasks\.json/);
  });
});
