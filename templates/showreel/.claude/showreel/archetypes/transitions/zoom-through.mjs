// zoom-through (C9 transition) — port of spike s1's dive: the outgoing beat accelerates into the frame
// centre (exponential scale) under radial light streaks, while a glowing rounded "portal" opens from the
// centre with the incoming beat settling inside it; the portal blows past the frame edges by k = 1.
// Pure function of k (0..1 over the overlap). Continuity: k=0 ≡ outgoing beat alone, k=1 ≡ incoming alone.

const STREAKS = 150;
const DIVE_MAX = 14;   // outgoing scale at k = 1

export default {
  id: 'zoom-through',
  apply(ctx, k, drawOut, drawIn, api) {
    const { W, H, clamp, lerp, ease, hash, rr, palette: pal } = api;
    const cx = W / 2, cy = H / 2;
    const A = api.scratch(0), B = api.scratch(1);
    drawOut(A.ctx);
    drawIn(B.ctx);

    // 1) outgoing beat dives into the centre and fades out over the back half
    const zk = Math.pow(k, 2.2);
    const sOut = Math.exp(Math.log(DIVE_MAX) * zk);
    const outA = 1 - ease.inQuad(clamp((k - 0.3) / 0.55));
    if (outA > 0) {
      ctx.save();
      ctx.globalAlpha *= outA;
      ctx.translate(cx, cy); ctx.scale(sOut, sOut); ctx.translate(-cx, -cy);
      ctx.drawImage(A.canvas, 0, 0);
      ctx.restore();
    }

    // 2) radial streaks (additive), strongest mid-transition
    const sk = Math.sin(Math.PI * k);
    if (sk > 0.002) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const cols = ['#ffffff', pal.primary, pal.secondary], buckets = [[], [], []];
      for (let i = 0; i < STREAKS; i++) {
        const u = hash(i * 3.7 + 1), ph = hash(i * 7.1 + 4);
        const m = (u + zk * (0.8 + ph * 1.4)) % 1, rad = 90 + 1900 * m * m, len = rad * (0.15 + 0.7 * zk) * (0.4 + ph);
        buckets[i % 3].push([(i / STREAKS) * 6.2832 + ph * 0.04, rad, rad + len]);
      }
      buckets.forEach((bt, bi) => {
        ctx.strokeStyle = cols[bi]; ctx.lineWidth = 1.2 + 1.8 * sk; ctx.globalAlpha = 0.75 * sk; ctx.beginPath();
        for (const [a, r0, r1] of bt) { const c = Math.cos(a), s = Math.sin(a); ctx.moveTo(cx + c * r0, cy + s * r0); ctx.lineTo(cx + c * r1, cy + s * r1); }
        ctx.stroke();
      });
      ctx.restore();
    }

    // 3) portal: opens from the centre, interior = incoming beat settling from 0.82 → 1
    const arm = ease.outCubic(clamp(k / 0.15));
    const grow = ease.inCubic(k);
    const hw = lerp(70, W * 0.78, grow), hh = lerp(40, H * 0.78, grow), rad = lerp(18, 140, grow);
    ctx.save();
    // soft bloom around the rim, fades as the portal leaves the frame
    ctx.globalCompositeOperation = 'lighter';
    const ba = 0.5 * arm * sk * (1 - 0.7 * grow);
    if (ba > 0.002) {
      const bl = ctx.createRadialGradient(cx, cy, 0, cx, cy, 150 + hw * 0.9);
      bl.addColorStop(0, `rgba(255,255,255,${ba * 0.5})`); bl.addColorStop(0.35, api.rgba(pal.primary, ba * 0.6)); bl.addColorStop(1, api.rgba(pal.primary, 0));
      ctx.fillStyle = bl; ctx.fillRect(cx - 150 - hw, cy - 150 - hw, 300 + 2 * hw, 300 + 2 * hw);
    }
    ctx.globalCompositeOperation = 'source-over';
    rr(ctx, cx - hw, cy - hh, hw * 2, hh * 2, rad);
    ctx.clip();
    // ink interior gives the incoming beat contrast; it fades out so the shared background returns by k = 1
    const inkA = arm * (1 - ease.inQuad(k));
    if (inkA > 0.002) {
      const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, 760);
      ig.addColorStop(0, pal.panel2); ig.addColorStop(0.55, pal.ink2); ig.addColorStop(1, pal.ink);
      ctx.globalAlpha = inkA; ctx.fillStyle = ig; ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);
    }
    const inA = ease.outQuad(clamp((k - 0.1) / 0.6));
    if (inA > 0) {
      const sIn = lerp(0.82, 1, ease.outCubic(k));
      ctx.globalAlpha = inA;
      ctx.translate(cx, cy); ctx.scale(sIn, sIn); ctx.translate(-cx, -cy);
      ctx.drawImage(B.canvas, 0, 0);
    }
    ctx.restore();

    // 4) rim: white-hot → primary → secondary, gone by k = 1
    const rimA = arm * (1 - ease.inQuad(k));
    if (rimA > 0.002) {
      ctx.save();
      rr(ctx, cx - hw, cy - hh, hw * 2, hh * 2, rad);
      const rg = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.45, pal.primary); rg.addColorStop(1, pal.secondary);
      ctx.lineWidth = 5 + 14 * (1 - grow); ctx.strokeStyle = rg; ctx.shadowColor = pal.primary; ctx.shadowBlur = 50;
      ctx.globalAlpha = rimA; ctx.stroke();
      ctx.restore();
    }
  },
};
