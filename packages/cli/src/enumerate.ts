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
  const shared = await collect(getSharedDir());
  const profileFiles = await collect(profile.templateDir);

  // Map keyed by *target* relPath so profile entries override shared on collision.
  const map = new Map<string, FileEntry>();

  for (const { src, rel } of shared) {
    const target = targetRelPath(rel);
    map.set(target, {
      srcAbs: src,
      relPath: target,
      isTemplate: src.endsWith('.hbs'),
      kind: classifyFile(target),
    });
  }
  for (const { src, rel } of profileFiles) {
    const target = targetRelPath(rel);
    map.set(target, {
      srcAbs: src,
      relPath: target,
      isTemplate: src.endsWith('.hbs'),
      kind: classifyFile(target),
    });
  }

  return [...map.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));
}
