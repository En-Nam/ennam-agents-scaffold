import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

export const BACKUP_DIR = '.ennam-scaffold-backup';

/**
 * Copy `<cwd>/<relPath>` to `<cwd>/.ennam-scaffold-backup/<session>/<relPath>`.
 * Returns the absolute path of the backup copy.
 * If `session` is omitted, a fresh ISO-like timestamp is generated.
 * Caller is responsible for using one `session` per scaffold run so all
 * backups land in the same dir.
 */
export async function backupFile(cwd: string, relPath: string, session?: string): Promise<string> {
  const sessionDir = session ?? new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(cwd, BACKUP_DIR, sessionDir, relPath);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(path.join(cwd, relPath), dest);
  return dest;
}

/**
 * Remove all but the `keep` newest session directories under .ennam-scaffold-backup/.
 * Session dirs sort lexicographically — ISO timestamps do this correctly.
 * No-op if backup root does not exist.
 */
export async function rotateBackups(cwd: string, keep: number): Promise<void> {
  const root = path.join(cwd, BACKUP_DIR);
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return; // backup dir doesn't exist yet — nothing to rotate
  }
  const sorted = entries.sort();
  const toRemove = sorted.slice(0, Math.max(0, sorted.length - keep));
  for (const name of toRemove) {
    await rm(path.join(root, name), { recursive: true, force: true });
  }
}

/** Generate the canonical session id used by execute.ts for the current run. */
export function newSessionId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
