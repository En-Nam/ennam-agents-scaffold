import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v1.9.0 — lock the qa-automation SKILLs against Alden's spec on issue #2.
// The concrete examples (change-email OTP flow, CLPReviewPage) are part of
// the contract with the team's real conventions in `d:\C4K-Parent\tests-e2e\`
// and `.maestro\`. If those anchor examples drift, the SKILLs stop matching
// the team's production patterns and this test fails loudly.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.resolve(HERE, '..', '..', 'templates', 'qa-automation', '.claude', 'skills');

const readSkill = (name: string) =>
  readFile(path.join(PROFILE, name, 'SKILL.md'), 'utf8');

describe('qa-automation SKILL discipline', () => {
  it('gherkin-bdd — has WHEN trigger + explicit intent mapping table', async () => {
    const t = await readSkill('gherkin-bdd');
    expect(t).toMatch(/^---[\s\S]*name: gherkin-bdd[\s\S]*description: Use WHEN /m);
    expect(t).toMatch(/intent/i);
    expect(t).toMatch(/assert\.visible/);
    expect(t).toMatch(/JSDoc BDD header/);
    // Ambiguity policy is REQUIRED — Rule 12 (fail loud, never invent).
    expect(t).toMatch(/Ambiguity policy/i);
    expect(t).toMatch(/candidates/);
  });

  it('qa-maestro — owns the list_devices → inspect_screen → run loop', async () => {
    const t = await readSkill('qa-maestro');
    expect(t).toMatch(/^---[\s\S]*name: qa-maestro[\s\S]*description: Use WHEN /m);
    expect(t).toMatch(/list_devices/);
    expect(t).toMatch(/inspect_screen/);
    expect(t).toMatch(/cloud/i);
    // The team's OTP echo pattern is the canonical example — must be present verbatim.
    expect(t).toMatch(/copyTextFrom/);
    expect(t).toMatch(/extendedWaitUntil/);
    // Sub-flow reuse pattern (underscore-prefix).
    expect(t).toMatch(/runFlow: _/);
    // Locator strategy — no raw coords rule.
    expect(t).toMatch(/NEVER use raw coords/i);
    // Reference to react-native install (do NOT duplicate).
    expect(t).toMatch(/react-native/);
  });

  it('qa-playwright — uses JSDoc BDD header convention (no .feature for web)', async () => {
    const t = await readSkill('qa-playwright');
    expect(t).toMatch(/^---[\s\S]*name: qa-playwright[\s\S]*description: Use WHEN /m);
    expect(t).toMatch(/JSDoc BDD header/);
    expect(t).toMatch(/SKIPS `\.feature` files/);
    // Anchor: the team's CLP review reference the SKILL must mention.
    expect(t).toMatch(/CLPReviewPage/);
    // Self-healing state is REQUIRED per Alden's team convention.
    expect(t).toMatch(/self-heal/i);
    // Locator priority: getByRole first, no xpath.
    expect(t).toMatch(/getByRole/);
    expect(t).toMatch(/NEVER use xpath/i);
    // Flake policy: no naive retries.
    expect(t).toMatch(/NOT `retries: 3`/);
  });
});

describe('qa-automation CLAUDE.md.partial.hbs', () => {
  it('names the 3 skills + the QA Automation role + escalation boundary', async () => {
    const p = path.resolve(HERE, '..', '..', 'templates', 'qa-automation', 'CLAUDE.md.partial.hbs');
    const t = await readFile(p, 'utf8');
    expect(t).toMatch(/QA Automation Engineer/);
    expect(t).toMatch(/qa-maestro/);
    expect(t).toMatch(/qa-playwright/);
    expect(t).toMatch(/gherkin-bdd/);
    // Boundary rule — no app code edits, escalate failures.
    expect(t).toMatch(/No app code edits/);
    expect(t).toMatch(/\/escalate/);
  });
});
