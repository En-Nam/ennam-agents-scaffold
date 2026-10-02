// Rule 12 disclosure for check/render output (M3, mem:backlog/showreel-m3-cluster-disclosure):
// a flow-graph beat drawn as the arrowless `cluster` variant because the repo has no usable ordered source
// (no ordered list of >= 3 steps: no collection holds the flow-graph steps slot minimum of sequenced facts that
// fit the slot, ruling R-k) is reported as flowVariantReason: "no-sequence-source", so the agent can tell the
// user no step order is claimed. A 2-item list cannot fill a sequential variant either, so it does not count as a
// sequence source. Not an error. Pure apart from reading the shipped archetypes.json.
import { readJson } from '../util/json.mjs';

const ARCHETYPES = new URL('../../archetypes/archetypes.json', import.meta.url);

/** → 'no-sequence-source' | null */
export function flowVariantReason(storyboard, facts) {
  const usesCluster = (storyboard.beats || []).some((b) => b.archetype === 'flow-graph' && b.variant === 'cluster');
  if (!usesCluster) return null;
  const slot = readJson(ARCHETYPES).archetypes['flow-graph'].slots.steps;
  const perCollection = new Map();
  for (const f of facts.facts || []) {
    if (f.sequence == null || !slot.kinds.includes(f.kind) || f.display.length > slot.maxChars) continue;
    perCollection.set(f.collection, (perCollection.get(f.collection) ?? 0) + 1);
  }
  const hasSequence = [...perCollection.values()].some((n) => n >= slot.min);
  return hasSequence ? null : 'no-sequence-source';
}

/** Spread into an ok() payload: {flowVariantReason} only when there is something to disclose. */
export function disclosure(storyboard, facts) {
  const reason = flowVariantReason(storyboard, facts);
  return reason ? { flowVariantReason: reason } : {};
}
