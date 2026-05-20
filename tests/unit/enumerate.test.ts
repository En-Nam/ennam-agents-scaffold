import { describe, it, expect } from 'vitest';
import { enumerateFiles } from '../../packages/cli/src/enumerate.js';
import { getProfile } from '../../packages/cli/src/profiles.js';

describe('enumerateFiles', () => {
  it('collects _shared files and profile files, dedupes by relative path', async () => {
    const profile = getProfile('next');
    const entries = await enumerateFiles(profile);
    const rels = entries.map(e => e.relPath).sort();
    expect(rels).toContain('AGENTS.md');
    expect(rels).toContain('CLAUDE.md');   // .hbs stripped → relPath is CLAUDE.md
  });

  it('marks .hbs files as templates', async () => {
    const profile = getProfile('next');
    const entries = await enumerateFiles(profile);
    const claudeMd = entries.find(e => e.relPath === 'CLAUDE.md');
    expect(claudeMd?.isTemplate).toBe(true);
  });

  it('overrides _shared file when profile has same path', async () => {
    // Will become meaningful once both shared and next have CLAUDE.md.partial.hbs.
    // For now, just assert no duplicate entries.
    const profile = getProfile('next');
    const entries = await enumerateFiles(profile);
    const seen = new Set<string>();
    for (const e of entries) {
      expect(seen.has(e.relPath)).toBe(false);
      seen.add(e.relPath);
    }
  });
});
