import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('Superpowers plugin wiring in .claude/settings.json', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  }, 120_000);

  it('fresh install emits enabledPlugins["superpowers@claude-plugins-official"]: true', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    const { exitCode, stdout } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const settings = JSON.parse(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8'));
    // The 14 superpowers:* references in CLAUDE.md.partial.hbs only resolve if this key
    // is present — closing the audit's "contract mismatch" gap (see decisions/superpowers-plugin-strategy).
    expect(settings.enabledPlugins).toBeDefined();
    expect(settings.enabledPlugins['superpowers@claude-plugins-official']).toBe(true);

    // session-start hook is wired so Claude (and the user) see the manual-install fallback every session.
    const hookPs1 = await readFile(path.join(cwd, '.claude', 'hooks', 'session-start.ps1'), 'utf8');
    const hookSh = await readFile(path.join(cwd, '.claude', 'hooks', 'session-start.sh'), 'utf8');
    expect(hookPs1).toContain('/plugin install superpowers@claude-plugins-official');
    expect(hookSh).toContain('/plugin install superpowers@claude-plugins-official');

    // Next-steps output tells the user about the trust prompt + headless workaround
    // even in --no-prompts mode (Rule 12 — fail loud, do not silently rely on the trust dialog).
    expect(stdout).toContain('superpowers@claude-plugins-official');
  }, 60_000);

  it('preserves user-defined enabledPlugins while adding superpowers (deep merge, user-wins)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    // User pre-existing settings.json with a different plugin enabled AND a non-default model.
    // mergeJson is user-wins on scalars, so the user's `model` must survive; the scaffold's
    // `enabledPlugins` entry must be added without clobbering the user's.
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    const userSettings = {
      model: 'claude-sonnet-4-6',
      enabledPlugins: {
        'my-plugin@my-marketplace': true,
      },
    };
    await writeFile(path.join(cwd, '.claude', 'settings.json'), JSON.stringify(userSettings, null, 2));

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const merged = JSON.parse(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8'));
    expect(merged.model).toBe('claude-sonnet-4-6');                              // user wins on scalar
    expect(merged.enabledPlugins['my-plugin@my-marketplace']).toBe(true);        // user entry preserved
    expect(merged.enabledPlugins['superpowers@claude-plugins-official']).toBe(true);  // scaffold entry added
  }, 60_000);

  it('fresh install does NOT introduce a hardcoded `model` field (regression: issue #3)', async () => {
    // Issue #3: hard-coding `"model": "claude-opus-4-7"` in the template polluted
    // every project's `.claude/settings.json` — users on the global default got
    // pinned to opus-4-7, and `mergeJson` (user-wins on scalars) only protected
    // users who had ALREADY set their own value. Let Claude Code's own
    // resolution chain (global > project) decide; the scaffold must not opt in.
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const settings = JSON.parse(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8'));
    expect(settings.model).toBeUndefined();
  }, 60_000);

  it('respects an explicit user opt-out (enabledPlugins[superpowers] = false survives)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('git', ['init', '-q'], { cwd });

    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    const userSettings = {
      enabledPlugins: {
        'superpowers@claude-plugins-official': false,
      },
    };
    await writeFile(path.join(cwd, '.claude', 'settings.json'), JSON.stringify(userSettings, null, 2));

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const merged = JSON.parse(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8'));
    // mergeJson is user-wins: explicit `false` is preserved over scaffold's `true`.
    expect(merged.enabledPlugins['superpowers@claude-plugins-official']).toBe(false);
  }, 60_000);
});
