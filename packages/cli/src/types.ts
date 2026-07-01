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

export interface ProfileDef {
  name: string;                  // 'next' | 'flutter' | …
  description: string;           // human-readable
  templateDir: string;           // absolute path to templates/<name>
  extraMcp: string[];            // names of MCP servers added on top of _shared
  minClaudeCodeVersion?: string; // v1.9.0 — WARN if `claude --version` < this. Semver-lite.
}

export interface FileEntry {
  srcAbs: string;                // absolute source path inside templates/
  relPath: string;               // path relative to project cwd (after .hbs stripped)
  isTemplate: boolean;           // ends with .hbs
  kind: FileKind;
  extraSrcAbs?: string;          // for marker-merge: a second partial concatenated under {{profileSection}}
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
}
