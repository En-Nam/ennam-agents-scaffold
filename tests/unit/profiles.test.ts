import { describe, it, expect } from 'vitest';
import { getProfile, listProfiles } from '../../packages/cli/src/profiles.js';

const ALL_PROFILES = [
  'agent-org',
  'ba',
  'ceo',
  'ciso',
  'data-analytics',
  'design',
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
  'pm',
  'python',
  'qa',
  'qa-automation',
  'react',
  'react-native',
  'tech-writer',
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

  it('agent-org declares minClaudeCodeVersion 2.1.178 (post-TeamCreate removal + team_name deprecation)', () => {
    const p = getProfile('agent-org');
    expect(p.minClaudeCodeVersion).toBe('2.1.178');
  });

  it('no other profile in v1.9.0 declares minClaudeCodeVersion (infra is opt-in per profile)', () => {
    for (const name of ALL_PROFILES) {
      if (name === 'agent-org') continue;
      expect(getProfile(name).minClaudeCodeVersion).toBeUndefined();
    }
  });

  it('doc-first roles declare ruleFamily=doc-first; every code/infra role leaves it undefined (engineering)', () => {
    const docFirst = ['ba', 'hr', 'pm', 'tech-writer', 'data-analytics', 'ceo', 'ciso', 'design'];
    for (const name of docFirst) {
      expect(getProfile(name).ruleFamily).toBe('doc-first');
    }
    for (const name of ALL_PROFILES) {
      if (docFirst.includes(name)) continue;
      expect(getProfile(name).ruleFamily).toBeUndefined();
    }
  });
});
