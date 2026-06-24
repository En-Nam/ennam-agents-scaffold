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

  it('QA-QC + Local-root → qa', () => {
    expect(resolveProfile('QA-QC', 'Local-root')).toBe('qa');
  });

  it('QA-QC + Existing repository → qa', () => {
    expect(resolveProfile('QA-QC', 'Existing repository')).toBe('qa');
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
      resolveProfile('QA-QC', 'Local-root'),
      resolveProfile('QA-QC', 'Existing repository'),
    ];
    for (const name of resolved) {
      expect(() => getProfile(name)).not.toThrow();
    }
  });

  it('Developer + Existing repository without stack → throws', () => {
    expect(() => resolveProfile('Developer', 'Existing repository')).toThrow(/stack is required/i);
  });

  it('unknown role combination → throws', () => {
    // Cast through unknown so the runtime defensive guard is exercised even though
    // TypeScript would normally catch this at the call site.
    expect(() => resolveProfile('Designer' as unknown as 'Developer', 'Local-root')).toThrow(/unknown combination/i);
  });
});
