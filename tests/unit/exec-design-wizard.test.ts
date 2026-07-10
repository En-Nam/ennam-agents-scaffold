import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../../packages/cli/src/wizard.js';
import { recommendWorkflow } from '../../packages/cli/src/workflow.js';
import { getProfile } from '../../packages/cli/src/profiles.js';

// #29 — the Executive role group sub-selects CEO/CISO (enum-throw), Design is a flat role.
describe('executive + design wizard resolution (#29)', () => {
  it('resolves the Executive sub-select and the flat Design role', () => {
    expect(resolveProfile('Executive', 'Existing repository', undefined, undefined, undefined, undefined, 'CEO')).toBe('ceo');
    expect(resolveProfile('Executive', 'Existing repository', undefined, undefined, undefined, undefined, 'CISO')).toBe('ciso');
    expect(resolveProfile('Design', 'Existing repository')).toBe('design');
  });

  it('fails loud when the Executive role has no sub-role, or an unknown one (Rule 12)', () => {
    expect(() => resolveProfile('Executive', 'Existing repository')).toThrow(/execRole is required/);
    // A bogus JSON-fed value must throw rather than silently default.
    expect(() =>
      resolveProfile('Executive', 'Existing repository', undefined, undefined, undefined, undefined, 'CFO' as never),
    ).toThrow(/unknown execRole/);
  });

  it('each new profile recommends its role-family workflow', () => {
    expect(recommendWorkflow([getProfile('ceo')])).toBe('exec-decision');
    expect(recommendWorkflow([getProfile('ciso')])).toBe('security-incident');
    expect(recommendWorkflow([getProfile('design')])).toBe('doc-first-signoff');
    expect(recommendWorkflow([getProfile('hr')])).toBe('people-lifecycle');
  });

  it('the new profiles carry the expected registry shape', () => {
    expect(getProfile('ceo').ruleFamily).toBe('doc-first');
    expect(getProfile('ceo').autoPolicy).toBe(true);
    expect(getProfile('ciso').extraMcp).toContain('github');
    expect(getProfile('ciso').autoPolicy).toBe(true);
    expect(getProfile('design').extraMcp).toContain('figma');
    expect(getProfile('design').autoPolicy).toBeUndefined();
  });
});
