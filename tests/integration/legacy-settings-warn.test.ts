import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import stripAnsi from 'strip-ansi';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

/**
 * v1.5.1 regression — two contracts:
 *   1. Template ships the CORRECT shape (allow + nested hooks). Verifies the
 *      bug that caused "Expected array, but received undefined" in Claude Code
 *      cannot be re-introduced silently.
 *   2. Warner detects pre-1.5.1 broken installs (legacy additionalAllowList
 *      and bare hooks.SessionStart shape) and surfaces them on stdout. Since
 *      mergeJson is user-wins on arrays, the scaffold cannot auto-fix — warn
 *      is the only mitigation.
 */
describe('settings.json — template shape + legacy warner', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('fresh install ships permissions.allow (not additionalAllowList) and nested hooks.SessionStart', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const settings = JSON.parse(await readFile(path.join(cwd, '.claude/settings.json'), 'utf8'));

    // Permissions: new shape ships, legacy key does NOT.
    expect(settings.permissions).toBeDefined();
    expect(settings.permissions.allow).toEqual(expect.arrayContaining(['Bash(npm:*)', 'Bash(git:*)']));
    expect(settings.permissions.additionalAllowList).toBeUndefined();

    // Hooks: each SessionStart entry must have a nested `hooks` array of
    // `{type: "command", command: "..."}`. This is what Claude Code requires
    // (the missing nested array is what triggered the parse-error popup).
    const sessionStart = settings.hooks.SessionStart;
    expect(Array.isArray(sessionStart)).toBe(true);
    for (const entry of sessionStart) {
      expect(Array.isArray(entry.hooks)).toBe(true);
      for (const h of entry.hooks) {
        expect(h.type).toBe('command');
        expect(typeof h.command).toBe('string');
      }
      // Legacy bare `{command}` must NOT appear at the entry level.
      expect(entry.command).toBeUndefined();
    }
  });

  it('warns about legacy `additionalAllowList` when re-running over a pre-1.5.1 install', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    // Seed a pre-1.5.1 broken settings.json (the exact shape v1.0–1.5.0 shipped).
    await writeFile(
      path.join(cwd, '.claude/settings.json'),
      JSON.stringify({
        outputStyle: 'default',
        model: 'claude-opus-4-7',
        hooks: {
          SessionStart: [{ command: '.claude/hooks/session-start.sh' }],  // legacy bare shape
        },
        permissions: {
          additionalAllowList: ['Bash(npm:*)'],  // legacy key
        },
      }, null, 2),
    );

    const { stdout } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const out = stripAnsi(stdout);

    expect(out).toContain('legacy shapes Claude Code no longer accepts');
    expect(out).toContain('additionalAllowList');
    expect(out).toContain('hooks.SessionStart uses the legacy bare');
  });

  it('does NOT warn when the install is already correct shape', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    await writeFile(
      path.join(cwd, '.claude/settings.json'),
      JSON.stringify({
        permissions: { allow: ['Bash(npm:*)'] },
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: '.claude/hooks/session-start.sh' }] },
          ],
        },
      }, null, 2),
    );

    const { stdout } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const out = stripAnsi(stdout);

    expect(out).not.toContain('legacy shapes Claude Code no longer accepts');
  });
});
