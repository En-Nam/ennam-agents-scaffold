// Toolkit version (B4 handshake source). Dependency-free on purpose: cli.mjs re-exports it and
// lib/preflight/probe.mjs imports it from here, so the preflight path never imports cli.mjs.
export const VERSION = '1.0.0';
