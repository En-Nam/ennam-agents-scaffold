// Rule 12 disclosure for check/render output (M3, mem:backlog/showreel-m3-cluster-disclosure):
// a flow-graph beat drawn as the arrowless `cluster` variant because the repo has no ordered source
// (no fact carries `sequence`, ruling R-k) is reported as flowVariantReason: "no-sequence-source",
// so the agent can tell the user no step order is claimed. Not an error. Pure, dependency-free.

/** → 'no-sequence-source' | null */
export function flowVariantReason(storyboard, facts) {
  const usesCluster = (storyboard.beats || []).some((b) => b.archetype === 'flow-graph' && b.variant === 'cluster');
  if (!usesCluster) return null;
  const hasSequence = (facts.facts || []).some((f) => f.sequence != null);
  return hasSequence ? null : 'no-sequence-source';
}

/** Spread into an ok() payload: {flowVariantReason} only when there is something to disclose. */
export function disclosure(storyboard, facts) {
  const reason = flowVariantReason(storyboard, facts);
  return reason ? { flowVariantReason: reason } : {};
}
