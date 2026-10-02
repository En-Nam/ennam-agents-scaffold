// column-wipe (C9 transition, M2) — the frame splits into vertical columns that flip from the outgoing
// to the incoming beat left → right, staggered, each column wiping vertically (alternating down / up).
// The incoming content slides the last few px into place behind the wipe front, and every front carries
// a brand-gradient light bar with a hot core (additive), brightest mid-wipe; thin bright column edges and a
// short luminance lift trailing the front keep the columns legible over dark backgrounds. 2 GRID overlap (C13/C14).
// Pure function of k (0..1 over the overlap). Continuity: k=0 ≡ outgoing beat alone, k=1 ≡ incoming alone;
// mid-overlap the left columns already show the incoming beat while the right ones still show the outgoing.
// C16: both beats draw onto scratch layers that are blitted shifted (±SLIDE) and clipped, so the engine records
// no text boxes during the overlap (core.mjs setBoxRecording(false)); overlap frames are exempt from offFrame.

const COLS = 6;
const STAGGER = 0.1;                         // start offset between neighbouring columns, in k
const SPAN = 1 - (COLS - 1) * STAGGER;       // each column's own wipe length, in k (0.5)
const SLIDE = 40;                            // px the incoming column content travels behind the front

export default {
  id: 'column-wipe',
  apply(ctx, k, drawOut, drawIn, api) {
    const { W, H, clamp, ease, palette: pal } = api;
    const A = api.scratch(0), B = api.scratch(1);
    drawOut(A.ctx);
    drawIn(B.ctx);
    const cw = W / COLS;

    // per column: wipe progress u ∈ [0,1], direction (even columns wipe down, odd up)
    const cols = [];
    for (let c = 0; c < COLS; c++) {
      const u = ease.inOutCubic(clamp((k - c * STAGGER) / SPAN));
      cols.push({ x: c * cw, u, down: c % 2 === 0 });
    }

    // 1) outgoing beat in the not-yet-wiped part of every column
    ctx.save();
    ctx.beginPath();
    for (const { x, u, down } of cols) if (u < 1) ctx.rect(x, down ? u * H : 0, cw, (1 - u) * H);
    ctx.clip();
    ctx.drawImage(A.canvas, 0, 0);
    ctx.restore();

    // 2) incoming beat in the wiped part, sliding the last SLIDE px into place
    for (const { x, u, down } of cols) {
      if (u <= 0) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, down ? 0 : (1 - u) * H, cw, u * H); ctx.clip();
      ctx.drawImage(B.canvas, 0, (down ? -1 : 1) * SLIDE * (1 - u));
      ctx.restore();
    }

    // 3) light bar on every moving front: brand gradient across the column, white-hot core, gone at u = 0 and 1
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const { x, u, down } of cols) {
      const a = Math.sin(Math.PI * u);
      if (a < 0.002) continue;
      const y = down ? u * H : (1 - u) * H;
      ctx.globalAlpha = a;
      ctx.fillStyle = api.brand(ctx, x, 0, x + cw, 0, pal.primary, pal.secondary);
      ctx.shadowColor = pal.primary; ctx.shadowBlur = 30;
      ctx.fillRect(x, y - 3, cw, 6);
      ctx.shadowBlur = 0;
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      g.addColorStop(0, api.rgba(pal.primary, 0));
      g.addColorStop(0.5, api.rgba(pal.secondary, 0.35));
      g.addColorStop(1, api.rgba(pal.primary, 0));
      ctx.fillStyle = g; ctx.fillRect(x, y - 60, cw, 120);
      api.glowDot(ctx, x + cw / 2, y, cw * 0.45, 0.5 * a, api.hexToRgb(pal.secondary).join(','));
      // luminance lift on the freshly revealed body, trailing the front (so a wipe over a dark, empty
      // incoming background still reads as columns turning over, not as a flicker)
      const lift = H * 0.4 * u;
      const y1 = down ? y - lift : y + lift;
      const gl = ctx.createLinearGradient(0, y, 0, y1);
      gl.addColorStop(0, api.rgba(pal.secondary, 0.16));
      gl.addColorStop(1, api.rgba(pal.secondary, 0));
      ctx.fillStyle = gl; ctx.fillRect(x, Math.min(y, y1), cw, Math.abs(lift));
      // thin bright edges on the column boundaries along the wiped extent (frame edges skipped)
      const ey0 = down ? 0 : y, ey1 = down ? y : H;
      ctx.fillStyle = api.rgba(pal.secondary, 0.55);
      ctx.shadowColor = pal.primary; ctx.shadowBlur = 14;
      if (x > 0) ctx.fillRect(x - 1, ey0, 2, ey1 - ey0);
      if (x + cw < W - 0.5) ctx.fillRect(x + cw - 1, ey0, 2, ey1 - ey0);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  },
};
