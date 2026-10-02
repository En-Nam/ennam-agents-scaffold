import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../../templates/showreel/.claude/showreel/lib/util/version.mjs';

// M3 — the motion-designer agent + /showreel skill (D2). Hermetic: reads the shipped markdown.
// These pin the parts of the prompt the requirement makes binding, so an edit that drops one
// (handshake, QA floor, refusal, disclosure, report fields) fails here instead of in a real run.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDON = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude');
const agent = readFileSync(path.join(ADDON, 'agents', 'motion-designer.md'), 'utf8');
const skill = readFileSync(path.join(ADDON, 'skills', 'showreel', 'SKILL.md'), 'utf8');

describe('motion-designer agent + /showreel skill', () => {
  it('B4 handshake: both declare the toolkit VERSION; the agent passes it to preflight --expect', () => {
    for (const [name, src] of [['agent', agent], ['skill', skill]] as const) {
      expect(src, name).toContain(`Required toolkit version: ${VERSION}`);
    }
    expect(agent).toContain(`node .claude/showreel/cli.mjs preflight --expect ${VERSION}`);
    // no stale version anywhere in the prompt
    for (const m of agent.matchAll(/--expect ([^\s`]+)/g)) expect(m[1]).toBe(VERSION);
  });

  it('frontmatter names match the files (Claude Code loads agents/skills by name)', () => {
    expect(agent).toMatch(/^---\nname: motion-designer\ndescription: .+\n---\n/);
    expect(skill).toMatch(/^---\nname: showreel\ndescription: .+\n---\n/);
  });

  it('the procedure is the fixed linear order of the requirement', () => {
    const order = ['preflight --expect', 'cli.mjs facts', 'arrangements.json', 'showreel/storyboard.json', 'check --sheet', 'Transition critic', 'render --final', 'cli.mjs verify', 'Final report'];
    let at = -1;
    for (const marker of order) {
      const i = agent.indexOf(marker, at + 1);
      expect(i, marker).toBeGreaterThan(at);
      at = i;
    }
  });

  it('B2: QA is minimum 3, maximum 5 rounds, reported as n/5', () => {
    expect(agent).toMatch(/minimum 3, maximum 5/);
    expect(agent).toContain('QA rounds: n/5');
  });

  it('D4: refuses loudly on E_THIN_REPO with the missing kinds and writes no storyboard', () => {
    expect(agent).toMatch(/E_THIN_REPO[\s\S]{0,80}REFUSE loudly/);
    expect(agent).toContain('missing fact kinds');
    expect(agent).toContain('Do not write a storyboard');
  });

  it('R-k: sequential flow-graph variants only with a sequence collection, else cluster; cluster disclosure wording from the backlog', () => {
    expect(agent).toMatch(/sequential variants[\s\S]{0,120}ONLY when the digest has a sequence collection/);
    expect(agent).toContain('Otherwise use `cluster`');
    expect(agent).toContain('flowVariantReason: "no-sequence-source"');
    expect(agent).toContain('Flow beat shown as a cluster: no ordered setup/usage list of 3 or more steps found in README, so no step order is claimed.');
  });

  // Orchestrator item: in a headless run the agent only sees a partial self-count of its own turns; relaying it
  // (or a guess) put a wrong token figure in the report. The authoritative number is the harness usage.
  it('Tokens: never an estimate or partial self-count — exact "not measured by the agent" line pointing at the harness usage', () => {
    const report = agent.slice(agent.indexOf('## Final report'));
    expect(report).toContain('"not measured by the agent — read the harness usage (e.g. claude -p --output-format json modelUsage)"');
    expect(report).toMatch(/ONLY when you can read the session's authoritative usage/);
    expect(report).toContain('never relay a partial self-count');
    expect(report).not.toMatch(/write "not measured" —/);
  });

  // Orchestrator item: a headless / untrusted-workspace run has no Serena MCP; hand-writing .serena/memories
  // bypasses Serena's index (CLAUDE.md Serena MCP Protocol). The report must say the checkpoint was not written.
  it('checkpoint: Serena unavailable → report "checkpoint not written — <why>"; never hand-writes .serena/memories', () => {
    const step9 = agent.slice(agent.indexOf('9. **Report + checkpoint**'), agent.indexOf('## Final report'));
    expect(step9).toContain('checkpoint not written — <why>');
    expect(step9).toMatch(/NEVER hand-write `\.serena\/memories\/` files/);
    const report = agent.slice(agent.indexOf('## Final report'));
    expect(report).toContain('**Checkpoint:**');
    expect(report).toContain('"checkpoint not written — <why>"');
    expect(report).toMatch(/Never hand-written into `\.serena\/memories\/`/);
  });

  it('report carries every required field (Rule 12)', () => {
    const report = agent.slice(agent.indexOf('## Final report'));
    for (const field of ['QA rounds: n/5', 'sheet path', 'Transition critic', 'verify JSON', 'Timings (measured)', 'Tokens', 'context-weighted', 'GPU notice', 'Cluster disclosure', 'Checkpoint', 'Skipped']) {
      expect(report, field).toContain(field);
    }
  });

  it('never edits toolkit code, app code or facts.json; P5 boot exception is stated as provisional and the checkpoint is still written', () => {
    expect(agent).toContain('Never edit toolkit code (`.claude/showreel/**`), app code, or `showreel/facts.json`');
    expect(agent).toMatch(/Session Boot exception \(PROVISIONAL/);
    expect(agent).toMatch(/You STILL write your checkpoint/);
  });

  it('skill: /showreel [15|30|45|60], default 30, measured ~111 MB first-run disclosure, delegates to motion-designer', () => {
    expect(skill).toContain('# /showreel [15|30|45|60]');
    expect(skill).toMatch(/default \*\*30\*\*/);
    expect(skill).toContain('~111 MB');
    expect(skill).not.toContain('~200 MB');
    expect(skill).toContain('**motion-designer** agent');
  });

  // PO ruling (M3): clean-environment figures may be quoted as the typical case, but always with their single-
  // machine provenance and with the plugin-heavy figures beside them; and the platform line must not over-claim
  // (R4: "verified on Windows; Linux verified in CI; macOS untested" — no blanket cross-platform promise).
  it('cost figures name ONE Windows machine (RTX 5070 Ti) and show clean + plugin-heavy side by side', () => {
    const readme = readFileSync(path.resolve(ADDON, '..', 'README.md'), 'utf8');
    expect(readme).toMatch(/ONE Windows machine \([^)]*RTX 5070 Ti\)/);
    const rows = readme.split('\n').filter((l) => /^\| (Clean|Plugin-heavy)/.test(l));
    expect(rows.map((l) => l.split('|')[1]!.trim().split(' ')[0])).toEqual(['Clean', 'Plugin-heavy']);
    expect(skill).toMatch(/one Windows machine \(RTX 5070 Ti\)/);
  });

  it('platform support line is exactly the PO wording — no blanket cross-platform claim', () => {
    const readme = readFileSync(path.resolve(ADDON, '..', 'README.md'), 'utf8');
    expect(readme).toMatch(/verified on Windows; Linux verified in CI .*; macOS untested\./);
    expect(readme).not.toMatch(/cross-platform|Windows\/macOS\/Linux/i);
  });
});
