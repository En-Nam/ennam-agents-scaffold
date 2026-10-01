import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';
import { validateStoryboard, BEAT_BUDGET } from '../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { compileTimeline } from '../../templates/showreel/.claude/showreel/lib/compile/timeline.mjs';
import { storyboardFromArrangement, type ArrangementBeat, type DigestFact } from './helpers/storyboard';

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
