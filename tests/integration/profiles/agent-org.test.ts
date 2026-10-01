import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

// v1.14 — agent-org must install ready to run: dynamic workflows on disk byte-for-byte,
// SubagentStop + isolatePeerMachines merged into settings.json (no manual paste step),
// and a loud warning when the user's own SubagentStop blocks ours.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');
const WF_SRC = path.join(REPO_ROOT, 'templates', 'agent-org', '.claude', 'workflows');

async function install(cwd: string) {
  await execa('git', ['init', '-q'], { cwd });
  return execa('node', [CLI_ENTRY, 'agent-org', '--merge-strategy=skip', '--no-prompts'], { cwd });
}

describe('install agent-org profile', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('copies the 3 workflow scripts verbatim (no Handlebars rendering of ${...})', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    expect((await install(cwd)).exitCode).toBe(0);
    const files = (await readdir(path.join(cwd, '.claude', 'workflows'))).sort();
    expect(files).toEqual(['fix-loop.js', 'judge-panel.js', 'review-changes.js']);
    for (const f of files) {
      const installed = await readFile(path.join(cwd, '.claude', 'workflows', f), 'utf8');
      expect(installed).toBe(await readFile(path.join(WF_SRC, f), 'utf8'));
    }
  });

  it('merges SubagentStop + isolatePeerMachines into settings.json alongside the shared SessionStart', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    const { stdout } = await install(cwd);
    const settings = JSON.parse(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8'));
    expect(settings.isolatePeerMachines).toBe(true);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toMatch(/session-start\.(ps1|sh)/);
    expect(settings.hooks.SubagentStop[0].hooks[0].command).toMatch(/subagent-log\.(ps1|sh)/);
    // The v1.9 manual paste instruction is gone.
    expect(stdout).not.toMatch(/paste this into your `hooks` object/);
    expect(stdout).not.toMatch(/did NOT add its own entry/);
  });

  it('warns (Rule 12) when the user already owns SubagentStop, and keeps the user hook', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    const mine = { hooks: { SubagentStop: [{ hooks: [{ type: 'command', command: 'node my-hook.js' }] }] } };
    await writeFile(path.join(cwd, '.claude', 'settings.json'), JSON.stringify(mine, null, 2));
    const { stdout } = await install(cwd);
    expect(stdout).toMatch(/did NOT add its own entry/);
    // Printed entry must be the real nested settings shape, so pasting it actually works.
    expect(stdout).toMatch(/Append to the hooks\.SubagentStop array: \{ "hooks": \[ \{ "type": "command", "command": "[^"]*subagent-log\.(ps1|sh)" \} \] \}/);
    const settings = JSON.parse(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8'));
    expect(settings.hooks.SubagentStop[0].hooks[0].command).toBe('node my-hook.js');
    expect(settings.isolatePeerMachines).toBe(true);
  });

  it('aborts with exit 2 and leaves an unparseable settings.json untouched (no silent overwrite)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    const broken = '{ "hooks": { // a comment, not JSON\n} }';
    await writeFile(path.join(cwd, '.claude', 'settings.json'), broken);
    await execa('git', ['init', '-q'], { cwd });
    const r = await execa('node', [CLI_ENTRY, 'agent-org', '--merge-strategy=skip', '--no-prompts'], { cwd, reject: false });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/\.claude\/settings\.json is not valid JSON/);
    expect(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8')).toBe(broken);
  });
});

