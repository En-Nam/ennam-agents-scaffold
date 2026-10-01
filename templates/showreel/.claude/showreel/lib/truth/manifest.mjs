// Render-time text manifest ⊆ resolved set (D8). The engine records every drawn string
// with its source; anything not traceable to a resolved fact/phrase fails the build.
//   source = '<factId>' | '<phraseId>' → text must equal the resolved text of that id
//   source = 'counter:<factId>'        → text is a plain integer in 0..fact number
//   source = 'unit:<factId>'           → text must equal that count fact's unit (e.g. "routes")
//   anything else                      → 'unsourced'
const COUNTER = 'counter:';
const UNIT = 'unit:';

/** Returns [] or [{text, source, reason}] with reason ∈ mismatch | out-of-range | unknown-source | unsourced. */
export function checkManifest(manifest, resolved) {
  const byId = new Map();
  for (const beat of Object.values(resolved.beats)) {
    for (const slot of Object.values(beat.slots)) {
      for (const it of slot.items) byId.set(it.id, it);
    }
  }
  const out = [];
  for (const { text, source } of manifest) {
    const reason = check(text, source, byId);
    if (reason) out.push({ text, source, reason });
  }
  return out;
}

function check(text, source, byId) {
  if (typeof source !== 'string' || source === '') return 'unsourced';
  if (source.startsWith(COUNTER)) {
    const item = byId.get(source.slice(COUNTER.length));
    if (!item || item.number === null) return 'unknown-source';
    if (typeof text !== 'string' || !/^\d+$/.test(text)) return 'mismatch';
    const n = Number(text);
    return n >= 0 && n <= item.number ? null : 'out-of-range';
  }
  if (source.startsWith(UNIT)) {
    const item = byId.get(source.slice(UNIT.length));
    if (!item || typeof item.unit !== 'string') return 'unknown-source';
    return text === item.unit ? null : 'mismatch';
  }
  if (!/^[fp]\./.test(source)) return 'unsourced';
  const item = byId.get(source);
  if (!item) return 'unknown-source';
  return text === item.text ? null : 'mismatch';
}
