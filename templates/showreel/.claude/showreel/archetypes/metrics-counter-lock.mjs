// metrics-counter-lock (C9) — port of spike s3's slot-machine counter. Each count fact rolls up like an
// odometer inside a glass card with glowing frame corners; every counter LOCKS on cue `lock` onto the exact
// code-extracted display (api.counter at progress 1 draws item.text — D8), with a punch, rings and a check.
//   row  — counters side by side          grid — 2 columns (1 counter = one hero card)
// Slots: counters (1–4 count facts; unit drawn under the number via api.unit) · label (phrase, optional).
// Rolling values are integers 0..number recorded as counter:<id>. Pure function of localT (D9/D10).

const ROW_MAX = [0, 340, 280, 210, 170];   // number max px by counter count (row)
const GRID_MAX = [0, 340, 280, 200, 200];  // (grid)
const AREA_W = 1680, GAP = 40;

export default {
  id: 'metrics-counter-lock',

  layout(rb, variant, api) {
    const items = rb.slots.counters.items;
    const label = rb.slots.label?.items[0] ?? null;
    const N = items.length;
    const cols = variant === 'grid' ? Math.min(N, 2) : N;
    const rows = Math.ceil(N / cols);
    const cw = Math.min(N === 1 ? 760 : 600, Math.floor((AREA_W - (cols - 1) * GAP) / cols));
    const ch = rows === 1 ? 560 : 340;
    const labelPx = label ? api.fitSlot('label', { maxW: 1400, maxPx: 56, weight: 700, track: 1 }) : 0;
    const px = api.fitSlot('counters', { maxW: cw - 90, maxPx: (variant === 'grid' ? GRID_MAX : ROW_MAX)[N], weight: 800 });
    // units share one px, fitted by the engine: a unit too wide for its card fails `check` (fit null)
    const unitPx = api.fitUnits('counters', { maxW: cw - 90, maxPx: Math.max(30, Math.round(px * 0.2)), weight: 600, track: 2 });
    const top = (label ? 170 + labelPx : 0) + Math.round((1080 - (label ? 170 + labelPx : 0) - (rows * ch + (rows - 1) * GAP)) / 2);
    const cards = items.map((item, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const inRow = Math.min(cols, N - r * cols);                       // centre a short last row
      const rowW = inRow * cw + (inRow - 1) * GAP;
      const x = Math.round((1920 - rowW) / 2 + c * (cw + GAP));
      const y = top + r * (ch + GAP);
      const uPx = item.unit ? unitPx : 0;
      const numBase = Math.round(y + ch * 0.5 + px * 0.36 - (uPx ? uPx * 0.6 : 0));
      return { item, x, y, w: cw, h: ch, cx: x + cw / 2, numBase, unitPx: uPx, unitBase: numBase + Math.round(uPx * 1.7) };
    });
    return { cards, label, labelPx, labelY: label ? 150 + labelPx : 0, px, pitch: Math.round(px * 1.05) };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L, dur } = p;
    const { W, clamp, lerp, ease, hash, rgba, mix, palette: P, grid } = api;
    const snap = (x) => Math.max(grid, Math.round(x / grid) * grid);
    const lock = cues.lock ?? snap(dur * 0.6);
    const dl = lt - lock, lk = dl >= 0 ? Math.exp(-dl * 9) : 0;
    const N = L.cards.length;

    // ── label: tracked headline + brand rule ──
    if (L.label) {
      const q = ease.outExpo(clamp((lt - grid) / 0.5));
      if (q > 0) {
        api.text(ctx, L.label, W / 2, L.labelY + 24 * (1 - q), { size: L.labelPx, weight: 700, track: 1, align: 'center', fill: P.text, alpha: q });
        const hw = 180 * q;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = api.brand(ctx, W / 2 - hw, 0, W / 2 + hw, 0, P.primary, P.secondary); ctx.shadowColor = P.primary; ctx.shadowBlur = 14;
        ctx.fillRect(W / 2 - hw, L.labelY + 28, hw * 2, 3); ctx.restore();
      }
    }

    L.cards.forEach((cd, i) => {
      const appear = grid * (2 + 2 * i);
      const ap = ease.outQuint(clamp((lt - appear) / 0.4));
      if (ap <= 0.002) return;
      const rollStart = Math.min(appear + grid * 2, lock - grid * 4);
      const u = clamp((lt - rollStart) / (lock - rollStart));
      const prog = 1 - Math.pow(1 - u, 2.5);
      const n = cd.item.number;
      const { cx, x, y, w, h } = cd;
      const cy = y + h / 2;
      ctx.save();
      ctx.globalAlpha = clamp(ap * 1.3);
      ctx.translate(0, (1 - ap) * 40);

      // halo behind the number, swells on the lock
      const hr = Math.min(w, h) * 0.7 + 90 * lk, hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, hr);
      hg.addColorStop(0, mix(P.primary, P.secondary, 0.35, 0.14 + 0.2 * lk)); hg.addColorStop(1, rgba(P.primary, 0));
      ctx.fillStyle = hg; ctx.fillRect(cx - hr, cy - hr, hr * 2, hr * 2);
      api.glass(ctx, x, y, w, h, 26, { fill: 'rgba(12,15,26,0.62)', border: rgba(P.secondary, 0.22 + 0.4 * lk), glowColor: rgba(P.primary, 0.25 + 0.3 * lk), glowBlur: 36 });

      // frame corners (draw on with the card, flare on the lock)
      const ll = 46 * ease.outBack(ap), fx = x + 18, fy = y + 18, fw = w - 36, fh = h - 36;
      ctx.save(); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = mix(P.secondary, '#ffffff', 0.5 * lk, 0.9); ctx.shadowColor = rgba(P.secondary, 0.9); ctx.shadowBlur = 14 + 30 * lk;
      for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const px0 = fx + sx * fw, py0 = fy + sy * fh, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(px0 + dx * ll, py0); ctx.lineTo(px0, py0); ctx.lineTo(px0, py0 + dy * ll); ctx.stroke();
      }
      ctx.restore();

      // the reel: current value rolls up out of the window as the next one rises in
      const punch = 1 + (dl >= 0 ? 0.08 * Math.exp(-dl * 9) * Math.cos(dl * 34) : 0);
      const v = n * prog, cur = Math.min(n, Math.floor(v + 1e-9)), frac = cur >= n ? 0 : v - cur;
      const speed = u < 1 ? (n * 2.5 * Math.pow(1 - u, 1.5)) / Math.max(grid, lock - rollStart) : 0; // values/s
      const stretch = 1 + Math.min(speed / 60, 0.35);
      const gdig = ctx.createLinearGradient(0, cd.numBase - L.px * 0.8, 0, cd.numBase);
      gdig.addColorStop(0, mix(P.primary, '#ffffff', 0.45)); gdig.addColorStop(0.5, P.primary); gdig.addColorStop(1, P.secondary);
      const white = ease.outCubic(clamp((lt - (lock - grid)) / grid));
      const numCy = cd.numBase - L.px * 0.36;
      ctx.save();
      // slot window = the digit band only (cap height + a little), so a rolling value never crosses the unit
      ctx.beginPath(); ctx.rect(x + 10, cd.numBase - L.px * 0.9, w - 20, L.px * 0.98); ctx.clip();
      ctx.translate(cx, numCy); ctx.scale(punch, punch); ctx.translate(-cx, -numCy);
      ctx.shadowColor = mix(P.primary, P.secondary, 0.3, 0.55); ctx.shadowBlur = 18 + 16 * lk;
      for (const [val, off] of [[cur, -frac], [cur + 1, 1 - frac]]) {
        if (val > n || (off !== -frac && frac === 0)) continue;
        const dy = off * L.pitch;
        const al = clamp(1 - Math.abs(dy) / (L.pitch * 0.75));
        if (al <= 0.01) continue;
        ctx.save(); ctx.translate(cx, cd.numBase + dy); ctx.scale(1, stretch); ctx.translate(-cx, -cd.numBase);
        const o = { size: L.px, weight: 800, align: 'center', fill: gdig, alpha: al / (1 + (stretch - 1) * 0.4) };
        api.counter(ctx, cd.item, n === 0 ? 1 : val / n, cx, cd.numBase, o);
        if (val === n && white > 0) { // the locked display cools to crisp white
          ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 0;
          api.counter(ctx, cd.item, 1, cx, cd.numBase, { ...o, fill: '#ffffff', alpha: (0.3 + 0.5 * lk) * white * al });
        }
        ctx.restore();
      }
      ctx.restore();

      // unit
      if (cd.item.unit) {
        const ua = ease.outCubic(clamp((lt - appear - grid * 3) / 0.4));
        if (ua > 0) api.unit(ctx, cd.item, cx, cd.unitBase + 14 * (1 - ua), { size: cd.unitPx, weight: 600, track: 2, align: 'center', fill: mix(P.dim, '#ffffff', 0.25 + 0.5 * lk), alpha: ua });
      }

      // lock: settle ring, bigger mint ring, check badge
      if (dl >= 0 && dl < 0.6) {
        const k = clamp(dl / 0.55), r = lerp(Math.min(w, h) * 0.3, Math.min(w, h) * 0.75, ease.outExpo(k));
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = mix(P.mint, '#ffffff', 0.3, 0.55 * (1 - k)); ctx.lineWidth = lerp(5, 1, k);
        ctx.beginPath(); ctx.arc(cx, numCy, r, 0, 7); ctx.stroke();
        ctx.strokeStyle = rgba(P.secondary, 0.45 * (1 - k)); ctx.lineWidth = lerp(3, 1, k);
        ctx.beginPath(); ctx.arc(cx, numCy, r * 0.7, 0, 7); ctx.stroke();
        ctx.restore();
      }
      if (dl >= 0.03) api.checkMark(ctx, x + w - 18, y + 18, N > 2 ? 20 : 26, clamp((dl - 0.03) / 0.35), P.mint);
      if (dl >= 0) api.sparks(ctx, dl, cx, numCy, 36, 20 + i, { a0: 0, a1: 6.2832, sMin: 200, sMax: 900, pow: 1.4, drag: 4, grav: 260, lifeMin: 0.25, lifeMax: 0.6, alpha: 0.8 }, ['#ffffff', P.secondary, P.mint], hash);
      ctx.restore();
    });

    // floor line under the cards (anchors the composition)
    const fl = ease.outExpo(clamp(lt / 0.8));
    if (fl > 0 && N) {
      const yb = Math.max(...L.cards.map((c) => c.y + c.h)) + 46, hw = 820 * fl;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(W / 2 - hw, 0, W / 2 + hw, 0);
      g.addColorStop(0, rgba(P.primary, 0)); g.addColorStop(0.5, rgba(P.secondary, 0.35 + 0.4 * lk)); g.addColorStop(1, rgba(P.primary, 0));
      ctx.fillStyle = g; ctx.fillRect(W / 2 - hw, yb, hw * 2, 2);
      ctx.restore();
    }
  },
};
