import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';

// v1.15 — `automation` is an add-on: one role + automation must install the role EXACTLY
// as if alone (a wizard "Yes" must never cost the user their role's setup or next steps),
// plus three guidance files. See mem:decisions/automation-profile-v1.15.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');
const ADDON_FILES = ['.claude/skills/ennam-automation/SKILL.md', '.claude/loop.md', 'docs/agents-scaffold/automation.md'];

async function install(cwd: string, profiles: string[]) {
  return execa('node', [CLI_ENTRY, ...profiles, '--merge-strategy=overwrite', '--no-prompts'], { cwd });
}
async function fresh() {
  const { path: cwd } = await tmpDir({ unsafeCleanup: true });
  await execa('git', ['init', '-q'], { cwd });
  return cwd;
}
const exists = (p: string) => access(p).then(() => true, () => false);
const read = (cwd: string, rel: string) => readFile(path.join(cwd, rel), 'utf8');
const tree = (cwd: string) => fg('**/*', { cwd, dot: true, onlyFiles: true, ignore: ['.git/**'] });

describe('install automation add-on', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  for (const role of ['next', 'hr']) {
    it(`${role} + automation installs ${role} byte-identically, plus the 3 guidance files`, async () => {
      const withAddon = await fresh();
      const alone = await fresh();
      expect((await install(withAddon, [role, 'automation'])).exitCode).toBe(0);
      await install(alone, [role]);
      // Whole tree: the ONLY difference is the add-on's files.
      const aloneFiles = await tree(alone);
      expect((await tree(withAddon)).sort()).toEqual([...aloneFiles, ...ADDON_FILES].sort());
      // .mcp.json embeds the install dir (serena --project <cwd>) — normalize only that.
      const norm = async (cwd: string, rel: string) => (await read(cwd, rel)).split(JSON.stringify(cwd).slice(1, -1)).join('<CWD>');
      for (const rel of aloneFiles) {
        expect(await norm(withAddon, rel), rel).toBe(await norm(alone, rel));
      }
    });
  }

  it('keeps role-specific next steps (game-unity licence warning) and adds the automation step', async () => {
    const { stdout } = await install(await fresh(), ['game-unity', 'automation']);
    expect(stdout).toMatch(/Tripo3D asset-pipeline skill DEFAULTS to --dry-run/);
    expect(stdout).toMatch(/Automation guidance installed/);
  });

  it('keeps the agent-org cost disclosure when automation is added', async () => {
    const { stdout } = await install(await fresh(), ['agent-org', 'automation']);
    expect(stdout).toMatch(/COST DISCLOSURE/);
  });

  it('in a multi-role compose, automation does not flip doc-first roles to engineering', async () => {
    const cwd = await fresh();
    const { stdout } = await install(cwd, ['ba', 'pm', 'automation']);
    expect(await read(cwd, 'AGENTS.md')).toContain('Think Before Drafting');
    for (const rel of ADDON_FILES) expect(await exists(path.join(cwd, rel)), rel).toBe(true);
    expect(stdout).toMatch(/Automation guidance installed/);
  });

  it('a user-edited .claude/loop.md survives a re-run, even with --merge-strategy=overwrite', async () => {
    const cwd = await fresh();
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    await writeFile(path.join(cwd, '.claude', 'loop.md'), 'my own loop prompt\n');
    await install(cwd, ['next', 'automation']);
    expect(await read(cwd, '.claude/loop.md')).toBe('my own loop prompt\n');
  });

  it('works standalone and is idempotent', async () => {
    const cwd = await fresh();
    const first = await install(cwd, ['automation']);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toMatch(/Automation guidance installed/);
    const second = await install(cwd, ['automation']);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toMatch(/Written:\s*0/);
  });

  for (const role of ['next', 'hr']) {
    it(`${role} (no add-on) gitignores the runtime .claude/scheduled_tasks.json`, async () => {
      const cwd = await fresh();
      await install(cwd, [role]);
      expect(await read(cwd, '.gitignore')).toContain('.claude/scheduled_tasks.json');
    });
  }
});
