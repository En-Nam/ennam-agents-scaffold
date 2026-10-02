// A Node stand-in for the per-beat engine api (engine/core.mjs), enough to run an archetype's layout() without a
// browser: real palettes / accents / math / cue lookup / camera bounds, and a drawing sink for canvases. Text is
// "measured" at 0.6 em per code point. Used for layout-level assertions (what the archetype DECIDES: colours,
// geometry, which cues it requires) — pixels stay the browser tests' business.

import { cueLookup, CAMERA, SAFE_RECT, W, H } from '../../../templates/showreel/.claude/showreel/engine/core.mjs';
import { palette as getPalette, rgba, hexToRgb, accents } from '../../../templates/showreel/.claude/showreel/engine/palettes.mjs';
import { mix, rr, brand } from '../../../templates/showreel/.claude/showreel/engine/draw.mjs';
import { clamp, lerp, ease, prog, map, edge, anticipate, rng, hash, noise, hashStr } from '../../../templates/showreel/.claude/showreel/engine/math.mjs';
import { kindOf, FAMILIES } from '../../../templates/showreel/.claude/showreel/engine/fonts.mjs';
import { clusters } from '../../../templates/showreel/.claude/showreel/engine/text.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** a 2D-context sink: every method is a no-op returning the sink (so gradients / patterns chain), any property settable */
export function sinkCtx(): any {
  const state: Record<string | symbol, unknown> = {};
  const fn = () => proxy;
  const proxy: any = new Proxy(fn, {
    get: (_t, k) => (k in state ? state[k] : fn),
    set: (_t, k, v) => { state[k] = v; return true; },
  });
  return proxy;
}

type Opts = { palette?: string; cues?: Record<string, number>; beatId?: string; archetype?: string; dur?: number };

export function fakeApi({ palette = 'violet', cues = {}, beatId = 'b1', archetype = 'probe', dur = 4 }: Opts = {}) {
  const pal = getPalette(palette);
  const width = (s: string, o: any = {}) => Array.from(s).length * (0.6 * (o.size ?? 48) + (o.track ?? 0));
  return Object.freeze({
    W, H, clamp, lerp, ease, prog, map, edge, anticipate, rng, hash, noise, hashStr,
    palette: pal, rgba, hexToRgb, accents: (n: number) => accents(pal, n), families: FAMILIES, kindOf, clusters,
    mix, rr, brand, cam: CAMERA, safeRect: SAFE_RECT, grid: 0.125, beatId, dur, seed: 7, typing: null,
    cues: Object.freeze({ ...cues }), cue: cueLookup(cues, beatId, archetype),
    makeCanvas: (role: string, w: number, h: number) => {
      if (role !== 'cache' && role !== 'frame') throw new Error(`fake makeCanvas: role ${role}`);
      return { canvas: { width: w, height: h }, ctx: sinkCtx() };
    },
    measure: (_c: unknown, item: any, o: any = {}) => {
      const s = o.what === 'unit' ? (item.unit ?? '') : Array.from(item.text as string).slice(...(o.slice ?? [0])).join('');
      return { width: width(s, o), ascent: 0.72 * (o.size ?? 48), descent: 0.2 * (o.size ?? 48) };
    },
    fitText: (_c: unknown, _s: string, _w: number, maxPx: number) => Math.floor(maxPx),
    fitSlot: (_slot: string, o: any) => Math.floor(o.maxPx),
    fitUnits: (_slot: string, o: any) => Math.floor(o.maxPx),
    text: () => 0,
    blit: () => {},
    glass: () => {}, glow: () => {}, glowDot: () => {}, sparks: () => {}, checkMark: () => {}, chevron: () => {},
    font: (size: number, weight = 600) => `${weight} ${size}px x`,
    hitEnergy: () => 0, cueEnergy: () => 0, scratch: () => ({ canvas: {}, ctx: sinkCtx() }),
  });
}
