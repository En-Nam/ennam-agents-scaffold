// TEST FIXTURE — frozen copy of archetypes/kinetic-text.mjs at dec2dbd (blob fe0d0b75), BEFORE the R5 punch/chapter
// fix. Only tests/showreel/archetype-kinetic-text.test.ts loads it, to render the "old" column of the before/after
// sheet. Never registered in archetypes/index.mjs; not shipped.
// kinetic-text (C9) — new in v1.16, in the spike's typographic style (heavy Archivo, white-hot → colour
// landings, brand-gradient accents, additive light). Lines enter one by one on GRID-snapped local times:
// the first on cue `line`, the rest spaced by a whole number of 1/16 notes (api.grid) derived from dur.
//   stack — lines stack up left-aligned; each word rises out of a mask, the newest line is brightest
//   punch — one line owns the frame at a time, centred; slam-in with echoes, sparks and a ring
//   chapter — a section card (M2): the `chapter` phrase is the centred title (words rise out of a mask on
//             cue `line`, white-hot → text), a brand rule draws out from the centre above it, and the
//             optional fact line settles in below, dim. archetypes.json variantSlots: lead 1 (tag chapter), lines 0..1.
// Slots: lines (1–3 facts: feature / app.tagline / stack.item / problem; chapter 0–1) · lead (phrase; chapter: required).
// Pure function of localT; no literal absolute seconds (D10).

const STACK_X = 200, STACK_W = 1520;
const PUNCH_W = 1600;
const STACK_MAX = [0, 150, 120, 100];   // max px by line count
const PUNCH_MAX = 180;
const LEAD_MAX = 34;
const CHAPTER_W = 1500;  // title + line width budget (≥ 162 px clear of each edge after the camera push)
const CHAPTER_MAX = 150;
const CHAPTER_LINE_MAX = 46;

/** words of a string as code-point ranges [s, e) (spaces excluded) */
function words(str) {
  const cps = Array.from(str), out = [];
  let s = -1;
  cps.forEach((ch, i) => {
    if (ch === ' ') { if (s >= 0) out.push([s, i]); s = -1; } else if (s < 0) s = i;
  });
  if (s >= 0) out.push([s, cps.length]);
  return out;
}

function chapterLayout(rb, api) {
  const title = rb.slots.lead.items[0];
  const line = rb.slots.lines?.items[0] ?? null;
  const track = -2, weight = 800, lineTrack = 6, lineWeight = 600;
  const px = api.fitSlot('lead', { maxW: CHAPTER_W, maxPx: CHAPTER_MAX, weight, track });
  const linePx = line ? api.fitSlot('lines', { maxW: CHAPTER_W, maxPx: CHAPTER_LINE_MAX, weight: lineWeight, track: lineTrack }) : 0;
  const m = api.makeCanvas('cache', 8, 8).ctx;
  const o = { size: px, weight, track };
  const width = api.measure(m, title, o).width - track;
  const ws = words(title.text).map(([s, e]) => ({ s, e, x: api.measure(m, title, { ...o, slice: [0, s] }).width, x1: api.measure(m, title, { ...o, slice: [0, e] }).width }));
  const lineW = line ? api.measure(m, line, { size: linePx, weight: lineWeight, track: lineTrack }).width - lineTrack : 0;
  const ruleGap = 40, lineGap = line ? Math.round(px * 0.42) + linePx : 0;
  const blockH = ruleGap + px + lineGap;
  const top = Math.round((1080 - blockH) / 2);
  const ruleY = top;
  const base = top + ruleGap + Math.round(px * 0.86);
  // rows: [] keeps the stack/punch schedule math inert; the chapter draw owns its own schedule
  return { chapter: true, rows: [], title, line, px, linePx, track, weight, lineTrack, lineWeight, width, words: ws, lineW, ruleY, base, lineBase: base + lineGap, lh: Math.round(px * 1.12) };
}

/** chapter card: rule draws out from the centre, title words rise out of a mask (first word on `first`), line settles below */
function drawChapter(ctx, lt, p, first) {
  const { api, layout: L } = p;
  const { W, clamp, ease, rgba, mix, palette: P, grid } = api;
  const cx = W / 2, x0 = cx - L.width / 2;
  const wordGap = grid * 0.5;

  // brand rule above the title, centre-out, with a hot core that cools
  const ra = lt - (first - 2 * grid);
  const rq = ease.outExpo(clamp(ra / 0.6));
  if (rq > 0) {
    const hw = Math.max(48, L.width * 0.32) * rq;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = api.brand(ctx, cx - hw, 0, cx + hw, 0, P.primary, P.secondary);
    ctx.shadowColor = P.primary; ctx.shadowBlur = 18;
    ctx.fillRect(cx - hw, L.ruleY - 2, hw * 2, 4);
    const heat = Math.exp(-Math.max(0, ra) * 5);
    if (heat > 0.02) api.glowDot(ctx, cx, L.ruleY, 90, 0.7 * heat, api.hexToRgb(P.secondary).join(','));
    ctx.restore();
  }

  // title: each word rises out of the baseline mask, lands white-hot, cools to white metal under a brand halo
  // (spike s5 lockup language: white face with a cool tint toward the baseline, violet→cyan glow around it)
  const capTop = L.base - L.px * 0.75;
  const metal = ctx.createLinearGradient(0, capTop, 0, L.base);
  metal.addColorStop(0, '#ffffff'); metal.addColorStop(0.55, mix(P.primary, '#ffffff', 0.9)); metal.addColorStop(1, mix(P.secondary, '#ffffff', 0.72));
  const halo = api.brand(ctx, x0, 0, x0 + L.width, 0, P.primary, P.secondary);
  // backdrop halo that shifts primary (left) → secondary (right) under the title, up once the first word lands
  const hq = ease.outCubic(clamp((lt - first) / 0.6));
  if (hq > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hy = L.base - L.px * 0.36, hr = Math.max(260, L.width * 0.42);
    api.glowDot(ctx, x0 + L.width * 0.25, hy, hr, 0.10 * hq, api.hexToRgb(P.primary).join(','));
    api.glowDot(ctx, x0 + L.width * 0.75, hy, hr, 0.10 * hq, api.hexToRgb(P.secondary).join(','));
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(x0 - 60, L.base - L.px * 1.1, L.width + 120, L.px * 1.45); ctx.clip();
  for (let w = 0; w < L.words.length; w++) {
    const wd = L.words[w];
    const a = lt - (first + w * wordGap);
    if (a <= 0) continue;
    const q = ease.outExpo(clamp(a / 0.45));
    const heat = Math.exp(-a * 9);
    const dy = (1 - q) * L.lh * 0.9;
    const o = { size: L.px, weight: L.weight, track: L.track, slice: [wd.s, wd.e] };
    ctx.save();
    // coloured halo (additive, blurred by the shadow) under the face
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = P.primary; ctx.shadowBlur = 36 + 30 * heat;
    api.text(ctx, L.title, x0 + wd.x, L.base + dy, { ...o, fill: halo, alpha: 0.45 * q });
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = rgba(P.primary, 0.6 + 0.35 * heat); ctx.shadowBlur = 12 + 40 * heat;
    api.text(ctx, L.title, x0 + wd.x, L.base + dy, { ...o, fill: metal });
    if (heat > 0.03) {
      ctx.globalCompositeOperation = 'lighter';
      api.text(ctx, L.title, x0 + wd.x, L.base + dy, { ...o, fill: '#ffffff', alpha: 0.8 * heat });
    }
    ctx.restore();
  }
  ctx.restore();
  // sparse dust kicked up off the baseline as each word lands (spike s5 per-letter spray, thinned to per-word)
  for (let w = 0; w < L.words.length; w++) {
    const wd = L.words[w];
    api.sparks(ctx, lt - (first + w * wordGap), x0 + (wd.x + wd.x1) / 2, L.base + 4, 10, (api.seed % 997) + w, { a0: -2.9, a1: -0.25, sMin: 200, sMax: 800, pow: 1.3, drag: 5, grav: 1400, lifeMin: 0.25, lifeMax: 0.55, alpha: 0.6 }, ['#ffffff', P.primary, P.secondary], api.hash);
  }

  // optional fact line: settles up into place once the title has landed
  if (L.line) {
    const la = lt - (first + Math.max(1, L.words.length) * wordGap + 2 * grid);
    const q = ease.outCubic(clamp(la / 0.5));
    if (q > 0) {
      const lx = cx - L.lineW / 2;
      ctx.save();
      ctx.shadowColor = rgba(P.secondary, 0.5); ctx.shadowBlur = 16;
      api.text(ctx, L.line, lx, L.lineBase + (1 - q) * 18, {
        size: L.linePx, weight: L.lineWeight, track: L.lineTrack, alpha: q,
        fill: api.brand(ctx, lx, 0, lx + L.lineW, 0, mix(P.primary, '#ffffff', 0.45), mix(P.secondary, '#ffffff', 0.35)),
      });
      ctx.restore();
    }
  }
}

export default {
  id: 'kinetic-text',

  layout(rb, variant, api) {
    if (variant === 'chapter') return chapterLayout(rb, api);
    const lines = rb.slots.lines.items;
    const lead = rb.slots.lead?.items[0] ?? null;
    const N = lines.length;
    const punch = variant === 'punch';
    const track = -2, weight = 800;
    const px = api.fitSlot('lines', { maxW: punch ? PUNCH_W : STACK_W, maxPx: punch ? PUNCH_MAX : STACK_MAX[Math.min(N, 3)], weight, track });
    const leadPx = lead ? api.fitSlot('lead', { maxW: punch ? PUNCH_W : STACK_W, maxPx: LEAD_MAX, weight: 600, track: 4 }) : 0;
    const m = api.makeCanvas('cache', 8, 8).ctx;
    const o = { size: px, weight, track };
    const rows = lines.map((item) => {
      const width = api.measure(m, item, o).width - track;
      const ws = words(item.text).map(([s, e]) => ({ s, e, x: api.measure(m, item, { ...o, slice: [0, s] }).width }));
      return { item, width, words: ws };
    });
    const lh = Math.round(px * 1.12);
    const leadGap = lead ? leadPx + 46 : 0;
    const blockH = (punch ? lh : N * lh) + leadGap;
    const top = Math.round((1080 - blockH) / 2);
    const leadW = lead ? api.measure(m, lead, { size: leadPx, weight: 600, track: 4 }).width : 0;
    return { rows, lead, px, leadPx, leadW, lh, top, leadY: top + leadPx, firstBase: top + leadGap + Math.round(px * 0.9), punch, track, weight };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L, dur } = p;
    const { W, H, clamp, lerp, ease, hash, rgba, mix, palette: P, grid } = api;
    const N = L.rows.length;
    const snap = (x) => Math.max(grid, Math.round(x / grid) * grid);
    // schedule: first line on cue `line`, then whole grid steps; lead precedes the lines
    const first = cues.line ?? snap(dur * 0.15);
    const step = N > 1 ? Math.max(2 * grid, snap((dur * (L.punch ? 0.62 : 0.45)) / N)) : 0;
    const enterAt = (i) => first + i * step;
    const wordGap = L.punch ? grid * 0.25 : grid * 0.5;
    const e = api.cueEnergy(lt, 6);

    // ── ambience: diagonal light band + brand haze, gently tied to the cue energy ──
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hz = ctx.createRadialGradient(W * 0.5, H * 0.52, 0, W * 0.5, H * 0.52, 900);
    hz.addColorStop(0, rgba(P.primary, 0.10 + 0.08 * Math.min(e, 1))); hz.addColorStop(1, rgba(P.primary, 0));
    ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
    const sp = clamp(lt / dur);
    ctx.save(); ctx.translate(lerp(-400, W + 400, ease.inOutCubic(sp)), H / 2); ctx.rotate(0.35);
    const bg = ctx.createLinearGradient(-220, 0, 220, 0);
    bg.addColorStop(0, rgba(P.secondary, 0)); bg.addColorStop(0.5, rgba(P.secondary, 0.05)); bg.addColorStop(1, rgba(P.secondary, 0));
    ctx.fillStyle = bg; ctx.fillRect(-220, -1100, 440, 2200); ctx.restore();
    ctx.restore();

    if (L.chapter) return drawChapter(ctx, lt, p, first);

    // ── lead phrase: tracked, dim, with a brand tick that draws on ──
    if (L.lead) {
      const la = lt - Math.max(0, first - 2 * grid);
      const q = ease.outExpo(clamp(la / 0.5));
      if (q > 0) {
        const x = L.punch ? W / 2 - L.leadW / 2 : STACK_X;
        ctx.save();
        ctx.fillStyle = api.brand(ctx, x, 0, x + 64, 0, P.primary, P.secondary);
        ctx.shadowColor = P.primary; ctx.shadowBlur = 14;
        ctx.fillRect(x, L.leadY - L.leadPx - 18, 64 * q, 4);
        ctx.restore();
        api.text(ctx, L.lead, x + (1 - q) * -24, L.leadY, { size: L.leadPx, weight: 600, track: 4, fill: mix(P.dim, '#ffffff', 0.35), alpha: q });
      }
    }

    const fillFor = (i, x0, x1) => (i === N - 1 && N > 1 ? api.brand(ctx, x0, 0, x1, 0, mix(P.primary, '#ffffff', 0.25), P.secondary) : P.text);

    // a line's words: white-hot landing (additive pass) that cools to the line fill
    function drawWords(row, i, x0, base, a0, opts) {
      for (let w = 0; w < row.words.length; w++) {
        const wd = row.words[w];
        const a = lt - (a0 + w * wordGap);
        if (a <= 0) continue;
        const q = ease.outExpo(clamp(a / (L.punch ? 0.3 : 0.45)));
        const heat = Math.exp(-a * 9);
        const dy = opts.rise ? (1 - q) * L.lh * 0.9 : 0;
        ctx.save();
        ctx.shadowColor = rgba(P.primary, 0.55 + 0.4 * heat); ctx.shadowBlur = 8 + 40 * heat;
        api.text(ctx, row.item, x0 + wd.x, base + dy, { size: L.px, weight: L.weight, track: L.track, slice: [wd.s, wd.e], fill: fillFor(i, x0, x0 + row.width), alpha: opts.alpha * (L.punch ? clamp(a / 0.08) : 1) });
        if (heat > 0.03) { // additive white-hot pass over the fresh word
          ctx.globalCompositeOperation = 'lighter';
          api.text(ctx, row.item, x0 + wd.x, base + dy, { size: L.px, weight: L.weight, track: L.track, slice: [wd.s, wd.e], fill: '#ffffff', alpha: 0.8 * heat * opts.alpha });
        }
        ctx.restore();
      }
    }

    function streakAt(x0, x1, y, a) {
      if (a <= 0 || a > 0.6) return;
      const k = ease.outExpo(clamp(a / 0.5)), al = 1 - clamp(a / 0.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const x = lerp(x0 - 200, x1 + 200, k);
      const g = ctx.createLinearGradient(x - 600, 0, x, 0);
      g.addColorStop(0, rgba(P.secondary, 0)); g.addColorStop(1, `rgba(255,255,255,${0.9 * al})`);
      ctx.fillStyle = g; ctx.fillRect(x - 600, y - 1.5, 600, 3);
      api.glowDot(ctx, x, y, 60, 0.6 * al, api.hexToRgb(P.secondary).join(','));
      ctx.restore();
    }

    if (!L.punch) {
      // ── stack ──
      L.rows.forEach((row, i) => {
        const a0 = enterAt(i), a = lt - a0;
        if (a <= 0) return;
        const base = L.firstBase + i * L.lh;
        const newest = i === N - 1 || lt < enterAt(i + 1);
        const dim = newest ? 1 : lerp(1, 0.55, ease.outCubic(clamp((lt - enterAt(i + 1)) / 0.4)));
        // accent bar
        const bq = ease.outExpo(clamp(a / 0.35));
        ctx.save(); ctx.fillStyle = api.brand(ctx, 0, base - L.px * 0.72, 0, base, P.primary, P.secondary);
        ctx.shadowColor = P.primary; ctx.shadowBlur = 18 * dim; ctx.globalAlpha = dim;
        ctx.fillRect(STACK_X - 44, base - L.px * 0.72 * bq, 8, L.px * 0.72 * bq); ctx.restore();
        // mask: words rise out of the baseline
        ctx.save();
        ctx.beginPath(); ctx.rect(STACK_X - 20, base - L.px * 1.05, STACK_W + 120, L.px * 1.3); ctx.clip();
        drawWords(row, i, STACK_X, base, a0, { rise: true, alpha: dim });
        ctx.restore();
        streakAt(STACK_X, STACK_X + row.width, base + L.px * 0.16, a - (row.words.length - 1) * wordGap * 0.5);
      });
    } else {
      // ── punch ──
      const cx = W / 2, cy = L.firstBase - L.px * 0.36;
      L.rows.forEach((row, i) => {
        const a0 = enterAt(i), a = lt - a0;
        if (a <= -grid) return;
        const next = i < N - 1 ? enterAt(i + 1) : Infinity;
        const out = clamp((lt - next) / 0.22);
        if (out >= 1) return;
        // anticipation: a thin charging line just before the slam
        if (a < 0) {
          const k = clamp(1 + a / grid);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
          ctx.fillStyle = api.brand(ctx, cx - 600, 0, cx + 600, 0, rgba(P.primary, 0), '#ffffff');
          ctx.fillRect(cx - 600 * k, cy - 1.5, 1200 * k, 3); ctx.restore();
          return;
        }
        const slam = 1 + 0.35 * Math.exp(-a * 14) * Math.cos(a * 18) - 0.35 * (1 - clamp(a / 0.02));
        const push = 1 + 0.04 * clamp(a / Math.max(0.5, dur - a0)) + 0.25 * ease.inQuad(out);
        const s = Math.max(0.6, slam) * push;
        const x0 = cx - row.width / 2;
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
        // motion echoes right after the slam
        if (a < 0.18) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (const [dyE, al] of [[-46, 0.22], [-92, 0.1]]) {
            api.text(ctx, row.item, x0, L.firstBase + dyE * (1 - a / 0.18), { size: L.px, weight: L.weight, track: L.track, fill: P.primary, alpha: al * (1 - a / 0.18) });
          }
          ctx.restore();
        }
        drawWords(row, i, x0, L.firstBase, a0, { rise: false, alpha: 1 - out });
        ctx.restore();
        // ring + sparks on the slam
        if (a < 0.8) {
          const k = ease.outExpo(clamp(a / 0.7));
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.pow(1 - clamp(a / 0.7), 1.4) * 0.9;
          ctx.strokeStyle = api.brand(ctx, cx - 900, 0, cx + 900, 0, P.primary, P.secondary); ctx.lineWidth = 6 * (1 - k) + 1.2;
          ctx.shadowColor = P.primary; ctx.shadowBlur = 30;
          const ew = row.width / 2 + 40 + 520 * k, eh = L.px * 0.6 + 260 * k;
          api.rr(ctx, cx - ew, cy - eh, ew * 2, eh * 2, eh); ctx.stroke();
          ctx.restore();
          api.sparks(ctx, a, cx, cy, 70, 3 + i, { a0: 0, a1: 6.2832, sMin: 300, sMax: 1800, pow: 1.5, drag: 3.6, grav: 420, lifeMin: 0.3, lifeMax: 0.8, alpha: 0.8 }, ['#ffffff', P.primary, P.secondary], hash);
        }
        streakAt(x0, x0 + row.width, cy + L.px * 0.55, a);
      });
    }
  },
};
