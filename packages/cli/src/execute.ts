import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { confirm, isCancel, cancel } from '@clack/prompts';
import type { PlannedOp, RenderContext } from './types.js';
import { renderString } from './render.js';

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

async function readSource(op: PlannedOp): Promise<string> {
  return readFile(op.src.srcAbs, 'utf8');
}

async function maybeRender(op: PlannedOp, ctx: RenderContext): Promise<string> {
  const raw = await readSource(op);
  return op.src.isTemplate ? renderString(raw, ctx) : raw;
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
