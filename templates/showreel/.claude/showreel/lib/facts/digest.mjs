// The digest the agent reads to write the storyboard: [{id, kind, display, unit}],
// ≤ 150 entries and ≤ 20k chars (~5k tokens). Over budget → round-robin across kinds so
// every kind stays represented; facts.json itself is never truncated.

export const MAX_ENTRIES = 150;
export const MAX_CHARS = 20000;

/** → {digest, truncated} — digest keeps facts-array order; truncated = facts dropped. */
export function makeDigest(facts, maxEntries = MAX_ENTRIES, maxChars = MAX_CHARS) {
  const entries = facts.map((f) => ({ id: f.id, kind: f.kind, display: f.display, unit: f.unit }));
  const groups = new Map();
  entries.forEach((e, i) => {
    if (!groups.has(e.kind)) groups.set(e.kind, []);
    groups.get(e.kind).push(i);
  });
  const keep = new Set();
  let chars = 2; // "[]"
  const longest = Math.max(0, ...[...groups.values()].map((g) => g.length));
  for (let round = 0; round < longest && keep.size < maxEntries; round++) {
    for (const idxs of groups.values()) {
      if (round >= idxs.length || keep.size >= maxEntries) continue;
      const cost = JSON.stringify(entries[idxs[round]]).length + (keep.size ? 1 : 0);
      if (chars + cost > maxChars) continue;
      keep.add(idxs[round]);
      chars += cost;
    }
  }
  const digest = entries.filter((_, i) => keep.has(i));
  return { digest, truncated: entries.length - digest.length };
}
