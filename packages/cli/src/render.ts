import path from 'node:path';
import { readFile } from 'node:fs/promises';
import Handlebars from 'handlebars';
import type { RenderContext, FileEntry } from './types.js';

export interface BuildContextOpts {
  profile: string;
  cwd: string;
  version: string;
}

export function buildContext(opts: BuildContextOpts): RenderContext {
  const now = new Date();
  const date = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return {
    scaffoldVersion: opts.version,
    profile: opts.profile,
    cwd: opts.cwd,
    projectName: path.basename(opts.cwd),
    year: now.getUTCFullYear(),
    date,
    isWindows: process.platform === 'win32',
  };
}

// Register custom helpers once at module load (Handlebars helpers are global, idempotent).
Handlebars.registerHelper('json', (value: unknown) => {
  return JSON.stringify(value);
});

export function renderString(template: string, ctx: RenderContext): string {
  return Handlebars.compile(template, { noEscape: true })(ctx);
}

/**
 * Render a FileEntry to the exact content the scaffold would write to disk.
 * Used by scanConflicts to detect already-installed files (identical → skip).
 */
export async function renderFileEntry(entry: FileEntry, ctx: RenderContext): Promise<string> {
  const raw = await readFile(entry.srcAbs, 'utf8');
  return entry.isTemplate ? renderString(raw, ctx) : raw;
}
