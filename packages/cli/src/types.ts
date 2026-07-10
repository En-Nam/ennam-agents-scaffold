export type FileKind =
  | 'write-or-ask'        // write if absent; classify-default 'ask' if exists
  | 'append-marker'       // marker-pair merge for CLAUDE.md (shared + profile partials)
  | 'append-lines'        // append missing lines with dedup (.gitignore)
  | 'json-merge'          // deep merge, user wins on conflicts (.mcp.json, settings.json)
  | 'skip-if-exists'      // never overwrite
  | 'mkdir-only';         // create empty dir + .gitkeep (reserved; no template uses it yet)

export type UserStrategy = 'ask' | 'skip' | 'overwrite' | 'append' | 'json-merge';
// Plan 2 added: 'append' (force append-marker / append-lines), 'json-merge' (force JSON merge).
// 'edit' was dropped — auto-backup covers manual-review use case.

export type RuleFamily = 'engineering' | 'doc-first';

// v1.12 (#23) — id of a workflow preset. A preset is a phase-list markdown file at
// templates/_shared/workflow/<id>.md fed into the CLAUDE.md {{{workflowSection}}} slot.
// Kept a plain string alias in v1.12 #23 (only 'engineering-full' ships); #26 adds the
// other presets + the wizard/--workflow selection that narrows how this is chosen.
export type WorkflowPresetId = string;

export interface ProfileDef {
  name: string;                  // 'next' | 'flutter' | …
  description: string;           // human-readable
  templateDir: string;           // absolute path to templates/<name>
  extraMcp: string[];            // names of MCP servers added on top of _shared
  minClaudeCodeVersion?: string; // v1.9.0 — WARN if `claude --version` < this. Semver-lite.
  // v1.11 (#9) — which AGENTS.md variant to emit. Default (undefined) = engineering
  // (the original _shared/AGENTS.md, byte-identical). 'doc-first' emits
  // _shared/AGENTS.doc-first.md for non-code-writing roles (ba/hr/pm/tech-writer/data).
  ruleFamily?: RuleFamily;
  // v1.11 (#14) — auto-attach the governance/data-handling POLICY.md for roles that
  // routinely touch sensitive data (hr = CVs/PII, data-analytics = source data). Users
  // of other profiles opt in with --policy.
  autoPolicy?: boolean;
  // v1.12 (#23) — which workflow preset this role recommends for the CLAUDE.md
  // {{{workflowSection}}} slot. Default (undefined) resolves to 'engineering-full'
  // (the original 7-phase Superpowers text, byte-identical). Doc-first roles will point
  // this at people-lifecycle / exec-decision / etc. as those presets ship (#26, #31).
  recommendedWorkflow?: WorkflowPresetId;
}

/** v1.11 (#10) — options threaded into enumeration (multi-profile + opt-in packs). */
export interface EnumerateOptions {
  policy?: boolean;              // emit the governance POLICY.md pack
}

export interface FileEntry {
  srcAbs: string;                // absolute source path inside templates/
  relPath: string;               // path relative to project cwd (after .hbs stripped)
  isTemplate: boolean;           // ends with .hbs
  kind: FileKind;
  extraSrcAbs?: string;          // for marker-merge: a second partial concatenated under {{profileSection}}
  // v1.11 (#10) — multi-profile composition. When set, render concatenates ALL these
  // profile partials (each under its own sub-heading) in place of the single extraSrcAbs.
  // Single-profile installs never set this — their path is unchanged.
  extraSrcList?: string[];
  // v1.12 (#23) — absolute path to the resolved workflow preset file whose (trailing-
  // newline-stripped) content fills the CLAUDE.md {{{workflowSection}}} slot. Only the
  // CLAUDE.md marker entry sets this; other entries leave it undefined.
  workflowSrc?: string;
}

export type ConflictState = 'absent' | 'identical' | 'differs';

export type ConflictReport = Map<string, ConflictState>;

export interface PlannedOp {
  relPath: string;
  src: FileEntry;
  conflict: ConflictState;
  op: 'write' | 'skip' | 'mkdir' | 'merge-marker' | 'merge-json' | 'merge-lines';
  reason: string;                // for logging (human-readable, not for control flow)
  needsPrompt: boolean;          // if true, execute.ts asks user before writing
}

export interface OperationPlan {
  cwd: string;
  profile: ProfileDef;
  ops: PlannedOp[];
  // true if .git directory detected in cwd at plan-build time
  hasGit: boolean;
}

export interface RenderContext {
  scaffoldVersion: string;
  profile: string;
  cwd: string;
  projectName: string;
  year: number;
  date: string;
  isWindows: boolean;
  profileSection?: string;       // populated for marker-merge to feed shared partial's {{#if profileSection}} slot
  workflowSection?: string;      // v1.12 (#23) — fills the shared partial's {{{workflowSection}}} slot
}
