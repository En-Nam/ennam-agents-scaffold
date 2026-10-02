import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { getProfile } from '../../../packages/cli/src/profiles.js';
import { VERSION, nodeTooOld } from '../../../templates/showreel/.claude/showreel/lib/util/version.mjs';

// v1.16 — `showreel` is an add-on: one role + showreel must install the role EXACTLY as if
// alone (no CLAUDE.md / AGENTS.md / settings change — no core change, AC6), plus the
// toolkit tree and its runbook. See mem:decisions/showreel-addon-v1.16.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');
const GOLDEN = path.join(REPO_ROOT, 'tests', 'fixtures', 'claude-shared-block-engineering.golden.md');

let SHOWREEL_FILES: string[] = [];
// M3 — installed outside .claude/showreel/ but upgraded with it (B4, classify pins).
const AGENT_AND_SKILL = ['.claude/agents/motion-designer.md', '.claude/skills/showreel/SKILL.md'];
// Installed copies of the template, byte for byte (everything except the profile README, which is renamed).
const fromTemplate = () => SHOWREEL_FILES.filter(r => r !== 'docs/agents-scaffold/showreel.md');
// The toolkit runtime refuses Node < 22.12 (P1); the scaffold's own CI may run Node 20.
const TOOLKIT_NODE_OK = !nodeTooOld(process.versions.node);
const runToolkit = (cwd: string, args: string[]) =>
  execa('node', [path.join(cwd, '.claude', 'showreel', 'cli.mjs'), ...args], { cwd, reject: false });

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
    SHOWREEL_FILES = [...toolkit.map(r => `.claude/showreel/${r}`), ...AGENT_AND_SKILL, 'docs/agents-scaffold/showreel.md'].sort();
  });

  it('SHOWREEL_FILES covers the toolkit skeleton, the motion-designer agent and the /showreel skill', () => {
    for (const rel of [
      ...AGENT_AND_SKILL,
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
    for (const rel of AGENT_AND_SKILL) expect(packed).toContain(`templates/showreel/${rel}`);
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
      // The toolkit, agent and skill land byte-identical to the template (text-only installer, no rendering).
      for (const rel of fromTemplate()) {
        expect(await read(withAddon, rel), rel).toBe(await readFile(path.join(REPO_ROOT, 'templates', 'showreel', rel), 'utf8'));
      }
    }, 60_000);
  }

  it('prints the showreel next step', async () => {
    const { stdout } = await install(await fresh(), ['next', 'showreel']);
    expect(stdout).toMatch(/Showreel toolkit installed at \.claude\/showreel\//);
    expect(stdout).toMatch(/node \.claude\/showreel\/cli\.mjs preflight/);
    // Same wording as the README THIRD-PARTY table: puppeteer-core drives the installed browser, nothing Chrome-ish is downloaded.
    // Measured first-run download (M3), same wording as the README THIRD-PARTY table: puppeteer-core
    // drives the installed browser, nothing Chrome-ish is downloaded.
    expect(stdout).toContain('~111 MB (puppeteer-core, ffmpeg, fonts)');
    expect(stdout).not.toContain('~200 MB');
    expect(stdout).not.toMatch(/Chrome driver/i);
  });

  // M3 — the /showreel skill ships now, so user-facing text (--list / wizard description, next steps,
  // README) must name it, and keep the node .claude/showreel/cli.mjs runbook path for manual runs.
  it('user-facing text names the shipped /showreel skill and the node .claude/showreel/cli.mjs runbook path', async () => {
    const ships = await fg(['.claude/skills/showreel/SKILL.md'], { cwd: path.join(REPO_ROOT, 'templates', 'showreel'), dot: true });
    expect(ships).toEqual(['.claude/skills/showreel/SKILL.md']);
    const SLASH = /(^|[\s(`'"—])\/showreel\b/;
    const description = getProfile('showreel').description;
    const readme = await readFile(path.join(REPO_ROOT, 'templates', 'showreel', 'README.md'), 'utf8');
    const { stdout } = await install(await fresh(), ['next', 'showreel']);
    for (const [where, text] of [['description', description], ['README', readme], ['next steps', stdout]] as const) {
      expect(text, where).toMatch(SLASH);
      expect(text, where).toContain('node .claude/showreel/cli.mjs');
      expect(text, where).not.toContain('~200 MB');
    }
  });

  // B4: toolkit + agent + skill upgrade as one unit. A stale toolkit file AND a stale motion-designer
  // agent are both replaced by --merge-strategy=overwrite. Without the classify pins the agent would
  // be skip-if-exists (generic .claude/agents/ rule) and stay stale — this case would fail.
  it('upgrade: a stale toolkit file and a stale motion-designer agent are restored by --merge-strategy=overwrite', async () => {
    const cwd = await fresh();
    expect((await install(cwd, ['next', 'showreel'])).exitCode).toBe(0);
    const stale = ['.claude/showreel/lib/render/policy.mjs', '.claude/agents/motion-designer.md', '.claude/skills/showreel/SKILL.md'];
    const templates = await Promise.all(stale.map(rel => readFile(path.join(REPO_ROOT, 'templates', 'showreel', rel), 'utf8')));
    for (const [i, rel] of stale.entries()) {
      await writeFile(path.join(cwd, rel), templates[i]!.replaceAll(VERSION, '0.9.0') + '\n<!-- older toolkit -->\n');
    }
    expect((await install(cwd, ['next', 'showreel'])).exitCode).toBe(0);
    for (const [i, rel] of stale.entries()) expect(await read(cwd, rel), rel).toBe(templates[i]);
  }, 60_000);

  // B4 handshake: the agent/skill pass `--expect <their version>`; a skewed toolkit refuses BEFORE any
  // side effect and gives the exact scoped re-run command.
  it.skipIf(!TOOLKIT_NODE_OK)('installed toolkit: preflight --expect <other version> fails E_VERSION with the re-run command, before any side effect', async () => {
    const cwd = await fresh();
    expect((await install(cwd, ['next', 'showreel'])).exitCode).toBe(0);
    const r = await runToolkit(cwd, ['preflight', '--expect', '0.9.0']);
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.error.code).toBe('E_VERSION');
    expect(out.error.message).toContain(`Toolkit is ${VERSION} but 0.9.0 is required`);
    expect(out.error.fix).toContain('showreel --merge-strategy=overwrite');
    // refused before any side effect: no .tool install, no nested .gitignore written
    expect(await fg(['.claude/showreel/.tool/**', '.claude/showreel/.gitignore', 'showreel/**'], { cwd, dot: true })).toEqual([]);
  }, 60_000);

  // D4 / AC5 refusal evidence: a doc-first role has no code facts, so `facts` refuses loudly and
  // names the missing kinds instead of inventing a film.
  it.skipIf(!TOOLKIT_NODE_OK)('hr + showreel: facts refuses with E_THIN_REPO naming the missing fact kinds', async () => {
    const cwd = await fresh();
    expect((await install(cwd, ['hr', 'showreel'])).exitCode).toBe(0);
    const r = await runToolkit(cwd, ['facts']);
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.error.code).toBe('E_THIN_REPO');
    expect(out.error.message).toMatch(/missing \S/);
    const facts = JSON.parse(await read(cwd, 'showreel/facts.json'));
    expect(facts.minimumGate.passed).toBe(false);
    expect(facts.minimumGate.missing.length).toBeGreaterThan(0);
    for (const kind of facts.minimumGate.missing) expect(out.error.message).toContain(kind);
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
