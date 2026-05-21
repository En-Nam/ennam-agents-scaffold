import { describe, it, expect } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { writeFile, readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { backupFile, rotateBackups, BACKUP_DIR } from '../../packages/cli/src/backup.js';

describe('backup', () => {
  it('copies file content into .ennam-scaffold-backup/<timestamp>/', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(path.join(cwd, 'CLAUDE.md'), 'original content', 'utf8');

    const backupPath = await backupFile(cwd, 'CLAUDE.md');

    expect(backupPath).toContain(BACKUP_DIR);
    expect(backupPath).toContain('CLAUDE.md');
    const restored = await readFile(backupPath, 'utf8');
    expect(restored).toBe('original content');
  });

  it('preserves directory structure in backup', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    await writeFile(path.join(cwd, '.claude', 'settings.json'), '{"x":1}', 'utf8');

    const backupPath = await backupFile(cwd, '.claude/settings.json');

    expect(backupPath).toMatch(/\.claude[\\/]settings\.json$/);
    const restored = await readFile(backupPath, 'utf8');
    expect(restored).toBe('{"x":1}');
  });

  it('uses the same timestamp dir for multiple files in one run', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(path.join(cwd, 'a.txt'), 'A', 'utf8');
    await writeFile(path.join(cwd, 'b.txt'), 'B', 'utf8');

    const session = `session-${Date.now()}`;
    const aBack = await backupFile(cwd, 'a.txt', session);
    const bBack = await backupFile(cwd, 'b.txt', session);

    expect(path.dirname(aBack)).toBe(path.dirname(bBack));
  });

  it('rotates to keep only the 3 newest session dirs', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const root = path.join(cwd, BACKUP_DIR);
    await mkdir(root, { recursive: true });
    // Create 5 fake sessions (alphabetical order = creation order via padded numbers)
    for (const s of ['001', '002', '003', '004', '005']) {
      await mkdir(path.join(root, s), { recursive: true });
      await writeFile(path.join(root, s, 'marker'), s, 'utf8');
    }

    await rotateBackups(cwd, 3);

    const remaining = (await readdir(root)).sort();
    expect(remaining).toEqual(['003', '004', '005']);
  });

  it('rotateBackups is a no-op if backup root does not exist', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await expect(rotateBackups(cwd, 3)).resolves.toBeUndefined();
  });
});
