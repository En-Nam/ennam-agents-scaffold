import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { confirm, isCancel, cancel } from '@clack/prompts';
import type { PlannedOp, RenderContext } from './types.js';
import { renderString, renderJsonContent } from './render.js';
import { mergeMarker } from './merge/marker.js';
import { mergeJson } from './merge/json.js';
import { backupFile, newSessionId } from './backup.js';

export interface ExecuteInput {
  cwd: string;
  ops: PlannedOp[];
  ctx: RenderContext;
  interactive: boolean;  // false in CI/test; true for normal runs (enables ask prompt)
}

export interface ExecuteResult {
  written: number;
  skipped: number;
  mkdirs: number;
}

async function maybeRender(op: PlannedOp, ctx: RenderContext): Promise<string> {
  const raw = await readFile(op.src.srcAbs, 'utf8');
  if (!op.src.extraSrcAbs) {
    return op.src.isTemplate ? renderString(raw, ctx) : raw;
  }
  // Combine shared partial + profile partial via the `profileSection` Handlebars slot.
  const profileRaw = await readFile(op.src.extraSrcAbs, 'utf8');
  const profileRendered = renderString(profileRaw, ctx);
  const extendedCtx = { ...ctx, profileSection: profileRendered };
  return renderString(raw, extendedCtx as RenderContext);
}

async function promptOverwrite(relPath: string): Promise<boolean> {
  const ans = await confirm({
    message: `File exists and differs: ${relPath}. Overwrite?`,
    initialValue: false,
  });
  if (isCancel(ans)) {
    cancel('Aborted by user.');
    process.exit(1);
  }
  return ans === true;
}

export async function executeOps(input: ExecuteInput): Promise<ExecuteResult> {
  const result: ExecuteResult = { written: 0, skipped: 0, mkdirs: 0 };
  const session = newSessionId();

  for (const op of input.ops) {
    const target = path.join(input.cwd, op.relPath);

    if (op.op === 'skip') {
      result.skipped++;
      continue;
    }
    if (op.op === 'mkdir') {
      await mkdir(target, { recursive: true });
      result.mkdirs++;
      continue;
    }
    if (op.op === 'merge-marker') {
      await mkdir(path.dirname(target), { recursive: true });
      let existing = '';
      try {
        existing = await readFile(target, 'utf8');
        if (existing.length > 0) await backupFile(input.cwd, op.relPath, session);
      } catch {
        // file doesn't exist — fine
      }
      // Strip trailing newline from block before merging — mergeMarker is idempotent
      // only when block does not end with \n (the engine appends its own trailing \n).
      const block = (await maybeRender(op, input.ctx)).replace(/\n$/, '');
      const merged = mergeMarker(existing, block);
      await writeFile(target, merged, 'utf8');
      result.written++;
      continue;
    }
    if (op.op === 'merge-json') {
      await mkdir(path.dirname(target), { recursive: true });
      let existingObj: Record<string, unknown> = {};
      let existed = false;
      try {
        const existingText = await readFile(target, 'utf8');
        if (existingText.trim().length > 0) {
          existingObj = JSON.parse(existingText) as Record<string, unknown>;
          existed = true;
        }
      } catch {
        // file doesn't exist — fine
      }
      if (existed) await backupFile(input.cwd, op.relPath, session);

      const scaffoldObj = await renderJsonContent(op.src, input.ctx);
      const merged = mergeJson(
        existingObj as Parameters<typeof mergeJson>[0],
        scaffoldObj as Parameters<typeof mergeJson>[0],
      );
      await writeFile(target, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      result.written++;
      continue;
    }
    // op === 'write'
    if (op.needsPrompt && input.interactive) {
      const yes = await promptOverwrite(op.relPath);
      if (!yes) {
        result.skipped++;
        continue;
      }
    }
    await mkdir(path.dirname(target), { recursive: true });
    const content = await maybeRender(op, input.ctx);
    await writeFile(target, content, 'utf8');
    result.written++;
  }
  return result;
}
