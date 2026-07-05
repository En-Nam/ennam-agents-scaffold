import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateFiles } from '../../packages/cli/src/enumerate.js';
import { getProfile } from '../../packages/cli/src/profiles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SHARED = path.join(REPO_ROOT, 'templates', '_shared');

// Issue #9 — role-adaptive AGENTS.md; issue #15 (DoD half) folded into the doc-first variant.
describe('rule family (#9) — AGENTS.md variant selection', () => {
  it('doc-first profile (ba) sources AGENTS.md from the doc-first variant', async () => {
    const entries = await enumerateFiles(getProfile('ba'));
    const agents = entries.find(e => e.relPath === 'AGENTS.md');
    expect(agents).toBeDefined();
    expect(agents!.srcAbs).toMatch(/AGENTS\.doc-first\.md$/);
  });

  it('engineering profile (next) sources AGENTS.md from the original _shared/AGENTS.md (diff=0)', async () => {
    const entries = await enumerateFiles(getProfile('next'));
    const agents = entries.find(e => e.relPath === 'AGENTS.md');
    expect(agents).toBeDefined();
    expect(agents!.srcAbs).toMatch(/_shared[/\\]AGENTS\.md$/);
    expect(agents!.srcAbs).not.toMatch(/doc-first/);
  });

  it('never emits AGENTS.doc-first.md as its own file (it is a variant, not a target)', async () => {
    for (const name of ['ba', 'next', 'pm', 'hr']) {
      const entries = await enumerateFiles(getProfile(name));
      expect(entries.find(e => e.relPath === 'AGENTS.doc-first.md')).toBeUndefined();
    }
  });

  it('both AGENTS variants keep the full Rule 1–13 set (no drift between families)', async () => {
    const eng = await readFile(path.join(SHARED, 'AGENTS.md'), 'utf8');
    const doc = await readFile(path.join(SHARED, 'AGENTS.doc-first.md'), 'utf8');
    for (let n = 1; n <= 13; n++) {
      expect(eng).toContain(`## Rule ${n} —`);
      expect(doc).toContain(`## Rule ${n} —`);
    }
  });

  it('doc-first variant reframes code rules and adds a Definition of Done; engineering does not', async () => {
    const eng = await readFile(path.join(SHARED, 'AGENTS.md'), 'utf8');
    const doc = await readFile(path.join(SHARED, 'AGENTS.doc-first.md'), 'utf8');
    // engineering keeps the code-centric framing
    expect(eng).toContain('Think Before Coding');
    expect(eng).not.toContain('Definition of Done');
    // doc-first reframes it and defines non-code "done"
    expect(doc).toContain('Think Before Drafting');
    expect(doc).not.toContain('Think Before Coding');
    expect(doc).toContain('Definition of Done');
    expect(doc).toContain('sign-off');
  });
});
