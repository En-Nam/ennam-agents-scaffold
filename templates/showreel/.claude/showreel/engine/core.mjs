// CORE — deterministic 1920x1080 canvas renderer (C10). renderAt(t, samples) is a PURE function of t:
// no accumulated state, so frames render identically in any order, in fresh pages, in any launch (AC3).
// Post-FX = spike core.js renderFrame (camera push/shake from hit energy, chromatic aberration, bloom,
// vignette, scanlines, grain, fade-in) + temporal supersampling. Every canvas comes from makeCanvas(role).
// The ONLY time source is build/timeline.json (D10): no absolute seconds live in this file.
//
// ─────────────────────────── ARCHETYPE CONTRACT (C9) ───────────────────────────
// archetypes/<id>.mjs: export default { id, layout(resolvedBeat, variant, api), draw(ctx, localT, params, resolvedBeat, cues) }
//   resolvedBeat = resolved.beats[beatId] (C7: {archetype, variant, slots:{<slot>:{source, items:[{id,text,number,unit}], fitSizePx}}})
//   layout(...)  runs ONCE per beat at boot, after fonts load, in beat order. Pure. Returns a plain object
//                (deep-frozen by the engine — draw cannot carry state in it). It MUST call api.fitSlot()
//                for every slot that has items (boot fails loud otherwise). Build sprite caches here with
//                api.makeCanvas('cache', w, h) and keep them on the returned object.
//   draw(...)    pure function of localT (seconds since beat.t0, 0..dur incl. overlaps). Never call
//                ctx.fillText/strokeText or create canvases directly (static test) — use api.text/counter/unit.
//   cues         {<cueName>: localT} — this beat's timeline.hits, named by storyboard/default cues.
//                Read them with api.cue(name), which THROWS on a missing name: the compiler always emits every
//                default cue and every cue-map hit (C14), so a missing one is a broken timeline or a renamed
//                cue — never invent a fallback time (it drifts from the audible hit). Validate the names the
//                archetype needs in layout() (api.cue works there), so a mismatch fails at boot.
//                Cue-map hits come in index order (validate + compiler guarantee <map>.0 < <map>.1 < …).
//   params       {dur, variant, seed, W, H, layout, palette, api, beatId, typing}
//                typing = null | {t0, interval, chars, enterAt} in LOCAL seconds (timeline.typing for this beat).
//
// api (frozen; per beat):
//   W, H                         1920, 1080
//   clamp lerp ease prog map edge anticipate rng hash noise hashStr      math.mjs (seeded / stateless only)
//   palette                      palettes.mjs tokens: ink…red, white/black + roles primary/secondary/hot;
//                                rgba(hex,a), hexToRgb(hex). Colours come ONLY from here (no literals: static test).
//   accents(n)                   n '#rrggbb' accents derived from the roles only (per layer / card / badge colour);
//                                never a named hue (P.violet, P.amber, …) the palette did not pick as a role
//   font(size, weight, fam)      CSS font string, fam 'display'|'mono'; families = FAMILIES
//   kindOf(item)                 fact kind from the item id ('f.route.2' → 'route'), null for phrases
//   cue(name)                    this beat's cue time (local s); throws E_ENGINE on a missing name (see cues)
//   cam                          {pushMax, shakeMax, rotMax}: the largest camera push (scale about the frame
//                                centre), shake (px) and roll (rad) renderFrame applies over the beat
//   safeRect                     {x0, y0, x1, y1}: user-space rect whose every point stays inside the 48 px safe
//                                margin under the worst camera push + shake + roll (derived from cam)
//   text(ctx, item, x, y, o)     draw a resolved item (o: size weight fill stroke lineWidth mode align base track alpha slice)
//   blit(ctx, sprite, …)         ctx.drawImage of a 'cache' sprite that holds api.text draws (same argument forms);
//                                places the sprite's text boxes in the frame (manifest bbox + on-screen coverage).
//                                A text sprite drawn with plain drawImage never counts as on screen — the
//                                right call only for glow / bloom / mask sprites, which are not legible text.
//   counter(ctx, item, p, x, y, o)  rolling integer 0→item.number, locks on item.text at p ≥ 1
//   unit(ctx, item, x, y, o)     draw item.unit ("routes")
//   measure(ctx, item, o)        {width, ascent, descent} without drawing
//   fitText(ctx, str, maxW, maxPx, minPx, o)  raw fit helper (prefer fitSlot)
//   clusters(str)                [{s, e, ch}] code-point ranges, combining marks kept with their base (use as o.slice)
//   fitSlot(slot, {maxW, maxPx, minPx?, weight?, track?}) → px   largest px ≤ maxPx at which EVERY item of the
//                                slot fits maxW; records fit()[beatId][slot] (null when below the family
//                                minimum: display 28, mono 22 — then returns the minimum so drawing continues
//                                and `check` fails naming beat+slot). Call from layout().
//   fitUnits(slot, {maxW, maxPx, minPx?, weight?, track?}) → px   same, for the item.unit strings of the slot
//                                (one shared px); a unit that overflows at the family minimum sets
//                                fit()[beatId][slot] = null (never clipped silently). Call after fitSlot(slot).
//   rr brand glow glass          shape helpers (draw.mjs)
//   mix glowDot sparks checkMark chevron   FX helpers (draw.mjs); sparks(ctx, dt, ox, oy, n, seed, o, cols, hash)
//   grid                         seconds per 1/16 note (15 / timeline.music.bpm) — snap archetype-internal
//                                choreography to the music grid without literal seconds (D10)
//   makeCanvas(role, w, h)       roles 'cache' (build-once, CPU-pinned) | 'frame' (per-frame GPU scratch); layout only
//   scratch(i)                   pooled, cleared W×H 'frame' layer, i ∈ {0,1}; separate pools for archetypes
//                                and transitions. Finish with a layer before draw() returns.
//                                Draw TEXT on the beat ctx, not on a scratch layer that is later blitted
//                                translated/scaled: the manifest bbox (C16) is taken at draw time, so the
//                                no-clipping check would judge the pre-blit rectangle.
//   hitEnergy(globalT, decay)    film-wide impact energy;  cueEnergy(localT, decay) — this beat's hits only
//   beatId, dur, seed, typing, cues   per-beat values (same as params)
//
// Placeholders: never draw a shape that stands in for text — skeleton bars, empty label pills / boxes. They read
// as a missing label (R5). Structure that carries no label (port dots, card bodies with an icon) is fine.
//
// Transitions (archetypes/transitions/<id>.mjs): { id, apply(ctx, k, drawOut, drawIn, api) }, k 0..1 over the
// overlap; drawOut(c)/drawIn(c) draw the outgoing/incoming beat into any 2D context c; api = the shared api.
// C16 exemption: while a transition runs, text boxes are NOT recorded (setBoxRecording(false)) — the beats
// draw onto scratch layers the transition blits shifted / scaled / clipped, so a draw-time box would judge
// the wrong rectangle. Overlap frames carry bbox null; the no-clipping contract covers solo frames.

import { makeCanvas, gpuRenderer } from './canvas.mjs';
import { clamp, lerp, ease, prog, map, edge, anticipate, rng, hash, noise, hashStr } from './math.mjs';
import { palette as getPalette, hexToRgb, rgba, accents } from './palettes.mjs';
import { text, counter, unit, measure, fitText, font, manifest, clusters, beginFrame, blit, setBoxRecording } from './text.mjs';
import { FAMILIES, familyOf, kindOf, loadFonts, glyphGaps } from './fonts.mjs';
import { rr, brand, glow, glass, mix, glowDot, sparks, checkMark, chevron } from './draw.mjs';
import { ARCHETYPES, TRANSITIONS } from '../archetypes/index.mjs';

export const W = 1920, H = 1080;
const SHUTTER = 0.6;          // exposure as a fraction of one frame (≈216° shutter) for temporal supersampling
const FADE_IN_BEATS = 0.6;    // fade from black over 0.6 musical beats at film start (timeline.music.bpm)
const HIT_WINDOW = 1.2;       // seconds a hit keeps contributing energy (decaying)
const EPS = 1e-6;
const SAFE_MARGIN = 48;       // C16 safe margin (lib/truth/safearea.mjs offFrame default)

// Global camera (spike core.js renderFrame): slow push-in + impact punch, shake and roll from hit energy.
// ONE source for renderFrame and for the bounds archetypes keep text inside (api.cam / api.safeRect).
const CAM = Object.freeze({
  pushDrift: 0.035, pushHit: 0.028, pushHitCap: 1.4,   // push = 1 + pushDrift·(t/D) + pushHit·min(e, pushHitCap)
  shakeNoise: 14, shakeSine: 8, shakeCap: 1.2,          // shake = (noise·shakeNoise + sin·shakeSine)·min(e, shakeCap)
  roll: 0.006,                                          // roll = noise·roll·min(e, shakeCap)
});
/** worst-case camera: the largest push, shake (px, per axis) and roll (rad) renderFrame can apply */
export const CAMERA = Object.freeze({
  pushMax: 1 + CAM.pushDrift + CAM.pushHit * CAM.pushHitCap,
  shakeMax: (CAM.shakeNoise + CAM.shakeSine) * CAM.shakeCap,
  rotMax: CAM.roll * CAM.shakeCap,
});
/**
 * User-space rect that stays inside the safe margin after the worst camera: a point at distance d from the
 * frame centre lands at d·pushMax ± shakeMax, and the roll moves it by up to rotMax × the other half-extent.
 */
export const SAFE_RECT = (() => {
  const { pushMax, shakeMax, rotMax } = CAMERA;
  const hx = (W / 2 - SAFE_MARGIN - shakeMax - rotMax * (H / 2) * pushMax) / pushMax;
  const hy = (H / 2 - SAFE_MARGIN - shakeMax - rotMax * (W / 2) * pushMax) / pushMax;
  return Object.freeze({ x0: W / 2 - hx, y0: H / 2 - hy, x1: W / 2 + hx, y1: H / 2 + hy });
})();

/** cueLookup(cues, beatId, archetype) → (name) → local time; a missing name throws (never an invented time). */
export function cueLookup(cues, beatId, archetype) {
  return (name) => {
    const t = cues[name];
    if (typeof t !== 'number') {
      throw new Error(`E_ENGINE: beat ${beatId} (${archetype}) has no cue "${name}" in timeline.hits (cues: ${Object.keys(cues).sort().join(', ') || 'none'}) — recompile the timeline (check), or fix the cue name in the archetype`);
    }
    return t;
  };
}

// ───────────────────────────── validation (pure) ─────────────────────────────
/** checkTimeline(timeline, resolved, archetypes, transitions) → [] | ['…human-readable error…'] */
export function checkTimeline(timeline, resolved, archetypes = ARCHETYPES, transitions = TRANSITIONS) {
  const errs = [];
  const beats = timeline.beats ?? [];
  if (!beats.length) return ['timeline has no beats'];
  try { getPalette(timeline.palette); } catch (e) { errs.push(e.message); }
  if (Math.abs(beats[0].t0) > EPS) errs.push(`first beat ${beats[0].id} must start at 0 (t0=${beats[0].t0})`);
  const last = beats[beats.length - 1];
  if (Math.abs(last.t1 - timeline.durationS) > EPS) errs.push(`last beat ${last.id} must end at durationS=${timeline.durationS} (t1=${last.t1})`);
  beats.forEach((b, i) => {
    if (!archetypes[b.archetype]) errs.push(`beat ${b.id}: archetype "${b.archetype}" is not registered in archetypes/index.mjs`);
    const rb = resolved.beats?.[b.id];
    if (!rb) errs.push(`beat ${b.id}: missing from resolved.json`);
    else if (rb.archetype !== b.archetype) errs.push(`beat ${b.id}: resolved archetype "${rb.archetype}" ≠ timeline "${b.archetype}"`);
    if (!(b.t1 > b.t0)) errs.push(`beat ${b.id}: t1 must be > t0`);
    if (b.t1 - b.t0 + EPS < b.overlapIn + b.overlapOut) errs.push(`beat ${b.id}: shorter than its overlaps`);
    if (i === beats.length - 1) return;
    const n = beats[i + 1];
    if (Math.abs(b.overlapOut - n.overlapIn) > EPS) errs.push(`beat ${b.id}: overlapOut ${b.overlapOut} ≠ ${n.id}.overlapIn ${n.overlapIn}`);
    if (Math.abs(n.t0 - (b.t1 - b.overlapOut)) > EPS) errs.push(`beat ${n.id}: t0 must equal ${b.id}.t1 − overlapOut`);
    if (b.transitionOut === 'cut' ? b.overlapOut > EPS : !(b.overlapOut > EPS)) errs.push(`beat ${b.id}: transitionOut "${b.transitionOut}" with overlapOut ${b.overlapOut}`);
    if (b.overlapOut > EPS && !transitions[b.transitionOut]) errs.push(`beat ${b.id}: transition "${b.transitionOut}" is not registered`);
  });
  return errs;
}

// deep-freeze plain objects/arrays (not canvases, contexts or typed arrays): no frame-carried state
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    const proto = Object.getPrototypeOf(v);
    if (Array.isArray(v) || proto === Object.prototype || proto === null) {
      Object.freeze(v);
      for (const k of Object.keys(v)) deepFreeze(v[k]);
    }
  }
  return v;
}

function resetCtx(c) {
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.shadowBlur = 0; c.shadowColor = 'rgba(0,0,0,0)';
}

// ───────────────────────────── engine ─────────────────────────────
/** createEngine({timeline, resolved, archetypes?, transitions?}) → {renderAt, fit}. Browser only. Throws on invalid input. */
export function createEngine({ timeline, resolved, archetypes = ARCHETYPES, transitions = TRANSITIONS }) {
  const errs = checkTimeline(timeline, resolved, archetypes, transitions);
  if (errs.length) throw new Error('E_ENGINE: ' + errs.join('; '));
  deepFreeze(timeline);
  deepFreeze(resolved);
  const TL = timeline;
  const pal = getPalette(TL.palette);
  const blobRgb = [hexToRgb(pal.primary), hexToRgb(pal.secondary), hexToRgb(pal.hot)];

  // energy of impacts at global time t: sum of decaying pulses (spike hitEnergy, reads timeline.hits)
  function hitEnergy(t, decay = 9) {
    let e = 0;
    for (const h of TL.hits) { const dt = t - h.t; if (dt >= 0 && dt < HIT_WINDOW) e += h.amp * Math.exp(-dt * decay); }
    return e;
  }

  // Pooled W×H 'frame' layers. Transitions own pool slots 0–1, archetypes 2–3: drawOut/drawIn run while the
  // transition still holds its layers, so the two must never alias.
  const pool = [];
  const makeScratch = (offset) => (i) => {
    if (i !== 0 && i !== 1) throw new Error(`scratch(${i}): index must be 0 or 1`);
    const n = offset + i;
    if (!pool[n]) pool[n] = makeCanvas('frame', W, H);
    resetCtx(pool[n].ctx);
    pool[n].ctx.clearRect(0, 0, W, H);
    return pool[n];
  };
  const archMakeCanvas = (role, w, h) => {
    if (role === 'stage') throw new Error('archetypes may not create a stage canvas (roles: cache | frame)');
    return makeCanvas(role, w, h);
  };

  const base = Object.freeze({
    W, H, clamp, lerp, ease, prog, map, edge, anticipate, rng, hash, noise, hashStr,
    palette: pal, rgba, hexToRgb, accents: (n) => accents(pal, n), font, families: FAMILIES, kindOf,
    text, counter, unit, measure, fitText, clusters, blit, rr, brand, glow, glass, mix, glowDot, sparks, checkMark, chevron,
    grid: 15 / TL.music.bpm, makeCanvas: archMakeCanvas, scratch: makeScratch(0), hitEnergy, cam: CAMERA, safeRect: SAFE_RECT,
  });
  const archScratch = makeScratch(2);

  // per-beat setup: cues, typing, seed, layout (+ text fit)
  const measureCtx = makeCanvas('cache', 8, 8).ctx;
  const fitTable = {};
  const beats = TL.beats.map((b) => {
    const arch = archetypes[b.archetype];
    const rb = resolved.beats[b.id];
    const dur = b.t1 - b.t0;
    const myHits = TL.hits.filter((h) => h.beatId === b.id);
    const cues = {};
    for (const h of myHits) cues[h.cue] = h.t - b.t0;
    const ty = TL.typing.find((x) => x.beatId === b.id);
    const typing = ty ? { t0: ty.t0 - b.t0, interval: ty.interval, chars: ty.chars, enterAt: ty.enterAt - b.t0 } : null;
    const seed = (hashStr(b.id) ^ Math.imul(TL.seed, 0x9e3779b1)) >>> 0;
    const fits = (fitTable[b.id] = {});

    function fitSlot(slot, o) {
      const s = rb.slots[slot];
      if (!s) throw new Error(`beat ${b.id}: fitSlot("${slot}") — slot not in resolved.json`);
      if (!s.items.length) return Math.floor(o.maxPx);
      let px = Math.floor(o.maxPx);
      for (const item of s.items) {
        const fam = familyOf(item);
        const minPx = Math.max(o.minPx ?? 0, FAMILIES[fam].minPx);
        const p = fitText(measureCtx, item.text, o.maxW, o.maxPx, minPx, { weight: o.weight, family: fam, track: o.track });
        if (p === null) { px = null; break; }
        px = Math.min(px, p);
      }
      const prev = fits[slot];
      fits[slot] = prev === undefined ? px : prev === null || px === null ? null : Math.min(prev, px);
      return px ?? Math.max(o.minPx ?? 0, FAMILIES[familyOf(s.items[0])].minPx);
    }
    function fitUnits(slot, o) {
      const s = rb.slots[slot];
      if (!s) throw new Error(`beat ${b.id}: fitUnits("${slot}") — slot not in resolved.json`);
      const withUnit = s.items.filter((item) => typeof item.unit === 'string');
      if (!withUnit.length) return Math.floor(o.maxPx);
      let px = Math.floor(o.maxPx);
      for (const item of withUnit) {
        const fam = familyOf(item);
        const minPx = Math.max(o.minPx ?? 0, FAMILIES[fam].minPx);
        const p = fitText(measureCtx, item.unit, o.maxW, o.maxPx, minPx, { weight: o.weight, family: fam, track: o.track });
        if (p === null) { px = null; break; }
        px = Math.min(px, p);
      }
      if (px === null) fits[slot] = null; // the slot fails `check` as a whole; the number's px stays fits' business
      return px ?? Math.max(o.minPx ?? 0, FAMILIES[familyOf(withUnit[0])].minPx);
    }
    function cueEnergy(lt, decay = 9) {
      let e = 0;
      for (const h of myHits) { const dt = lt - (h.t - b.t0); if (dt >= 0 && dt < HIT_WINDOW) e += h.amp * Math.exp(-dt * decay); }
      return e;
    }

    const api = Object.freeze({ ...base, scratch: archScratch, beatId: b.id, dur, seed, typing: deepFreeze(typing), cues: deepFreeze({ ...cues }), cue: cueLookup(cues, b.id, b.archetype), fitSlot, fitUnits, cueEnergy });
    const layout = deepFreeze(arch.layout(rb, b.variant, api));
    for (const [slot, s] of Object.entries(rb.slots)) {
      if (s.items.length && !(slot in fits)) {
        throw new Error(`E_ENGINE: archetype "${b.archetype}" did not fit slot "${slot}" of beat ${b.id} (layout must call api.fitSlot for every slot it draws)`);
      }
    }
    const params = Object.freeze({ dur, variant: b.variant, seed, W, H, layout, palette: pal, api, beatId: b.id, typing: api.typing });
    return { b, arch, rb, params, cues: api.cues };
  });

  // ───────────────────────────── canvases ─────────────────────────────
  const { canvas: out, ctx: octx } = makeCanvas('stage', W, H);
  const { canvas: sceneC, ctx: sctx } = makeCanvas('frame', W, H);
  const { canvas: tintC, ctx: tctx } = makeCanvas('frame', W, H);
  const { canvas: bloomA, ctx: bactx } = makeCanvas('frame', 480, 270);
  const { canvas: bloomB, ctx: bbctx } = makeCanvas('frame', 960, 540);
  const { canvas: accC, ctx: actx } = makeCanvas('frame', W, H);
  const { canvas: grainC, ctx: gctx } = makeCanvas('cache', 256, 256);
  { // film grain tile (seeded)
    const id = gctx.createImageData(256, 256); const r = rng(1234);
    for (let i = 0; i < id.data.length; i += 4) { const v = (r() * 255) | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    gctx.putImageData(id, 0, 0);
  }
  const { canvas: vignette, ctx: vctx } = makeCanvas('cache', W, H);
  {
    const rg = vctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.0);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.62)');
    vctx.fillStyle = rg; vctx.fillRect(0, 0, W, H);
  }

  // ───────────────────────────── shared background ─────────────────────────────
  // continuous across the whole film; blobs in the palette roles drift by global time
  function background(ctx, t) {
    ctx.fillStyle = pal.ink; ctx.fillRect(0, 0, W, H);
    const k = t / TL.durationS;
    const blobs = [
      { x: 0.2 + 0.1 * Math.sin(t * 0.4), y: 0.3 + 0.1 * Math.cos(t * 0.3), r: 0.55, c: blobRgb[0], a: 0.11 + 0.06 * Math.sin(k * 6.28) },
      { x: 0.8 + 0.08 * Math.cos(t * 0.35), y: 0.7 + 0.1 * Math.sin(t * 0.45), r: 0.5, c: blobRgb[1], a: 0.065 + 0.045 * Math.cos(k * 6.28 + 1) },
      { x: 0.5 + 0.2 * Math.sin(t * 0.2), y: 1.0, r: 0.45, c: blobRgb[2], a: 0.035 + 0.04 * Math.max(0, Math.sin(k * 9.4 + 2)) },
    ];
    for (const b of blobs) {
      const g = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * W);
      g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${Math.max(0, b.a)})`);
      g.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // faint dot grid with slow parallax drift
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.07)';
    const step = 48, ox = (t * 6) % step, oy = (t * 3) % step;
    for (let y = -step + oy; y < H + step; y += step) for (let x = -step + ox; x < W + step; x += step) ctx.fillRect(x, y, 2, 2);
    ctx.restore();
    // drifting motes (deterministic)
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const r = hash(i * 7.3), s = hash(i * 3.1), z = 0.3 + hash(i * 1.7) * 0.9;
      const x = ((r * W * 1.3 + t * 14 * z) % (W * 1.3)) - W * 0.15;
      const y = ((s * H * 1.3 - t * 10 * z) % (H * 1.3) + H * 1.3) % (H * 1.3) - H * 0.15;
      ctx.globalAlpha = 0.10 + 0.25 * z * (0.5 + 0.5 * Math.sin(t * 1.3 + i));
      ctx.fillStyle = i % 3 === 0 ? pal.secondary : i % 3 === 1 ? pal.primary : '#fff';
      ctx.beginPath(); ctx.arc(x, y, 1 + z * 1.6, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ───────────────────────────── scene loop ─────────────────────────────
  const lastIdx = beats.length - 1;
  function activeBeats(t) {
    const act = [];
    for (let i = 0; i <= lastIdx; i++) {
      const b = beats[i].b;
      if (t >= b.t0 && (t < b.t1 || (i === lastIdx && t <= b.t1))) act.push(i);
    }
    return act;
  }
  function drawBeat(ctx, i, t) {
    const B = beats[i];
    ctx.save();
    B.arch.draw(ctx, t - B.b.t0, B.params, B.rb, B.cues);
    ctx.restore();
  }
  function drawScenes(ctx, t) {
    const act = activeBeats(t);
    if (act.length === 1) return drawBeat(ctx, act[0], t);
    if (act.length === 2) {
      const [i, j] = act;
      const out = beats[i].b, inn = beats[j].b;
      const k = clamp((t - inn.t0) / (out.t1 - inn.t0));
      setBoxRecording(false); // C16 exemption: the beats draw on scratch layers the transition moves (see top)
      try {
        transitions[out.transitionOut].apply(ctx, k, (c) => drawBeat(c, i, t), (c) => drawBeat(c, j, t), base);
      } finally {
        setBoxRecording(true);
      }
      return;
    }
    if (act.length > 2) throw new Error(`E_ENGINE: ${act.length} beats active at t=${t}`);
  }

  // ───────────────────────────── frame render ─────────────────────────────
  function renderFrame(t) {
    t = clamp(t, 0, TL.durationS);
    const e = hitEnergy(t);
    // 1) scene layer with global camera (slow push-in + impact shake/punch)
    resetCtx(sctx);
    sctx.clearRect(0, 0, W, H);
    sctx.save();
    const push = 1 + CAM.pushDrift * (t / TL.durationS) + CAM.pushHit * Math.min(e, CAM.pushHitCap);
    const sx = (noise(t * 55) * CAM.shakeNoise + Math.sin(t * 90) * CAM.shakeSine) * Math.min(e, CAM.shakeCap);
    const sy = (noise(t * 55 + 100) * CAM.shakeNoise + Math.cos(t * 83) * CAM.shakeSine) * Math.min(e, CAM.shakeCap);
    const rot = noise(t * 40 + 7) * CAM.roll * Math.min(e, CAM.shakeCap);
    sctx.translate(W / 2 + sx, H / 2 + sy); sctx.rotate(rot); sctx.scale(push, push); sctx.translate(-W / 2, -H / 2);
    background(sctx, t);
    drawScenes(sctx, t);
    sctx.restore();

    // 2) composite with chromatic aberration (scales with impact energy)
    resetCtx(octx);
    const ab = Math.min(e, 1.4) * 9;
    if (ab > 0.6) {
      octx.fillStyle = '#000'; octx.fillRect(0, 0, W, H);
      octx.globalCompositeOperation = 'lighter';
      const ch = [['#ff0000', ab, 0], ['#00ff00', 0, 0], ['#0000ff', -ab, 0]];
      for (const [col, dx, dy] of ch) {
        tctx.globalCompositeOperation = 'source-over'; tctx.drawImage(sceneC, 0, 0);
        tctx.globalCompositeOperation = 'multiply'; tctx.fillStyle = col; tctx.fillRect(0, 0, W, H);
        octx.drawImage(tintC, dx, dy);
      }
      octx.globalCompositeOperation = 'source-over';
    } else octx.drawImage(sceneC, 0, 0);

    // 3) bloom (two blur radii, additive)
    bactx.clearRect(0, 0, 480, 270); bactx.filter = 'blur(5px)'; bactx.drawImage(sceneC, 0, 0, 480, 270); bactx.filter = 'none';
    bbctx.clearRect(0, 0, 960, 540); bbctx.filter = 'blur(3px)'; bbctx.drawImage(sceneC, 0, 0, 960, 540); bbctx.filter = 'none';
    octx.globalCompositeOperation = 'lighter';
    octx.globalAlpha = 0.55 + 0.25 * Math.min(e, 1); octx.drawImage(bloomA, 0, 0, W, H);
    octx.globalAlpha = 0.28; octx.drawImage(bloomB, 0, 0, W, H);
    octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';

    // 4) vignette, scanline whisper, grain, fade-in from black
    octx.drawImage(vignette, 0, 0);
    octx.globalAlpha = 0.035; octx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) octx.fillRect(0, y, W, 1);
    octx.globalAlpha = 0.06; octx.globalCompositeOperation = 'overlay';
    const fi = Math.floor(t * TL.fps), gx = (hash(fi) * 256) | 0, gy = (hash(fi + 99) * 256) | 0;
    for (let y = -256 + gy; y < H; y += 256) for (let x = -256 + gx; x < W; x += 256) octx.drawImage(grainC, x, y);
    octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';
    const fade = 1 - clamp(t / ((FADE_IN_BEATS * 60) / TL.music.bpm));
    if (fade > 0) { octx.fillStyle = `rgba(0,0,0,${fade})`; octx.fillRect(0, 0, W, H); }
  }

  // temporal supersampling = real motion blur. samples=1 is the draft path.
  function renderAt(t, samples = 1) {
    if (!Number.isFinite(t)) throw new Error(`renderAt: t must be a finite number, got ${t}`);
    if (!(Number.isInteger(samples) && samples >= 1)) throw new Error(`renderAt: samples must be an integer ≥ 1, got ${samples}`);
    beginFrame(); // manifest bboxes (C16) describe THIS frame (all its motion-blur samples), never an earlier one
    if (samples === 1) return renderFrame(t);
    const exposure = SHUTTER / TL.fps;
    resetCtx(actx);
    for (let i = 0; i < samples; i++) {
      renderFrame(t + ((i + 0.5) / samples - 0.5) * exposure);
      actx.globalAlpha = 1 / (i + 1); actx.drawImage(out, 0, 0);
    }
    actx.globalAlpha = 1;
    resetCtx(octx);
    octx.drawImage(accC, 0, 0);
  }

  const fit = () => JSON.parse(JSON.stringify(fitTable));
  return { renderAt, fit, stage: out };
}

// ───────────────────────────── page boot (C10) ─────────────────────────────
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`E_ENGINE: ${url} → HTTP ${res.status} (run: node .claude/showreel/cli.mjs check)`);
  return res.json();
}

/** Installs window.SHOWREEL. `ready` rejects with the reason when anything is missing (fail loud). */
export function boot({ build = '/build', fonts = '/fonts' } = {}) {
  const notReady = () => { throw new Error('SHOWREEL not ready: await SHOWREEL.ready first'); };
  const S = { ready: null, renderer: gpuRenderer(), renderAt: notReady, manifest, fit: notReady, glyphGaps: notReady };
  window.SHOWREEL = S;
  S.ready = (async () => {
    const [timeline, resolved] = await Promise.all([getJson(`${build}/timeline.json`), getJson(`${build}/resolved.json`)]);
    await loadFonts(fonts);
    S.glyphGaps = () => glyphGaps(resolved);
    const eng = createEngine({ timeline, resolved });
    S.renderAt = eng.renderAt;
    S.fit = eng.fit;
    return true;
  })();
  return S;
}
