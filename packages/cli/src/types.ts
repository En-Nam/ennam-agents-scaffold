export type FileKind =
  | 'write-or-ask'        // write if absent; classify-default 'ask' if exists
  | 'append-marker'       // Plan 2 — placeholder for now
  | 'append-lines'        // Plan 2
  | 'json-merge'          // Plan 2
  | 'skip-if-exists'      // never overwrite
  | 'mkdir-only';         // create empty dir + .gitkeep

export type UserStrategy = 'ask' | 'skip' | 'overwrite';
// Plan 2 will extend: | 'append' | 'json-merge' | 'edit'

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
}

export type ConflictState = 'absent' | 'identical' | 'differs';

export type ConflictReport = Map<string, ConflictState>;

export interface PlannedOp {
  relPath: string;
  src: FileEntry;
  conflict: ConflictState;
  op: 'write' | 'skip' | 'mkdir';
  reason: string;                // for logging
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
}
