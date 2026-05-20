import { describe, it, expect } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { executeOps } from '../../packages/cli/src/execute.js';
import type { PlannedOp, FileEntry, RenderContext } from '../../packages/cli/src/types.js';

const ctx: RenderContext = {
  scaffoldVersion: '0.0.0',
  profile: 'next',
  cwd: '<filled per test>',
  projectName: 'test',
  year: 2026,
  date: '2026-05-20',
  isWindows: process.platform === 'win32',
};

function ops(srcBase: string, cwd: string): PlannedOp[] {
  const entry: FileEntry = {
    srcAbs: path.join(srcBase, 'AGENTS.md'),
    relPath: 'AGENTS.md',
    isTemplate: false,
    kind: 'write-or-ask',
  };
  return [{ relPath: 'AGENTS.md', src: entry, conflict: 'absent', op: 'write', reason: 'absent — write' }];
}

describe('executeOps — empty cwd', () => {
  it('writes a file into cwd', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { path: src } = await tmpDir({ unsafeCleanup: true });
    // Seed source
    await (await import('node:fs/promises')).writeFile(path.join(src, 'AGENTS.md'), 'hello');
    await executeOps({ cwd, ops: ops(src, cwd), ctx: { ...ctx, cwd }, interactive: false });
    const written = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    expect(written).toBe('hello');
  });

  it('respects op=skip', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { path: src } = await tmpDir({ unsafeCleanup: true });
    await (await import('node:fs/promises')).writeFile(path.join(src, 'AGENTS.md'), 'hello');
    const skipOps: PlannedOp[] = [{ ...ops(src, cwd)[0]!, op: 'skip', reason: 'test' }];
    await executeOps({ cwd, ops: skipOps, ctx: { ...ctx, cwd }, interactive: false });
    await expect(stat(path.join(cwd, 'AGENTS.md'))).rejects.toThrow();
  });
});
