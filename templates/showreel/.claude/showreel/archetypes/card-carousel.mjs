// card-carousel (C9 / C13) — NEW archetype in spike A's glass-card language (s2 wizard chips + selected band,
// s3 glass counter cards with glowing frame corners and check pops). A set of fact cards lands one by one on
// the cue-map hits `card.<i>` (C14), the focus band follows the newest card like a carousel selection, and a
// light sweep (cue `settle`) re-lights every card once the set is complete. A missing cue throws (no made-up times).
//   row — glass cards slide in from the right into ghost slots; rows of up to 3 (N ≥ 4 → two rows)
//   fan — a deck at a glowing pivot swings open like a hand of cards; each card swings out on its hit
// Slots: cards (3–6 feature / route / command facts; route + command render mono) · lead (phrase, optional).
// Every colour comes from params.palette (no literals — static test); text only via api.text (D8). A card's
// text is drawn only once the card has landed in its final place, so no text is ever drawn off-frame while
// cards fly in (C16 no-clipping). Pure function of localT (D9/D10): times come from cues / api.grid only.

const ROW_CW = 560, ROW_GAP = 40, ROW_PAD = 40, ROW_TAG = 56;
const FAN_PX = 260, FAN_CY = 548, FAN_R0 = 180, FAN_R1 = 1560, FAN_RT = 880, FAN_TEXT = 76, FAN_SPREAD = 32, FAN_STEP = 12;
const DEG = Math.PI / 180;
const KIND = /^f\.(.+)\.\d+$/;

/** row variant: cards per row (N ≤ 3 → one row; else two, the first one longer) */
function rowsOf(N) {
  if (N <= 3) return [N];
  const a = Math.ceil(N / 2);
  return [a, N - a];
}

/**
 * Per-kind text size. api.fitSlot (the check record) is ONE px for the whole slot = the minimum over its items,
 * and a 32-char mono route would drag display cards below the display floor. So each kind of card gets the
 * largest px at which all its cards fit maxW (measured in their own family via api.measure), never below the
 * slot's fitSlot px — every card still fits wherever fitSlot said the slot fits.
 */
function kindSizes(api, m, items, kinds, maxW, maxPx, slotPx) {
  const byKind = {};
  items.forEach((it, i) => {
    const wAt = (px) => api.measure(m, it, { size: px, weight: 600 }).width;
    let px = maxPx;
    if (wAt(px) > maxW) px = Math.floor((px * maxW) / wAt(px));
    while (px > slotPx && wAt(px) > maxW) px--;
    px = Math.max(slotPx, px);
    byKind[kinds[i]] = Math.min(byKind[kinds[i]] ?? maxPx, px);
  });
  return kinds.map((k) => byKind[k]);
}

/** a cue's local time, or throw: never invent a time for a missing / misnamed cue */
function cueOf(cues, name) {
  const t = cues[name];
  if (typeof t !== 'number') throw new Error(`card-carousel: missing cue ${name}`);
  return t;
}

export default {
  id: 'card-carousel',

  layout(rb, variant, api) {
    const items = rb.slots.cards.items;
    const lead = rb.slots.lead?.items[0] ?? null;
    const N = items.length;
    const m = api.makeCanvas('cache', 8, 8).ctx;
    const kinds = items.map((it) => KIND.exec(it.id)?.[1] ?? 'feature');
    // the compiler always emits card.<i> + settle (C14): a missing one is a broken timeline — fail at setup (Rule 12)
    for (const name of [...items.map((_, i) => 'card.' + i), 'settle']) cueOf(api.cues, name);

    if (variant === 'fan') {
      const spread = Math.min(FAN_SPREAD, (N - 1) * FAN_STEP) * DEG;
      const step = N > 1 ? spread / (N - 1) : 0;
      const bh = Math.round(Math.min(124, 0.92 * FAN_RT * Math.sin(step || FAN_STEP * DEG)));
      const textX = FAN_RT + FAN_TEXT, textW = FAN_R1 - 36 - textX;
      const leadPx = lead ? api.fitSlot('lead', { maxW: 820, maxPx: 52, weight: 700, track: 1 }) : 0;
      const maxPx = Math.min(46, Math.round(bh * 0.4));
      const slotPx = api.fitSlot('cards', { maxW: textW, maxPx, weight: 600 });
      const sizes = kindSizes(api, m, items, kinds, textW, maxPx, slotPx);
      const px = Math.max(...sizes);
      const cards = items.map((item, i) => ({
        item, kind: kinds[i], ang: (i - (N - 1) / 2) * step, px: sizes[i],
        textW: api.measure(m, item, { size: sizes[i], weight: 600 }).width,
      }));
      return { variant: 'fan', N, cards, lead, leadPx, leadW: lead ? api.measure(m, lead, { size: leadPx, weight: 700, track: 1 }).width : 0, px, bh, textX, step };
    }

    // row (default)
    const rows = rowsOf(N);
    const ch = rows.length === 1 ? 360 : 290;
    const leadPx = lead ? api.fitSlot('lead', { maxW: 1400, maxPx: 56, weight: 700, track: 1 }) : 0;
    const maxPx = rows.length === 1 ? 54 : 50;
    const slotPx = api.fitSlot('cards', { maxW: ROW_CW - 2 * ROW_PAD, maxPx, weight: 600 });
    const sizes = kindSizes(api, m, items, kinds, ROW_CW - 2 * ROW_PAD, maxPx, slotPx);
    const px = Math.max(...sizes);
    const head = lead ? 150 + leadPx : 60;
    const blockH = rows.length * ch + (rows.length - 1) * ROW_GAP;
    const top = Math.round(head + Math.max(0, (1080 - 70 - head - blockH) / 2));
    const cards = [];
    rows.forEach((n, r) => {
      const rowW = n * ROW_CW + (n - 1) * ROW_GAP;
      for (let c = 0; c < n; c++) {
        const i = cards.length;
        const x = Math.round((1920 - rowW) / 2 + c * (ROW_CW + ROW_GAP)), y = top + r * (ch + ROW_GAP);
        cards.push({
          item: items[i], kind: kinds[i], px: sizes[i], x, y, w: ROW_CW, h: ch, cx: x + ROW_CW / 2, cy: y + ch / 2,
          textW: api.measure(m, items[i], { size: sizes[i], weight: 600 }).width,
        });
      }
    });
    return { variant: 'row', N, cards, lead, leadPx, leadY: lead ? 104 + leadPx : 0, px, ch, floorY: top + blockH + 44 };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L } = p;
    const { W, clamp, lerp, ease, hash, rgba, mix, rr, palette: P, grid } = api;
    const N = L.N;
    const landAt = (i) => cueOf(cues, 'card.' + i);
    const SETTLE = cueOf(cues, 'settle');
    const pulse = (t0, decay) => (lt >= t0 ? Math.exp(-(lt - t0) * decay) : 0);
    const accents = [P.primary, P.secondary, P.hot, P.amber, P.mint, P.primary];
    const sparkCols = [P.text, P.secondary, P.primary];
    // carousel focus: the newest landed card holds the band until the next one lands
    let focusIdx = -1;
    for (let i = 0; i < N; i++) if (lt >= landAt(i)) focusIdx = i;
    const settled = lt >= SETTLE;
    const kick = 1 + 0.012 * Math.min(1, api.cueEnergy(lt, 10));

    // ─── shared pieces ───
    function icon(c, kind, x, y, s, col) {
      c.save(); c.translate(x, y);
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2.5, s * 0.12); c.lineCap = 'round'; c.lineJoin = 'round';
      c.shadowColor = col; c.shadowBlur = 10;
      if (kind === 'command') {
        api.chevron(c, -s * 0.32, s * 0.28, s * 0.56, col, 8);
        c.beginPath(); c.moveTo(s * 0.06, s * 0.28); c.lineTo(s * 0.36, s * 0.28); c.stroke();
      } else if (kind === 'route') {
        c.beginPath(); c.moveTo(s * 0.12, -s * 0.34); c.lineTo(-s * 0.12, s * 0.34); c.stroke();
        c.beginPath(); c.arc(-s * 0.3, s * 0.26, s * 0.08, 0, 7); c.arc(s * 0.3, -s * 0.26, s * 0.08, 0, 7); c.fill();
      } else { // feature: a four-point spark
        c.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4 - Math.PI / 2, r = k % 2 ? s * 0.12 : s * 0.38;
          if (k) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath(); c.fill();
      }
      c.restore();
    }

    function corners(c, x, y, w, h, len, a, flare) {
      if (len <= 0.5) return;
      c.save(); c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = mix(P.secondary, P.text, 0.5 * flare, 0.85 * a); c.shadowColor = rgba(P.secondary, 0.9 * a); c.shadowBlur = 12 + 26 * flare;
      for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const px0 = x + sx * w, py0 = y + sy * h, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
        c.beginPath(); c.moveTo(px0 + dx * len, py0); c.lineTo(px0, py0); c.lineTo(px0, py0 + dy * len); c.stroke();
      }
      c.restore();
    }

    /** one glass card in LOCAL coords: body rect (x0,y0,w,h); content anchored at (tx, base) */
    function card(c, cd, i, g) {
      const { x0, y0, w, h, tx, tagX, tagY, tagS, base, ghost } = g;
      const land = landAt(i), dl = lt - land;
      const landed = dl >= 0;
      const fl = pulse(land, 7);                       // landing flash
      const focus = !settled && i === focusIdx ? 1 : 0;
      const sw = pulse(SETTLE + i * grid * 0.5, 4.5);  // settle re-light, staggered across the set
      const lit = landed ? 0.35 + 0.65 * Math.max(focus, sw) : 0;
      const acc = accents[i % accents.length];
      const r = Math.min(22, h * 0.24);

      // halo
      if (landed) {
        c.save(); c.globalCompositeOperation = 'lighter';
        const hr = Math.max(w, h) * 0.62, hg = c.createRadialGradient(x0 + w / 2, y0 + h / 2, 0, x0 + w / 2, y0 + h / 2, hr);
        hg.addColorStop(0, mix(P.primary, P.secondary, 0.4, 0.05 + 0.12 * lit + 0.18 * fl)); hg.addColorStop(1, rgba(P.primary, 0));
        c.fillStyle = hg; c.fillRect(x0 + w / 2 - hr, y0 + h / 2 - hr, hr * 2, hr * 2); c.restore();
      }
      api.glass(c, x0, y0, w, h, r, {
        fill: rgba(P.ink2, ghost ? 0.5 : 0.7), border: rgba(landed ? acc : P.text, landed ? 0.28 + 0.5 * lit : 0.14),
        glowColor: rgba(P.primary, 0.2 + 0.3 * lit + 0.3 * fl), glowBlur: 30,
      });
      // focus band: the spike's selected-option gradient, held by the active card, flashed on landing
      const band = 0.26 * focus + 0.5 * fl + 0.22 * sw;
      if (band > 0.003) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= clamp(band);
        rr(c, x0 + 2, y0 + 2, w - 4, h - 4, r - 2);
        c.fillStyle = api.brand(c, x0, 0, x0 + w, 0, rgba(P.primary, 0.75), rgba(P.secondary, 0.55)); c.fill();
        c.restore();
      }
      corners(c, x0 + 12, y0 + 12, w - 24, h - 24, Math.min(40, h * 0.22) * ease.outBack(clamp(dl / 0.3)) * (landed ? 1 : 0), 0.55 + 0.45 * lit, fl + sw);

      // tag tile + kind icon
      const ta = landed ? 1 : 0.35;
      api.glass(c, tagX, tagY, tagS, tagS, 14, { fill: rgba(acc, 0.12 + 0.14 * lit), border: rgba(acc, 0.5 + 0.4 * lit), alpha: ta, glowColor: landed ? rgba(acc, 0.45) : null, glowBlur: 16 });
      if (landed) icon(c, cd.kind, tagX + tagS / 2, tagY + tagS / 2, tagS * 0.62, mix(acc, P.text, 0.35));

      // skeleton bars (spike placeholder rows) — ghost cards show them alone
      const sk = g.skeleton;
      if (sk) {
        c.save(); c.fillStyle = rgba(P.text, landed ? 0.07 : 0.1);
        for (let k = 0; k < sk.n; k++) { rr(c, tx, sk.y + k * sk.gap, sk.w * (0.82 - 0.3 * hash(i * 3.1 + k * 7.7)), 10, 5); c.fill(); }
        c.restore();
      }

      // text: only once landed (final place → never off-frame); wipes on left → right
      if (landed) {
        const q = ease.outExpo(clamp(dl / 0.32));
        c.save();
        c.beginPath(); c.rect(tx - 8, base - cd.px * 1.2, (cd.textW + 24) * q + 1, cd.px * 1.8); c.clip();
        c.shadowColor = rgba(P.primary, 0.6); c.shadowBlur = 10 + 14 * (fl + focus * 0.5);
        api.text(c, cd.item, tx, base + 10 * (1 - q), { size: cd.px, weight: 600, fill: P.text, alpha: clamp(q * 2.5) });
        if (fl > 0.02) { // hot white flash on the glyphs
          c.globalCompositeOperation = 'lighter'; c.shadowBlur = 0;
          api.text(c, cd.item, tx, base + 10 * (1 - q), { size: cd.px, weight: 600, fill: P.text, alpha: 0.55 * fl });
        }
        c.restore();
        // wipe head
        if (q < 0.99) {
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - q;
          const hx = tx - 8 + (cd.textW + 24) * q;
          const gg = c.createLinearGradient(0, base - cd.px, 0, base + cd.px * 0.4);
          gg.addColorStop(0, rgba(P.text, 0)); gg.addColorStop(0.5, rgba(P.text, 0.95)); gg.addColorStop(1, rgba(P.text, 0));
          c.fillStyle = gg; c.fillRect(hx - 2, base - cd.px, 4, cd.px * 1.4); c.restore();
        }
      }

      // progress segment along the bottom: fills on landing (spike wizard progress)
      if (g.bar) {
        const { bx, by, bw } = g.bar;
        c.save(); rr(c, bx, by, bw, 6, 3); c.fillStyle = rgba(P.text, 0.08); c.fill();
        const f = landed ? Math.min(1.03, ease.outBack(clamp(dl / 0.45))) : 0;
        if (f > 0.002) {
          rr(c, bx, by, bw * f, 6, 3);
          c.fillStyle = api.brand(c, bx, 0, bx + bw, 0, P.primary, P.secondary); c.shadowColor = P.secondary; c.shadowBlur = 8 + 10 * lit; c.fill();
        }
        c.restore();
      }
      if (dl >= 0.05) api.checkMark(c, x0 + w - 34, y0 + 34, 15, clamp((dl - 0.05) / 0.35), P.mint);

      // landing: flash lines on the long edges + sparks from both ends (spike reel lock)
      if (landed && dl < 0.6) {
        const hw = lerp(0, w * 0.6, ease.outExpo(clamp(dl / 0.22))), mx = x0 + w / 2;
        c.save(); c.globalCompositeOperation = 'lighter';
        const lg = c.createLinearGradient(mx - hw, 0, mx + hw, 0);
        lg.addColorStop(0, rgba(P.secondary, 0)); lg.addColorStop(0.5, rgba(P.text, 0.7 * Math.exp(-dl * 9))); lg.addColorStop(1, rgba(P.primary, 0));
        c.fillStyle = lg; c.fillRect(mx - hw, y0 - 1.5, hw * 2, 3); c.fillRect(mx - hw, y0 + h - 1.5, hw * 2, 3);
        c.restore();
        api.sparks(c, dl, x0 + 6, y0 + h / 2, 14, 40 + i, { a0: 2.2, a1: 4.1, sMin: 200, sMax: 800, pow: 1.3, drag: 5, grav: 400, lifeMin: 0.25, lifeMax: 0.55, alpha: 0.85 }, sparkCols, hash);
        api.sparks(c, dl, x0 + w - 6, y0 + h / 2, 14, 60 + i, { a0: -0.95, a1: 0.95, sMin: 200, sMax: 800, pow: 1.3, drag: 5, grav: 400, lifeMin: 0.25, lifeMax: 0.55, alpha: 0.85 }, sparkCols, hash);
      }
      // settle sweep: a light band crossing the card (clipped to it)
      const sq = clamp((lt - (SETTLE - 0.12 + i * grid * 0.5)) / 0.5);
      if (sq > 0 && sq < 1) {
        c.save(); rr(c, x0, y0, w, h, r); c.clip(); c.globalCompositeOperation = 'lighter';
        const sx = lerp(x0 - w * 0.5, x0 + w * 1.5, ease.inOutCubic(sq)), bw2 = Math.max(90, w * 0.22);
        const sg = c.createLinearGradient(sx - bw2, 0, sx + bw2, 0);
        sg.addColorStop(0, rgba(P.secondary, 0)); sg.addColorStop(0.5, rgba(P.text, 0.32 * Math.sin(sq * Math.PI))); sg.addColorStop(1, rgba(P.primary, 0));
        c.fillStyle = sg; c.fillRect(x0, y0, w, h); c.restore();
      }
    }

    // ─── lead: tracked headline + brand rule ───
    function drawLead(x, y, align, w) {
      if (!L.lead) return;
      const q = ease.outExpo(clamp((lt - grid) / 0.5));
      if (q <= 0) return;
      api.text(ctx, L.lead, x, y + 22 * (1 - q), { size: L.leadPx, weight: 700, track: 1, align, fill: P.text, alpha: q });
      const hw = Math.min(200, w / 2 + 20) * q, cx = align === 'center' ? x : x + hw;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = api.brand(ctx, cx - hw, 0, cx + hw, 0, P.primary, P.secondary); ctx.shadowColor = P.primary; ctx.shadowBlur = 14;
      ctx.fillRect(cx - hw, y + 26, hw * 2, 3); ctx.restore();
    }

    if (L.variant === 'fan') drawFan(); else drawRow();

    function drawRow() {
      drawLead(W / 2, L.leadY, 'center', L.lead ? 600 : 0);
      const drift = 6 * Math.sin(lt * 0.9);   // the carousel never quite stops
      // ghost slots: dashed outlines waiting for their card (no empty frame before the first landing)
      const ga = ease.outCubic(clamp(lt / 0.35));
      ctx.save(); ctx.translate(W / 2, 540); ctx.scale(kick, kick); ctx.translate(-W / 2, -540);
      L.cards.forEach((cd, i) => {
        const land = landAt(i), enter = Math.max(0.05, Math.min(4 * grid, land - 0.05));
        const u = clamp((lt - (land - enter)) / enter);
        if (u < 1 && ga > 0) {
          ctx.save(); ctx.globalAlpha = ga * (1 - u) * 0.9; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -lt * 30;
          ctx.strokeStyle = rgba(P.text, 0.22); ctx.lineWidth = 2; rr(ctx, cd.x + 0.5, cd.y + 0.5, cd.w - 1, cd.h - 1, 22); ctx.stroke();
          ctx.setLineDash([]); ctx.fillStyle = rgba(P.text, 0.06);
          for (let k = 0; k < 3; k++) { rr(ctx, cd.x + ROW_PAD, cd.y + cd.h * 0.5 + k * 30, (cd.w - 2 * ROW_PAD) * (0.75 - 0.25 * hash(i + k * 5.3)), 10, 5); ctx.fill(); }
          ctx.restore();
        }
        if (u <= 0) return;
        // fly in from the right (carousel scroll), land on the cue with a pop
        const e = ease.outQuart(u), dl = lt - land;
        const ox = (1 - e) * 760 + drift;
        const pop = dl >= 0 ? 1 + 0.07 * Math.exp(-dl * 12) * Math.cos(dl * 32) : lerp(0.92, 1, e);
        const geom = (c) => {
          c.translate(cd.cx + ox, cd.cy); c.scale(pop, pop);
          const w = cd.w, h = cd.h, x0 = -w / 2, y0 = -h / 2;
          return {
            x0, y0, w, h, tx: x0 + ROW_PAD, tagX: x0 + ROW_PAD, tagY: y0 + 34, tagS: ROW_TAG,
            base: y0 + 34 + ROW_TAG + 30 + L.px * 0.95,
            skeleton: { n: 2, y: y0 + 34 + ROW_TAG + 30 + L.px * 0.95 + 34, gap: 26, w: w - 2 * ROW_PAD },
            bar: { bx: x0 + ROW_PAD, by: y0 + h - 30, bw: w - 2 * ROW_PAD },
          };
        };
        if (u < 1) { // motion echoes while sliding
          for (let k = 3; k >= 1; k--) {
            const ek = ease.outQuart(clamp((lt - k * 0.016 - (land - enter)) / enter));
            ctx.save(); ctx.translate(cd.cx + (1 - ek) * 760 + drift, cd.cy);
            rr(ctx, -cd.w / 2, -cd.h / 2, cd.w, cd.h, 22); ctx.globalAlpha *= 0.16 / k; ctx.fillStyle = rgba(P.primary, 1); ctx.fill(); ctx.restore();
          }
        }
        ctx.save(); ctx.globalAlpha *= clamp(u * 3);
        const g = geom(ctx);
        card(ctx, cd, i, g);
        ctx.restore();
      });
      ctx.restore();
      // floor line under the set
      const fl = ease.outExpo(clamp(lt / 0.8));
      if (fl > 0) {
        const hw = 860 * fl, s = pulse(SETTLE, 4);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(W / 2 - hw, 0, W / 2 + hw, 0);
        g.addColorStop(0, rgba(P.primary, 0)); g.addColorStop(0.5, rgba(P.secondary, 0.3 + 0.5 * s)); g.addColorStop(1, rgba(P.primary, 0));
        ctx.fillStyle = g; ctx.fillRect(W / 2 - hw, Math.min(L.floorY, 1040), hw * 2, 2); ctx.restore();
      }
    }

    function drawFan() {
      drawLead(96, 150, 'left', L.lead ? L.leadW : 0);
      const enter = ease.outCubic(clamp(lt / 0.45));
      const slide = (1 - enter) * -320;
      ctx.save();
      ctx.translate(slide, 0);
      ctx.translate(FAN_PX, FAN_CY); ctx.scale(kick, kick); ctx.translate(-FAN_PX, -FAN_CY);
      ctx.globalAlpha *= clamp(enter * 1.5);
      const breathe = 1 + 0.025 * Math.sin(lt * 1.3) * clamp((lt - SETTLE) / 0.6);
      const angOf = (i) => {
        const land = landAt(i), swing = Math.max(0.05, Math.min(3 * grid, land - 0.05)), dl = lt - land;
        if (dl < -swing) return { a: 0, out: false, u: 0 };
        if (dl < 0) return { a: L.cards[i].ang * ease.inOutCubic(1 + dl / swing), out: false, u: 1 + dl / swing };
        return { a: L.cards[i].ang * (breathe + 0.07 * Math.exp(-dl * 10) * Math.sin(dl * 30)), out: true, u: 1 };
      };
      const geom = (c, a, cd) => {
        c.translate(FAN_PX, FAN_CY); c.rotate(a);
        const h = L.bh, w = FAN_R1 - FAN_R0, x0 = FAN_R0, y0 = -h / 2, tagS = Math.min(56, h - 28);
        const base = cd.px * 0.36 - (h > 96 ? 10 : 0);
        return {
          x0, y0, w, h, tx: L.textX, tagX: FAN_RT, tagY: -tagS / 2, tagS, base,
          skeleton: h > 96 ? { n: 1, y: base + 18, gap: 0, w: Math.min(420, FAN_R1 - 60 - L.textX) } : null,
          bar: null,
        };
      };
      // the unswung deck first (beneath), then the swung cards in index order
      const st = L.cards.map((_, i) => angOf(i));
      const order = [...L.cards.keys()].filter((i) => !st[i].out && st[i].u === 0).concat([...L.cards.keys()].filter((i) => st[i].out || st[i].u > 0));
      for (const i of order) {
        const cd = L.cards[i];
        ctx.save();
        const g = geom(ctx, st[i].a, cd);
        card(ctx, cd, i, { ...g, ghost: !st[i].out });
        // brand edge along the card's spine (ties the hand together at the pivot)
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.5 + 0.5 * pulse(landAt(i), 6);
        ctx.fillStyle = api.brand(ctx, g.x0, 0, g.x0 + 700, 0, rgba(accents[i % accents.length], 0.9), rgba(P.primary, 0));
        ctx.fillRect(g.x0 + 10, g.y0 + 2, 690, 2); ctx.restore();
        ctx.restore();
      }
      // pivot hub
      const hub = pulse(landAt(Math.max(0, focusIdx)), 6) * (focusIdx >= 0 ? 1 : 0) + pulse(SETTLE, 4);
      ctx.save(); ctx.translate(FAN_PX, FAN_CY);
      api.glowDot(ctx, 0, 0, 90 + 60 * hub, 0.35 + 0.35 * hub, api.hexToRgb(P.primary).join(','));
      api.glass(ctx, -34, -34, 68, 68, 34, { fill: rgba(P.ink2, 0.85), border: rgba(P.secondary, 0.8), glowColor: rgba(P.secondary, 0.6), glowBlur: 24 });
      ctx.lineWidth = 3; ctx.strokeStyle = api.brand(ctx, -34, -34, 34, 34, P.primary, P.secondary);
      for (let k = 0; k < 3; k++) { const a0 = lt * 1.4 + k * 2.0944; ctx.beginPath(); ctx.arc(0, 0, 46, a0, a0 + 0.9); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fillStyle = P.text; ctx.shadowColor = P.secondary; ctx.shadowBlur = 16; ctx.fill();
      ctx.restore();
      ctx.restore();
    }
  },
};
