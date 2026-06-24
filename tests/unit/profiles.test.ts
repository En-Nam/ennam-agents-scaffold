import { describe, it, expect } from 'vitest';
import { getProfile, listProfiles } from '../../packages/cli/src/profiles.js';

describe('profiles', () => {
  it('returns the next profile by name', () => {
    const p = getProfile('next');
    expect(p.name).toBe('next');
    expect(p.extraMcp).toContain('chrome-devtools');
    expect(p.extraMcp).toContain('figma');
  });

  it('throws on unknown profile', () => {
    expect(() => getProfile('rust')).toThrow(/unknown profile/i);
  });

  it('returns all expected profiles', () => {
    const names = listProfiles().map(p => p.name).sort();
    expect(names).toEqual(['flutter', 'go', 'local-root', 'next', 'python', 'qa']);
  });

  it.each(['flutter', 'next', 'python', 'go', 'qa', 'local-root'] as const)('returns %s profile', (name) => {
    const p = getProfile(name);
    expect(p.name).toBe(name);
    expect(p.templateDir).toContain(name);
  });
});
