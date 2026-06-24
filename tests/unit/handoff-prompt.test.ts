import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import stripAnsi from 'strip-ansi';
import { printHandoffPrompt } from '../../packages/cli/src/ux.js';

describe('printHandoffPrompt', () => {
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    logs = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(a => String(a)).join(' '));
    };
  });

  afterEach(() => {
    console.log = origLog;
  });

  it('emits the boundary rule, grounding rules, and diff-before-write contract for an existing-repo profile', () => {
    printHandoffPrompt('next');
    const out = stripAnsi(logs.join('\n'));
    // The three load-bearing guarantees the BA + adversarial review required.
    expect(out).toContain('BOUNDARY RULE');
    expect(out).toContain('MUST NOT modify, reorder, or remove anything between those markers');
    expect(out).toContain('GROUNDING RULES');
    expect(out).toContain('show a unified diff');
    expect(out).toContain('Do NOT guess');
    // The marker lines must be referenced verbatim so the agent recognises them.
    expect(out).toContain('<!-- ennam-agents-scaffold:begin');
    expect(out).toContain('<!-- ennam-agents-scaffold:end -->');
  });

  it.each(['react', 'react-native', 'dotnet-mvc', 'express', 'ba', 'hr', 'devops-aws', 'devops-azure', 'devops-gcp', 'next', 'flutter', 'python', 'go', 'qa'])('prints the prompt for profile %s', (profile) => {
    printHandoffPrompt(profile);
    const out = stripAnsi(logs.join('\n'));
    expect(out).toContain('seeding project context');
  });

  it('skips local-root (no app-shape to extract — it is the polyrepo coordinator)', () => {
    printHandoffPrompt('local-root');
    expect(logs).toEqual([]);
  });
});
