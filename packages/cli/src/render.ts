import path from 'node:path';
import { readFile } from 'node:fs/promises';
import Handlebars from 'handlebars';
import type { RenderContext, FileEntry } from './types.js';
import { mergeJson } from './merge/json.js';

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
 * Handles extraSrcAbs (marker-merge) by combining shared + profile partials.
 */
export async function renderFileEntry(entry: FileEntry, ctx: RenderContext): Promise<string> {
  const raw = await readFile(entry.srcAbs, 'utf8');
  if (!entry.extraSrcAbs) {
    return entry.isTemplate ? renderString(raw, ctx) : raw;
  }
  // Combine shared partial + profile partial via the `profileSection` slot.
  const profileRaw = await readFile(entry.extraSrcAbs, 'utf8');
  const profileRendered = renderString(profileRaw, ctx);
  const extendedCtx = { ...ctx, profileSection: profileRendered };
  return renderString(raw, extendedCtx as RenderContext);
}

/**
 * Produce the scaffold-side combined JSON object for a json-merge entry.
 * If entry has extraSrcAbs (profile partial), profile wins on conflict.
 * mergeJson(first, second) keeps first's value on conflict, so:
 *   mergeJson(profileObj, sharedObj) → profile wins.
 */
export async function renderJsonContent(entry: FileEntry, ctx: RenderContext): Promise<Record<string, unknown>> {
  const sharedRaw = await readFile(entry.srcAbs, 'utf8');
  const sharedObj = JSON.parse(renderString(sharedRaw, ctx)) as Record<string, unknown>;
  if (!entry.extraSrcAbs) return sharedObj;
  const profileRaw = await readFile(entry.extraSrcAbs, 'utf8');
  const profileObj = JSON.parse(renderString(profileRaw, ctx)) as Record<string, unknown>;
  // Profile wins on conflict (profile is more specific). mergeJson(first, second) keeps first's value.
  return mergeJson(
    profileObj as Parameters<typeof mergeJson>[0],
    sharedObj as Parameters<typeof mergeJson>[0],
  );
}
