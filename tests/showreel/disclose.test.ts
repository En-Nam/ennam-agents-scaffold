import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFacts } from '../../templates/showreel/.claude/showreel/lib/facts/extract.mjs';
import { flowVariantReason, disclosure } from '../../templates/showreel/.claude/showreel/lib/check/disclose.mjs';

// M3 cluster disclosure (mem:backlog/showreel-m3-cluster-disclosure, ruling R-k). When a flow-graph
// beat is the arrowless `cluster` variant because the repo has NO ordered setup/usage list, check
// and render must say so (flowVariantReason: "no-sequence-source") so the agent tells the user no
// step order is claimed (Rule 12). With an ordered source the field must be absent — otherwise the
// disclosure would be noise the user learns to ignore. Facts come from the real extractor, so a
// change to how `sequence` is set breaks this test instead of a hand-written fixture hiding it.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function repo(readme: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'showreel-disclose-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'acme-shop', scripts: { dev: 'next dev', build: 'next build' } }));
  writeFileSync(path.join(root, 'README.md'), readme);
  return root;
}

const PLAIN = '# Acme Shop\n\nA shop.\n\n## Features\n\n- Checkout\n- Search\n- Accounts\n';
const ORDERED = PLAIN + '\n## Getting started\n\n1. Install the dependencies\n2. Start the dev server\n3. Open the browser\n';

const board = (variant: string) => ({
  version: 1, durationS: 15, seed: 1,
  beats: [
    { id: 'b1', archetype: 'cold-open-command', variant: 'terminal' },
    { id: 'b2', archetype: 'flow-graph', variant },
    { id: 'b3', archetype: 'lockup-cta', variant: 'center' },
  ],
});

describe('flowVariantReason (cluster disclosure)', () => {
  it('no ordered README list → no sequence facts → a cluster flow beat is disclosed as no-sequence-source', async () => {
    const { facts } = await extractFacts(repo(PLAIN));
    expect(facts.facts.some((f: { sequence?: number | null }) => f.sequence != null)).toBe(false);
    expect(flowVariantReason(board('cluster'), facts)).toBe('no-sequence-source');
    expect(disclosure(board('cluster'), facts)).toEqual({ flowVariantReason: 'no-sequence-source' });
  });

  it('an ordered README list (sequence facts exist) → the field is absent even for a cluster beat', async () => {
    const { facts } = await extractFacts(repo(ORDERED));
    expect(facts.facts.some((f: { sequence?: number | null }) => f.sequence != null)).toBe(true);
    expect(flowVariantReason(board('cluster'), facts)).toBeNull();
    expect(disclosure(board('cluster'), facts)).toEqual({});
  });

  // Release-gate decision: a 2-item ordered list carries `sequence` but can never fill a sequential flow
  // (steps slot min 3), so the cluster drawn instead is just as unordered — staying silent would hide that.
  it('a 2-item ordered list (below the steps slot min of 3) is no sequence source → still disclosed', async () => {
    const { facts } = await extractFacts(repo(PLAIN + '\n## Getting started\n\n1. Install the dependencies\n2. Start the dev server\n'));
    expect(facts.facts.filter((f: { sequence?: number | null }) => f.sequence != null)).toHaveLength(2);
    expect(flowVariantReason(board('cluster'), facts)).toBe('no-sequence-source');
    expect(disclosure(board('cluster'), facts)).toEqual({ flowVariantReason: 'no-sequence-source' });
  });

  it('no cluster beat → nothing to disclose (arrow variants are already validated against sequence)', async () => {
    const { facts } = await extractFacts(repo(PLAIN));
    expect(disclosure(board('converge'), facts)).toEqual({});
  });

  it('check and render both spread the disclosure into their ok JSON', () => {
    const lib = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel', 'lib');
    for (const f of ['check/cmd.mjs', 'render/cmd.mjs']) {
      const src = readFileSync(path.join(lib, f), 'utf8');
      expect(src, f).toMatch(/import \{ disclosure \} from '\.{1,2}\/(check\/)?disclose\.mjs'/);
      expect(src, f).toMatch(/\.\.\.disclosure\(storyboard, facts\)/);
    }
  });
});
