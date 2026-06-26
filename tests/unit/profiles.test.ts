import { describe, it, expect } from 'vitest';
import { getProfile, listProfiles } from '../../packages/cli/src/profiles.js';

const ALL_PROFILES = [
  'ba',
  'devops-aws',
  'devops-azure',
  'devops-docker',
  'devops-gcp',
  'dotnet-mvc',
  'express',
  'flutter',
  'game-unity',
  'go',
  'hr',
  'local-root',
  'next',
  'python',
  'qa',
  'react',
  'react-native',
] as const;

describe('profiles', () => {
  it('returns the next profile by name', () => {
    const p = getProfile('next');
    expect(p.name).toBe('next');
    expect(p.extraMcp).toEqual(['figma']);
  });

  it('throws on unknown profile', () => {
    expect(() => getProfile('rust')).toThrow(/unknown profile/i);
  });

  it('returns all expected profiles', () => {
    const names = listProfiles().map(p => p.name).sort();
    expect(names).toEqual([...ALL_PROFILES]);
  });

  it.each(ALL_PROFILES)('returns %s profile', (name) => {
    const p = getProfile(name);
    expect(p.name).toBe(name);
    expect(p.templateDir).toContain(name);
  });

  it('every devops profile declares the github MCP', () => {
    for (const name of ['devops-aws', 'devops-azure', 'devops-gcp', 'devops-docker']) {
      expect(getProfile(name).extraMcp).toContain('github');
    }
  });

  it('game-unity does NOT declare extraMcp from the shared catalog (Unity MCP comes via own partial)', () => {
    expect(getProfile('game-unity').extraMcp).toEqual([]);
  });
});
