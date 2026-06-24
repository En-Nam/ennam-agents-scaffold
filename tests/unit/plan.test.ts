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
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('write');
    expect(ops[0]?.reason).toMatch(/absent/i);
  });

  it('skips existing files in skip-if-exists kind regardless of strategy', () => {
    const ops = buildPlan({
      entries: [fe('.claude/agents/web-dev.md', 'skip-if-exists')],
      conflicts: new Map([['.claude/agents/web-dev.md', 'differs']]),
      strategy: 'overwrite',
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('skip');
    expect(ops[0]?.reason).toMatch(/skip-if-exists/i);
  });

  it('overwrites differing files when strategy=overwrite', () => {
    const ops = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'overwrite',
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('write');
  });

  it('skips differing files when strategy=skip', () => {
    const ops = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'skip',
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('skip');
  });

  it('marks differing files for ask-prompt when strategy=ask', () => {
    const ops = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'ask',
      hasGit: true,
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
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('skip');
    expect(ops[0]?.reason).toMatch(/identical/i);
  });

  it('emits merge-lines op for append-lines kind', () => {
    const ops = buildPlan({
      entries: [fe('.gitignore', 'append-lines')],
      conflicts: new Map([['.gitignore', 'differs']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('merge-lines');
    expect(ops[0]?.reason).toMatch(/append|lines/i);
  });

  it('emits merge-json op for json-merge kind (differs)', () => {
    const ops = buildPlan({
      entries: [fe('.mcp.json', 'json-merge')],
      conflicts: new Map([['.mcp.json', 'differs']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('merge-json');
    expect(ops[0]?.reason).toMatch(/merge|user wins/i);
  });

  it('emits merge-json op for json-merge kind (absent)', () => {
    const ops = buildPlan({
      entries: [fe('.mcp.json', 'json-merge')],
      conflicts: new Map([['.mcp.json', 'absent']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('merge-json');
    expect(ops[0]?.reason).toMatch(/absent/i);
  });

  it('skips identical json-merge files', () => {
    const ops = buildPlan({
      entries: [fe('.mcp.json', 'json-merge')],
      conflicts: new Map([['.mcp.json', 'identical']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(ops[0]?.op).toBe('skip');
    expect(ops[0]?.reason).toMatch(/identical/i);
  });

  it('emits merge-marker op for append-marker kind regardless of conflict', () => {
    const absent = buildPlan({
      entries: [fe('CLAUDE.md', 'append-marker')],
      conflicts: new Map([['CLAUDE.md', 'absent']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(absent[0]?.op).toBe('merge-marker');
    expect(absent[0]?.reason).toMatch(/marker/i);

    const differs = buildPlan({
      entries: [fe('CLAUDE.md', 'append-marker')],
      conflicts: new Map([['CLAUDE.md', 'differs']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(differs[0]?.op).toBe('merge-marker');

    const identical = buildPlan({
      entries: [fe('CLAUDE.md', 'append-marker')],
      conflicts: new Map([['CLAUDE.md', 'identical']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(identical[0]?.op).toBe('skip');
  });

  it('sets needsPrompt: true only for differs + ask strategy + write-or-ask kind', () => {
    const askDiffer = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(askDiffer[0]?.needsPrompt).toBe(true);

    const overwriteDiffer = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'differs']]),
      strategy: 'overwrite',
      hasGit: true,
    });
    expect(overwriteDiffer[0]?.needsPrompt).toBe(false);

    const absent = buildPlan({
      entries: [fe('AGENTS.md')],
      conflicts: new Map([['AGENTS.md', 'absent']]),
      strategy: 'ask',
      hasGit: true,
    });
    expect(absent[0]?.needsPrompt).toBe(false);
  });

  it('skips .gitignore when hasGit=false', () => {
    const entry: FileEntry = { srcAbs: '/fake/.gitignore', relPath: '.gitignore', isTemplate: false, kind: 'append-lines' };
    const ops = buildPlan({ entries: [entry], conflicts: new Map([['.gitignore', 'differs']]), strategy: 'ask', hasGit: false });
    expect(ops[0]?.op).toBe('skip');
    expect(ops[0]?.reason).toMatch(/No \.git detected/i);
  });

  it('processes .gitignore normally when hasGit=true', () => {
    const entry: FileEntry = { srcAbs: '/fake/.gitignore', relPath: '.gitignore', isTemplate: false, kind: 'append-lines' };
    const ops = buildPlan({ entries: [entry], conflicts: new Map([['.gitignore', 'differs']]), strategy: 'ask', hasGit: true });
    expect(ops[0]?.op).toBe('merge-lines');
  });
});
