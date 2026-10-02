// Storyboard → resolved.json (C7). Rule 13: the only strings read from the storyboard are
// ids; every on-screen text is taken from facts.json (fact.display) or phrases.json
// (phrase.text). A storyboard that fails validation is refused whole, with every error.
import { ShowreelError } from '../util/out.mjs';
import { validateStoryboard, indexInputs } from './validate.mjs';

const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function resolve(sb, inputs) {
  const errors = validateStoryboard(sb, inputs);
  if (errors.length) {
    throw new ShowreelError(
      'E_STORYBOARD',
      `storyboard.json has ${errors.length} error(s): ` + errors.map((e) => `${e.path || '/'} ${e.code}: ${e.message}`).join('; '),
      'Fix showreel/storyboard.json: use only fact ids from showreel/facts.json and phrase ids from .claude/showreel/phrases.json, in slots the archetype defines.',
    );
  }
  const idx = indexInputs(inputs);
  const beats = {};
  const allowed = new Set();

  for (const beat of sb.beats) {
    const arch = idx.archetypes.get(beat.archetype);
    const slots = {};
    // Every archetype slot is emitted (empty items when unbound) so consumers see a stable shape.
    for (const [slotId, slot] of Object.entries(arch.slots)) {
      const group = slot.source === 'fact' ? beat.bindings : beat.phrases;
      const items = asList(group && group[slotId]).map((id) => {
        if (slot.source === 'fact') {
          const f = idx.facts.get(id);
          return { id, text: f.display, number: f.kind === 'count' ? f.value : null, unit: f.unit ?? null };
        }
        return { id, text: idx.phrases.get(id).text, number: null, unit: null };
      });
      for (const it of items) {
        allowed.add(it.text);
        if (it.unit !== null) allowed.add(it.unit);
      }
      slots[slotId] = { source: slot.source, items, fitSizePx: null };
    }
    beats[beat.id] = { archetype: beat.archetype, variant: beat.variant, slots };
  }
  // Code-unit sort, never locale order: byte-stable across machines.
  return { version: 1, beats, allowed: [...allowed].sort() };
}
