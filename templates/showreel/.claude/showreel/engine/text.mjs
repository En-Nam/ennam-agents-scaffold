// Engine text API (D8 / Rule 13). The ONLY module allowed to call fillText/strokeText (static test).
// Archetypes draw resolved ITEMS ({id, text, number, unit} from resolved.json), never raw strings, and
// every draw is recorded in the manifest as {text, source}. `check`/`verify` assert manifest ⊆ resolved.
//
// Manifest sources:
//   <factId|phraseId>     text === item.text (full text, also when only a slice/prefix is drawn)
//   counter:<factId>      intermediate counter value, /^\d+$/, 0..item.number
//   unit:<factId>         text === item.unit (C7 lists units in `allowed`)
// The manifest is a page-lifetime record of what was drawn; it never feeds back into drawing.

import { FAMILIES, familyOf } from './fonts.mjs';
import { clamp } from './math.mjs';
import { makeCanvas, roleOf } from './canvas.mjs';

// Large glyphs on a GPU canvas are NOT byte-deterministic (measured M1, RTX 5070 Ti / Chrome): above roughly
// 100 device px, the pixels of the same frame depend on what earlier pages in the same browser drew (shared
// GPU-process glyph/path caches) — AC3 failed for a 200–280 px counter and a 243 px kinetic slam, while 100 px
// was stable. So any run whose DEVICE size exceeds GPU_TEXT_MAX_PX is rasterized on a CPU-pinned 'cache'
// sprite (same fix class as the M0 TITLE sprites) and blitted; smaller text stays on the GPU fast path.
const GPU_TEXT_MAX_PX = 96;
const MAX_SPRITE_SCALE = 4;
// A FRESH cache canvas per run, never pooled: reusing one CPU canvas as a blit source across frames made a
// page that had rendered other frames hash differently from a fresh page (measured M1). Fresh = stable.

function deviceScale(ctx) {
  if (typeof ctx.getTransform !== 'function') return 1;
  const m = ctx.getTransform();
  return Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
}

/** draw str with the current font/align/baseline state of ctx into target g (fill and/or stroke) */
function rasterize(g, str, x, y, o) {
  const mode = o.mode ?? 'fill';
  if (mode === 'fill' || mode === 'both') {
    g.fillStyle = o.fill ?? '#eef1f8';
    g.fillText(str, x, y);
  }
  if (mode === 'stroke' || mode === 'both') {
    g.strokeStyle = o.stroke ?? o.fill ?? '#eef1f8';
    g.lineWidth = o.lineWidth ?? 2;
    g.lineJoin = 'round';
    g.strokeText(str, x, y);
  }
}

const recorded = new Map();
function record(text, source) {
  const key = source + '\u0000' + text;
  if (!recorded.has(key)) recorded.set(key, { text, source });
}

/** Everything drawn so far in this page, sorted (source, text) for stable output. */
export function manifest() {
  return [...recorded.values()].sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

/** CSS font string for a family key ('display'|'mono'). */
export function font(size, weight = 600, fam = 'display') {
  const f = FAMILIES[fam];
  if (!f) throw new Error(`font: unknown family "${fam}" (expected display|mono)`);
  return `${weight} ${size}px "${f.family}", ${fam === 'mono' ? 'monospace' : 'sans-serif'}`;
}

function assertItem(item, fn) {
  if (!item || typeof item.id !== 'string' || typeof item.text !== 'string') {
    throw new Error(`${fn}: expected a resolved item {id, text, …}; archetypes may only draw resolved items`);
  }
}

// [start, end) in code points (so Vietnamese / astral characters never split)
function sliceCp(str, slice) {
  if (!slice) return str;
  return Array.from(str).slice(slice[0], slice[1]).join('');
}

function applyFont(ctx, family, o) {
  ctx.font = font(o.size ?? 48, o.weight ?? 600, family);
  ctx.letterSpacing = (o.track ?? 0) + 'px';
}

function paint(ctx, str, x, y, family, o) {
  ctx.save();
  applyFont(ctx, family, o);
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.base ?? 'alphabetic';
  ctx.globalAlpha *= o.alpha ?? 1;
  const m = ctx.measureText(str);
  const k = deviceScale(ctx);
  if ((o.size ?? 48) * k > GPU_TEXT_MAX_PX && ctx.canvas && roleOf(ctx.canvas) !== 'cache' && str.trim()) {
    // CPU sprite path: rasterize in the SAME user space (gradients stay valid), at device resolution
    const lw = o.mode === 'stroke' || o.mode === 'both' ? (o.lineWidth ?? 2) : 0;
    const pad = Math.ceil((o.size ?? 48) * 0.06 + lw + 2);
    const left = x - m.actualBoundingBoxLeft - pad, top = y - m.actualBoundingBoxAscent - pad;
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight + 2 * pad, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 2 * pad;
    const kk = Math.min(k, MAX_SPRITE_SCALE), sw = Math.ceil(w * kk), sh = Math.ceil(h * kk);
    const S = makeCanvas('cache', Math.max(1, sw), Math.max(1, sh)), g = S.ctx;
    g.setTransform(kk, 0, 0, kk, -left * kk, -top * kk);
    g.font = ctx.font; g.letterSpacing = ctx.letterSpacing; g.textAlign = ctx.textAlign; g.textBaseline = ctx.textBaseline;
    rasterize(g, str, x, y, o);
    ctx.drawImage(S.canvas, 0, 0, sw, sh, left, top, sw / kk, sh / kk);
  } else {
    rasterize(ctx, str, x, y, o);
  }
  ctx.restore();
  return m.width;
}

/**
 * text(ctx, item, x, y, opts) → drawn width. Draws item.text (or a code-point slice of it) in the
 * item's family and records {text:item.text, source:item.id}.
 * opts: size, weight, fill (string|gradient), stroke, lineWidth, mode 'fill'|'stroke'|'both',
 *       align, base, track (letter spacing px), alpha, slice [start, end) in code points.
 */
export function text(ctx, item, x, y, opts = {}) {
  assertItem(item, 'text');
  record(item.text, item.id);
  return paint(ctx, sliceCp(item.text, opts.slice), x, y, familyOf(item), opts);
}

/**
 * counter(ctx, item, progress, x, y, opts) → drawn width. progress < 1 draws round(number × progress)
 * (source counter:<id>); progress ≥ 1 draws the exact fact display item.text (source <id>) — the
 * counter always LOCKS on the code-extracted display (D8).
 */
export function counter(ctx, item, progress, x, y, opts = {}) {
  assertItem(item, 'counter');
  if (!Number.isInteger(item.number)) throw new Error(`counter: item ${item.id} has no integer number (only count facts animate)`);
  const p = clamp(progress);
  if (p >= 1) return text(ctx, item, x, y, opts);
  const str = String(Math.round(item.number * p));
  record(str, 'counter:' + item.id);
  return paint(ctx, str, x, y, familyOf(item), opts);
}

/** unit(ctx, item, x, y, opts) → drawn width. Draws item.unit (e.g. "routes"), source unit:<id>. */
export function unit(ctx, item, x, y, opts = {}) {
  assertItem(item, 'unit');
  if (typeof item.unit !== 'string') throw new Error(`unit: item ${item.id} has no unit`);
  record(item.unit, 'unit:' + item.id);
  return paint(ctx, item.unit, x, y, familyOf(item), opts);
}

/** measure(ctx, item, opts) → {width, ascent, descent} of item.text (or opts.slice / opts.what:'unit'). No record. */
export function measure(ctx, item, opts = {}) {
  assertItem(item, 'measure');
  const str = opts.what === 'unit' ? (item.unit ?? '') : sliceCp(item.text, opts.slice);
  ctx.save();
  applyFont(ctx, familyOf(item), opts);
  const m = ctx.measureText(str);
  ctx.restore();
  return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
}

/**
 * fitText(ctx, str, maxW, maxPx, minPx, opts) → largest integer px in [minPx, maxPx] whose width ≤ maxW,
 * or null when even minPx overflows (never clip silently: `check` fails on null).
 * opts: weight, family ('display'|'mono'), track.
 */
export function fitText(ctx, str, maxW, maxPx, minPx, opts = {}) {
  const fam = opts.family ?? 'display';
  const width = (px) => {
    ctx.save();
    applyFont(ctx, fam, { size: px, weight: opts.weight, track: opts.track });
    const w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  };
  let px = Math.floor(maxPx);
  const w0 = width(px);
  if (w0 > maxW) px = Math.max(1, Math.min(px - 1, Math.floor((px * maxW) / w0))); // width ≈ linear in px; then walk
  while (px >= minPx && width(px) > maxW) px--;
  while (px < Math.floor(maxPx) && width(px + 1) <= maxW) px++; // tracking is not linear in px: settle up
  return px >= minPx ? px : null;
}
