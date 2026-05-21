export type FileKind =
  | 'write-or-ask'        // write if absent; classify-default 'ask' if exists
  | 'append-marker'       // Plan 2 — placeholder for now
  | 'append-lines'        // Plan 2
  | 'json-merge'          // Plan 2
  | 'skip-if-exists'      // never overwrite
  | 'mkdir-only';         // create empty dir + .gitkeep

export type UserStrategy = 'ask' | 'skip' | 'overwrite' | 'append' | 'json-merge';
// Plan 2 added: 'append' (force append-marker / append-lines), 'json-merge' (force JSON merge).
// 'edit' was dropped — auto-backup covers manual-review use case.

export interface ProfileDef {
  name: string;                  // 'next' | 'flutter' | …
  description: string;           // human-readable
  templateDir: string;           // absolute path to templates/<name>
  extraMcp: string[];            // names of MCP servers added on top of _shared
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
  op: 'write' | 'skip' | 'mkdir' | 'merge-marker' | 'merge-json';
  reason: string;                // for logging (human-readable, not for control flow)
  needsPrompt: boolean;          // if true, execute.ts asks user before writing
}

export interface OperationPlan {
  cwd: string;
  profile: ProfileDef;
  ops: PlannedOp[];
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
