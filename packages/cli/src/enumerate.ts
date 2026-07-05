import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import type { ProfileDef, FileEntry, EnumerateOptions } from './types.js';
import { getSharedDir } from './profiles.js';
import { classifyFile } from './classify.js';

/**
 * Strip .hbs and .partial.hbs and .append suffixes to derive the on-disk relPath.
 * `CLAUDE.md.partial.hbs` → `CLAUDE.md`
 * `.gitignore.append`     → `.gitignore`
 * `settings.json.hbs`     → `settings.json`
 */
function targetRelPath(srcRel: string): string {
  return srcRel
    .replace(/\.partial\.hbs$/, '')
    .replace(/\.hbs$/, '')
    .replace(/\.append$/, '');
}

async function collect(dir: string): Promise<{ src: string; rel: string }[]> {
  const files = await fg('**/*', { cwd: dir, dot: true, onlyFiles: true });
  return files.map(rel => ({ src: path.join(dir, rel), rel }));
}

export async function enumerateFiles(profile: ProfileDef, opts: EnumerateOptions = {}): Promise<FileEntry[]> {
  const sharedDir = getSharedDir();
  const shared = await collect(sharedDir);
  const profileFiles = await collect(profile.templateDir);

  // Map keyed by target relPath. Profile entries override shared on collision.
  const map = new Map<string, FileEntry>();

  // Handle marker-merge sources separately so we can pair shared + profile partials.
  // For Plan 2, only CLAUDE.md uses marker pairing.
  const markerPairs = new Map<string, { sharedSrc?: string; profileSrc?: string }>();
  const collectMarker = (src: string, rel: string, isShared: boolean): boolean => {
    if (!rel.endsWith('.partial.hbs')) return false;
    const target = targetRelPath(rel);
    if (target !== 'CLAUDE.md') return false;
    const entry = markerPairs.get(target) ?? {};
    if (isShared) entry.sharedSrc = src;
    else entry.profileSrc = src;
    markerPairs.set(target, entry);
    return true;
  };

  for (const { src, rel } of shared) {
    if (collectMarker(src, rel, true)) continue;
    if (src.endsWith('.partial.hbs')) continue;  // non-CLAUDE partial — handled in T11
    // v1.11 (#9) — AGENTS.doc-first.md is a family VARIANT, never emitted under its own
    // name. It is swapped in as the AGENTS.md source below for doc-first profiles.
    if (rel === 'AGENTS.doc-first.md') continue;
    // v1.11 (#14) — POLICY.baseline.md is an opt-in pack, emitted as POLICY.md only when
    // requested (--policy) or auto-attached; never a default file.
    if (rel === 'POLICY.baseline.md') continue;
    const target = targetRelPath(rel);
    map.set(target, {
      srcAbs: src,
      relPath: target,
      isTemplate: src.endsWith('.hbs'),
      kind: classifyFile(target),
    });
  }
  for (const { src, rel } of profileFiles) {
    if (collectMarker(src, rel, false)) continue;
    if (src.endsWith('.partial.hbs')) continue;
    const target = targetRelPath(rel);
    map.set(target, {
      srcAbs: src,
      relPath: target,
      isTemplate: src.endsWith('.hbs'),
      kind: classifyFile(target),
    });
  }

  // Emit one FileEntry per marker pair.
  for (const [target, pair] of markerPairs) {
    if (!pair.sharedSrc) continue;  // no shared partial → no marker block to write
    map.set(target, {
      srcAbs: pair.sharedSrc,
      relPath: target,
      isTemplate: true,
      kind: 'append-marker',
      extraSrcAbs: pair.profileSrc,
    });
  }

  // v1.11 (#9) — doc-first roles emit the doc-first AGENTS.md variant in place of the
  // engineering default. The target file is still named AGENTS.md; only the source swaps.
  // Engineering profiles (ruleFamily undefined) keep _shared/AGENTS.md byte-for-byte.
  if (profile.ruleFamily === 'doc-first') {
    const agentsEntry = map.get('AGENTS.md');
    if (agentsEntry) {
      agentsEntry.srcAbs = path.join(sharedDir, 'AGENTS.doc-first.md');
    }
  }

  // v1.11 (#14) — governance pack. Emit POLICY.md when requested (--policy) or when the
  // profile auto-attaches it (hr, data-analytics — roles that routinely touch PII).
  if (opts.policy || profile.autoPolicy) {
    map.set('POLICY.md', {
      srcAbs: path.join(sharedDir, 'POLICY.baseline.md'),
      relPath: 'POLICY.md',
      isTemplate: false,
      kind: classifyFile('POLICY.md'),
    });
  }

  // For json-merge: shared `_shared/.mcp.json.hbs` is the base; profile `<profile>/.mcp.json.partial.hbs`
  // is the addition. Attach profile partial as extraSrcAbs on the shared entry.
  const profileMcpPartial = profileFiles.find(({ rel }) => rel === '.mcp.json.partial.hbs');
  if (profileMcpPartial) {
    const existing = map.get('.mcp.json');
    if (existing) {
      existing.extraSrcAbs = profileMcpPartial.src;
    }
  }

  return [...map.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/**
 * v1.11 (#10) — compose one or more profiles into a single install.
 * - 1 profile → identical to enumerateFiles (single-profile path is untouched).
 * - N profiles → merge shared + every profile's files. CLAUDE.md concatenates each
 *   profile's partial (sub-headed); .mcp.json unions every profile partial; AGENTS.md
 *   uses the ENGINEERING variant if ANY profile is engineering (a repo with both dev
 *   and doc roles is a code repo), else doc-first; POLICY.md emits if any profile
 *   auto-attaches or --policy is set.
 * - Fail loud (Rule 7): if two profiles ship the SAME file path with DIFFERENT content
 *   (an agent/command/skill collision), throw a listed error instead of silently picking one.
 */
export async function enumerateProfiles(profiles: ProfileDef[], opts: EnumerateOptions = {}): Promise<FileEntry[]> {
  if (profiles.length <= 1) {
    return enumerateFiles(profiles[0]!, opts);
  }

  const sharedDir = getSharedDir();
  const shared = await collect(sharedDir);
  const anyEngineering = profiles.some(p => p.ruleFamily !== 'doc-first');
  const wantPolicy = !!opts.policy || profiles.some(p => p.autoPolicy);

  const map = new Map<string, FileEntry>();
  // Provenance for conflict detection on profile-owned static files (agents/commands/skills).
  const owner = new Map<string, { profile: string; content: string }>();
  const conflicts: string[] = [];

  // 1. Shared static files. Skip partials + variants; AGENTS.md source depends on family.
  for (const { src, rel } of shared) {
    if (src.endsWith('.partial.hbs')) continue;         // CLAUDE partial handled below
    if (rel === 'AGENTS.doc-first.md') continue;
    if (rel === 'POLICY.baseline.md') continue;
    if (rel === 'AGENTS.md') {
      map.set('AGENTS.md', {
        srcAbs: anyEngineering ? src : path.join(sharedDir, 'AGENTS.doc-first.md'),
        relPath: 'AGENTS.md',
        isTemplate: false,
        kind: classifyFile('AGENTS.md'),
      });
      continue;
    }
    const target = targetRelPath(rel);
    map.set(target, { srcAbs: src, relPath: target, isTemplate: src.endsWith('.hbs'), kind: classifyFile(target) });
  }

  // 2. Each profile's own files (agents/commands/skills/etc.). Detect cross-profile collisions.
  for (const profile of profiles) {
    const files = await collect(profile.templateDir);
    for (const { src, rel } of files) {
      if (rel === 'CLAUDE.md.partial.hbs') continue;    // marker — handled below
      if (rel === '.mcp.json.partial.hbs') continue;    // json — handled below
      if (src.endsWith('.partial.hbs')) continue;
      const target = targetRelPath(rel);
      const content = await readFile(src, 'utf8');
      const prev = owner.get(target);
      if (prev && prev.content !== content) {
        conflicts.push(`${target} (differs between "${prev.profile}" and "${profile.name}")`);
        continue;
      }
      owner.set(target, { profile: profile.name, content });
      map.set(target, { srcAbs: src, relPath: target, isTemplate: src.endsWith('.hbs'), kind: classifyFile(target) });
    }
  }

  // 3. Fail loud on same-path/different-content collisions (Rule 7 — surface, don't merge).
  if (conflicts.length > 0) {
    throw new Error(
      `Profile composition conflict — these paths are shipped by more than one selected profile with different content:\n` +
      conflicts.map(c => `  - ${c}`).join('\n') +
      `\nInstall the conflicting profiles separately, or drop one from the selection.`,
    );
  }

  // 4. CLAUDE.md — concatenate every profile's partial under the shared base's marker block.
  map.set('CLAUDE.md', {
    srcAbs: path.join(sharedDir, 'CLAUDE.md.partial.hbs'),
    relPath: 'CLAUDE.md',
    isTemplate: true,
    kind: 'append-marker',
    extraSrcList: profiles
      .map(p => path.join(p.templateDir, 'CLAUDE.md.partial.hbs'))
      .filter(existsSync),
  });

  // 5. .mcp.json — union every profile's partial onto the shared base.
  const mcpEntry = map.get('.mcp.json');
  if (mcpEntry) {
    mcpEntry.extraSrcList = profiles
      .map(p => path.join(p.templateDir, '.mcp.json.partial.hbs'))
      .filter(existsSync);
  }

  // 6. Governance pack.
  if (wantPolicy) {
    map.set('POLICY.md', {
      srcAbs: path.join(sharedDir, 'POLICY.baseline.md'),
      relPath: 'POLICY.md',
      isTemplate: false,
      kind: classifyFile('POLICY.md'),
    });
  }

  return [...map.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));
}
