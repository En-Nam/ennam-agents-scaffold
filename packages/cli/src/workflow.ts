import path from 'node:path';
import { existsSync } from 'node:fs';
import { getSharedDir } from './profiles.js';
import type { WorkflowPresetId } from './types.js';

// v1.12 (#23) — workflow presets live as phase-list markdown files under
// templates/_shared/workflow/<id>.md. This module resolves a preset id to its source
// path for the CLAUDE.md {{{workflowSection}}} slot. #23 ships only 'engineering-full'
// (the verbatim lift of the original 7-phase Superpowers text). #26/#31 add the rest.

export const DEFAULT_WORKFLOW: WorkflowPresetId = 'engineering-full';

export function workflowDir(): string {
  return path.join(getSharedDir(), 'workflow');
}

/**
 * Resolve a workflow preset id to its absolute source file path. Undefined resolves to
 * the default ('engineering-full'), which keeps every existing profile byte-identical.
 * Fails loud (Rule 12) on an unknown id — a bogus recommendedWorkflow or (later) a bad
 * --workflow value must never silently fall back to the default.
 */
export function resolveWorkflowSrc(id?: WorkflowPresetId): string {
  const preset = id ?? DEFAULT_WORKFLOW;
  const src = path.join(workflowDir(), `${preset}.md`);
  if (!existsSync(src)) {
    throw new Error(
      `Unknown workflow preset "${preset}". Add templates/_shared/workflow/${preset}.md ` +
        `or pick an existing preset.`,
    );
  }
  return src;
}
