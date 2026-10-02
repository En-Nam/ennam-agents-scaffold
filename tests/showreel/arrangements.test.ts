import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';
import { validateStoryboard, BEAT_BUDGET } from '../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { extractFacts } from '../../templates/showreel/.claude/showreel/lib/facts/extract.mjs';
import { makeDigest } from '../../templates/showreel/.claude/showreel/lib/facts/digest.mjs';
import { storyboardFromArrangement, makeStoryboard, type ArrangementBeat, type DigestFact } from './helpers/storyboard';

// v1.16 showreel M2 — recommended arrangements (C15). They are the M3 agent's default beat sequence
// and the e2e/N-matrix storyboards: an arrangement that breaks the beat budget, names a variant that
// does not exist, or fails to compile at its duration would hand the agent a film it cannot render.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const readJ = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const ARCH = readJ(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJ(path.join(TOOLKIT, 'phrases.json'));
const ARR = readJ(path.join(TOOLKIT, 'archetypes', 'arrangements.json'));
const STORYBOARD_SCHEMA = readJ(path.join(TOOLKIT, 'schema', 'storyboard.schema.json'));
const TIMELINE_SCHEMA = readJ(path.join(TOOLKIT, 'schema', 'timeline.schema.json'));
const DURATIONS = [15, 30, 45, 60] as const;

// Synthetic facts: enough distinct items of every kind for max-N slots (lengths are short; the
// near-maxChars clipping matrix is the gated N-matrix browser test, M2 Task 7).
function fact(kind: string, n: number, display: string, extra: Record<string, unknown> = {}) {
  return {
    id: `f.${kind}.${n}`, kind, value: display, display, unit: null,
    source: { file: 'synthetic', locator: `${kind}/${n}`, extractor: 'test', rule: 'synthetic' },
    hash: 'sha256:0000000000000000', ...extra,
  };
}
const FACTS = {
  version: 1,
  minimumGate: { passed: true, missing: [] },
  brand: { name: 'Acme Shop', palette: 'violet', wordmark: 'f.app.name.1' },
  facts: [
    fact('app.name', 1, 'Acme Shop'),
    fact('app.tagline', 1, 'Checkout in one click'),
    ...['Saved carts', 'Guest checkout', 'Order history', 'Live inventory', 'Gift cards', 'Fast search', 'Coupons'].map((d, i) => fact('feature', i + 1, d)),
    ...['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Postgres', 'Redis', 'Stripe', 'Vitest'].map((d, i) => fact('stack.item', i + 1, d)),
    ...['/checkout', '/cart', '/account', '/orders/[id]', '/search', '/api/health'].map((d, i) => fact('route', i + 1, d)),
    ...['npm run dev', 'npm test', 'npm run build'].map((d, i) => fact('command', i + 1, d)),
    ...([[42, 'routes'], [7, 'commands'], [128, 'tests'], [12, 'components']] as const).map(([v, u], i) => ({ ...fact('count', i + 1, String(v)), value: v, unit: u })),
  ],
};
const DIGEST: DigestFact[] = FACTS.facts.map((f) => ({ id: f.id, kind: f.kind, display: f.display, unit: f.unit }));
const inputs = { archetypes: ARCH, facts: FACTS, phrases: PHRASES };
const arrangement = (d: number): ArrangementBeat[] => ARR.arrangements[String(d)];

describe('arrangements.json (C15) — shape and composition rules', () => {
  it('has version 1 and exactly the four durations', () => {
    expect(ARR.version).toBe(1);
    expect(Object.keys(ARR.arrangements).sort()).toEqual(['15', '30', '45', '60']);
  });

  for (const d of DURATIONS) {
    describe(`${d} s`, () => {
      const beats = arrangement(d);

      it('beat count sits in the duration budget; first = cold-open-command, last = lockup-cta', () => {
        const [lo, hi] = BEAT_BUDGET[d];
        expect(beats.length).toBeGreaterThanOrEqual(lo);
        expect(beats.length).toBeLessThanOrEqual(hi);
        expect(beats[0]!.archetype).toBe('cold-open-command');
        expect(beats.at(-1)!.archetype).toBe('lockup-cta');
      });

      it('every beat names an existing archetype + variant, a weight within [minWeight, 3] and a legal transition', () => {
        const transitions = STORYBOARD_SCHEMA.$defs.beat.properties.transitionOut.enum;
        beats.forEach((b, i) => {
          const spec = ARCH.archetypes[b.archetype];
          expect(spec, `${i} ${b.archetype}`).toBeDefined();
          expect(spec.variants, `${i}`).toContain(b.variant);
          expect(b.weight, `${i}`).toBeGreaterThanOrEqual(spec.minWeight);
          expect(b.weight, `${i}`).toBeLessThanOrEqual(3);
          expect(transitions, `${i}`).toContain(b.transitionOut);
          expect(Object.keys(b).sort(), `${i}`).toEqual(['archetype', 'transitionOut', 'variant', 'weight']);
        });
      });

      for (const count of ['min', 'typical', 'max'] as const) {
        it(`a storyboard built from it (${count} N) validates, resolves and compiles at 30 + 60 fps`, () => {
          const sb = storyboardFromArrangement(DIGEST, d, beats, ARCH, PHRASES, { count });
          expect(validateStoryboard(sb, inputs)).toEqual([]);
          const resolved = resolve(sb, inputs);
          for (const fps of [30, 60]) {
            const tl = compileTimeline(sb, resolved, ARCH, { fps });
            expect(validate(TIMELINE_SCHEMA, tl)).toEqual([]);
            expect(tl.beats.map((b: { archetype: string }) => b.archetype)).toEqual(beats.map((b) => b.archetype));
          }
        });
      }
    });
  }

  it('45 s and 60 s use at least one chapter card', () => {
    for (const d of [45, 60]) expect(arrangement(d).some((b) => b.archetype === 'kinetic-text' && b.variant === 'chapter'), `${d}`).toBe(true);
  });

  it('every archetype appears in the 60 s arrangement, and it uses both overlap transitions', () => {
    const used = new Set(arrangement(60).map((b) => b.archetype));
    expect([...used].sort()).toEqual(Object.keys(ARCH.archetypes).sort());
    const tr = new Set(arrangement(60).slice(0, -1).map((b) => b.transitionOut));
    expect(tr.has('zoom-through') && tr.has('column-wipe')).toBe(true);
  });

  it('the helper fails loud (never emits an invalid storyboard) when the digest cannot fill a slot', () => {
    const thin = DIGEST.filter((f) => f.kind !== 'route' && f.kind !== 'feature' && f.kind !== 'stack.item');
    expect(() => storyboardFromArrangement(thin, 60, arrangement(60), ARCH, PHRASES)).toThrow(/needs \d+ distinct/);
  });
});

// Orchestrator ruling (f): arrows claim an order, so the recommended (agent-default) flow-graph is the unordered
// "cluster" — safe on every repo. The helper (agent stand-in) may pick a sequential variant ONLY when the digest
// has an ordered step collection of >= 3 fitting steps, and must pick lead phrases true of the bound kinds.
describe('ruling (f) — arrangements default to cluster; the helper picks sequential variants only on real steps', () => {
  const flowBeats = (sb: { beats: { archetype: string; variant: string; bindings: Record<string, unknown> }[] }) =>
    sb.beats.filter((b) => b.archetype === 'flow-graph');

  it('every flow-graph beat in arrangements.json is "cluster"', () => {
    for (const d of DURATIONS) {
      const flows = arrangement(d).filter((b) => b.archetype === 'flow-graph');
      expect(flows.length, `${d}`).toBeGreaterThanOrEqual(1);
      for (const b of flows) expect(b.variant, `${d}`).toBe('cluster');
    }
  });

  it('no sequence in the digest → every flow-graph beat stays cluster (and the storyboard validates)', () => {
    for (const d of DURATIONS) {
      const sb = storyboardFromArrangement(DIGEST, d, arrangement(d), ARCH, PHRASES);
      for (const b of flowBeats(sb)) expect(b.variant, `${d}`).toBe('cluster');
      expect(validateStoryboard(sb, inputs), `${d}`).toEqual([]);
    }
  });

  const step = (n: number, kind: string, display: string, collection: string, sequence: number) =>
    fact(kind, n, display, { collection, sequence });
  const withSteps = (steps: ReturnType<typeof step>[]) => {
    const facts = { ...FACTS, facts: [...FACTS.facts, ...steps] };
    const digest: DigestFact[] = facts.facts.map((f: any) => ({ id: f.id, kind: f.kind, display: f.display, unit: f.unit,
      ...(f.sequence != null ? { collection: f.collection, sequence: f.sequence } : {}) }));
    return { facts, digest };
  };

  it('a 2-step ordered list is not enough → cluster', () => {
    const { digest, facts } = withSteps([step(4, 'command', 'npm ci', 'readme.steps.1', 1), step(5, 'command', 'npm start', 'readme.steps.1', 2)]);
    const sb = storyboardFromArrangement(digest, 30, arrangement(30), ARCH, PHRASES);
    expect(flowBeats(sb).map((b) => b.variant)).toEqual(['cluster']);
    expect(validateStoryboard(sb, { ...inputs, facts })).toEqual([]);
  });

  it('>= 3 ordered steps → the first flow-graph beat is "chain", bound in ascending sequence; a 2nd stays cluster', () => {
    // listed out of order in facts.json (facts are grouped by kind) — the helper must order by sequence
    const { digest, facts } = withSteps([
      step(8, 'feature', 'Open localhost:3000', 'readme.steps.1', 3),
      step(4, 'command', 'npm ci', 'readme.steps.1', 1),
      step(5, 'command', 'npm run dev', 'readme.steps.1', 2),
      step(6, 'command', 'npm test', 'readme.steps.1', 5),
      step(7, 'command', 'npm run a-very-long-script-name-x', 'readme.steps.1', 4), // > 28 chars: skipped, a gap
    ]);
    for (const count of ['min', 'typical', 'max'] as const) {
      const sb = storyboardFromArrangement(digest, 60, arrangement(60), ARCH, PHRASES, { count });
      const flows = flowBeats(sb);
      expect(flows.map((b) => b.variant), count).toEqual(['chain', 'cluster']);
      const want = ['f.command.4', 'f.command.5', 'f.feature.8', 'f.command.6'];
      expect(flows[0]!.bindings.steps, count).toEqual(want.slice(0, count === 'min' ? 3 : 4));
      expect(validateStoryboard(sb, { ...inputs, facts }), count).toEqual([]);
    }
  });

  it('a sequential arrangement entry falls back to cluster when the digest has no steps (never emits E_SLOT_ORDER)', () => {
    const chained = arrangement(30).map((b) => (b.archetype === 'flow-graph' ? { ...b, variant: 'chain' } : b));
    const sb = storyboardFromArrangement(DIGEST, 30, chained, ARCH, PHRASES);
    expect(flowBeats(sb).map((b) => b.variant)).toEqual(['cluster']);
    expect(validateStoryboard(sb, inputs)).toEqual([]);
  });

  describe('real fixtures (js-next, python-fastapi: README steps) × every arrangement × every count', () => {
    const FIXTURES = path.resolve(HERE, 'fixtures', 'facts');
    const real: Record<string, { facts: any; digest: DigestFact[] }> = {};
    beforeAll(async () => {
      for (const fx of ['js-next', 'python-fastapi']) {
        const { facts } = await extractFacts(path.join(FIXTURES, fx));
        real[fx] = { facts, digest: makeDigest(facts.facts).digest };
      }
    });

    for (const fx of ['js-next', 'python-fastapi']) {
      it(`${fx}: helper storyboards validate (no E_PHRASE_KIND / E_SLOT_ORDER), resolve, compile; the first flow-graph is an ascending chain`, () => {
        const { facts, digest } = real[fx]!;
        const ctx = { archetypes: ARCH, facts, phrases: PHRASES };
        let built = 0;
        for (const d of DURATIONS) {
          for (const count of ['min', 'typical', 'max'] as const) {
            let sb;
            try { sb = storyboardFromArrangement(digest, d, arrangement(d), ARCH, PHRASES, { count }); } catch (err) {
              // a thin fixture may not fill a max/typical slot; the helper must say so loudly, never emit a bad film
              expect(String(err), `${fx} ${d} ${count}`).toMatch(/needs \d+ distinct/);
              expect(count, `${fx} ${d}: min N must always build`).not.toBe('min');
              continue;
            }
            built++;
            expect(validateStoryboard(sb, ctx), `${fx} ${d} ${count}`).toEqual([]);
            compileTimeline(sb, resolve(sb, ctx), ARCH, { fps: 30 });
            const first = flowBeats(sb)[0]!;
            expect(first.variant, `${fx} ${d} ${count}`).toBe('chain');
            const seqs = (first.bindings.steps as string[]).map((id) => facts.facts.find((f: any) => f.id === id).sequence);
            expect(seqs.every((s: number | null) => s !== null), `${fx} ${d}`).toBe(true);
            expect([...seqs].sort((a, b) => a - b), `${fx} ${d}`).toEqual(seqs);
          }
        }
        expect(built).toBeGreaterThanOrEqual(DURATIONS.length);
      });

      it(`${fx}: makeStoryboard (e2e helper) storyboards validate at every duration`, () => {
        const { facts, digest } = real[fx]!;
        for (const d of DURATIONS) expect(validateStoryboard(makeStoryboard(digest, d), { archetypes: ARCH, facts, phrases: PHRASES }), `${fx} ${d}`).toEqual([]);
      });
    }
  });
});
