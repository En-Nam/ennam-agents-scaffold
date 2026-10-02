// Archetype + transition registry (C9). Browser ESM; also importable from Node (no DOM at import time).
// ids MUST equal the keys of archetypes.json. An id listed in a timeline but missing here makes the
// engine fail loud at boot (checkTimeline), never render a blank beat.
//
// To add an archetype: create archetypes/<id>.mjs (contract documented in engine/core.mjs), then
//   import coldOpenCommand from './cold-open-command.mjs';
// and add it below as  [coldOpenCommand.id]: coldOpenCommand.
import coldOpenCommand from './cold-open-command.mjs';
import kineticText from './kinetic-text.mjs';
import metricsCounterLock from './metrics-counter-lock.mjs';
import lockupCta from './lockup-cta.mjs';
import flowGraph from './flow-graph.mjs';
import layeredStack from './layered-stack.mjs';
import cardCarousel from './card-carousel.mjs';
import orbitNetwork from './orbit-network.mjs';
import zoomThrough from './transitions/zoom-through.mjs';
import columnWipe from './transitions/column-wipe.mjs';

export const ARCHETYPES = Object.freeze({
  [coldOpenCommand.id]: coldOpenCommand,
  [kineticText.id]: kineticText,
  [metricsCounterLock.id]: metricsCounterLock,
  [lockupCta.id]: lockupCta,
  [flowGraph.id]: flowGraph,
  [layeredStack.id]: layeredStack,
  [cardCarousel.id]: cardCarousel,
  [orbitNetwork.id]: orbitNetwork,
});

export const TRANSITIONS = Object.freeze({
  [zoomThrough.id]: zoomThrough,
  [columnWipe.id]: columnWipe,
});
