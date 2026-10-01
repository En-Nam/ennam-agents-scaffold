import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';

// v1.16 showreel — the schemas are the truth contract (D8 / Rule 13): the LLM-written
// storyboard may hold enums, numbers, fact ids and phrase ids only. A schema that lets a
// literal string or an echoed extra field through lets invented copy reach the film.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel', 'schema');
const schema = (name: string) => JSON.parse(readFileSync(path.join(SCHEMA_DIR, `${name}.schema.json`), 'utf8'));

type Err = { path: string; message: string };
const check = (name: string, value: unknown): Err[] => validate(schema(name), value);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// C4 example, extended to a full 30 s storyboard (7 beats, last = lockup-cta).
const STORYBOARD = {
  version: 1, durationS: 30, seed: 7, palette: 'violet',
  beats: [
    { id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1.0,
      bindings: { command: 'f.command.1' }, phrases: { caption: 'p.open.2' }, transitionOut: 'zoom-through',
      cues: [{ name: 'enter', at: 0.75, kind: 'boom', amp: 1.0 }] },
    { id: 'b2', archetype: 'kinetic-text', variant: 'stack', weight: 1, bindings: { lines: ['f.feature.1', 'f.feature.2'] }, phrases: { lead: 'p.lead.1' }, transitionOut: 'cut' },
    { id: 'b3', archetype: 'metrics-counter-lock', variant: 'row', weight: 1.5, bindings: { counters: ['f.count.1', 'f.count.2'] }, phrases: {}, transitionOut: 'zoom-through' },
    { id: 'b4', archetype: 'kinetic-text', variant: 'punch', weight: 0.5, bindings: { lines: 'f.app.tagline.1' }, transitionOut: 'cut' },
    { id: 'b5', archetype: 'kinetic-text', variant: 'stack', weight: 1, bindings: { lines: ['f.stack.item.1'] }, transitionOut: 'cut' },
    { id: 'b6', archetype: 'metrics-counter-lock', variant: 'grid', weight: 1, bindings: { counters: 'f.count.3' }, phrases: { label: 'p.metrics.1' }, transitionOut: 'cut' },
    { id: 'b7', archetype: 'lockup-cta', variant: 'center', weight: 2, bindings: { name: 'f.app.name.1', tagline: 'f.app.tagline.1' }, phrases: { cta: 'p.cta.1' }, transitionOut: 'cut' },
  ],
};

const FACTS = {
  version: 1,
  minimumGate: { passed: true, missing: [] },
  brand: { name: 'Acme Shop', palette: 'violet', wordmark: 'f.app.name.1' },
  facts: [
    { id: 'f.route.3', kind: 'route', value: '/checkout', display: '/checkout', unit: null,
      source: { file: 'app/checkout/page.tsx', locator: 'path', extractor: 'next-app-routes', rule: 'app/**/page.(tsx|jsx|ts|js) → route path' },
      collection: 'routes', order: 3, hash: 'sha256:0123456789abcdef' },
    { id: 'f.count.1', kind: 'count', value: 42, display: '42', unit: 'routes',
      source: { file: 'app', locator: 'glob', extractor: 'count', rule: 'count of route facts' }, hash: 'sha256:fedcba9876543210' },
  ],
};

const RESOLVED = {
  version: 1,
  beats: { b1: { archetype: 'cold-open-command', variant: 'terminal',
    slots: { command: { source: 'fact', items: [{ id: 'f.command.1', text: 'npm run dev', number: null, unit: null }], fitSizePx: null },
             caption: { source: 'phrase', items: [{ id: 'p.open.2', text: 'One command.', number: null, unit: null }], fitSizePx: null } } } },
  allowed: ['npm run dev', 'One command.'],
};

const TIMELINE = {
  version: 1, fps: 60, durationS: 30, frames: 1800, seed: 7, palette: 'violet',
  beats: [{ id: 'b1', archetype: 'cold-open-command', variant: 'terminal', t0: 0, t1: 3.5, overlapIn: 0, overlapOut: 0.375, transitionOut: 'zoom-through' }],
  hits: [{ t: 2.5, kind: 'boom', amp: 1, beatId: 'b1', cue: 'enter' }],
  typing: [{ beatId: 'b1', t0: 0.45, interval: 0.052, chars: 11, enterAt: 2.5 }],
  sections: [{ name: 'intro', t0: 0, t1: 3.5 }],
  music: { bpm: 120, key: 'F#m' },
};

describe('showreel schemas — valid contract examples pass', () => {
  it.each([
    ['storyboard', STORYBOARD],
    ['facts', FACTS],
    ['resolved', RESOLVED],
    ['timeline', TIMELINE],
  ] as const)('%s', (name, value) => {
    expect(check(name, value)).toEqual([]);
  });
});

describe('storyboard schema rejects free text (Rule 13)', () => {
  it('a literal phrase text instead of a phrase id fails at the exact slot path', () => {
    const sb = clone(STORYBOARD);
    (sb.beats[0]!.phrases as Record<string, string>).caption = 'Buy now!';
    const errors = check('storyboard', sb);
    expect(errors.map(e => e.path)).toEqual(['/beats/0/phrases/caption']);
  });

  it('literal text in a fact binding fails at the slot path', () => {
    const sb = clone(STORYBOARD);
    (sb.beats[0]!.bindings as Record<string, unknown>).command = 'npm run dev';
    expect(check('storyboard', sb).map(e => e.path)).toEqual(['/beats/0/bindings/command']);
  });

  it('a fact id outside the closed C3 kind set fails at the slot path (no smuggled words)', () => {
    const sb = clone(STORYBOARD);
    (sb.beats[6]!.bindings as Record<string, unknown>).name = 'f.buy.now.1';
    expect(check('storyboard', sb).map(e => e.path)).toEqual(['/beats/6/bindings/name']);
  });

  it('a phrase id outside the closed tag set fails at the slot path', () => {
    const sb = clone(STORYBOARD);
    (sb.beats[6]!.phrases as Record<string, string>).cta = 'p.buynow.1';
    expect(check('storyboard', sb).map(e => e.path)).toEqual(['/beats/6/phrases/cta']);
  });

  it('an echoed extra property (e.g. commandText) fails via additionalProperties', () => {
    const sb = clone(STORYBOARD) as unknown as { beats: Record<string, unknown>[] };
    sb.beats[0]!.commandText = 'npm run deploy --prod';
    const errors = check('storyboard', sb);
    expect(errors).toEqual([{ path: '/beats/0/commandText', message: 'is not an allowed property' }]);
  });

  it('an unknown top-level key fails too', () => {
    expect(check('storyboard', { ...clone(STORYBOARD), title: 'My film' }).map(e => e.path)).toEqual(['/title']);
  });

  it('enums and ranges are enforced (archetype, weight, cue kind)', () => {
    const sb = clone(STORYBOARD) as unknown as { beats: Record<string, unknown>[] };
    sb.beats[1]!.archetype = 'ui-mock';
    sb.beats[2]!.weight = 5;
    sb.beats[0]!.cues = [{ name: 'enter', at: 0.5, kind: 'explosion', amp: 1 }];
    expect(check('storyboard', sb).map(e => e.path).sort()).toEqual(['/beats/0/cues/0/kind', '/beats/1/archetype', '/beats/2/weight']);
  });
});

describe('facts schema', () => {
  it('a count fact must carry an integer value and a lowercase unit', () => {
    const f = clone(FACTS);
    (f.facts[1] as Record<string, unknown>).value = '42';
    expect(check('facts', f).length).toBeGreaterThan(0);
  });
});

describe('validate() subset semantics', () => {
  it('resolves $ref to #/$defs', () => {
    const s = { $defs: { id: { type: 'string', pattern: '^x\\d$' } }, type: 'object', properties: { a: { $ref: '#/$defs/id' } } };
    expect(validate(s, { a: 'x1' })).toEqual([]);
    expect(validate(s, { a: 'y1' })).toEqual([{ path: '/a', message: 'must match pattern ^x\\d$' }]);
  });

  it('throws on an unsupported keyword instead of silently ignoring it (Rule 12)', () => {
    expect(() => validate({ type: 'string', minLength: 3 }, 'ab')).toThrow(/unsupported keyword "minLength"/);
    expect(() => validate({ $ref: 'other.json#/x' }, 1)).toThrow(/only "#\/\$defs\/<name>" refs/);
  });

  it('type integer rejects floats; oneOf needs exactly one match', () => {
    expect(validate({ type: 'integer' }, 1.5)).toHaveLength(1);
    expect(validate({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 2)).toEqual([
      { path: '', message: 'must match exactly one oneOf branch (matched 2)' },
    ]);
  });
});
