import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { ConflictState } from './types.js';

export type RenderedProvider = (relPath: string) => Promise<string | null>;

export type ConflictReport = Map<string, ConflictState>;

/**
 * Scan cwd for each target relPath.
 * If `provider` is given, identical/differs is determined by comparing rendered content;
 * otherwise we only distinguish absent vs differs (content presence implies "differs" for safety).
 */
export async function scanConflicts(
  cwd: string,
  relPaths: string[],
  provider?: RenderedProvider,
): Promise<ConflictReport> {
  const out: ConflictReport = new Map();
  for (const rel of relPaths) {
    const abs = path.join(cwd, rel);
    let exists = true;
    try {
      await access(abs);
    } catch {
      exists = false;
    }
    if (!exists) {
      out.set(rel, 'absent');
      continue;
    }
    if (!provider) {
      out.set(rel, 'differs');
      continue;
    }
    const incoming = await provider(rel);
    if (incoming === null) {
      out.set(rel, 'differs');
      continue;
    }
    const existing = await readFile(abs, 'utf8');
    out.set(rel, existing === incoming ? 'identical' : 'differs');
  }
  return out;
}
