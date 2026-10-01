// Deterministic storyboard from a `facts` digest — the e2e stand-in for the motion-designer agent
// (no LLM). Picks facts in digest order, cycling, filtered by the slot's kinds and maxChars from
// archetypes.json, so every id it emits is a real fact id and passes `check` on any repo that passed
// the minimum gate. Beat count = the low end of the duration budget (C4).

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
