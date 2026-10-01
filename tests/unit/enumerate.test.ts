import { describe, it, expect } from 'vitest';
import { enumerateFiles, enumerateProfiles } from '../../packages/cli/src/enumerate.js';
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

  it('.mcp.json entry has extraSrcAbs when profile partial exists', async () => {
    const profile = getProfile('next');
    const entries = await enumerateFiles(profile);
    const mcpEntry = entries.find(e => e.relPath === '.mcp.json');
    expect(mcpEntry).toBeDefined();
    expect(mcpEntry?.kind).toBe('json-merge');
    expect(mcpEntry?.extraSrcAbs).toBeDefined();
    expect(mcpEntry?.extraSrcAbs).toMatch(/\.mcp\.json\.partial\.hbs$/);
  });

  // v1.14 — the Unity LFS rules lived in _shared and leaked into EVERY profile:
  // a Next.js user got *.png/*.jpg routed to Git LFS. Only game-unity may ship them.
  it('does NOT ship .gitattributes for non-Unity profiles', async () => {
    const entries = await enumerateFiles(getProfile('next'));
    expect(entries.map(e => e.relPath)).not.toContain('.gitattributes');
  });

  it('ships .gitattributes (append) for game-unity', async () => {
    const entries = await enumerateFiles(getProfile('game-unity'));
    const ga = entries.find(e => e.relPath === '.gitattributes');
    expect(ga?.kind).toBe('append-lines');
  });

  // v1.14 — a profile's root README.md documents the profile; it must never target
  // the user's own project README (that prompted to overwrite their README).
  it.each(['agent-org', 'game-unity', 'qa-automation'])(
    '%s: profile README is remapped under docs/agents-scaffold/, never the root README',
    async (name) => {
      const rels = (await enumerateFiles(getProfile(name))).map(e => e.relPath);
      expect(rels).not.toContain('README.md');
      expect(rels).toContain(`docs/agents-scaffold/${name}.md`);
    },
  );

  // v1.14 — profile-specific settings (agent-org's SubagentStop hook + isolatePeerMachines)
  // must reach .claude/settings.json without a manual paste step.
  it('agent-org settings.json entry carries the profile settings partial', async () => {
    const entries = await enumerateFiles(getProfile('agent-org'));
    const s = entries.find(e => e.relPath === '.claude/settings.json');
    expect(s?.kind).toBe('json-merge');
    expect(s?.extraSrcAbs).toMatch(/settings\.json\.partial\.hbs$/);
  });

  it('profiles without a settings partial keep the shared settings only', async () => {
    const entries = await enumerateFiles(getProfile('next'));
    expect(entries.find(e => e.relPath === '.claude/settings.json')?.extraSrcAbs).toBeUndefined();
  });

  // v1.14 — before the README remap, two profiles that each ship a README.md could not be
  // composed at all (same path, different content → Rule-7 conflict). Each now gets its own doc.
  it("compose: agent-org + qa-automation no longer collide on README.md", async () => {
    const rels = (await enumerateProfiles([getProfile("agent-org"), getProfile("qa-automation")])).map(e => e.relPath);
    expect(rels).toContain("docs/agents-scaffold/agent-org.md");
    expect(rels).toContain("docs/agents-scaffold/qa-automation.md");
    expect(rels).not.toContain("README.md");
  });
});
