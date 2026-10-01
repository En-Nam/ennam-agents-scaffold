import { describe, it, expect } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { executeOps } from '../../packages/cli/src/execute.js';
import type { PlannedOp, FileEntry, RenderContext } from '../../packages/cli/src/types.js';

// v1.14 — before this fix, a JSON.parse failure inside execute's merge-json fell into a
// "file doesn't exist" catch: no backup, and the user's settings were REPLACED by the
// scaffold JSON. The plan stage now aborts first, but execute must never fall back to
// overwriting on its own (defense in depth) — this test pins that independently.

const ctx: RenderContext = {
  scaffoldVersion: '0.0.0', profile: 'next', cwd: '<per test>', projectName: 'test',
  year: 2026, date: '2026-10-01', isWindows: process.platform === 'win32',
};

describe('executeOps merge-json over unparseable JSON', () => {
  it('rejects and leaves the file byte-identical', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const src = path.join(cwd, 'scaffold-settings.json');
    await writeFile(src, '{ "hooks": {} }');
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    const target = path.join(cwd, '.claude', 'settings.json');
    const broken = '{ "permissions": { // comment\n} }';
    await writeFile(target, broken);

    const entry: FileEntry = { srcAbs: src, relPath: '.claude/settings.json', isTemplate: false, kind: 'json-merge' };
    const ops: PlannedOp[] = [{
      relPath: '.claude/settings.json', src: entry, conflict: 'differs', op: 'merge-json', reason: 'test', needsPrompt: false,
    }];

    await expect(executeOps({ cwd, ops, ctx: { ...ctx, cwd }, interactive: false })).rejects.toThrow(SyntaxError);
    expect(await readFile(target, 'utf8')).toBe(broken);
  });
});
