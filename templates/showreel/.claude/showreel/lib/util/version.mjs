// Toolkit version (B4 handshake source) and the Node floor. Dependency-free and ES2018-only on
// purpose: cli.mjs imports it before its Node floor check (it must parse on Node 18+), and
// lib/preflight/probe.mjs imports it from here, so the preflight path never imports cli.mjs.
export const VERSION = '1.0.0';

/** Minimum Node for the toolkit runtime: [major, minor]. The single source for cli.mjs and preflight. */
export const NODE_FLOOR = [22, 12];

export function nodeTooOld(version) {
  const parts = String(version).split('.').map(Number);
  if (parts[0] !== NODE_FLOOR[0]) return parts[0] < NODE_FLOOR[0];
  return parts[1] < NODE_FLOOR[1];
}
