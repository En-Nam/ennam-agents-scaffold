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

  it('lists all v1 profiles', () => {
    const all = listProfiles().map(p => p.name);
    expect(all).toContain('next');
    // Other profiles arrive in Plan 2; this test asserts only what Plan 1 ships.
  });
});
