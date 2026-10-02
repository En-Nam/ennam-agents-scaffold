// Minimum-facts gate (D4): app.name + ≥3 of {feature, stack.item, route, command} + ≥1 count.
// Thin repos are refused rather than inviting invented copy.

export const CODE_KINDS = ['feature', 'stack.item', 'route', 'command'];
export const MIN_CODE_KINDS = 3;

/** → {passed, missing: kinds in a fixed order} */
export function evaluateGate(facts) {
  const have = new Set(facts.map((f) => f.kind));
  const missing = [];
  if (!have.has('app.name')) missing.push('app.name');
  const absent = CODE_KINDS.filter((k) => !have.has(k));
  if (CODE_KINDS.length - absent.length < MIN_CODE_KINDS) missing.push(...absent);
  if (!have.has('count')) missing.push('count');
  return { passed: missing.length === 0, missing };
}
