import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../../packages/cli/src/wizard.js';
import { recommendWorkflow } from '../../packages/cli/src/workflow.js';
import { getProfile } from '../../packages/cli/src/profiles.js';

// #30 — round-2 executive expansion (cto/coo/cmo) + #33 accounting (Finance role).
describe('exec-expand + finance wizard resolution (#30/#33)', () => {
  it('the Executive sub-select resolves the new chiefs', () => {
    const exec = (r: 'CTO' | 'COO' | 'CMO') =>
      resolveProfile('Executive', 'Existing repository', undefined, undefined, undefined, undefined, r);
    expect(exec('CTO')).toBe('cto');
    expect(exec('COO')).toBe('coo');
    expect(exec('CMO')).toBe('cmo');
  });

  it('the Finance role resolves the accounting profile', () => {
    expect(resolveProfile('Finance', 'Existing repository')).toBe('accounting');
  });

  it('each new profile recommends its workflow', () => {
    expect(recommendWorkflow([getProfile('cto')])).toBe('exec-decision');
    expect(recommendWorkflow([getProfile('coo')])).toBe('ops-review-cadence');
    expect(recommendWorkflow([getProfile('cmo')])).toBe('exec-decision');
    expect(recommendWorkflow([getProfile('accounting')])).toBe('finance-close');
  });

  it('registry shape: cmo uses the canva MCP; accounting is autoPolicy finance-close', () => {
    expect(getProfile('cmo').extraMcp).toContain('canva');
    expect(getProfile('cto').extraMcp).toContain('github');
    expect(getProfile('coo').extraMcp).toContain('github');
    expect(getProfile('accounting').autoPolicy).toBe(true);
    expect(getProfile('accounting').recommendedWorkflow).toBe('finance-close');
  });
});
