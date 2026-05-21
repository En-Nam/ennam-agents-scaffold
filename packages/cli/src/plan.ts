import type { FileEntry, PlannedOp, UserStrategy, ConflictReport } from './types.js';

export interface BuildPlanInput {
  entries: FileEntry[];
  conflicts: ConflictReport;
  strategy: UserStrategy;
}

export function buildPlan(input: BuildPlanInput): PlannedOp[] {
  const ops: PlannedOp[] = [];
  for (const e of input.entries) {
    const state = input.conflicts.get(e.relPath) ?? 'absent';

    if (state === 'absent') {
      ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'write', reason: 'absent — write', needsPrompt: false });
      continue;
    }
    if (state === 'identical') {
      ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'skip', reason: 'identical — skip', needsPrompt: false });
      continue;
    }
    // state === 'differs'
    if (e.kind === 'skip-if-exists') {
      ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'skip', reason: 'skip-if-exists kind', needsPrompt: false });
      continue;
    }
    if (e.kind === 'mkdir-only') {
      ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'mkdir', reason: 'mkdir-only kind', needsPrompt: false });
      continue;
    }
    if (e.kind === 'append-marker' || e.kind === 'append-lines' || e.kind === 'json-merge') {
      throw new Error(`File kind "${e.kind}" for ${e.relPath} is not supported in Plan 1 (deferred to Plan 2)`);
    }
    // write-or-ask
    switch (input.strategy) {
      case 'overwrite':
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'write', reason: 'differs — overwrite (--merge-strategy=overwrite)', needsPrompt: false });
        break;
      case 'skip':
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'skip', reason: 'differs — keep existing (--merge-strategy=skip)', needsPrompt: false });
        break;
      case 'ask':
      default:
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'write', reason: 'differs — will prompt at execute time', needsPrompt: true });
        break;
    }
  }
  return ops;
}
