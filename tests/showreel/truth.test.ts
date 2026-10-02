import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';
import { validateStoryboard, slotsFor as slotsOf } from '../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';
import { resolve } from '../../templates/showreel/.claude/showreel/lib/truth/resolve.mjs';
import { checkManifest } from '../../templates/showreel/.claude/showreel/lib/truth/manifest.mjs';
import { offFrame } from '../../templates/showreel/.claude/showreel/lib/truth/safearea.mjs';

// v1.16 showreel — truth layer (D8 / Rule 13, AC2). The LLM writes only ids; every
// on-screen string must come from code-extracted facts or the fixed phrase library.
// These tests mock an LLM that *alters* what it was given (echoed strings, invented ids,
// literal copy, wrong kinds) — a faithful-echo mock could never catch the failure class.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel');
const FIX = path.join(HERE, 'fixtures', 'truth');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const ARCHETYPES = readJson(path.join(TOOLKIT, 'archetypes', 'archetypes.json'));
const PHRASES = readJson(path.join(TOOLKIT, 'phrases.json'));
const FACTS = readJson(path.join(FIX, 'facts.json'));
const STORYBOARD = readJson(path.join(FIX, 'storyboard.json'));
const schema = (name: string) => readJson(path.join(TOOLKIT, 'schema', `${name}.schema.json`));

type Err = { path: string; code: string; message: string };
type Beat = Record<string, any>;
const ctx = (over: Record<string, unknown> = {}) => ({ archetypes: ARCHETYPES, facts: FACTS, phrases: PHRASES, ...over });
const sbWith = (mutate: (beats: Beat[], sb: Record<string, any>) => void) => {
  const sb = clone(STORYBOARD);
  mutate(sb.beats, sb);
  return sb;
};
const errs = (sb: unknown, c = ctx()): Err[] => validateStoryboard(sb, c);
const codesAt = (list: Err[], p: string) => list.filter((e) => e.path === p).map((e) => e.code);
const phraseText = (id: string) => PHRASES.phrases.find((p: { id: string }) => p.id === id).text;

describe('fixtures are contract-valid (otherwise every test below proves nothing)', () => {
  it('facts fixture conforms to C3 and storyboard fixture to C4', () => {
    expect(validate(schema('facts'), FACTS)).toEqual([]);
    expect(validate(schema('storyboard'), STORYBOARD)).toEqual([]);
  });

  it('the valid storyboard has zero truth errors', () => {
    expect(errs(STORYBOARD)).toEqual([]);
  });
});

describe('phrases.json (C6) — the only non-fact copy that may reach the film', () => {
  const list: { id: string; tags: string[]; text: string }[] = PHRASES.phrases;

  it('has version 1 and ≥3 phrases for each tag the archetype slots draw from', () => {
    expect(PHRASES.version).toBe(1);
    const slotTags = new Set<string>();
    for (const a of Object.values<any>(ARCHETYPES.archetypes)) {
      for (const s of Object.values<any>(a.slots)) if (s.source === 'phrase') s.tags.forEach((t: string) => slotTags.add(t));
      // C13: per-variant overrides (kinetic-text "chapter") may name tags of their own
      for (const v of Object.values<any>(a.variantSlots ?? {})) {
        for (const [slotId, o] of Object.entries<any>(v)) if (a.slots[slotId].source === 'phrase') (o.tags ?? []).forEach((t: string) => slotTags.add(t));
      }
    }
    expect([...slotTags].sort()).toEqual(['carousel', 'chapter', 'cta', 'flow', 'lead', 'metrics', 'open', 'stack']);
    for (const tag of slotTags) expect(list.filter((p) => p.tags.includes(tag)).length, tag).toBeGreaterThanOrEqual(3);
  });

  it('ids are unique, match the storyboard phraseId pattern and their own tag', () => {
    const pattern = new RegExp(schema('storyboard').$defs.phraseId.pattern);
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    for (const p of list) {
      expect(p.id, p.id).toMatch(pattern);
      expect(p.tags, p.id).toContain(p.id.split('.')[1]);
    }
  });

  it('texts are non-empty printable ASCII (no tofu risk, no locale surprises)', () => {
    for (const p of list) expect(p.text, p.id).toMatch(/^[\x20-\x7e]+$/);
    for (const p of list) expect(p.text.trim(), p.id).toBe(p.text);
  });

  it('C6 named examples hold', () => {
    expect(phraseText('p.cta.1')).toBe('Get started');
    expect(phraseText('p.open.1')).toBe('One command.');
  });
});

describe('validateStoryboard — mock LLM outputs (AC2)', () => {
  it('(a) a stray echoed-string field is a schema error at that path, never read', () => {
    const sb = sbWith((b) => { b[0]!.commandText = 'npm run deploy --prod'; });
    const e = errs(sb);
    expect(codesAt(e, '/beats/0/commandText')).toEqual(['E_SCHEMA']);
  });

  it('(b) an invented fact id fails with E_UNKNOWN_FACT naming the slot', () => {
    const e = errs(sbWith((b) => { b[0]!.bindings.command = 'f.command.99'; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/0/bindings/command', code: 'E_UNKNOWN_FACT' })]);
    expect(e[0]!.message).toContain('f.command.99');
  });

  it('(b2) an invented phrase id fails with E_UNKNOWN_PHRASE naming the slot', () => {
    const e = errs(sbWith((b) => { b[1]!.phrases.lead = 'p.lead.99'; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/1/phrases/lead', code: 'E_UNKNOWN_PHRASE' })]);
  });

  it('(c) literal text in a slot is E_SCHEMA naming the slot (pattern), not resolved as copy', () => {
    const e = errs(sbWith((b) => { b[0]!.bindings.command = 'npm run dev'; }));
    expect(codesAt(e, '/beats/0/bindings/command')).toContain('E_SCHEMA');
    expect(e.every((x) => x.code === 'E_SCHEMA')).toBe(true);
  });

  it('(d) a real fact of the wrong kind is E_SLOT_KIND (a route is not a counter)', () => {
    const e = errs(sbWith((b) => { b[2]!.bindings.counters = ['f.route.1']; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/2/bindings/counters/0', code: 'E_SLOT_KIND' })]);
  });

  it('(e) a real phrase with the wrong tag is E_SLOT_KIND (an opener is not a CTA)', () => {
    const e = errs(sbWith((b) => { b[6]!.phrases.cta = 'p.open.1'; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/6/phrases/cta', code: 'E_SLOT_KIND' })]);
  });

  it('(h) budget: 30 s with 6 beats is E_BUDGET', () => {
    const e = errs(sbWith((b) => { b.splice(4, 1); }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats', code: 'E_BUDGET' })]);
    expect(e[0]!.message).toMatch(/7.*8/);
  });

  it('(h) budget: last beat must be lockup-cta (E_LAST_BEAT)', () => {
    const e = errs(sbWith((b) => { b.splice(6, 1, clone(b[1]!)); b[6]!.id = 'b7'; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/6/archetype', code: 'E_LAST_BEAT' })]);
  });

  it.each([
    [15, 4, 5], [30, 7, 8], [45, 10, 11], [60, 13, 14],
  ])('beat budget for %i s is exactly %i–%i beats', (durationS, lo, hi) => {
    const make = (n: number) => sbWith((b, sb) => {
      sb.durationS = durationS;
      const body = b[1]!;
      const beats = [b[0]!];
      for (let i = 1; i < n - 1; i++) beats.push({ ...clone(body), id: `b${i + 1}` });
      beats.push({ ...clone(b[6]!), id: `b${n}` });
      b.splice(0, b.length, ...beats);
    });
    const budget = (n: number) => codesAt(errs(make(n)), '/beats');
    // 3 beats is already below the schema's global minItems (4) → E_SCHEMA at the same path.
    expect(budget(lo - 1)).toEqual([lo - 1 < 4 ? 'E_SCHEMA' : 'E_BUDGET']);
    expect(budget(lo)).toEqual([]);
    expect(budget(hi)).toEqual([]);
    if (hi + 1 <= 14) expect(budget(hi + 1)).toEqual(['E_BUDGET']);
  });

  it('weight below the archetype minWeight is E_BUDGET (schema allows 0.5, lockup needs 1.0)', () => {
    const e = errs(sbWith((b) => { b[6]!.weight = 0.75; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/6/weight', code: 'E_BUDGET' })]);
  });

  it('a slot the archetype does not have is E_UNKNOWN_SLOT (schema allows the key globally)', () => {
    const e = errs(sbWith((b) => { b[1]!.bindings.counters = 'f.count.1'; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/1/bindings/counters', code: 'E_UNKNOWN_SLOT' })]);
  });

  it('a binding whose source differs from the slot source is E_SLOT_KIND', () => {
    const arch = clone(ARCHETYPES);
    arch.archetypes['lockup-cta'].slots.tagline = { source: 'phrase', tags: ['cta'], min: 0, max: 1 };
    const e = errs(STORYBOARD, ctx({ archetypes: arch }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/6/bindings/tagline', code: 'E_SLOT_KIND' })]);
  });

  it('slot count outside min..max is E_SLOT_COUNT (too many lines; required name missing)', () => {
    // lead "The essentials" (p.lead.3) is true of all four kinds, so the count is the ONLY error (ruling f)
    const tooMany = errs(sbWith((b) => { b[1]!.bindings.lines = ['f.feature.1', 'f.feature.2', 'f.stack.item.1', 'f.app.tagline.1']; b[1]!.phrases.lead = 'p.lead.3'; }));
    expect(tooMany).toEqual([expect.objectContaining({ path: '/beats/1/bindings/lines', code: 'E_SLOT_COUNT' })]);
    const missing = errs(sbWith((b) => { delete b[6]!.bindings.name; }));
    expect(missing).toEqual([expect.objectContaining({ path: '/beats/6/bindings/name', code: 'E_SLOT_COUNT' })]);
  });

  it('a fact display longer than slot maxChars is E_TEXT_LIMIT (never silently clipped)', () => {
    const e = errs(sbWith((b) => { b[0]!.bindings.command = 'f.command.2'; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/0/bindings/command', code: 'E_TEXT_LIMIT' })]);
    expect(e[0]!.message).toMatch(/64/);
  });

  it('variant not offered by the archetype is E_SCHEMA (schema enum is global)', () => {
    const e = errs(sbWith((b) => { b[0]!.variant = 'grid'; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/0/variant', code: 'E_SCHEMA' })]);
  });

  it('duplicate beat ids and duplicate cue names within a beat are rejected', () => {
    expect(codesAt(errs(sbWith((b) => { b[3]!.id = 'b2'; })), '/beats/3/id')).toEqual(['E_SCHEMA']);
    const e = errs(sbWith((b) => { b[0]!.cues.push({ name: 'enter', at: 0.2, kind: 'snap', amp: 0.3 }); }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/0/cues/1/name', code: 'E_SCHEMA' })]);
  });

  it('reports ALL semantic errors in one pass, not just the first', () => {
    const e = errs(sbWith((b) => {
      b[0]!.bindings.command = 'f.command.99';
      b[2]!.bindings.counters = ['f.route.1'];
      b[6]!.phrases.cta = 'p.open.1';
    }));
    expect(e.map((x) => x.code).sort()).toEqual(['E_SLOT_KIND', 'E_SLOT_KIND', 'E_UNKNOWN_FACT']);
  });
});

describe('resolve — ground truth comes from facts/phrases, never from the storyboard', () => {
  it('produces C7 resolved.json that conforms to the resolved schema', () => {
    const r = resolve(STORYBOARD, ctx());
    expect(validate(schema('resolved'), r)).toEqual([]);
    expect(r.beats.b1).toEqual({
      archetype: 'cold-open-command', variant: 'terminal',
      slots: {
        command: { source: 'fact', items: [{ id: 'f.command.1', text: 'npm run dev', number: null, unit: null }], fitSizePx: null },
        caption: { source: 'phrase', items: [{ id: 'p.open.1', text: 'One command.', number: null, unit: null }], fitSizePx: null },
      },
    });
    expect(Object.keys(r.beats)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']);
  });

  it('text is fact.display (not value); counts carry number=value and unit', () => {
    const r = resolve(STORYBOARD, ctx());
    expect(r.beats.b5.slots.lines.items).toEqual([{ id: 'f.stack.item.1', text: 'Next.js', number: null, unit: null }]);
    expect(r.beats.b3.slots.counters.items).toEqual([
      { id: 'f.count.1', text: '42', number: 42, unit: 'routes' },
      { id: 'f.count.2', text: '7', number: 7, unit: 'commands' },
    ]);
  });

  it('unbound optional slots are present with empty items (stable shape for the engine)', () => {
    const r = resolve(STORYBOARD, ctx());
    expect(r.beats.b7.slots.command).toEqual({ source: 'fact', items: [], fitSizePx: null });
    expect(Object.keys(r.beats.b7.slots).sort()).toEqual(['command', 'cta', 'name', 'tagline']);
  });

  it('allowed = sorted unique texts plus units', () => {
    const r = resolve(STORYBOARD, ctx());
    const expected = [
      'Acme Shop', 'Checkout in one click', 'Saved carts', 'Guest checkout', 'Next.js', '42', '7',
      'routes', 'commands', 'npm run dev',
      phraseText('p.open.1'), phraseText('p.lead.1'), phraseText('p.metrics.1'), phraseText('p.cta.1'),
    ];
    expect(r.allowed).toEqual([...new Set(expected)].sort());
  });

  it('(f) facts display changed after the storyboard was written → resolved text is the NEW display', () => {
    const facts = clone(FACTS);
    facts.facts.find((f: { id: string }) => f.id === 'f.command.1').display = 'pnpm dev';
    const r = resolve(STORYBOARD, ctx({ facts }));
    expect(r.beats.b1.slots.command.items[0].text).toBe('pnpm dev');
    expect(r.allowed).toContain('pnpm dev');
    expect(r.allowed).not.toContain('npm run dev');
  });

  it('is deterministic: same inputs → deep-equal output', () => {
    expect(resolve(clone(STORYBOARD), ctx())).toEqual(resolve(clone(STORYBOARD), ctx()));
  });

  it('throws ShowreelError E_STORYBOARD listing every error with its path', () => {
    const bad = sbWith((b) => {
      b[0]!.bindings.command = 'f.command.99';
      b[6]!.phrases.cta = 'p.open.1';
    });
    let thrown: any;
    try { resolve(bad, ctx()); } catch (err) { thrown = err; }
    expect(thrown?.name).toBe('ShowreelError');
    expect(thrown.code).toBe('E_STORYBOARD');
    expect(thrown.message).toContain('/beats/0/bindings/command');
    expect(thrown.message).toContain('E_UNKNOWN_FACT');
    expect(thrown.message).toContain('/beats/6/phrases/cta');
    expect(thrown.message).toContain('E_SLOT_KIND');
    expect(typeof thrown.fix).toBe('string');
  });

  it('a storyboard carrying echoed copy is refused, so that copy can never be resolved', () => {
    const bad = sbWith((b) => { b[0]!.commandText = 'npm run deploy --prod'; });
    expect(() => resolve(bad, ctx())).toThrow(/commandText/);
  });
});

describe('checkManifest — drawn text ⊆ resolved set', () => {
  const resolved = resolve(STORYBOARD, ctx());

  it('(g) exact fact/phrase text with its source id passes', () => {
    expect(checkManifest([
      { text: 'npm run dev', source: 'f.command.1' },
      { text: phraseText('p.cta.1'), source: 'p.cta.1' },
    ], resolved)).toEqual([]);
  });

  it('(g) altered text under a valid source is a mismatch', () => {
    expect(checkManifest([{ text: 'npm run deploy', source: 'f.command.1' }], resolved))
      .toEqual([{ text: 'npm run deploy', source: 'f.command.1', reason: 'mismatch' }]);
  });

  it('(g) counters lock on the fact: 0..number pass, number+1 is out-of-range', () => {
    expect(checkManifest([
      { text: '0', source: 'counter:f.count.1' },
      { text: '17', source: 'counter:f.count.1' },
      { text: '42', source: 'counter:f.count.1' },
    ], resolved)).toEqual([]);
    expect(checkManifest([{ text: '43', source: 'counter:f.count.1' }], resolved))
      .toEqual([{ text: '43', source: 'counter:f.count.1', reason: 'out-of-range' }]);
  });

  it('counter text that is not a plain integer is rejected', () => {
    expect(checkManifest([{ text: '4.2', source: 'counter:f.count.1' }], resolved)[0]!.reason).toBe('mismatch');
    expect(checkManifest([{ text: '-1', source: 'counter:f.count.1' }], resolved)[0]!.reason).toBe('mismatch');
  });

  // Orchestrator ruling (M1): units ("routes") are code-derived text too, so they need a
  // source form — unit:<factId> must draw exactly that count fact's unit, nothing else.
  it('a unit label passes only as the exact unit of a bound count fact', () => {
    const unit = Object.values(resolved.beats).flatMap((b: any) => Object.values(b.slots))
      .flatMap((s: any) => s.items).find((it: any) => it.id === 'f.count.1')!.unit as string;
    expect(typeof unit).toBe('string');
    expect(checkManifest([{ text: unit, source: 'unit:f.count.1' }], resolved)).toEqual([]);
    expect(checkManifest([{ text: unit + 's', source: 'unit:f.count.1' }], resolved)[0]!.reason).toBe('mismatch');
    // a fact without a unit (a command) cannot source a unit label
    expect(checkManifest([{ text: 'npm run dev', source: 'unit:f.command.1' }], resolved)[0]!.reason).toBe('unknown-source');
    expect(checkManifest([{ text: unit, source: 'unit:f.count.99' }], resolved)[0]!.reason).toBe('unknown-source');
  });

  it('(g) text with no source is unsourced', () => {
    expect(checkManifest([{ text: 'hello', source: null }], resolved))
      .toEqual([{ text: 'hello', source: null, reason: 'unsourced' }]);
  });

  it('a source id that is not in the resolved set is rejected (e.g. a real fact the storyboard never bound)', () => {
    const out = checkManifest([
      { text: '/checkout', source: 'f.route.1' },
      { text: '3', source: 'counter:f.route.1' },
      { text: '3', source: 'counter:f.feature.1' },
    ], resolved);
    expect(out.map((x: { reason: string }) => x.reason)).toEqual(['unknown-source', 'unknown-source', 'unknown-source']);
  });
});

describe('variantSlots (C13) — kinetic-text "chapter" validates against its own slot rules', () => {
  // A chapter card is a title card: the lead phrase IS the content, so it is required and must be a
  // chapter phrase; a body line is optional. Other variants keep the base rules, so a chapter
  // phrase can never leak into a "stack" lead (and vice versa).
  const chapter = (mut: (b: Beat) => void = () => {}) => sbWith((b) => {
    b[1] = { id: 'b2', archetype: 'kinetic-text', variant: 'chapter', weight: 1, bindings: {}, phrases: { lead: 'p.chapter.1' }, transitionOut: 'cut' };
    mut(b[1]);
  });

  it('0 lines + a chapter lead is valid (base slots would demand >= 1 line)', () => {
    expect(errs(chapter())).toEqual([]);
    expect(errs(chapter((b) => { b.bindings.lines = 'f.feature.1'; }))).toEqual([]);
  });

  it('the lead is REQUIRED in chapter (E_SLOT_COUNT), optional elsewhere', () => {
    expect(errs(chapter((b) => { delete b.phrases.lead; }))).toEqual([expect.objectContaining({ path: '/beats/1/phrases/lead', code: 'E_SLOT_COUNT' })]);
    expect(errs(sbWith((b) => { delete b[1]!.phrases.lead; }))).toEqual([]);
  });

  it('chapter takes at most 1 line (E_SLOT_COUNT at 2)', () => {
    const e = errs(chapter((b) => { b.bindings.lines = ['f.feature.1', 'f.feature.2']; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/1/bindings/lines', code: 'E_SLOT_COUNT' })]);
  });

  it('chapter tag is enforced both ways: a lead phrase in chapter and a chapter phrase in stack are E_SLOT_KIND', () => {
    expect(errs(chapter((b) => { b.phrases.lead = 'p.lead.1'; }))).toEqual([expect.objectContaining({ path: '/beats/1/phrases/lead', code: 'E_SLOT_KIND' })]);
    expect(errs(sbWith((b) => { b[1]!.phrases.lead = 'p.chapter.1'; }))).toEqual([expect.objectContaining({ path: '/beats/1/phrases/lead', code: 'E_SLOT_KIND' })]);
  });

  it('the override merges per field over the base slot (kinds/source/maxChars are inherited)', () => {
    const e = errs(chapter((b) => { b.bindings.lines = 'f.count.1'; }));
    expect(e).toEqual([expect.objectContaining({ path: '/beats/1/bindings/lines', code: 'E_SLOT_KIND' })]);
  });

  it('the shipped archetypes.json only overrides slots and variants that exist', () => {
    for (const [id, a] of Object.entries<any>(ARCHETYPES.archetypes)) {
      for (const [variant, over] of Object.entries<any>(a.variantSlots ?? {})) {
        expect(a.variants, `${id}.${variant}`).toContain(variant);
        for (const slotId of Object.keys(over)) expect(Object.keys(a.slots), `${id}.${variant}.${slotId}`).toContain(slotId);
      }
    }
  });
});

describe('M2 archetypes (C13) — slot rules and cue-map override names', () => {
  const extra = [
    ['f.route.2', 'route', '/cart'], ['f.route.3', 'route', '/account'], ['f.route.4', 'route', '/orders/[id]/receipt-history-x'],
  ].map(([id, kind, display]) => ({ ...clone(FACTS.facts[5]), id, kind, value: display, display }));
  const facts = { ...FACTS, facts: [...FACTS.facts, ...extra] };
  const flow = (mut: (b: Beat) => void = () => {}) => sbWith((b) => {
    // routes carry no sequence (ruling f), so the unordered "cluster" variant + a phrase that implies no order
    b[1] = { id: 'b2', archetype: 'flow-graph', variant: 'cluster', weight: 1, bindings: { steps: ['f.route.1', 'f.route.2', 'f.route.3'] }, phrases: { lead: 'p.flow.4' }, transitionOut: 'column-wipe' };
    mut(b[1]);
  });
  const e = (sb: unknown) => errs(sb, ctx({ facts }));
  // the shipped flow-graph step map (from..to read from archetypes.json, so tuning re-derives the windows below);
  // 3 steps → defaults from, (from+to)/2, to — computed exactly as validate.mjs does, so messages match verbatim
  const STEP = ARCHETYPES.archetypes['flow-graph'].cueMaps.find((m: { name: string }) => m.name === 'step');
  const d1 = STEP.from + ((STEP.to - STEP.from) * 1) / 2;
  const reEsc = (x: number) => String(x).replace(/\./g, '\\.');

  it('a valid flow-graph beat passes (column-wipe is a legal transition)', () => {
    expect(e(flow())).toEqual([]);
  });

  it('flow-graph needs 3..6 steps and <= 28 chars per step', () => {
    expect(e(flow((b) => { b.bindings.steps = ['f.route.1', 'f.route.2']; }))).toEqual([expect.objectContaining({ path: '/beats/1/bindings/steps', code: 'E_SLOT_COUNT' })]);
    expect(e(flow((b) => { b.bindings.steps = ['f.route.1', 'f.route.2', 'f.route.4']; }))).toEqual([expect.objectContaining({ path: '/beats/1/bindings/steps/2', code: 'E_TEXT_LIMIT' })]);
  });

  it('a storyboard cue may override a mapped cue by full name "<map>.<i>" for i < N', () => {
    // 3 steps: defaults from, (from+to)/2, to (now 0.15, 0.325, 0.5) — the last step may move anywhere after step.1
    // up to the map's `to`: half-way between step.1's default and `to`
    expect(e(flow((b) => { b.cues = [{ name: 'step.2', at: (d1 + STEP.to) / 2, kind: 'boom', amp: 1 }]; }))).toEqual([]);
  });

  it('a mapped-cue override outside the map window (from..to) or out of index order is E_SCHEMA', () => {
    // flow-graph reveals step i before step i+1 (one path light per step); out-of-order or past `to` (into the
    // `converge` implosion) would render a scrambled reveal with no error
    const past = e(flow((b) => { b.cues = [{ name: 'step.2', at: 0.7, kind: 'boom', amp: 1 }]; }));
    expect(past).toEqual([expect.objectContaining({ path: '/beats/1/cues/0/at', code: 'E_SCHEMA' })]);
    expect(STEP.to, 'precondition: 0.7 is past the map window').toBeLessThan(0.7);
    expect(past[0]!.message).toMatch(new RegExp(`outside.*${reEsc(STEP.from)}\\.\\.${reEsc(STEP.to)}`));
    const early = e(flow((b) => { b.cues = [{ name: 'step.0', at: 0.1, kind: 'boom', amp: 1 }]; }));
    expect(early).toEqual([expect.objectContaining({ path: '/beats/1/cues/0/at', code: 'E_SCHEMA' })]);
    // step.2 before step.0 (both in the window): order broken
    const swapped = e(flow((b) => { b.cues = [{ name: 'step.2', at: 0.2, kind: 'boom', amp: 1 }]; }));
    expect(swapped).toEqual([expect.objectContaining({ path: '/beats/1/cues/0/at', code: 'E_SCHEMA' })]);
    expect(swapped[0]!.message).toMatch(new RegExp(`index order.*step\\.1 at ${reEsc(d1)}`));
    // two overrides that swap each other are judged against each other, not against the defaults
    const pair = e(flow((b) => { b.cues = [{ name: 'step.0', at: 0.4, kind: 'snap', amp: 1 }, { name: 'step.1', at: 0.3, kind: 'snap', amp: 1 }]; }));
    expect(pair.map((x) => x.path)).toEqual(['/beats/1/cues/0/at', '/beats/1/cues/1/at']);
    // in order + in the window passes even when several move
    expect(e(flow((b) => { b.cues = [{ name: 'step.0', at: 0.2, kind: 'snap', amp: 1 }, { name: 'step.1', at: 0.3, kind: 'snap', amp: 1 }]; }))).toEqual([]);
  });

  it('KEEP LITERAL (Rule 9): a pinned 0.15..0.6 step map yields hand-written window + order messages', () => {
    // d1 and the regexes above mirror validate.mjs's default-placement formula, so a change to that formula made
    // the same way on both sides would pass them; only these hand-written numbers make the check non-tautological.
    const pinned = clone(ARCHETYPES);
    pinned.archetypes['flow-graph'].cueMaps = [{ ...STEP, from: 0.15, to: 0.6 }];
    const ep = (sb: unknown) => errs(sb, ctx({ facts, archetypes: pinned }));
    expect(ep(flow((b) => { b.cues = [{ name: 'step.2', at: 0.55, kind: 'boom', amp: 1 }]; }))).toEqual([]);
    const past = ep(flow((b) => { b.cues = [{ name: 'step.2', at: 0.7, kind: 'boom', amp: 1 }]; }));
    expect(past).toEqual([expect.objectContaining({ path: '/beats/1/cues/0/at', code: 'E_SCHEMA' })]);
    expect(past[0]!.message).toMatch(/outside.*0\.15\.\.0\.6/);
    const swapped = ep(flow((b) => { b.cues = [{ name: 'step.2', at: 0.2, kind: 'boom', amp: 1 }]; }));
    expect(swapped).toEqual([expect.objectContaining({ path: '/beats/1/cues/0/at', code: 'E_SCHEMA' })]);
    expect(swapped[0]!.message).toMatch(/index order.*step\.1 at 0\.375/);
  });

  it('a mapped-cue name past N, or naming no cue map, is E_SCHEMA (an override that can never fire is a lie)', () => {
    const past = e(flow((b) => { b.cues = [{ name: 'step.3', at: 0.7, kind: 'boom', amp: 1 }]; }));
    expect(past).toEqual([expect.objectContaining({ path: '/beats/1/cues/0/name', code: 'E_SCHEMA' })]);
    expect(past[0]!.message).toMatch(/step\.0.*step\.2/);
    const noMap = e(flow((b) => { b.cues = [{ name: 'node.0', at: 0.7, kind: 'boom', amp: 1 }]; }));
    expect(noMap).toEqual([expect.objectContaining({ path: '/beats/1/cues/0/name', code: 'E_SCHEMA' })]);
  });
});

// Orchestrator ruling (f) — flow-graph truthfulness. chain/converge draw arrows ("this, then this"): a claim only
// the README's own ordered step list can back. A mock LLM that strings features/stack items/routes into a chain,
// reorders real steps, or splices two step lists together must be refused, naming the fact; "cluster" (no arrows)
// takes the same facts without any order claim.
describe('ruling (f) — E_SLOT_ORDER: sequential flow-graph variants bind ONE ordered step list, ascending', () => {
  const step = (id: string, kind: string, display: string, collection: string | null, sequence: number | null) =>
    ({ ...clone(FACTS.facts[5]), id, kind, value: display, display, collection, sequence });
  const facts = { ...FACTS, facts: [...FACTS.facts,
    step('f.command.3', 'command', 'npm ci', 'readme.steps.1', 1),
    step('f.command.4', 'command', 'npm run dev', 'readme.steps.1', 2),
    step('f.feature.3', 'feature', 'Open localhost:3000', 'readme.steps.1', 3),
    step('f.command.5', 'command', 'npm test', 'readme.steps.1', 5), // gap at 4 (an untitled item): allowed
    step('f.command.6', 'command', 'make deploy', 'readme.steps.2', 1),
    step('f.route.2', 'route', '/cart', 'routes', null),
    step('f.route.3', 'route', '/account', 'routes', null),
  ] };
  const e = (sb: unknown) => errs(sb, ctx({ facts }));
  const flow = (variant: string, steps: string[], lead: string | null = null) => sbWith((b) => {
    b[1] = { id: 'b2', archetype: 'flow-graph', variant, weight: 1, bindings: { steps }, phrases: lead ? { lead } : {}, transitionOut: 'cut' };
  });
  const ORDERED = ['f.command.3', 'f.command.4', 'f.feature.3', 'f.command.5'];

  it('the fixture facts are C3-valid (sequence is part of the schema)', () => {
    expect(validate(schema('facts'), facts)).toEqual([]);
  });

  it('chain and converge accept one collection in ascending sequence, gaps allowed', () => {
    for (const v of ['chain', 'converge']) {
      expect(e(flow(v, ORDERED)), v).toEqual([]);
      expect(e(flow(v, ['f.command.3', 'f.feature.3', 'f.command.5'])), v).toEqual([]);
    }
  });

  it('feature / stack.item facts without a sequence in a chain → E_SLOT_ORDER naming each fact', () => {
    for (const v of ['chain', 'converge']) {
      const out = e(flow(v, ['f.feature.1', 'f.stack.item.1', 'f.feature.2']));
      expect(out.map((x) => [x.path, x.code]), v).toEqual([
        ['/beats/1/bindings/steps/0', 'E_SLOT_ORDER'], ['/beats/1/bindings/steps/1', 'E_SLOT_ORDER'], ['/beats/1/bindings/steps/2', 'E_SLOT_ORDER'],
      ]);
      expect(out[1]!.message).toContain('"f.stack.item.1"');
      expect(out[1]!.message).toContain('b2');
      expect(out[1]!.message).toContain('"steps"');
      expect(out[1]!.message).toContain('cluster');
    }
    // one unordered fact among real steps is still refused, at its own index
    expect(e(flow('chain', ['f.command.3', 'f.route.1', 'f.command.4']))).toEqual([expect.objectContaining({ path: '/beats/1/bindings/steps/1', code: 'E_SLOT_ORDER' })]);
  });

  it('real steps out of order (or repeated) → E_SLOT_ORDER naming the fact that breaks the order', () => {
    const swapped = e(flow('chain', ['f.command.4', 'f.command.3', 'f.feature.3']));
    expect(swapped).toEqual([expect.objectContaining({ path: '/beats/1/bindings/steps/1', code: 'E_SLOT_ORDER' })]);
    expect(swapped[0]!.message).toMatch(/"f\.command\.3" \(sequence 1\) does not follow "f\.command\.4" \(sequence 2\)/);
    const repeated = e(flow('converge', ['f.command.3', 'f.command.4', 'f.command.4']));
    expect(repeated).toEqual([expect.objectContaining({ path: '/beats/1/bindings/steps/2', code: 'E_SLOT_ORDER' })]);
  });

  it('steps from two different ordered lists in one chain → E_SLOT_ORDER naming the foreign fact', () => {
    const mixed = e(flow('chain', ['f.command.3', 'f.command.4', 'f.command.6']));
    expect(mixed).toEqual([expect.objectContaining({ path: '/beats/1/bindings/steps/2', code: 'E_SLOT_ORDER' })]);
    expect(mixed[0]!.message).toContain('"f.command.6"');
    expect(mixed[0]!.message).toContain('readme.steps.2');
  });

  it('cluster (no arrows, no order claim) accepts unordered facts, mixed lists and any order', () => {
    expect(e(flow('cluster', ['f.feature.1', 'f.stack.item.1', 'f.route.1']))).toEqual([]);
    expect(e(flow('cluster', ['f.command.6', 'f.command.4', 'f.command.3']))).toEqual([]);
  });

  it('the rule lives in archetypes.json: steps is sequential in converge + chain, never in cluster', () => {
    const fg = ARCHETYPES.archetypes['flow-graph'];
    expect(fg.variants).toEqual(['converge', 'chain', 'cluster']);
    const seq = (v: string) => Boolean(fg.variantSlots?.[v]?.steps?.sequence);
    expect([seq('converge'), seq('chain'), seq('cluster')]).toEqual([true, true, false]);
    // cluster keeps the step cue map (cue maps are per archetype, not per variant)
    expect(fg.cueMaps.map((m: { name: string; per: string }) => [m.name, m.per])).toEqual([['step', 'steps']]);
  });
});

describe('ruling (f) — E_PHRASE_KIND: a phrase must be true of every fact it heads', () => {
  const e = (sb: unknown, c = ctx()) => errs(sb, c);
  const FACT_KINDS: string[] = schema('facts').$defs.textFact.properties.kind.enum.concat(['count']);
  const list: { id: string; tags: string[]; kinds?: string[]; variants?: string[]; text: string }[] = PHRASES.phrases;

  it('"Under the hood" over product features → E_PHRASE_KIND naming the phrase and the fact', () => {
    const out = e(sbWith((b) => { b[1]!.phrases.lead = 'p.lead.2'; })); // b2 lines: f.feature.1, f.feature.2
    expect(phraseText('p.lead.2')).toBe('Under the hood');
    expect(out.map((x) => [x.path, x.code])).toEqual([['/beats/1/phrases/lead', 'E_PHRASE_KIND'], ['/beats/1/phrases/lead', 'E_PHRASE_KIND']]);
    expect(out[0]!.message).toContain('"p.lead.2"');
    expect(out[0]!.message).toContain('"f.feature.1"');
    expect(out[1]!.message).toContain('"f.feature.2"');
    // …and is fine over the stack (b5 lines: f.stack.item.1)
    expect(e(sbWith((b) => { b[4]!.phrases = { lead: 'p.lead.2' }; }))).toEqual([]);
  });

  it('one wrong kind in a mixed beat is enough ("Built in" over a feature + a stack item)', () => {
    const out = e(sbWith((b) => { b[1]!.bindings.lines = ['f.feature.1', 'f.stack.item.1']; b[1]!.phrases.lead = 'p.lead.4'; }));
    expect(out).toEqual([expect.objectContaining({ path: '/beats/1/phrases/lead', code: 'E_PHRASE_KIND' })]);
    expect(out[0]!.message).toContain('"f.stack.item.1"');
  });

  it('a variant-scoped phrase outside its variants → E_PHRASE_KIND ("Step by step" over a cluster)', () => {
    const extra = ['/cart', '/account'].map((d, i) => ({ ...clone(FACTS.facts[5]), id: `f.route.${i + 2}`, value: d, display: d }));
    const c = ctx({ facts: { ...FACTS, facts: [...FACTS.facts, ...extra] } });
    const cluster = (lead: string) => sbWith((b) => {
      b[1] = { id: 'b2', archetype: 'flow-graph', variant: 'cluster', weight: 1, bindings: { steps: ['f.route.1', 'f.route.2', 'f.route.3'] }, phrases: { lead }, transitionOut: 'cut' };
    });
    const out = e(cluster('p.flow.1'), c);
    expect(out.map((x) => x.code)).toContain('E_PHRASE_KIND');
    expect(out.find((x) => /variants/.test(x.message))!.message).toContain('"p.flow.1"');
    expect(e(cluster('p.flow.4'), c)).toEqual([]);
  });

  it('a phrase with no kinds annotation is refused (it cannot be proven true of anything)', () => {
    const phrases = clone(PHRASES);
    delete phrases.phrases.find((p: { id: string }) => p.id === 'p.lead.1').kinds;
    const out = e(STORYBOARD, ctx({ phrases }));
    expect(out).toEqual([expect.objectContaining({ path: '/beats/1/phrases/lead', code: 'E_PHRASE_KIND' })]);
    expect(out[0]!.message).toContain('"p.lead.1"');
  });

  it('a phrase already refused for its tag is not double-reported (one root cause, one error)', () => {
    expect(e(sbWith((b) => { b[6]!.phrases.cta = 'p.open.1'; })).map((x) => x.code)).toEqual(['E_SLOT_KIND']);
  });

  it('every shipped phrase is annotated: non-empty kinds of real fact kinds; variants (when set) are real variants of an archetype its tags fit', () => {
    for (const p of list) {
      expect(Array.isArray(p.kinds) && p.kinds.length > 0, p.id).toBe(true);
      for (const k of p.kinds!) expect(FACT_KINDS, `${p.id} kind ${k}`).toContain(k);
      if (p.variants === undefined) continue;
      expect(p.variants.length, p.id).toBeGreaterThan(0);
      const fitting = Object.values<any>(ARCHETYPES.archetypes)
        .filter((a) => a.variants.some((v: string) => Object.values<any>(slotsOf(a, v)).some((s) => s.source === 'phrase' && s.tags.some((t: string) => p.tags.includes(t)))))
        .flatMap((a) => a.variants);
      for (const v of p.variants) expect(fitting, `${p.id} variant ${v}`).toContain(v);
    }
  });

  it('KEEP LITERAL (Rule 9): the named annotations of the ruling hold', () => {
    const by = (id: string) => list.find((p) => p.id === id)!;
    expect(by('p.lead.2').kinds).toEqual(['stack.item']); // 'Under the hood' is never a feature lead
    expect(by('p.flow.1').text).toBe('Step by step');
    expect([...by('p.flow.1').variants!].sort()).toEqual(['chain', 'converge']);
  });

  it('>= 3 flow phrases may head a cluster, and none of them implies an order', () => {
    const forCluster = list.filter((p) => p.tags.includes('flow') && (!p.variants || p.variants.includes('cluster')));
    expect(forCluster.length).toBeGreaterThanOrEqual(3);
    for (const p of forCluster) expect(p.text, p.id).not.toMatch(/step|then|first|next|start|finish|flow|order/i);
    // the order-implying flow phrases are all limited to the sequential variants
    for (const p of list.filter((x) => x.tags.includes('flow') && /step|start|finish|flow/i.test(x.text))) {
      expect(p.variants, p.id).toBeDefined();
      expect(p.variants, p.id).not.toContain('cluster');
    }
  });
});

describe('offFrame (C16) — drawn text bbox inside the 1920x1080 frame minus a 48 px safe margin', () => {
  // Every on-screen string must be readable: a word clipped by the frame edge (or hugging it, where
  // TVs/players overscan) is a failed beat. offFrame is the pure judge the browser tests call.
  it('flags a bbox at x=1900 and passes one well inside', () => {
    const inside = { text: 'Saved carts', source: 'f.feature.1', bbox: { x: 200, y: 400, w: 600, h: 80 } };
    const off = { text: 'Guest checkout', source: 'f.feature.2', bbox: { x: 1900, y: 400, w: 300, h: 80 } };
    expect(offFrame([inside, off])).toEqual([off]);
  });

  it('the margin is exclusive of the frame edge on all four sides; exactly on the margin passes', () => {
    const box = (x: number, y: number, w: number, h: number) => ({ text: 't', source: 'p.lead.1', bbox: { x, y, w, h } });
    expect(offFrame([box(48, 48, 1824, 984)])).toEqual([]);
    for (const b of [box(47, 100, 10, 10), box(100, 47, 10, 10), box(1863, 100, 10, 10), box(100, 1023, 10, 10)]) {
      expect(offFrame([b]), JSON.stringify(b.bbox)).toEqual([b]);
    }
  });

  it('entries without a bbox (not drawn in the last frame) are skipped; options override W/H/margin', () => {
    expect(offFrame([{ text: 't', source: 'p.lead.1', bbox: null }])).toEqual([]);
    const b = { text: 't', source: 'p.lead.1', bbox: { x: 10, y: 10, w: 10, h: 10 } };
    expect(offFrame([b], { W: 100, H: 100, margin: 0 })).toEqual([]);
    expect(offFrame([b], { W: 100, H: 100, margin: 20 })).toEqual([b]);
  });
});
