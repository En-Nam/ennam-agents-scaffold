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

    // append-marker is handled the same regardless of conflict state (except identical → skip)
    if (e.kind === 'append-marker') {
      if (state === 'identical') {
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'skip', reason: 'identical — skip', needsPrompt: false });
      } else {
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'merge-marker', reason: state === 'absent' ? 'absent — write marker block' : 'differs — merge marker block', needsPrompt: false });
      }
      continue;
    }

    // json-merge is handled regardless of conflict state (except identical → skip).
    // All states use merge-json op so execute.ts always writes JSON.stringify output,
    // keeping provider and execute in sync for idempotency.
    if (e.kind === 'json-merge') {
      if (state === 'identical') {
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'skip', reason: 'identical — skip', needsPrompt: false });
      } else {
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'merge-json', reason: state === 'absent' ? 'absent — write json' : 'differs — deep-merge (user wins)', needsPrompt: false });
      }
      continue;
    }

    // append-lines is handled regardless of conflict state (except identical → skip).
    // mergeLines(existing, incoming) handles absent files (existing='') naturally.
    if (e.kind === 'append-lines') {
      if (state === 'identical') {
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'skip', reason: 'identical — skip', needsPrompt: false });
      } else {
        ops.push({ relPath: e.relPath, src: e, conflict: state, op: 'merge-lines', reason: state === 'absent' ? 'absent — write lines' : 'differs — append missing lines (dedup)', needsPrompt: false });
      }
      continue;
    }

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
