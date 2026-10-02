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

// a slot reference as a list of ids: a single id becomes [id] (an absent ref is never passed here — unlike the
// compiler's boundList, which maps a missing binding to [])
const idsOf = (v) => (Array.isArray(v) ? v : [v]);
const charLen = (s) => [...s].length;

/**
 * The slot rules of an archetype for one variant (C13): `variantSlots[variant][slot]` fields are merged
 * over `slots[slot]` (e.g. kinetic-text "chapter": lines 0..1, lead required and tagged "chapter").
 */
export function slotsFor(arch, variant) {
  const over = (arch.variantSlots && arch.variantSlots[variant]) || {};
  return Object.fromEntries(Object.entries(arch.slots).map(([id, slot]) => [id, { ...slot, ...(over[id] || {}) }]));
}

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
    const slots = slotsFor(arch, beat.variant);
    if (beat.weight < arch.minWeight) {
      err(`${at}/weight`, 'E_BUDGET', `archetype "${beat.archetype}" needs weight >= ${arch.minWeight} (got ${beat.weight})`);
    }

    // Bound slots: bindings hold fact ids, phrases hold phrase ids.
    const bound = new Map();
    const okFacts = []; // [{slotId, fact}] that passed their slot checks (E_PHRASE_KIND input)
    const okPhrases = []; // [{path, phrase}] likewise
    for (const [group, source] of [['bindings', 'fact'], ['phrases', 'phrase']]) {
      for (const [slotId, ref] of Object.entries(beat[group] || {})) {
        const p = `${at}/${group}/${slotId}`;
        const slot = slots[slotId];
        if (!slot) {
          err(p, 'E_UNKNOWN_SLOT', `archetype "${beat.archetype}" has no slot "${slotId}" (slots: ${Object.keys(slots).join(', ')})`);
          continue;
        }
        bound.set(slotId, ref);
        if (slot.source !== source) {
          err(p, 'E_SLOT_KIND', `slot "${slotId}" takes a ${slot.source} id, not a ${source} id (move it to "${slot.source === 'fact' ? 'bindings' : 'phrases'}")`);
          continue;
        }
        const ids = idsOf(ref);
        if (ids.length < slot.min || ids.length > slot.max) {
          err(p, 'E_SLOT_COUNT', `slot "${slotId}" takes ${slot.min}-${slot.max} item(s) (got ${ids.length})`);
        }
        const slotFacts = [];
        ids.forEach((id, k) => {
          const ip = Array.isArray(ref) ? `${p}/${k}` : p;
          if (source === 'fact') {
            const fact = checkFact(idx, slotId, slot, id, ip, err);
            if (fact) slotFacts.push({ fact, path: ip });
          } else {
            const phrase = checkPhrase(idx, slotId, slot, id, ip, err);
            if (phrase) okPhrases.push({ path: ip, phrase });
          }
        });
        if (slot.sequence) checkSequence(beat, slotId, slotFacts, err);
        for (const { fact } of slotFacts) okFacts.push({ slotId, fact });
      }
    }
    // Ruling (f): a phrase heads the facts of its beat, so it must be true of every one of them ("Under the hood"
    // over product features is a lie) and may be limited to the variants it describes ("Step by step" ≠ cluster).
    for (const { path: pp, phrase } of okPhrases) {
      if (!Array.isArray(phrase.kinds) || phrase.kinds.length === 0) {
        err(pp, 'E_PHRASE_KIND', `phrase "${phrase.id}" has no "kinds" annotation in phrases.json, so it cannot be proven true of any fact`);
        continue;
      }
      if (Array.isArray(phrase.variants) && !phrase.variants.includes(beat.variant)) {
        err(pp, 'E_PHRASE_KIND', `phrase "${phrase.id}" ("${phrase.text}") fits variants ${phrase.variants.join('/')} only; beat ${beat.id} is "${beat.variant}"`);
      }
      for (const { slotId, fact } of okFacts) {
        if (!phrase.kinds.includes(fact.kind)) {
          err(pp, 'E_PHRASE_KIND', `phrase "${phrase.id}" ("${phrase.text}") heads ${phrase.kinds.join('/')} facts only; fact "${fact.id}" in slot "${slotId}" of beat ${beat.id} is ${fact.kind} (pick a phrase whose kinds include ${fact.kind}, or drop it)`);
        }
      }
    }
    // Required slots left unbound.
    for (const [slotId, slot] of Object.entries(slots)) {
      if (!bound.has(slotId) && slot.min > 0) {
        const group = slot.source === 'fact' ? 'bindings' : 'phrases';
        err(`${at}/${group}/${slotId}`, 'E_SLOT_COUNT', `slot "${slotId}" is required (${slot.min}-${slot.max} item(s))`);
      }
    }

    // Cue-map overrides (C14): "<map>.<i>" must name a hit the compiler will actually emit.
    const overrides = new Map(); // map name → [{i, at, j}]
    (beat.cues || []).forEach((cue, j) => {
      const dot = cue.name.indexOf('.');
      if (dot < 0) return;
      const mapName = cue.name.slice(0, dot), i = Number(cue.name.slice(dot + 1));
      const map = (arch.cueMaps || []).find((m) => m.name === mapName);
      const n = map && bound.has(map.per) ? idsOf(bound.get(map.per)).length : 0;
      if (!map || i >= n) {
        const offered = (arch.cueMaps || []).map((m) => {
          const k = bound.has(m.per) ? idsOf(bound.get(m.per)).length : 0;
          return k ? `${m.name}.0..${m.name}.${k - 1}` : null;
        }).filter(Boolean);
        err(`${at}/cues/${j}/name`, 'E_SCHEMA', `cue "${cue.name}" overrides no cue-map hit of beat ${beat.id} (mapped cues: ${offered.join(', ') || 'none'})`);
        return;
      }
      if (!overrides.has(mapName)) overrides.set(mapName, []);
      overrides.get(mapName).push({ i, at: cue.at, j });
    });
    // …inside the map's from..to window and in index order: archetypes reveal item i before item i+1 (a path
    // lights step by step, badges pop in turn), so an override that reorders the map would scramble the reveal
    for (const [mapName, list] of overrides) {
      const map = arch.cueMaps.find((m) => m.name === mapName);
      const n = idsOf(bound.get(map.per)).length;
      const eff = Array.from({ length: n }, (_, k) => map.from + ((map.to - map.from) * k) / Math.max(1, n - 1));
      for (const o of list) {
        eff[o.i] = o.at;
        if (o.at < map.from || o.at > map.to) {
          err(`${at}/cues/${o.j}/at`, 'E_SCHEMA', `cue "${mapName}.${o.i}" at ${o.at} is outside the "${mapName}" cue map window ${map.from}..${map.to} of beat ${beat.id}`);
        }
      }
      for (const o of list) {
        const prev = o.i > 0 ? eff[o.i - 1] : -Infinity, next = o.i < n - 1 ? eff[o.i + 1] : Infinity;
        if (!(o.at > prev && o.at < next)) {
          const nb = [o.i > 0 ? `${mapName}.${o.i - 1} at ${prev}` : null, o.i < n - 1 ? `${mapName}.${o.i + 1} at ${next}` : null].filter(Boolean).join(', ');
          err(`${at}/cues/${o.j}/at`, 'E_SCHEMA', `cue "${mapName}.${o.i}" at ${o.at} breaks the index order of the "${mapName}" cue map in beat ${beat.id} (${nb}): items are revealed in order, so each "${mapName}.<i>" must lie strictly between its neighbours`);
        }
      }
    }
  });
  return errors;
}

/** → the fact when it exists and fits the slot's kinds (a length error still binds it), else undefined. */
function checkFact(idx, slotId, slot, id, path, err) {
  const fact = idx.facts.get(id);
  if (!fact) return void err(path, 'E_UNKNOWN_FACT', `fact "${id}" does not exist in facts.json`);
  if (!slot.kinds.includes(fact.kind)) {
    return void err(path, 'E_SLOT_KIND', `slot "${slotId}" takes ${slot.kinds.join('/')} facts; "${id}" is ${fact.kind}`);
  }
  checkLength(slotId, slot, id, fact.display, path, err);
  return fact;
}

/** → the phrase when it exists and carries one of the slot's tags, else undefined. */
function checkPhrase(idx, slotId, slot, id, path, err) {
  const phrase = idx.phrases.get(id);
  if (!phrase) return void err(path, 'E_UNKNOWN_PHRASE', `phrase "${id}" does not exist in phrases.json`);
  if (!phrase.tags.some((t) => slot.tags.includes(t))) {
    return void err(path, 'E_SLOT_KIND', `slot "${slotId}" takes phrases tagged ${slot.tags.join('/')}; "${id}" is tagged ${phrase.tags.join('/')}`);
  }
  checkLength(slotId, slot, id, phrase.text, path, err);
  return phrase;
}

/**
 * Ruling (f): a sequential slot (archetypes.json `"sequence": true`, e.g. flow-graph chain/converge, which draw
 * arrows) claims "this, then this". Only facts of ONE explicitly ordered source carry that truth: every bound fact
 * needs a sequence, all from the same collection, strictly ascending (gaps allowed).
 */
function checkSequence(beat, slotId, slotFacts, err) {
  let first = null, prev = null;
  for (const { fact, path } of slotFacts) {
    const where = `beat ${beat.id} slot "${slotId}" (variant "${beat.variant}" is sequential)`;
    if (fact.sequence === null || fact.sequence === undefined) {
      err(path, 'E_SLOT_ORDER', `${where}: fact "${fact.id}" (${fact.kind}) has no sequence — only items of an ordered README step list (collection readme.steps.<n>) may be drawn in order; use variant "cluster" for unordered facts`);
      continue;
    }
    if (first === null) first = fact;
    else if (fact.collection !== first.collection) {
      err(path, 'E_SLOT_ORDER', `${where}: fact "${fact.id}" is from collection "${fact.collection}", but "${first.id}" is from "${first.collection}" — one sequence per beat`);
      continue;
    }
    if (prev !== null && !(fact.sequence > prev.sequence)) {
      err(path, 'E_SLOT_ORDER', `${where}: fact "${fact.id}" (sequence ${fact.sequence}) does not follow "${prev.id}" (sequence ${prev.sequence}) — bind steps in ascending sequence`);
      continue;
    }
    prev = fact;
  }
}

function checkLength(slotId, slot, id, text, path, err) {
  if (slot.maxChars !== undefined && charLen(text) > slot.maxChars) {
    err(path, 'E_TEXT_LIMIT', `"${id}" is ${charLen(text)} chars; slot "${slotId}" allows at most ${slot.maxChars}`);
  }
}
