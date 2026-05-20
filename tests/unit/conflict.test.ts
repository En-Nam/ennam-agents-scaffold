import { describe, it, expect } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { scanConflicts } from '../../packages/cli/src/conflict.js';

describe('scanConflicts', () => {
  it('marks files absent when cwd is empty', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const report = await scanConflicts(cwd, ['AGENTS.md', '.claude/settings.json']);
    expect(report.get('AGENTS.md')).toBe('absent');
    expect(report.get('.claude/settings.json')).toBe('absent');
  });

  it('marks files as differs when content does not match', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(path.join(cwd, 'AGENTS.md'), 'existing content');
    const report = await scanConflicts(cwd, ['AGENTS.md']);
    expect(report.get('AGENTS.md')).toBe('differs');
  });

  it('marks files as identical when content matches', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const content = 'same content';
    await writeFile(path.join(cwd, 'AGENTS.md'), content);
    const report = await scanConflicts(cwd, ['AGENTS.md'], async (rel) => {
      if (rel === 'AGENTS.md') return content;
      return null;
    });
    expect(report.get('AGENTS.md')).toBe('identical');
  });

  it('handles nested paths', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    await writeFile(path.join(cwd, '.claude', 'settings.json'), '{}');
    const report = await scanConflicts(cwd, ['.claude/settings.json']);
    expect(report.get('.claude/settings.json')).toBe('differs');
  });
});
