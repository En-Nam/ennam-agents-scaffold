import path from 'node:path';
import fg from 'fast-glob';
import type { ProfileDef, FileEntry } from './types.js';
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

export async function enumerateFiles(profile: ProfileDef): Promise<FileEntry[]> {
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
