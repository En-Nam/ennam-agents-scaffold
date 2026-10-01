import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { getProfile } from '../../../packages/cli/src/profiles.js';

// v1.16 — `showreel` is an add-on: one role + showreel must install the role EXACTLY as if
// alone (no CLAUDE.md / AGENTS.md / settings change — no core change, AC6), plus the
// toolkit tree and its runbook. See mem:decisions/showreel-addon-v1.16.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');
const GOLDEN = path.join(REPO_ROOT, 'tests', 'fixtures', 'claude-shared-block-engineering.golden.md');

let SHOWREEL_FILES: string[] = [];

async function install(cwd: string, profiles: string[]) {
  return execa('node', [CLI_ENTRY, ...profiles, '--merge-strategy=overwrite', '--no-prompts'], { cwd });
}
async function fresh() {
  const { path: cwd } = await tmpDir({ unsafeCleanup: true });
  await execa('git', ['init', '-q'], { cwd });
  return cwd;
}
const read = (cwd: string, rel: string) => readFile(path.join(cwd, rel), 'utf8');
const tree = (cwd: string) => fg('**/*', { cwd, dot: true, onlyFiles: true, ignore: ['.git/**'] });

describe('install showreel add-on', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
    const toolkit = await fg('**/*', { cwd: path.join(REPO_ROOT, 'templates', 'showreel', '.claude', 'showreel'), dot: true, onlyFiles: true });
    SHOWREEL_FILES = [...toolkit.map(r => `.claude/showreel/${r}`), 'docs/agents-scaffold/showreel.md'].sort();
  });

  it('SHOWREEL_FILES covers the Task 1 skeleton', () => {
    for (const rel of [
      '.claude/showreel/cli.mjs',
      '.claude/showreel/deps/manifest.json',
      '.claude/showreel/deps/lock.json',
      '.claude/showreel/archetypes/archetypes.json',
      '.claude/showreel/schema/storyboard.schema.json',
      '.claude/showreel/render/browser.mjs',
    ]) expect(SHOWREEL_FILES).toContain(rel);
  });

  // B1 — nested files/dirs can be special-cased by npm pack; the tarball is the only
  // delivery channel, so every template file must survive packing. Runs after this
  // file's beforeAll build (packages/cli/templates is the tsup copy).
  it('npm pack keeps every file under templates/showreel/', async () => {
    const { stdout } = await execa('npm', ['pack', '--dry-run', '--json', '-w', '@ennamjsc/agents-scaffold'], { cwd: REPO_ROOT, shell: true });
    const packed = (JSON.parse(stdout) as { files: { path: string }[] }[])[0]!.files
      .map(f => f.path.replace(/\\/g, '/'))
      .filter(p => p.startsWith('templates/showreel/'))
      .sort();
    const expected = (await fg('**/*', { cwd: path.join(REPO_ROOT, 'templates', 'showreel'), dot: true })).map(r => `templates/showreel/${r}`).sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(packed).toEqual(expected);
  }, 60_000);

  for (const roles of [['next'], ['hr'], ['ba', 'pm']]) {
    it(`${roles.join(' ')} + showreel installs ${roles.join(' ')} byte-identically, plus exactly SHOWREEL_FILES`, async () => {
      const withAddon = await fresh();
      const alone = await fresh();
      expect((await install(withAddon, [...roles, 'showreel'])).exitCode).toBe(0);
      await install(alone, roles);
      const aloneFiles = await tree(alone);
      expect((await tree(withAddon)).sort()).toEqual([...aloneFiles, ...SHOWREEL_FILES].sort());
      // .mcp.json embeds the install dir (serena --project <cwd>) — normalize only that.
      const norm = async (cwd: string, rel: string) => (await read(cwd, rel)).split(JSON.stringify(cwd).slice(1, -1)).join('<CWD>');
      for (const rel of aloneFiles) {
        expect(await norm(withAddon, rel), rel).toBe(await norm(alone, rel));
      }
      // The toolkit lands byte-identical to the template (text-only installer, no rendering).
      for (const rel of SHOWREEL_FILES.filter(r => r.startsWith('.claude/showreel/'))) {
        expect(await read(withAddon, rel), rel).toBe(await readFile(path.join(REPO_ROOT, 'templates', 'showreel', rel), 'utf8'));
      }
    }, 60_000);
  }

  it('prints the showreel next step', async () => {
    const { stdout } = await install(await fresh(), ['next', 'showreel']);
    expect(stdout).toMatch(/Showreel toolkit installed at \.claude\/showreel\//);
    expect(stdout).toMatch(/node \.claude\/showreel\/cli\.mjs preflight/);
    // Same wording as the README THIRD-PARTY table: puppeteer-core drives the installed browser, nothing Chrome-ish is downloaded.
    expect(stdout).toContain('~200 MB (puppeteer-core, ffmpeg, fonts)');
    expect(stdout).not.toMatch(/Chrome driver/i);
  });

  // The /showreel skill is M3 (plan). Until a skill/command ships, user-facing text (--list / wizard
  // description, next steps, README) must point at the entry point that IS installed.
  it('user-facing text names node .claude/showreel/cli.mjs, never a /showreel command that is not installed', async () => {
    const shipsSlash = (await fg(['.claude/skills/showreel/**', '.claude/commands/showreel*'], { cwd: path.join(REPO_ROOT, 'templates', 'showreel'), dot: true })).length > 0;
    const SLASH = /(^|[\s(`'"—])\/showreel\b/;
    const description = getProfile('showreel').description;
    const readme = await readFile(path.join(REPO_ROOT, 'templates', 'showreel', 'README.md'), 'utf8');
    const { stdout } = await install(await fresh(), ['next', 'showreel']);
    expect(description).toContain('node .claude/showreel/cli.mjs');
    if (!shipsSlash) {
      expect(description).not.toMatch(SLASH);
      expect(readme).not.toMatch(SLASH);
      expect(stdout).not.toMatch(SLASH);
    }
  });

  // B4: the toolkit upgrades as one unit — a locally modified toolkit file is replaced by
  // --merge-strategy=overwrite. (classify.ts has an explicit `.claude/showreel/` → write-or-ask rule;
  // the default also yields write-or-ask, so this end-to-end case is what proves the contract —
  // a skip-if-exists classification would keep the stale file and fail here.)
  it('a modified .claude/showreel/*.mjs is restored to the template by a re-run with --merge-strategy=overwrite', async () => {
    const cwd = await fresh();
    expect((await install(cwd, ['next', 'showreel'])).exitCode).toBe(0);
    const rel = '.claude/showreel/lib/render/policy.mjs';
    const template = await readFile(path.join(REPO_ROOT, 'templates', 'showreel', rel), 'utf8');
    await writeFile(path.join(cwd, rel), template + '\n// local edit from an older toolkit\n');
    expect((await install(cwd, ['next', 'showreel'])).exitCode).toBe(0);
    expect(await read(cwd, rel)).toBe(template);
  }, 60_000);

  it('the shared CLAUDE.md block stays byte-identical to the golden (no core change)', async () => {
    const cwd = await fresh();
    await install(cwd, ['python', 'showreel']);
    const { version } = JSON.parse(await readFile(path.join(REPO_ROOT, 'packages', 'cli', 'package.json'), 'utf8'));
    const golden = (await readFile(GOLDEN, 'utf8')).replace('v0.0.0-test', `v${version}`);
    // The installed block = golden shared block + the role's partial, then the end marker.
    const sharedBlock = golden.slice(0, golden.indexOf('<!-- ennam-agents-scaffold:end -->'));
    expect(sharedBlock.length).toBeGreaterThan(1000);
    const claude = await read(cwd, 'CLAUDE.md');
    expect(claude).toContain(sharedBlock);
    expect(claude).not.toMatch(/showreel/i);
  });

  it('re-running the install is idempotent (second run writes nothing)', async () => {
    const cwd = await fresh();
    expect((await install(cwd, ['next', 'showreel'])).exitCode).toBe(0);
    const before = await Promise.all(SHOWREEL_FILES.map(rel => read(cwd, rel)));
    const second = await install(cwd, ['next', 'showreel']);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toMatch(/Written:\s*0/);
    expect(await Promise.all(SHOWREEL_FILES.map(rel => read(cwd, rel)))).toEqual(before);
  }, 60_000);
});
