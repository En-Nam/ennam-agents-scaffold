// Storyboard truth validation (D8 / Rule 13). The LLM-written storyboard may reference
// facts and phrases only by id; this module proves every id exists, fits its slot and
// respects the duration budget. JSON-schema (C4) runs first: if the shape is wrong the
// semantic checks would read untrusted structure, so they are skipped until it is fixed.
import { readFileSync } from 'node:fs';
import { validate } from '../util/schema.mjs';

const SCHEMA = JSON.parse(readFileSync(new URL('../../schema/storyboard.schema.json', import.meta.url), 'utf8'));

/** Beats allowed per duration (D11 / C4). */
export const BEAT_BUDGET = { 15: [4, 5], 30: [7, 8], 45: [10, 11], 60: [13, 14] };
export const LAST_ARCHETYPE = 'lockup-cta';

/**
 * Accepts the parsed archetypes.json / facts.json / phrases.json documents
 * (or their inner map/arrays) and returns id lookups.
 */
export function indexInputs({ archetypes, facts, phrases }) {
  const archMap = archetypes && archetypes.archetypes ? archetypes.archetypes : archetypes;
  const factList = Array.isArray(facts) ? facts : facts.facts;
  const phraseList = Array.isArray(phrases) ? phrases : phrases.phrases;
  return {
    archetypes: new Map(Object.entries(archMap)),
    facts: new Map(factList.map((f) => [f.id, f])),
    phrases: new Map(phraseList.map((p) => [p.id, p])),
  };
}

const asList = (v) => (Array.isArray(v) ? v : [v]);
const charLen = (s) => [...s].length;

/** Returns [] or [{path, code, message}] — every error, not just the first. */
export function validateStoryboard(sb, inputs) {
  const schemaErrors = validate(SCHEMA, sb);
  if (schemaErrors.length) return schemaErrors.map((e) => ({ path: e.path, code: 'E_SCHEMA', message: e.message }));

  const idx = indexInputs(inputs);
  const errors = [];
  const err = (path, code, message) => errors.push({ path, code, message });

  const [lo, hi] = BEAT_BUDGET[sb.durationS];
  if (sb.beats.length < lo || sb.beats.length > hi) {
    err('/beats', 'E_BUDGET', `${sb.durationS} s needs ${lo}-${hi} beats (got ${sb.beats.length})`);
  }

  const seenIds = new Set();
  sb.beats.forEach((beat, i) => {
    const at = `/beats/${i}`;
    if (seenIds.has(beat.id)) err(`${at}/id`, 'E_SCHEMA', `duplicate beat id "${beat.id}"`);
    seenIds.add(beat.id);

    const seenCues = new Set();
    (beat.cues || []).forEach((cue, j) => {
      if (seenCues.has(cue.name)) err(`${at}/cues/${j}/name`, 'E_SCHEMA', `duplicate cue name "${cue.name}" in beat ${beat.id}`);
      seenCues.add(cue.name);
    });

    if (i === sb.beats.length - 1 && beat.archetype !== LAST_ARCHETYPE) {
      err(`${at}/archetype`, 'E_LAST_BEAT', `last beat must be "${LAST_ARCHETYPE}" (got "${beat.archetype}")`);
    }

    const arch = idx.archetypes.get(beat.archetype);
    if (!arch) {
      err(`${at}/archetype`, 'E_SCHEMA', `unknown archetype "${beat.archetype}"`);
      return;
    }
    if (!arch.variants.includes(beat.variant)) {
      err(`${at}/variant`, 'E_SCHEMA', `archetype "${beat.archetype}" has no variant "${beat.variant}" (allowed: ${arch.variants.join(', ')})`);
    }
    if (beat.weight < arch.minWeight) {
      err(`${at}/weight`, 'E_BUDGET', `archetype "${beat.archetype}" needs weight >= ${arch.minWeight} (got ${beat.weight})`);
    }

    // Bound slots: bindings hold fact ids, phrases hold phrase ids.
    const bound = new Map();
    for (const [group, source] of [['bindings', 'fact'], ['phrases', 'phrase']]) {
      for (const [slotId, ref] of Object.entries(beat[group] || {})) {
        const p = `${at}/${group}/${slotId}`;
        const slot = arch.slots[slotId];
        if (!slot) {
          err(p, 'E_UNKNOWN_SLOT', `archetype "${beat.archetype}" has no slot "${slotId}" (slots: ${Object.keys(arch.slots).join(', ')})`);
          continue;
        }
        bound.set(slotId, ref);
        if (slot.source !== source) {
          err(p, 'E_SLOT_KIND', `slot "${slotId}" takes a ${slot.source} id, not a ${source} id (move it to "${slot.source === 'fact' ? 'bindings' : 'phrases'}")`);
          continue;
        }
        const ids = asList(ref);
        if (ids.length < slot.min || ids.length > slot.max) {
          err(p, 'E_SLOT_COUNT', `slot "${slotId}" takes ${slot.min}-${slot.max} item(s) (got ${ids.length})`);
        }
        ids.forEach((id, k) => {
          const ip = Array.isArray(ref) ? `${p}/${k}` : p;
          if (source === 'fact') checkFact(idx, slotId, slot, id, ip, err);
          else checkPhrase(idx, slotId, slot, id, ip, err);
        });
      }
    }
    // Required slots left unbound.
    for (const [slotId, slot] of Object.entries(arch.slots)) {
      if (!bound.has(slotId) && slot.min > 0) {
        const group = slot.source === 'fact' ? 'bindings' : 'phrases';
        err(`${at}/${group}/${slotId}`, 'E_SLOT_COUNT', `slot "${slotId}" is required (${slot.min}-${slot.max} item(s))`);
      }
    }
  });
  return errors;
}

function checkFact(idx, slotId, slot, id, path, err) {
  const fact = idx.facts.get(id);
  if (!fact) return err(path, 'E_UNKNOWN_FACT', `fact "${id}" does not exist in facts.json`);
  if (!slot.kinds.includes(fact.kind)) {
    return err(path, 'E_SLOT_KIND', `slot "${slotId}" takes ${slot.kinds.join('/')} facts; "${id}" is ${fact.kind}`);
  }
  checkLength(slotId, slot, id, fact.display, path, err);
}

function checkPhrase(idx, slotId, slot, id, path, err) {
  const phrase = idx.phrases.get(id);
  if (!phrase) return err(path, 'E_UNKNOWN_PHRASE', `phrase "${id}" does not exist in phrases.json`);
  if (!phrase.tags.some((t) => slot.tags.includes(t))) {
    return err(path, 'E_SLOT_KIND', `slot "${slotId}" takes phrases tagged ${slot.tags.join('/')}; "${id}" is tagged ${phrase.tags.join('/')}`);
  }
  checkLength(slotId, slot, id, phrase.text, path, err);
}

function checkLength(slotId, slot, id, text, path, err) {
  if (slot.maxChars !== undefined && charLen(text) > slot.maxChars) {
    err(path, 'E_TEXT_LIMIT', `"${id}" is ${charLen(text)} chars; slot "${slotId}" allows at most ${slot.maxChars}`);
  }
}
