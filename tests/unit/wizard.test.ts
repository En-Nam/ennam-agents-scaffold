import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../../packages/cli/src/wizard.js';
import { getProfile } from '../../packages/cli/src/profiles.js';

describe('wizard resolveProfile matrix', () => {
  it('Developer + Local-root → local-root', () => {
    expect(resolveProfile('Developer', 'Local-root')).toBe('local-root');
  });

  it('Developer + Existing repository + Next.js → next', () => {
    expect(resolveProfile('Developer', 'Existing repository', 'Next.js')).toBe('next');
  });

  it('Developer + Existing repository + Flutter → flutter', () => {
    expect(resolveProfile('Developer', 'Existing repository', 'Flutter')).toBe('flutter');
  });

  it('Developer + Existing repository + Python → python', () => {
    expect(resolveProfile('Developer', 'Existing repository', 'Python')).toBe('python');
  });

  it('Developer + Existing repository + Go → go', () => {
    expect(resolveProfile('Developer', 'Existing repository', 'Go')).toBe('go');
  });

  it('Developer + Existing repository + React → react', () => {
    expect(resolveProfile('Developer', 'Existing repository', 'React')).toBe('react');
  });

  it('Developer + Existing repository + React Native → react-native', () => {
    expect(resolveProfile('Developer', 'Existing repository', 'React Native')).toBe('react-native');
  });

  it('Developer + Existing repository + .NET MVC → dotnet-mvc', () => {
    expect(resolveProfile('Developer', 'Existing repository', '.NET MVC')).toBe('dotnet-mvc');
  });

  it('Developer + Existing repository + Express.js → express', () => {
    expect(resolveProfile('Developer', 'Existing repository', 'Express.js')).toBe('express');
  });

  it('QA-QC + Local-root → qa', () => {
    expect(resolveProfile('QA-QC', 'Local-root')).toBe('qa');
  });

  it('QA-QC + Existing repository → qa', () => {
    expect(resolveProfile('QA-QC', 'Existing repository')).toBe('qa');
  });

  it('BA → ba (projectType ignored)', () => {
    expect(resolveProfile('BA', 'Existing repository')).toBe('ba');
    expect(resolveProfile('BA', 'Local-root')).toBe('ba');
  });

  it('HR → hr (projectType ignored)', () => {
    expect(resolveProfile('HR', 'Existing repository')).toBe('hr');
    expect(resolveProfile('HR', 'Local-root')).toBe('hr');
  });

  it('DevOps + AWS → devops-aws', () => {
    expect(resolveProfile('DevOps', 'Existing repository', undefined, 'AWS')).toBe('devops-aws');
  });

  it('DevOps + Azure → devops-azure', () => {
    expect(resolveProfile('DevOps', 'Existing repository', undefined, 'Azure')).toBe('devops-azure');
  });

  it('DevOps + Google Cloud → devops-gcp', () => {
    expect(resolveProfile('DevOps', 'Existing repository', undefined, 'Google Cloud')).toBe('devops-gcp');
  });

  it('DevOps + Docker → devops-docker', () => {
    expect(resolveProfile('DevOps', 'Existing repository', undefined, 'Docker')).toBe('devops-docker');
  });

  it('every resolved name is a registered profile', () => {
    // Lock the wizard's output to the live profile registry: if anyone renames
    // a profile in profiles.ts the wizard must surface that mismatch.
    const resolved = [
      resolveProfile('Developer', 'Local-root'),
      resolveProfile('Developer', 'Existing repository', 'Next.js'),
      resolveProfile('Developer', 'Existing repository', 'Flutter'),
      resolveProfile('Developer', 'Existing repository', 'Python'),
      resolveProfile('Developer', 'Existing repository', 'Go'),
      resolveProfile('Developer', 'Existing repository', 'React'),
      resolveProfile('Developer', 'Existing repository', 'React Native'),
      resolveProfile('Developer', 'Existing repository', '.NET MVC'),
      resolveProfile('Developer', 'Existing repository', 'Express.js'),
      resolveProfile('QA-QC', 'Local-root'),
      resolveProfile('QA-QC', 'Existing repository'),
      resolveProfile('BA', 'Existing repository'),
      resolveProfile('HR', 'Existing repository'),
      resolveProfile('DevOps', 'Existing repository', undefined, 'AWS'),
      resolveProfile('DevOps', 'Existing repository', undefined, 'Azure'),
      resolveProfile('DevOps', 'Existing repository', undefined, 'Google Cloud'),
      resolveProfile('DevOps', 'Existing repository', undefined, 'Docker'),
    ];
    for (const name of resolved) {
      expect(() => getProfile(name)).not.toThrow();
    }
  });

  it('Developer + Existing repository without stack → throws', () => {
    expect(() => resolveProfile('Developer', 'Existing repository')).toThrow(/stack is required/i);
  });

  it('DevOps without cloud → throws', () => {
    expect(() => resolveProfile('DevOps', 'Existing repository')).toThrow(/cloud is required/i);
  });

  it('unknown role combination → throws', () => {
    // Cast through unknown so the runtime defensive guard is exercised even though
    // TypeScript would normally catch this at the call site.
    expect(() => resolveProfile('Designer' as unknown as 'Developer', 'Local-root')).toThrow(/unknown combination/i);
  });
});
