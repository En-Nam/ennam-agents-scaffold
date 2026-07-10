import path from 'node:path';
import { existsSync } from 'node:fs';
import { getSharedDir } from './profiles.js';
import type { ProfileDef, WorkflowPresetId } from './types.js';

// v1.12 (#23/#26) — workflow presets live as phase-list markdown files under
// templates/_shared/workflow/<id>.md. This module resolves a preset id to its source
// path for the CLAUDE.md {{{workflowSection}}} slot, and (v1.12 #26) picks the recommended
// preset from the selected profile(s) + validates a user-supplied --workflow value.

export const DEFAULT_WORKFLOW: WorkflowPresetId = 'engineering-full';

export interface WorkflowPreset {
  id: WorkflowPresetId;
  label: string;
  hint: string;
  /** override-only presets are never auto-recommended; a user picks them deliberately. */
  overrideOnly?: boolean;
}

// The selectable catalog (wizard labels + hints). Every id MUST have a matching
// templates/_shared/workflow/<id>.md file — a test locks that in sync. #31/#32 add the
// role-family presets (people-lifecycle, exec-decision, security-incident, finance-close).
export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  { id: 'engineering-full', label: 'Full engineering (7-phase Superpowers)', hint: 'Understand → Plan → Isolate → Implement → Verify → Review → Complete' },
  { id: 'doc-first-signoff', label: 'Document (draft → review → sign-off)', hint: 'Frame → Draft → Self-check → Review → Sign-off — for knowledge work' },
  { id: 'data-insight', label: 'Data (question → query → validate → report)', hint: 'Question → Query → Validate → Report — read-only, reproducible' },
  // v1.12 (#31) — role-family presets. Recommended via each profile's recommendedWorkflow
  // (hr → people-lifecycle, ceo → exec-decision, ciso → security-incident); selectable by anyone.
  { id: 'people-lifecycle', label: 'People lifecycle (hire → review → offboard)', hint: 'Frame → Gather → Draft → Fairness check → Human decision → Sign-off — HR/people work' },
  { id: 'exec-decision', label: 'Executive decision & board communication', hint: 'Frame → Options → Decide → Deck → Validate figures → Sign-off — leadership calls' },
  { id: 'security-incident', label: 'Security incident response', hint: 'Intake → Scope from evidence → Contain → Notify → Post-mortem — NIST-style' },
  { id: 'quick-change', label: 'Quick change (express lane)', hint: 'Understand → Implement → Verify — small, low-risk edits', overrideOnly: true },
  { id: 'decision-brief', label: 'Decision (frame → options → decide → communicate)', hint: 'For making a call, not a document — human decides', overrideOnly: true },
];

export function listWorkflowPresetIds(): WorkflowPresetId[] {
  return WORKFLOW_PRESETS.map(p => p.id);
}

/**
 * Validate a user-supplied --workflow id. Fails loud (Rule 12) with the valid list so a
 * bogus value can never silently fall back to a default (mirrors resolveProfile's throw).
 */
export function assertWorkflowId(id: string): void {
  if (!WORKFLOW_PRESETS.some(p => p.id === id)) {
    throw new Error(`Unknown workflow preset "${id}". Available: ${listWorkflowPresetIds().join(', ')}`);
  }
}

/**
 * Pick the recommended preset for the selected profile(s). Single: the profile's explicit
 * recommendedWorkflow, else doc-first → doc-first-signoff, else engineering-full. Compose:
 * any engineering profile → engineering-full (a code repo); else data-analytics present →
 * data-insight; else doc-first-signoff. Never recommends an override-only preset.
 */
export function recommendWorkflow(profiles: ProfileDef[]): WorkflowPresetId {
  if (profiles.length === 1) {
    const p = profiles[0]!;
    if (p.recommendedWorkflow) return p.recommendedWorkflow;
    return p.ruleFamily === 'doc-first' ? 'doc-first-signoff' : DEFAULT_WORKFLOW;
  }
  if (profiles.some(p => p.ruleFamily !== 'doc-first')) return DEFAULT_WORKFLOW;
  if (profiles.some(p => p.recommendedWorkflow === 'data-insight')) return 'data-insight';
  return 'doc-first-signoff';
}

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
