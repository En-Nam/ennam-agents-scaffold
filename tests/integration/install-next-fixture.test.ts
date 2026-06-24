import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { cp, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'next-project');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

describe('install next profile into fixture', () => {
  beforeAll(async () => {
    // Ensure CLI is built before running smoke
    await execa('npm', ['-w', '@ennam/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('installs all expected files into cwd', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    // Required files
    const required = [
      'AGENTS.md',
      'CLAUDE.md',
      '.gitignore',
      '.claude/settings.json',
      '.claude/hooks/session-start.ps1',
      '.claude/hooks/session-start.sh',
      '.claude/commands/boot.md',
      '.claude/commands/checkpoint.md',
      '.claude/commands/memory.md',
      '.claude/commands/escalate.md',
      '.claude/agents/project-owner.md',
      '.claude/agents/team-lead.md',
      '.claude/agents/reviewer.md',
      '.claude/agents/web-dev.md',
      '.mcp.json',
      '.serena/memories/INDEX.md',
    ];
    for (const f of required) {
      const s = await stat(path.join(cwd, f));
      expect(s.isFile()).toBe(true);
    }

    // AGENTS.md is byte-identical to template
    const tplAgents = await readFile(path.join(REPO_ROOT, 'templates', '_shared', 'AGENTS.md'), 'utf8');
    const outAgents = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    expect(outAgents).toBe(tplAgents);

    // .mcp.json is valid JSON with serena, context7, jira
    const mcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(expect.arrayContaining(['serena', 'context7', 'jira']));

    // settings.json is valid JSON
    const settings = JSON.parse(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8'));
    expect(settings.outputStyle).toBe('default');

    // No .hbs files in output
    const fg = await import('fast-glob');
    const stray = await fg.default('**/*.hbs', { cwd, dot: true });
    expect(stray).toEqual([]);
  });

  it('deep-merges pre-existing .mcp.json and settings.json (user wins, strategy ignored for json-merge)', async () => {
    // T11: json-merge always deep-merges regardless of --merge-strategy.
    // User values win on key conflicts; scaffold adds new keys.
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });
    const existingMcp = '{"mcpServers":{"my-custom":{"command":"echo"}}}';
    await writeFile(path.join(cwd, '.mcp.json'), existingMcp, 'utf8');
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    const existingSettings = '{"outputStyle":"custom"}';
    await writeFile(path.join(cwd, '.claude', 'settings.json'), existingSettings, 'utf8');

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=skip', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const mergedMcp = JSON.parse(await readFile(path.join(cwd, '.mcp.json'), 'utf8'));
    // User's custom server preserved (user wins)
    expect(mergedMcp.mcpServers['my-custom'].command).toBe('echo');
    // Scaffold servers added
    expect(mergedMcp.mcpServers).toHaveProperty('serena');
    expect(mergedMcp.mcpServers).toHaveProperty('context7');

    const mergedSettings = JSON.parse(await readFile(path.join(cwd, '.claude', 'settings.json'), 'utf8'));
    // User's outputStyle preserved (user wins)
    expect(mergedSettings.outputStyle).toBe('custom');
    // Scaffold adds other keys
    expect(mergedSettings).toHaveProperty('model');
    expect(mergedSettings).toHaveProperty('permissions');

    // Other files still installed
    expect((await stat(path.join(cwd, 'AGENTS.md'))).isFile()).toBe(true);
  });

  it('dry-run produces no writes', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(FIXTURE, cwd, { recursive: true });
    await execa('git', ['init', '-q'], { cwd });
    const before = (await import('fast-glob')).default;
    const filesBefore = await before('**/*', { cwd, dot: true });

    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--dry-run', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);

    const filesAfter = await before('**/*', { cwd, dot: true });
    expect(filesAfter.sort()).toEqual(filesBefore.sort());
  });
});
