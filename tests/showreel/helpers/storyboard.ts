// Deterministic storyboard from a `facts` digest — the e2e stand-in for the motion-designer agent
// (no LLM). Picks facts in digest order, cycling, filtered by the slot's kinds and maxChars from
// archetypes.json, so every id it emits is a real fact id and passes `check` on any repo that passed
// the minimum gate. Beat count = the low end of the duration budget (C4).
// Ruling (f): every phrase it picks is annotated (phrases.json `kinds` / `variants`) as true of every
// fact bound in its beat, so a helper storyboard can never fail with E_PHRASE_KIND.

import { readFileSync } from 'node:fs';
import { slotsFor as prodSlotsFor } from '../../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';

export type DigestFact = { id: string; kind: string; display: string; unit: string | null; collection?: string; sequence?: number };
type Beat = Record<string, unknown>;
type Phrase = { id: string; tags: string[]; kinds?: string[]; variants?: string[]; text: string };

const SHIPPED_PHRASES: { phrases: Phrase[] } = JSON.parse(
  readFileSync(new URL('../../../templates/showreel/.claude/showreel/phrases.json', import.meta.url), 'utf8'),
);

/** Phrases carrying one of `tags` that are true of EVERY bound fact kind and allowed in `variant` (ruling f). */
export function compatiblePhrases(phrases: Phrase[], tags: string[], kinds: string[], variant: string): Phrase[] {
  return phrases.filter((p) => p.tags.some((t) => tags.includes(t))
    && kinds.every((k) => (p.kinds ?? []).includes(k))
    && (!p.variants || p.variants.includes(variant)));
}

const BEATS: Record<number, number> = { 15: 4, 30: 7, 45: 10, 60: 13 };
const BODY = [
  { archetype: 'kinetic-text', variant: 'stack', take: 3 },
  { archetype: 'metrics-counter-lock', variant: 'row', take: 3 },
  { archetype: 'kinetic-text', variant: 'punch', take: 1 },
  { archetype: 'metrics-counter-lock', variant: 'grid', take: 4 },
] as const;

const len = (s: string) => [...s].length;

export function makeStoryboard(digest: DigestFact[], durationS: 15 | 30 | 45 | 60, seed = 7) {
  const pick = (kinds: string[], maxChars: number) => digest.filter((f) => kinds.includes(f.kind) && len(f.display) <= maxChars);
  const commands = pick(['command'], 64);
  const names = pick(['app.name'], 32);
  const taglines = pick(['app.tagline'], 64);
  const lines = pick(['feature', 'app.tagline', 'stack.item', 'problem'], 48);
  const counts = pick(['count'], 12);
  if (!commands.length || !names.length || !lines.length) {
    throw new Error(`makeStoryboard: digest lacks a command (${commands.length}), app.name (${names.length}) or kinetic line (${lines.length})`);
  }
  const cursor = { lines: 0, counts: 0 };
  const next = (pool: DigestFact[], key: 'lines' | 'counts', n: number) => {
    const ids: string[] = [];
    for (let k = 0; k < Math.min(n, pool.length); k++) ids.push(pool[(cursor[key]++) % pool.length]!.id);
    return ids;
  };
  const kindOf = new Map(digest.map((f) => [f.id, f.kind]));
  // the i-th compatible phrase (cycling), or none — every phrase slot here is optional
  const phraseFor = (tag: string, ids: string[], variant: string, i: number) => {
    const pool = compatiblePhrases(SHIPPED_PHRASES.phrases, [tag], [...new Set(ids.map((id) => kindOf.get(id)!))], variant);
    return pool.length ? pool[i % pool.length]!.id : null;
  };

  const total = BEATS[durationS]!;
  const beats: Beat[] = [{
    id: 'b1', archetype: 'cold-open-command', variant: 'terminal', weight: 1.25,
    bindings: { command: commands[0]!.id }, phrases: { caption: 'p.open.1' }, transitionOut: 'zoom-through',
  }];
  const body = counts.length ? BODY : BODY.filter((b) => b.archetype === 'kinetic-text');
  for (let i = 0; i < total - 2; i++) {
    const t = body[i % body.length]!;
    const n = i + 2;
    const isKinetic = t.archetype === 'kinetic-text';
    const ids = isKinetic ? next(lines, 'lines', t.take) : next(counts, 'counts', t.take);
    const phrase = phraseFor(isKinetic ? 'lead' : 'metrics', ids, t.variant, i);
    beats.push({
      id: `b${n}`, archetype: t.archetype, variant: t.variant, weight: 1,
      bindings: isKinetic ? { lines: ids } : { counters: ids },
      phrases: phrase ? { [isKinetic ? 'lead' : 'label']: phrase } : {},
      transitionOut: i % 2 === 0 ? 'cut' : 'zoom-through',
    });
  }
  beats.push({
    id: `b${total}`, archetype: 'lockup-cta', variant: 'center', weight: 1.5,
    bindings: { name: names[0]!.id, ...(taglines.length ? { tagline: taglines[0]!.id } : {}), command: commands[0]!.id },
    phrases: { cta: 'p.cta.1' }, transitionOut: 'cut',
  });
  return { version: 1, durationS, seed, palette: 'violet', beats };
}

// ---------------------------------------------------------------------------------------------
// M2 (C15): storyboard from a recommended arrangement (archetypes/arrangements.json). Same idea as
// makeStoryboard — the agent stand-in picks real fact/phrase ids, never writes copy — but the beat
// sequence comes from the arrangement, and the slot rules (kinds, min/max, maxChars, phrase tags)
// come from archetypes.json with the variant's `variantSlots` merged over `slots` (C13).
// `count` picks how many items each fact list slot gets: min | typical (ceil of the midpoint) | max.
// Fails loud when the digest cannot fill a slot (Rule 12) instead of emitting an invalid storyboard.
//
// Ruling (f) — sequential variants (a slot with `"sequence": true`, e.g. flow-graph chain/converge, which draw
// arrows) are picked ONLY when the digest has an ordered step collection (facts with collection + sequence) of
// at least the slot's min items that fit it:
//   - an arrangement beat naming a sequential variant falls back to the archetype's first non-sequential variant
//     (cluster) when no such collection exists;
//   - the FIRST beat of an archetype with sequential variants is upgraded to its sequential variant ("chain" when
//     offered) when such a collection exists, so the ordered path is exercised; later beats keep the arrangement's
//     variant (the same steps are shown in order once).
// A sequential slot binds the longest qualifying collection in ascending sequence, min(N, collection size) items.
// Phrase slots are filled AFTER the fact slots, from phrases true of every bound fact kind (and the variant).

export type ArrangementBeat = { archetype: string; variant: string; weight: number; transitionOut: string };
type SlotSpec = { source: 'fact' | 'phrase'; kinds?: string[]; tags?: string[]; min: number; max: number; maxChars?: number; sequence?: boolean };
type ArchSpec = { variants: string[]; slots: Record<string, SlotSpec>; variantSlots?: Record<string, Record<string, Partial<SlotSpec>>> };

// The variant merge is the PRODUCTION rule (lib/truth/validate.mjs), not a copy: a test-side
// re-implementation could drift from what `check` enforces (Rule 7).
const slotsFor = (spec: ArchSpec, variant: string) => prodSlotsFor(spec, variant) as Record<string, SlotSpec>;
const isSequential = (spec: ArchSpec, variant: string) => Object.values(slotsFor(spec, variant)).some((s) => s.sequence);

/** The digest's ordered step collections fitting `slot` (kinds + maxChars), each in ascending sequence, longest first. */
export function stepCollections(digest: DigestFact[], slot: SlotSpec): DigestFact[][] {
  const byCollection = new Map<string, DigestFact[]>();
  for (const f of digest) {
    if (f.sequence == null || !f.collection) continue;
    if (!slot.kinds!.includes(f.kind) || (slot.maxChars !== undefined && len(f.display) > slot.maxChars)) continue;
    if (!byCollection.has(f.collection)) byCollection.set(f.collection, []);
    byCollection.get(f.collection)!.push(f);
  }
  const lists = [...byCollection.values()].map((l) => [...l].sort((a, b) => a.sequence! - b.sequence!));
  return lists.sort((a, b) => b.length - a.length); // stable: equal lengths keep digest order
}

export function storyboardFromArrangement(
  digest: DigestFact[],
  durationS: 15 | 30 | 45 | 60,
  arrangement: ArrangementBeat[],
  archetypes: { archetypes: Record<string, ArchSpec> },
  phrases: { phrases: Phrase[] },
  { seed = 7, count = 'typical' }: { seed?: number; count?: 'min' | 'typical' | 'max' } = {},
) {
  const cursor = new Map<string, number>();
  const upgraded = new Set<string>(); // archetypes whose first beat was considered for a sequential variant
  const kindOf = new Map(digest.map((f) => [f.id, f.kind]));
  const beats = arrangement.map((a, i) => {
    const spec = archetypes.archetypes[a.archetype];
    if (!spec) throw new Error(`storyboardFromArrangement: unknown archetype "${a.archetype}"`);
    const variant = chooseVariant(spec, a, digest, upgraded);
    const slots = Object.entries(slotsFor(spec, variant));
    const bindings: Record<string, string | string[]> = {};
    const phraseIds: Record<string, string> = {};
    for (const [slotId, s] of slots) {
      if (s.source !== 'fact') continue;
      let n = count === 'min' ? s.min : count === 'max' ? s.max : Math.ceil((s.min + s.max) / 2);
      if (n === 0) continue;
      if (s.sequence) {
        const steps = stepCollections(digest, s)[0] ?? [];
        n = Math.min(n, steps.length);
        if (n < s.min) throw new Error(`storyboardFromArrangement: ${a.archetype}.${slotId} (${variant}) is sequential but the digest has no ordered collection of ${s.min}+ fitting steps`);
        bindings[slotId] = steps.slice(0, n).map((f) => f.id);
        continue;
      }
      const pool = digest.filter((f) => s.kinds!.includes(f.kind) && (s.maxChars === undefined || len(f.display) <= s.maxChars));
      if (pool.length < n) {
        throw new Error(`storyboardFromArrangement: ${a.archetype}.${slotId} needs ${n} distinct ${s.kinds!.join('/')} facts <= ${s.maxChars} chars; digest has ${pool.length}`);
      }
      const key = s.kinds!.join('|');
      const start = cursor.get(key) ?? 0;
      cursor.set(key, start + n);
      const ids = Array.from({ length: n }, (_, k) => pool[(start + k) % pool.length]!.id);
      bindings[slotId] = s.max === 1 ? ids[0]! : ids;
    }
    const boundKinds = [...new Set(Object.values(bindings).flat().map((id) => kindOf.get(id)!))];
    for (const [slotId, s] of slots) {
      if (s.source !== 'phrase') continue;
      const n = count === 'min' ? s.min : count === 'max' ? s.max : Math.ceil((s.min + s.max) / 2);
      if (n === 0) continue;
      if (!phrases.phrases.some((p) => p.tags.some((t) => s.tags!.includes(t)))) {
        throw new Error(`storyboardFromArrangement: no phrase tagged ${s.tags!.join('/')} for ${a.archetype}.${slotId}`);
      }
      const pool = compatiblePhrases(phrases.phrases, s.tags!, boundKinds, variant);
      if (!pool.length) {
        if (s.min > 0) throw new Error(`storyboardFromArrangement: no ${s.tags!.join('/')} phrase is true of ${boundKinds.join('/')} facts in ${variant} for ${a.archetype}.${slotId}`);
        continue; // optional: no phrase beats a false one
      }
      phraseIds[slotId] = pool[i % pool.length]!.id;
    }
    return { id: `b${i + 1}`, archetype: a.archetype, variant, weight: a.weight, bindings, phrases: phraseIds, transitionOut: a.transitionOut };
  });
  return { version: 1, durationS, seed, palette: 'violet', beats };
}

function chooseVariant(spec: ArchSpec, a: ArrangementBeat, digest: DigestFact[], upgraded: Set<string>): string {
  const sequential = spec.variants.filter((v) => isSequential(spec, v));
  if (!sequential.length) return a.variant;
  const first = !upgraded.has(a.archetype);
  upgraded.add(a.archetype);
  const fits = (v: string) => Object.values(slotsFor(spec, v)).every((s) => !s.sequence || (stepCollections(digest, s)[0]?.length ?? 0) >= s.min);
  const plain = spec.variants.find((v) => !isSequential(spec, v));
  if (sequential.includes(a.variant)) {
    if (fits(a.variant)) return a.variant;
    if (!plain) throw new Error(`storyboardFromArrangement: ${a.archetype} "${a.variant}" needs ordered steps the digest lacks, and the archetype has no non-sequential variant`);
    return plain;
  }
  const target = sequential.includes('chain') ? 'chain' : sequential[0]!;
  return first && fits(target) ? target : a.variant;
}
