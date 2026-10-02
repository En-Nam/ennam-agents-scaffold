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
    expect(agent).toContain('Flow beat shown as a cluster: no ordered setup/usage list found in README, so no step order is claimed.');
  });

  it('report carries every required field (Rule 12)', () => {
    const report = agent.slice(agent.indexOf('## Final report'));
    for (const field of ['QA rounds: n/5', 'sheet path', 'Transition critic', 'verify JSON', 'Timings (measured)', 'Tokens', 'context-weighted', 'GPU notice', 'Cluster disclosure', 'Skipped']) {
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
});
