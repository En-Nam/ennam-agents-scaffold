// Deterministic storyboard from a `facts` digest — the e2e stand-in for the motion-designer agent
// (no LLM). Picks facts in digest order, cycling, filtered by the slot's kinds and maxChars from
// archetypes.json, so every id it emits is a real fact id and passes `check` on any repo that passed
// the minimum gate. Beat count = the low end of the duration budget (C4).

import { slotsFor as prodSlotsFor } from '../../../templates/showreel/.claude/showreel/lib/truth/validate.mjs';

export type DigestFact = { id: string; kind: string; display: string; unit: string | null };
type Beat = Record<string, unknown>;

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
    beats.push({
      id: `b${n}`, archetype: t.archetype, variant: t.variant, weight: 1,
      bindings: isKinetic ? { lines: next(lines, 'lines', t.take) } : { counters: next(counts, 'counts', t.take) },
      phrases: isKinetic ? { lead: `p.lead.${(i % 3) + 1}` } : { label: `p.metrics.${(i % 3) + 1}` },
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

export type ArrangementBeat = { archetype: string; variant: string; weight: number; transitionOut: string };
type SlotSpec = { source: 'fact' | 'phrase'; kinds?: string[]; tags?: string[]; min: number; max: number; maxChars?: number };
type ArchSpec = { slots: Record<string, SlotSpec>; variantSlots?: Record<string, Record<string, Partial<SlotSpec>>> };
type Phrase = { id: string; tags: string[]; text: string };

// The variant merge is the PRODUCTION rule (lib/truth/validate.mjs), not a copy: a test-side
// re-implementation could drift from what `check` enforces (Rule 7).
const slotsFor = (spec: ArchSpec, variant: string) => prodSlotsFor(spec, variant) as Record<string, SlotSpec>;

export function storyboardFromArrangement(
  digest: DigestFact[],
  durationS: 15 | 30 | 45 | 60,
  arrangement: ArrangementBeat[],
  archetypes: { archetypes: Record<string, ArchSpec> },
  phrases: { phrases: Phrase[] },
  { seed = 7, count = 'typical' }: { seed?: number; count?: 'min' | 'typical' | 'max' } = {},
) {
  const cursor = new Map<string, number>();
  const beats = arrangement.map((a, i) => {
    const spec = archetypes.archetypes[a.archetype];
    if (!spec) throw new Error(`storyboardFromArrangement: unknown archetype "${a.archetype}"`);
    const bindings: Record<string, string | string[]> = {};
    const phraseIds: Record<string, string> = {};
    for (const [slotId, s] of Object.entries(slotsFor(spec, a.variant))) {
      const n = count === 'min' ? s.min : count === 'max' ? s.max : Math.ceil((s.min + s.max) / 2);
      if (n === 0) continue;
      if (s.source === 'phrase') {
        const pool = phrases.phrases.filter((p) => p.tags.some((t) => s.tags!.includes(t)));
        if (!pool.length) throw new Error(`storyboardFromArrangement: no phrase tagged ${s.tags!.join('/')} for ${a.archetype}.${slotId}`);
        phraseIds[slotId] = pool[i % pool.length]!.id;
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
    return { id: `b${i + 1}`, archetype: a.archetype, variant: a.variant, weight: a.weight, bindings, phrases: phraseIds, transitionOut: a.transitionOut };
  });
  return { version: 1, durationS, seed, palette: 'violet', beats };
}
