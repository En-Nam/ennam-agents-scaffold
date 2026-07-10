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
 * v1.11 (#10) — multi-profile composition. Render each profile's CLAUDE.md partial
 * under its own `#### <profile>` sub-heading and join them, to feed the shared
 * partial's single `{{{profileSection}}}` slot. Order = selection order.
 * Shared between the conflict-scan (render.ts) and write (execute.ts) paths.
 */
export async function composeProfileSections(paths: string[], ctx: RenderContext): Promise<string> {
  const sections: string[] = [];
  for (const p of paths) {
    const name = path.basename(path.dirname(p)); // templates/<profile>/CLAUDE.md.partial.hbs
    const rendered = renderString(await readFile(p, 'utf8'), ctx);
    sections.push(`#### ${name}\n\n${rendered}`);
  }
  return sections.join('\n\n');
}

/**
 * v1.12 (#23) — read a FileEntry's resolved workflow preset and strip a single trailing
 * newline so it drops into the `{{{workflowSection}}}` slot byte-for-byte (mirrors the
 * marker-block trailing-newline handling in execute.ts). Only the CLAUDE.md marker entry
 * carries `workflowSrc`; every other entry returns undefined (no slot to fill).
 */
export async function readWorkflowSection(entry: FileEntry): Promise<string | undefined> {
  if (!entry.workflowSrc) return undefined;
  const raw = await readFile(entry.workflowSrc, 'utf8');
  return raw.replace(/\n$/, '');
}

/**
 * Render a FileEntry to the exact content the scaffold would write to disk.
 * Used by scanConflicts to detect already-installed files (identical → skip).
 * Handles extraSrcAbs (marker-merge) by combining shared + profile partials.
 */
export async function renderFileEntry(entry: FileEntry, ctx: RenderContext): Promise<string> {
  const raw = await readFile(entry.srcAbs, 'utf8');
  // v1.12 (#23) — fill the workflow slot (only set on the CLAUDE.md marker entry).
  const workflowSection = await readWorkflowSection(entry);
  const baseCtx: RenderContext = workflowSection !== undefined ? { ...ctx, workflowSection } : ctx;
  // v1.11 (#10) — multi-profile: concatenate all profile partials under sub-headings.
  if (entry.extraSrcList && entry.extraSrcList.length > 0) {
    const profileSection = await composeProfileSections(entry.extraSrcList, ctx);
    return renderString(raw, { ...baseCtx, profileSection } as RenderContext);
  }
  if (!entry.extraSrcAbs) {
    return entry.isTemplate ? renderString(raw, baseCtx) : raw;
  }
  // Combine shared partial + profile partial via the `profileSection` slot.
  const profileRaw = await readFile(entry.extraSrcAbs, 'utf8');
  const profileRendered = renderString(profileRaw, ctx);
  const extendedCtx = { ...baseCtx, profileSection: profileRendered };
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
  // v1.11 (#10) — multi-profile: union all profile .mcp.json partials (earlier profile
  // wins on key conflict), then let profiles win over the shared base.
  if (entry.extraSrcList && entry.extraSrcList.length > 0) {
    let acc: Record<string, unknown> = {};
    for (const p of entry.extraSrcList) {
      const obj = JSON.parse(renderString(await readFile(p, 'utf8'), ctx)) as Record<string, unknown>;
      acc = mergeJson(acc as Parameters<typeof mergeJson>[0], obj as Parameters<typeof mergeJson>[0]);
    }
    return mergeJson(acc as Parameters<typeof mergeJson>[0], sharedObj as Parameters<typeof mergeJson>[0]);
  }
  if (!entry.extraSrcAbs) return sharedObj;
  const profileRaw = await readFile(entry.extraSrcAbs, 'utf8');
  const profileObj = JSON.parse(renderString(profileRaw, ctx)) as Record<string, unknown>;
  // Profile wins on conflict (profile is more specific). mergeJson(first, second) keeps first's value.
  return mergeJson(
    profileObj as Parameters<typeof mergeJson>[0],
    sharedObj as Parameters<typeof mergeJson>[0],
  );
}
