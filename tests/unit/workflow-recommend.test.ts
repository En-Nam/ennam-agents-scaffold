import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  recommendWorkflow,
  WORKFLOW_PRESETS,
  listWorkflowPresetIds,
  assertWorkflowId,
  resolveWorkflowSrc,
} from '../../packages/cli/src/workflow.js';
import { getProfile } from '../../packages/cli/src/profiles.js';

describe('workflow recommendation + catalog (#26)', () => {
  it('every WORKFLOW_PRESETS id has a matching preset file on disk (catalog ↔ files in sync)', () => {
    for (const id of listWorkflowPresetIds()) {
      expect(existsSync(resolveWorkflowSrc(id))).toBe(true);
    }
  });

  it('single-profile: engineering → engineering-full, doc-first → doc-first-signoff, data → data-insight', () => {
    expect(recommendWorkflow([getProfile('next')])).toBe('engineering-full');
    expect(recommendWorkflow([getProfile('go')])).toBe('engineering-full');
    expect(recommendWorkflow([getProfile('hr')])).toBe('doc-first-signoff');
    expect(recommendWorkflow([getProfile('ba')])).toBe('doc-first-signoff');
    expect(recommendWorkflow([getProfile('data-analytics')])).toBe('data-insight');
  });

  it('compose: any engineering wins → engineering-full; else data present → data-insight; else doc-first-signoff', () => {
    expect(recommendWorkflow([getProfile('pm'), getProfile('next')])).toBe('engineering-full');
    expect(recommendWorkflow([getProfile('pm'), getProfile('data-analytics')])).toBe('data-insight');
    expect(recommendWorkflow([getProfile('pm'), getProfile('hr')])).toBe('doc-first-signoff');
  });

  it('assertWorkflowId accepts known ids and fails loud (with the valid list) on unknown', () => {
    expect(() => assertWorkflowId('engineering-full')).not.toThrow();
    expect(() => assertWorkflowId('doc-first-signoff')).not.toThrow();
    expect(() => assertWorkflowId('nope')).toThrow(/Unknown workflow preset "nope"\. Available:/);
  });

  it('override-only presets exist but are never auto-recommended', () => {
    const overrideOnly = WORKFLOW_PRESETS.filter(p => p.overrideOnly).map(p => p.id);
    expect(overrideOnly).toEqual(expect.arrayContaining(['quick-change', 'decision-brief']));
    // No profile recommends an override-only preset.
    for (const id of overrideOnly) {
      expect(recommendWorkflow([getProfile('next')])).not.toBe(id);
      expect(recommendWorkflow([getProfile('hr')])).not.toBe(id);
    }
  });
});
