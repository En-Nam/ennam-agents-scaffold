import { describe, it, expect } from 'vitest';
import { buildPlan } from '../../packages/cli/src/plan.js';
import type { FileEntry } from '../../packages/cli/src/types.js';

function fe(rel: string, kind: FileEntry['kind'] = 'write-or-ask'): FileEntry {
  return { srcAbs: `/src/${rel}`, relPath: rel, isTemplate: false, kind };
}

describe('buildPlan', () => {
  it('writes absent files', () => {
    const ops = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'absent']]),
      strategy: 'ask',
    });
    expect(ops[0]?.op).toBe('write');
    expect(ops[0]?.reason).toMatch(/absent/i);
  });

  it('skips existing files in skip-if-exists kind regardless of strategy', () => {
    const ops = buildPlan({
      entries: [fe('.claude/agents/web-dev.md', 'skip-if-exists')],
      conflicts: new Map([['.claude/agents/web-dev.md', 'differs']]),
      strategy: 'overwrite',
    });
    expect(ops[0]?.op).toBe('skip');
    expect(ops[0]?.reason).toMatch(/skip-if-exists/i);
  });

  it('overwrites differing files when strategy=overwrite', () => {
    const ops = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'overwrite',
    });
    expect(ops[0]?.op).toBe('write');
  });

  it('skips differing files when strategy=skip', () => {
    const ops = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'skip',
    });
    expect(ops[0]?.op).toBe('skip');
  });

  it('marks differing files for ask-prompt when strategy=ask', () => {
    const ops = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'ask',
    });
    // For Plan 1, ask resolves to 'write' at plan time after a future per-file prompt;
    // here we mark it for prompt by leaving op='write' but reason mentions prompt.
    // (Real prompt happens in execute.ts via ux.ts.)
    expect(ops[0]?.op).toBe('write');
    expect(ops[0]?.reason).toMatch(/will prompt/i);
  });

  it('skips identical files', () => {
    const ops = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'identical']]),
      strategy: 'ask',
    });
    expect(ops[0]?.op).toBe('skip');
    expect(ops[0]?.reason).toMatch(/identical/i);
  });

  it('throws if a kind not supported in Plan 1 is hit with strategy ask/overwrite', () => {
    expect(() => buildPlan({
      entries: [fe('CLAUDE.md', 'append-marker')],
      conflicts: new Map([['CLAUDE.md', 'differs']]),
      strategy: 'ask',
    })).toThrow(/not supported in plan 1|append-marker/i);
  });

  it('sets needsPrompt: true only for differs + ask strategy + write-or-ask kind', () => {
    const askDiffer = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'ask',
    });
    expect(askDiffer[0]?.needsPrompt).toBe(true);

    const overwriteDiffer = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'overwrite',
    });
    expect(overwriteDiffer[0]?.needsPrompt).toBe(false);

    const absent = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'absent']]),
      strategy: 'ask',
    });
    expect(absent[0]?.needsPrompt).toBe(false);
  });
});
