import { describe, it, expect } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { enumerateProfiles } from '../../packages/cli/src/enumerate.js';
import { resolveProfiles, getProfile } from '../../packages/cli/src/profiles.js';
import type { ProfileDef } from '../../packages/cli/src/types.js';

describe('resolveProfiles (#10)', () => {
  it('resolves and de-dupes (order preserved)', () => {
    const r = resolveProfiles(['pm', 'qa', 'pm']);
    expect(r.map(p => p.name)).toEqual(['pm', 'qa']);
  });

  it('throws on unknown name', () => {
    expect(() => resolveProfiles(['pm', 'nope'])).toThrow(/unknown profile/i);
  });

  it('throws on empty list', () => {
    expect(() => resolveProfiles([])).toThrow(/at least one/i);
  });
});

describe('enumerateProfiles (#10) — composition', () => {
  it('single profile is identical to enumerateFiles path (no extraSrcList)', async () => {
    const entries = await enumerateProfiles([getProfile('next')]);
    const claude = entries.find(e => e.relPath === 'CLAUDE.md');
    expect(claude?.extraSrcList).toBeUndefined();
    expect(claude?.extraSrcAbs).toBeDefined();
  });

  it('composes two profiles: CLAUDE.md gathers both partials, both agents present', async () => {
    const entries = await enumerateProfiles([getProfile('pm'), getProfile('qa')]);
    const rels = entries.map(e => e.relPath);
    const claude = entries.find(e => e.relPath === 'CLAUDE.md');
    expect(claude?.extraSrcList?.length).toBe(2);
    expect(rels).toContain('.claude/agents/product-manager.md'); // from pm
  });

  it('mixed families → AGENTS.md uses the ENGINEERING variant (a code repo)', async () => {
    const entries = await enumerateProfiles([getProfile('pm'), getProfile('express')]);
    const agents = entries.find(e => e.relPath === 'AGENTS.md');
    expect(agents!.srcAbs).toMatch(/_shared[/\\]AGENTS\.md$/);
    expect(agents!.srcAbs).not.toMatch(/doc-first/);
  });

  it('all-doc-first → AGENTS.md uses the doc-first variant', async () => {
    const entries = await enumerateProfiles([getProfile('pm'), getProfile('ba')]);
    const agents = entries.find(e => e.relPath === 'AGENTS.md');
    expect(agents!.srcAbs).toMatch(/AGENTS\.doc-first\.md$/);
  });

  it('any auto-policy profile in the mix emits POLICY.md', async () => {
    const withHr = await enumerateProfiles([getProfile('next'), getProfile('hr')]);
    expect(withHr.find(e => e.relPath === 'POLICY.md')).toBeDefined();
    const without = await enumerateProfiles([getProfile('next'), getProfile('go')]);
    expect(without.find(e => e.relPath === 'POLICY.md')).toBeUndefined();
  });

  it('FAILS LOUD when two profiles ship the same path with different content (Rule 7)', async () => {
    const { path: a } = await tmpDir({ unsafeCleanup: true });
    const { path: b } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(a, '.claude/commands'), { recursive: true });
    await mkdir(path.join(b, '.claude/commands'), { recursive: true });
    await writeFile(path.join(a, '.claude/commands/dup.md'), 'content A');
    await writeFile(path.join(b, '.claude/commands/dup.md'), 'content B');
    const profiles: ProfileDef[] = [
      { name: 'a', description: '', templateDir: a, extraMcp: [] },
      { name: 'b', description: '', templateDir: b, extraMcp: [] },
    ];
    await expect(enumerateProfiles(profiles)).rejects.toThrow(/composition conflict/i);
  });

  it('same path with IDENTICAL content is deduped, not a conflict', async () => {
    const { path: a } = await tmpDir({ unsafeCleanup: true });
    const { path: b } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(a, '.claude/commands'), { recursive: true });
    await mkdir(path.join(b, '.claude/commands'), { recursive: true });
    await writeFile(path.join(a, '.claude/commands/dup.md'), 'same');
    await writeFile(path.join(b, '.claude/commands/dup.md'), 'same');
    const profiles: ProfileDef[] = [
      { name: 'a', description: '', templateDir: a, extraMcp: [] },
      { name: 'b', description: '', templateDir: b, extraMcp: [] },
    ];
    const entries = await enumerateProfiles(profiles);
    expect(entries.filter(e => e.relPath === '.claude/commands/dup.md').length).toBe(1);
  });
});
