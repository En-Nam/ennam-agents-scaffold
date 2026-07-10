import { describe, it, expect, beforeAll } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

// #22 secret-leak fix + #23 end-to-end slot render, exercised through the real CLI.
describe('.env.local gitignore + workflow slot end-to-end', () => {
  beforeAll(async () => {
    await execa('npm', ['-w', '@ennamjsc/agents-scaffold', 'run', 'build'], { cwd: REPO_ROOT, shell: true });
  });

  it('adds .env.local and .env to .gitignore on a fresh install (secret-leak guard)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await mkdir(path.join(cwd, '.git'), { recursive: true }); // .gitignore step requires a repo
    const { exitCode } = await execa('node', [CLI_ENTRY, 'next', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    expect(exitCode).toBe(0);
    const gi = (await readFile(path.join(cwd, '.gitignore'), 'utf8')).split('\n');
    expect(gi).toContain('.env.local');
    expect(gi).toContain('.env');
  });

  it('renders the workflow section into CLAUDE.md via the slot (no unfilled slot remains)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await execa('node', [CLI_ENTRY, 'python', '--merge-strategy=overwrite', '--no-prompts'], { cwd });
    const claude = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('### Superpowers Workflow');
    expect(claude).toContain('### Task Complexity Guide');
    expect(claude).not.toContain('{{{workflowSection}}}'); // slot was filled, not left literal
  });
});
