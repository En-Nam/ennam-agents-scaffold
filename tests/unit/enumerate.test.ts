import { describe, it, expect } from 'vitest';
import { enumerateFiles } from '../../packages/cli/src/enumerate.js';
import { getProfile } from '../../packages/cli/src/profiles.js';

describe('enumerateFiles', () => {
  it('collects _shared files and profile files, dedupes by relative path', async () => {
    const profile = getProfile('next');
    const entries = await enumerateFiles(profile);
    const rels = entries.map(e => e.relPath).sort();
    expect(rels).toContain('AGENTS.md');
    expect(rels).toContain('CLAUDE.md');
  });

  it('marks .hbs files as templates and CLAUDE.md as append-marker', async () => {
    const profile = getProfile('next');
    const entries = await enumerateFiles(profile);
    // Check that non-.partial.hbs .hbs files are marked as templates
    const templateFiles = entries.filter(e => e.isTemplate);
    expect(templateFiles.length).toBeGreaterThan(0);
    expect(templateFiles.every(e => e.srcAbs.endsWith('.hbs'))).toBe(true);
    const claudeMd = entries.find(e => e.relPath === 'CLAUDE.md');
    expect(claudeMd?.isTemplate).toBe(true);
    expect(claudeMd?.kind).toBe('append-marker');
    expect(claudeMd?.extraSrcAbs).toBeDefined();
  });

  it('emits one CLAUDE.md entry (no duplicates) with paired partials', async () => {
    // Both shared and next profile have CLAUDE.md.partial.hbs → marker pair, one entry.
    const profile = getProfile('next');
    const entries = await enumerateFiles(profile);
    const seen = new Set<string>();
    for (const e of entries) {
      expect(seen.has(e.relPath)).toBe(false);
      seen.add(e.relPath);
    }
    const claudeEntries = entries.filter(e => e.relPath === 'CLAUDE.md');
    expect(claudeEntries.length).toBe(1);
  });
});
