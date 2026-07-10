import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFileEntry, buildContext } from '../../packages/cli/src/render.js';
import { resolveWorkflowSrc, DEFAULT_WORKFLOW } from '../../packages/cli/src/workflow.js';
import { getProfile, getSharedDir } from '../../packages/cli/src/profiles.js';
import { enumerateFiles } from '../../packages/cli/src/enumerate.js';
import type { FileEntry } from '../../packages/cli/src/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const GOLDEN = path.join(REPO_ROOT, 'tests', 'fixtures', 'claude-shared-block-engineering.golden.md');

// #23 — the {{{workflowSection}}} slot must reproduce the pre-refactor CLAUDE.md block
// BYTE-FOR-BYTE for an engineering profile. The golden was captured from the inline-workflow
// partial before the lift; a stray newline/heading break anywhere fails this (the merge gate).
describe('workflow-slot (#23)', () => {
  it('renders the shared CLAUDE block BYTE-IDENTICAL to the pre-refactor golden (engineering-full)', async () => {
    const entry: FileEntry = {
      srcAbs: path.join(getSharedDir(), 'CLAUDE.md.partial.hbs'),
      relPath: 'CLAUDE.md',
      isTemplate: true,
      kind: 'append-marker',
      workflowSrc: resolveWorkflowSrc(undefined), // unset → engineering-full
    };
    const ctx = buildContext({ profile: 'python', cwd: '/tmp/x', version: '0.0.0-test' });
    const out = await renderFileEntry(entry, ctx);
    const golden = await readFile(GOLDEN, 'utf8');
    expect(out).toBe(golden);
  });

  it('resolveWorkflowSrc defaults to engineering-full and fails loud on an unknown id', () => {
    expect(resolveWorkflowSrc()).toBe(path.join(getSharedDir(), 'workflow', `${DEFAULT_WORKFLOW}.md`));
    expect(resolveWorkflowSrc('engineering-full')).toContain('engineering-full.md');
    expect(() => resolveWorkflowSrc('does-not-exist')).toThrow(/Unknown workflow preset/);
  });

  it('sets workflowSrc on the CLAUDE.md entry and never emits workflow/*.md as an output file', async () => {
    const entries = await enumerateFiles(getProfile('python'));
    const claude = entries.find(e => e.relPath === 'CLAUDE.md');
    expect(claude?.workflowSrc).toContain(`${DEFAULT_WORKFLOW}.md`);
    expect(entries.some(e => e.relPath.startsWith('workflow/'))).toBe(false);
  });
});
