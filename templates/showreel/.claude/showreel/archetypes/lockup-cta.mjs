// lockup-cta (C9) — port of spike s5 "LOCKUP". Anticipation line → the app-name wordmark SLAMS in letter by
// letter (cue `slam`), the tagline snaps open under a light rule, the lattice mark draws itself on, the CTA
// and the command pill arrive, a light SWEEP (cue `sweep`) re-lights the lockup, then an ENTER ping climbs
// to the mark. Calm, pristine end card — no fade.
//
// D9 / M0 root cause: the spike built its TITLE face/glow sprites with blur filters on canvases of its own,
// which got a per-run GPU-or-CPU backing → unstable GPU hashes. Here EVERY sprite is api.makeCanvas('cache')
// (CPU-pinned), built once in layout() after fonts load; draw() only blits them.
// Slots: name (app.name, wordmark) · tagline (optional) · command (optional, mono pill) · cta (phrase, optional).

const CX = 960;
const MARK_Y = 184, MR = 70;
const TITLE_MAX = 260, TITLE_TRACK = -5, TITLE_W = 1560;
const TAG_MAX = 56, CTA_MAX = 40, CMD_MAX = 34;
const PILL_TEXT_W = 1100;   // a 64-char command (C5 maxChars) fits at the 22 px mono floor; longer fails `check`
const PAD = 130;   // sprite padding (outer glow blur radius)
// Lockup breathe (lockupXform): slow push to 1 + BR_PUSH over the beat + a ±BR_DRIFT sine.
const BR_PUSH = 0.05, BR_DRIFT = 0.004;
// Tagline snap-open: letter-spacing eases from TAG_TRACK to 0. The start track is capped per tagline so the
// tracked line stays ≤ TAG_SNAP_W — a 64-char tagline at the 1400 px fit would otherwise run ~45 px past the
// frame edges mid-snap. Short taglines keep the full spike track. The cap is the all-maxima-at-once worst case,
// derived (not hand-tuned) from the constants that grow the line about CX: half the 1824 px safe width
// (48 px margins), less the engine camera shake and the tagline layer drift (2.5 px in drawLockup), ÷ the
// lockup breathe × the engine camera push. The camera bound is the engine's own (api.cam = core.mjs CAMERA),
// so a camera change carries here; the every-frame safe-area test (archetype-lockup-cta) fails on a 64-char
// tagline when the cap stops being safe.
const TAG_DRIFT = 2.5, TAG_TRACK = 18;
const tagSnapW = (cam) => Math.floor((2 * (1824 / 2 - cam.shakeMax - TAG_DRIFT)) / ((1 + BR_PUSH + BR_DRIFT) * cam.pushMax));
// Light sweep keep-out: the band is drawn BEHIND the lockup and masked out of a dilated, blurred silhouette of
// every text line (tagline glyphs + KEEP_DIL px; title box and CTA/pill shapes + KEEP_BOX px, wider because the
// engine bloom spreads the band ~30 px into their translucent glass), so the light never lifts the background a
// glyph sits on.
const KEEP_DIL = 12, KEEP_BOX = 36, KEEP_BLUR = 10, KEEP_FEATHER = 24;
// PO R5 (c): the command chip is the line the viewer copies, so the light never touches it (nor the CTA pill): their
// keep-out is padded by KEEP_CHIP — past the engine bloom's reach (quarter-res blur ≈ 20 px σ at full res, so ~3σ),
// plus the pill's layer drift — and feathered like the title box, so the band fades out well before the chip.
const KEEP_CHIP = 84;
// PO R5 (a): the title's resting outer-glow alpha once the slam has settled (was 0.30 throughout).
// …its resting face opacity (was 1), and the title faces' strength in the sweep re-light (was the full face, ×2 at
// 0.7: the hold frame IS the sweep cue). The slam frames keep the full face + flash.
// FACE_REST is a visible change, flagged for PO sign-off: the face's pure-white top stop + the engine bloom clip on
// their own — halo and re-light cut alone leave 31–34 % of the wordmark ink flat white at the hold (HEAD 38 %), and
// only face headroom gets below the test's 20 % (0.85 → 28 %, 0.8 → 24 %, 0.75 → 19.8 %, 0.7 → 14.7 %; the
// acme-shop shape). 0.7 is the first step with real margin; the cost is a slightly paler resting wordmark.
const HALO_REST = 0.16, FACE_REST = 0.7, TITLE_RELIGHT = 0.12;

export default {
  id: 'lockup-cta',

  layout(rb, variant, api) {
    const P = api.palette;
    const name = rb.slots.name.items[0];
    const tagline = rb.slots.tagline?.items[0] ?? null;
    const command = rb.slots.command?.items[0] ?? null;
    const cta = rb.slots.cta?.items[0] ?? null;
    const m = api.makeCanvas('cache', 8, 8).ctx;
    for (const name of ['slam', 'sweep']) api.cue(name); // compiled default cues: a missing one fails the boot

    const tPx = api.fitSlot('name', { maxW: TITLE_W, maxPx: TITLE_MAX, weight: 700, track: TITLE_TRACK });
    const tagPx = tagline ? api.fitSlot('tagline', { maxW: 1400, maxPx: TAG_MAX, weight: 600 }) : 0;
    const ctaPx = cta ? api.fitSlot('cta', { maxW: 900, maxPx: CTA_MAX, weight: 700, track: 1 }) : 0;
    const cmdPx = command ? api.fitSlot('command', { maxW: PILL_TEXT_W, maxPx: CMD_MAX, weight: 500 }) : 0;

    // vertical stack under the mark, centred in the remaining height
    const tm = api.measure(m, name, { size: tPx, weight: 700 });
    const asc = Math.max(tm.ascent, tPx * 0.72), desc = Math.max(tm.descent, tPx * 0.05);
    const ctaH = Math.round(ctaPx * 2.1), pillH = Math.round(cmdPx * 2.25);
    const parts = [asc + desc, tagline ? 46 + tagPx * 1.25 : 0, cta ? 52 + ctaH : 0, command ? 40 + pillH : 0];
    const top = 300, bottom = 1010, total = parts.reduce((a, b) => a + b, 0);
    let y = top + Math.max(0, (bottom - top - total) / 2);
    const titleBase = Math.round(y + asc); y += parts[0];
    const ruleY = Math.round(titleBase + desc + 22);
    const tagBase = tagline ? Math.round(y + 46 + tagPx) : 0; y += parts[1];
    const ctaY = cta ? Math.round(y + 52 + ctaH / 2) : 0; y += parts[2];
    const pillY = command ? Math.round(y + 40 + pillH / 2) : 0;

    // ── TITLE sprites: one face + one glow sprite per letter, all on CACHE canvases ──
    const full = api.measure(m, name, { size: tPx, weight: 700, track: TITLE_TRACK }).width - TITLE_TRACK;
    const left = CX - full / 2;
    const baseLocal = PAD + Math.ceil(asc) + 10, sh = baseLocal + Math.ceil(desc) + 30 + PAD;
    const letters = [];
    for (const cl of api.clusters(name.text)) {
      if (cl.ch === ' ') continue;
      const x = api.measure(m, name, { size: tPx, weight: 700, track: TITLE_TRACK, slice: [0, cl.s] }).width;
      const adv = api.measure(m, name, { size: tPx, weight: 700, slice: [cl.s, cl.e] }).width;
      const sw = Math.ceil(adv) + PAD * 2;
      const o = { size: tPx, weight: 700, slice: [cl.s, cl.e] };
      const edge = (g) => api.brand(g, PAD - x, 0, PAD - x + full, 0, P.primary, P.secondary);
      // face: white metal + brand-gradient inner glow (blurred inverse clipped into the glyph)
      const face = api.makeCanvas('cache', sw, sh), g = face.ctx;
      const fg = g.createLinearGradient(0, baseLocal - asc, 0, baseLocal);
      fg.addColorStop(0, P.white); fg.addColorStop(0.55, api.mix(P.white, P.primary, 0.06)); fg.addColorStop(1, api.mix(P.white, P.secondary, 0.16));
      api.text(g, name, PAD, baseLocal, { ...o, fill: fg });
      const inv = api.makeCanvas('cache', sw, sh), iv = inv.ctx;
      iv.fillStyle = edge(iv); iv.fillRect(0, 0, sw, sh);
      iv.globalCompositeOperation = 'destination-out';
      api.text(iv, name, PAD, baseLocal, { ...o, fill: P.black });
      iv.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'source-atop';
      g.filter = 'blur(13px)'; g.drawImage(inv.canvas, 0, 0); g.drawImage(inv.canvas, 0, 0);
      g.filter = 'blur(2px)'; g.drawImage(inv.canvas, 0, 0);
      g.filter = 'none'; g.globalCompositeOperation = 'source-over';
      // outer glow sprite
      const glow = api.makeCanvas('cache', sw, sh), h = glow.ctx;
      h.filter = 'blur(34px)'; api.text(h, name, PAD, baseLocal, { ...o, fill: edge(h) });
      h.filter = 'blur(12px)'; h.globalAlpha = 0.6; api.text(h, name, PAD, baseLocal, { ...o, fill: edge(h) });
      h.filter = 'none'; h.globalAlpha = 1;
      letters.push({ sx: left + x - PAD, cx: left + x + adv / 2, sw, face, glow });
    }

    const tagW = tagline ? api.measure(m, tagline, { size: tagPx, weight: 600 }).width : 0;
    const ctaW = cta ? api.measure(m, cta, { size: ctaPx, weight: 700, track: 1 }).width : 0;
    const cmdW = command ? api.measure(m, command, { size: cmdPx, weight: 500 }).width : 0;
    const cmdCl = command ? api.clusters(command.text) : [];
    const cmdXs = command ? cmdCl.map((c) => api.measure(m, command, { size: cmdPx, weight: 500, slice: [0, c.s] }).width).concat([cmdW]) : [];
    const promptW = cmdPx * 1.1;
    const pillW = command ? promptW + cmdW + 2 * 46 + 22 : 0;
    const tagTrack0 = tagline ? api.clamp((tagSnapW(api.cam) - tagW) / Math.max(1, api.clusters(tagline.text).length - 1), 0, TAG_TRACK) : 0;
    // sweep keep-out silhouette at the rested lockup positions (draw() applies the same lockupXform to it)
    // small = tagline + CTA + pill (where any added light lowers contrast); the band also skips the title glyphs
    const dil = { mode: 'both', fill: P.text, stroke: P.text, lineWidth: 2 * KEEP_DIL };
    // built at half resolution (a soft mask; draw() scales it ×2) to keep the two cached layers at 2 MB each
    const keepMask = (withTitle) => {
      const ko = api.makeCanvas('cache', api.W / 2, api.H / 2), kg = ko.ctx;
      kg.scale(0.5, 0.5);
      if (tagline) api.text(kg, tagline, CX - tagW / 2, tagBase, { size: tagPx, weight: 600, ...dil });
      kg.fillStyle = P.text;
      // title: its whole box (letter gaps at display size are wide enough for the band to lift the background),
      // pill-shaped and feathered outside the KEEP_BOX pad so the band fades out around it instead of a hard slab
      kg.filter = `blur(${KEEP_FEATHER / 2}px)`;
      if (withTitle) {
        const pad = KEEP_BOX + KEEP_FEATHER, h = asc + desc + 2 * pad;
        api.rr(kg, left - pad, titleBase - asc - pad, full + 2 * pad, h, h / 2); kg.fill();
      }
      const chip = (w0, h0, y) => { const w = w0 + 2 * (KEEP_CHIP + KEEP_FEATHER), h = h0 + 2 * (KEEP_CHIP + KEEP_FEATHER); api.rr(kg, CX - w / 2, y - h / 2, w, h, h / 2); kg.fill(); };
      if (cta) chip(ctaW + ctaPx * 2.4, ctaH, ctaY);
      if (command) chip(pillW, pillH, pillY);
      kg.filter = 'none';
      const k = api.makeCanvas('cache', api.W / 2, api.H / 2);
      k.ctx.filter = `blur(${KEEP_BLUR / 2}px)`; k.ctx.drawImage(ko.canvas, 0, 0); k.ctx.drawImage(ko.canvas, 0, 0); k.ctx.filter = 'none';
      return k;
    };
    const keepOut = keepMask(true), keepSmall = keepMask(false);
    // lattice mark geometry
    const MV = [0, 1, 2, 3, 4, 5].map((k) => { const a = (-90 + 60 * k) * Math.PI / 180; return [Math.cos(a) * MR, Math.sin(a) * MR]; });
    const MC = [0, 0];
    const segs = [
      [MV[0], MV[1], 0.00, 0.28, 'T'], [MV[0], MV[5], 0.00, 0.28, 'T'], [MV[1], MV[2], 0.10, 0.28, 'T'], [MV[5], MV[4], 0.10, 0.28, 'T'],
      [MV[2], MV[3], 0.20, 0.28, 'T'], [MV[4], MV[3], 0.20, 0.28, 'T'], [MC, MV[1], 0.26, 0.26, 'T'], [MC, MV[3], 0.32, 0.26, 'T'],
      [MC, MV[5], 0.38, 0.26, 'T'], [MV[5], MV[1], 0.46, 0.26, 'b'], [MV[1], MV[3], 0.54, 0.26, 'b'], [MV[3], MV[5], 0.62, 0.26, 'b'],
    ];
    const nodes = [[MV[0], 0.0], [MV[1], 0.2], [MV[5], 0.2], [MV[2], 0.3], [MV[4], 0.3], [MV[3], 0.4], [MC, 0.26]];
    const faces = [[[MV[5], MV[0], MV[1], MC], 0.17], [[MV[1], MV[2], MV[3], MC], 0.10], [[MV[3], MV[4], MV[5], MC], 0.05]];

    return {
      name, tagline, command, cta, tPx, tagPx, ctaPx, cmdPx, asc, full, left, baseLocal, letters,
      titleBase, ruleY, tagBase, ctaY, ctaH, pillY, pillH, tagW, ctaW, cmdW, cmdCl, cmdXs, promptW, pillW,
      titleMid: titleBase - asc / 2, MV, segs, nodes, faces, tagTrack0, keepOut, keepSmall,
    };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L, dur } = p;
    const { W, H, clamp, lerp, ease, hash, noise, rgba, mix, rr, palette: P, grid } = api;
    const WH = P.white; // pure white: white-hot cores, flashes, the CTA label
    const SLAM = api.cue('slam');
    const SWEEP = api.cue('sweep');
    const SNAP = SLAM + 4 * grid;           // tagline snap
    const M0 = SLAM + 0.1;                  // mark draw-on
    const CALM = SLAM + 0.8;
    const PILL0 = SLAM + 1.2;
    const ENT = SWEEP + 6 * grid, MARK2 = ENT + 2 * grid;
    const settle = ease.inOutQuad(clamp((lt - CALM) / 0.8)); // the title's impact glow → its calmer resting grade
    const pulseAt = (t0, decay) => (lt >= t0 ? Math.exp(-(lt - t0) * decay) : 0);
    const cueHit = (t0, decay) => pulseAt(t0, decay);
    const nL = L.letters.length;
    const stagger = Math.min(0.035, 0.3 / Math.max(1, nL - 1));
    const landT = (n) => SLAM - (nL - 1 - n) * stagger;
    const FALL = 0.08;

    function letterState(n) {
      const Lt = landT(n), s = Lt - FALL;
      if (lt < s) return null;
      const fall = clamp((lt - s) / FALL), dt = lt - Lt;
      const k = dt > 0 ? Math.exp(-dt * 13) * Math.cos(dt * 40) : 0;
      const shk = dt > 0 ? Math.exp(-dt * 16) : 0;
      const dx = noise(n * 13 + lt * 80) * 7 * shk;
      const dy = -(1 - ease.inCubic(fall)) * 210 + (dt > 0 ? 9 * Math.exp(-dt * 20) + noise(n * 7 + lt * 80 + 50) * 5 * shk : 0);
      const sx = 1 + (dt > 0 ? 0.055 * k : -0.10 * (1 - fall));
      const sy = 1 + (dt > 0 ? -0.10 * k : 0.28 * (1 - fall));
      return { fall, dt, dx, dy, sx, sy };
    }

    function drawTitle(c, pass) {
      const TB = L.titleBase;
      const slotTop = TB - L.asc - 30, slotBot = TB + L.tPx * 0.4;
      for (let n = 0; n < nL; n++) {
        const Lt = L.letters[n], st = letterState(n);
        if (!st) continue;
        c.save();
        c.translate(Lt.cx + st.dx, TB + st.dy); c.scale(st.sx, st.sy); c.translate(-Lt.cx, -TB);
        const spX = Lt.sx, spY = TB - L.baseLocal;
        if (pass === 'glow') {
          // no sweep boost: brightening the halo fills the letter gaps and costs the title its contrast (the
          // sweep re-lights the faces instead — drawSweepRelight)
          // PO R5 (a): the resting halo settles a notch lower once the slam has rung out (crisper edges at the
          // hold); the slam / ENTER / mark-ignite pulses ride on top unchanged, so the impact frames stay hot
          const rest = lerp(0.30, HALO_REST, settle) + lerp(0.06, 0.03, settle) * Math.sin(lt * 2.2 + n);
          const a = (rest + 0.45 * Math.exp(-Math.max(0, st.dt) * 6) + 0.45 * pulseAt(ENT, 6) + 0.6 * pulseAt(MARK2, 7)) * st.fall * st.fall;
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = clamp(a, 0, 1.4);
          c.drawImage(Lt.glow.canvas, spX, spY);
          if (st.fall < 1) {
            c.globalAlpha = 0.35; c.drawImage(Lt.glow.canvas, spX, spY - 70);
            c.globalAlpha = 0.18; c.drawImage(Lt.glow.canvas, spX, spY - 140);
          }
        } else {
          // the face IS the title text: placed via api.blit so the name gets its frame box (C16 safe area +
          // on-screen coverage); the glow pass above is bloom and stays a plain drawImage
          c.beginPath(); c.rect(Lt.sx, slotTop, Lt.sw, slotBot - slotTop); c.clip();
          c.globalAlpha = pass === 'relight' ? TITLE_RELIGHT : lerp(1, FACE_REST, settle);
          api.blit(c, Lt.face.canvas, spX, spY);
          if (pass === 'relight') { c.restore(); continue; }
          const fl = 0.5 * Math.exp(-Math.max(0, st.dt) * 22) * (st.dt >= 0 ? 1 : 0);
          if (fl > 0.02) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = fl; api.blit(c, Lt.face.canvas, spX, spY); }
        }
        c.restore();
      }
    }

    function drawTagline(c) {
      if (!L.tagline) return;
      const q = clamp((lt - SNAP) / 0.65);
      if (q <= 0) return;
      const track = lerp(L.tagTrack0, 0, ease.outExpo(q));
      const wipe = ease.outExpo(clamp((lt - SNAP) / 0.5));
      const w = api.measure(c, L.tagline, { size: L.tagPx, weight: 600, track }).width - track;
      const x0 = CX - 1000, xf = x0 + 2000 * wipe;
      c.save();
      c.beginPath(); c.rect(x0, L.tagBase - L.tagPx * 1.1, xf - x0, L.tagPx * 1.6); c.clip();
      c.shadowColor = rgba(P.primary, 0.55); c.shadowBlur = 22;
      const bounce = 1 - ease.outBack(clamp((lt - SNAP) / 0.35));
      api.text(c, L.tagline, CX - w / 2, L.tagBase + bounce * 14, {
        size: L.tagPx, weight: 600, track, alpha: clamp(q * 4),
        fill: api.brand(c, CX - L.tagW / 2, 0, CX + L.tagW / 2, 0, mix(P.primary, WH, 0.45), mix(P.secondary, WH, 0.25)),
      });
      c.restore();
      if (wipe < 0.995) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp((1 - wipe) * 1.2);
        const g = c.createLinearGradient(0, L.tagBase - L.tagPx * 1.1, 0, L.tagBase + L.tagPx * 0.5);
        g.addColorStop(0, rgba(WH, 0)); g.addColorStop(0.5, WH); g.addColorStop(1, rgba(WH, 0));
        c.fillStyle = g; c.fillRect(xf - 2, L.tagBase - L.tagPx * 1.1, 4, L.tagPx * 1.6);
        c.restore();
      }
    }

    function drawRule(c) {
      const q = ease.outExpo(clamp((lt - SNAP) / 0.45));
      if (q <= 0) return;
      const half = (L.full / 2) * q, flash = Math.exp(-(lt - SNAP) * 6);
      c.save(); c.globalCompositeOperation = 'lighter';
      const g = c.createLinearGradient(CX - half, 0, CX + half, 0);
      g.addColorStop(0, rgba(P.primary, 0)); g.addColorStop(0.15, P.primary); g.addColorStop(0.85, P.secondary); g.addColorStop(1, rgba(P.secondary, 0));
      c.fillStyle = g; c.globalAlpha = 0.34 + 0.9 * flash; c.shadowColor = P.primary; c.shadowBlur = 14 * (0.3 + flash * 2);
      c.fillRect(CX - half, L.ruleY - 1, half * 2, 2);
      c.restore();
    }

    function drawMark(c) {
      if (lt < M0) return;
      const ml = lt - M0;
      c.save(); c.translate(CX, MARK_Y);
      const mp = pulseAt(MARK2, 6), hit = cueHit(SWEEP, 6) + 1.1 * mp, beat = Math.exp(-((ml % (4 * grid))) * 9);
      const calm = clamp((lt - CALM) / 0.4);
      const ms = 1 + 0.04 * hit + 0.012 * calm * beat + 0.05 * mp; c.scale(ms, ms);
      const grad = api.brand(c, -MR, -MR, MR, MR, P.primary, P.secondary);
      c.save(); c.globalCompositeOperation = 'lighter';
      const dg = c.createRadialGradient(0, 0, 0, 0, 0, MR * 2.4);
      const da = clamp(ml / 0.6) * (0.5 + 0.5 * calm) * (0.8 + 0.6 * hit + 0.15 * beat);
      dg.addColorStop(0, rgba(P.primary, 0.30 * da)); dg.addColorStop(0.5, rgba(P.secondary, 0.10 * da)); dg.addColorStop(1, rgba(P.secondary, 0));
      c.fillStyle = dg; c.fillRect(-MR * 2.4, -MR * 2.4, MR * 4.8, MR * 4.8); c.restore();
      const fa = ease.outCubic(clamp((ml - 0.65) / 0.5));
      if (fa > 0) for (const [f, a] of L.faces) {
        c.beginPath(); f.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
        c.globalAlpha = a * fa * (1 + 0.8 * hit); c.fillStyle = grad; c.fill(); c.globalAlpha = 1;
      }
      const pt = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      const run = (cls) => {
        c.beginPath();
        for (const [a, b, o, d, cl] of L.segs) {
          if (cl !== cls) continue;
          const k = ease.outCubic(clamp((ml - o) / d)); if (k <= 0) continue;
          const e = pt(a, b, k); c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1]);
        }
      };
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const [cls, w] of [['T', 6], ['b', 3]]) {
        run(cls); c.strokeStyle = grad; c.lineWidth = w;
        c.shadowColor = rgba(P.primary, 0.9); c.shadowBlur = 20 + 18 * hit; c.stroke();
        c.shadowBlur = 0; c.stroke();
        run(cls); c.strokeStyle = rgba(WH, 0.75); c.lineWidth = w * 0.3; c.stroke();
      }
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const [a, b, o, d] of L.segs) {
        const raw = (ml - o) / d; if (raw <= 0 || raw >= 1) continue;
        const e = pt(a, b, ease.outCubic(raw));
        const g = c.createRadialGradient(e[0], e[1], 0, e[0], e[1], 16);
        g.addColorStop(0, rgba(WH, 0.95)); g.addColorStop(1, rgba(P.primary, 0));
        c.fillStyle = g; c.fillRect(e[0] - 16, e[1] - 16, 32, 32);
      }
      c.restore();
      for (const [q, o] of L.nodes) {
        const k = ease.outBack(clamp((ml - o) / 0.3)); if (k <= 0) continue;
        const r = 8 * k * (1 + (calm > 0 ? 0.28 * beat : 0) + 0.4 * hit);
        c.beginPath(); c.arc(q[0], q[1], r, 0, 7);
        c.fillStyle = P.ink2; c.shadowColor = P.primary; c.shadowBlur = 16;
        c.fill(); c.shadowBlur = 0; c.lineWidth = 2.6; c.strokeStyle = grad; c.stroke();
        c.beginPath(); c.arc(q[0], q[1], r * 0.42, 0, 7); c.fillStyle = WH; c.fill();
      }
      if (lt > CALM) {
        const cA = clamp((lt - CALM) / 0.3), per = [0, 1, 2, 3, 4, 5, 0];
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let s = 0; s < 14; s++) {
          const u = (((lt - CALM) / 1.7) - s * 0.006) % 1, uu = (u + 1) % 1;
          const e = Math.floor(uu * 6), fr = uu * 6 - e;
          const q = pt(L.MV[per[e]], L.MV[per[e + 1]], fr);
          c.globalAlpha = cA * (1 - s / 14) * 0.9; c.fillStyle = s === 0 ? WH : P.secondary;
          c.beginPath(); c.arc(q[0], q[1], 5.5 * (1 - s / 18), 0, 7); c.fill();
        }
        c.restore();
      }
      const ra = ease.outExpo(clamp((ml - 0.6) / 0.6));
      if (ra > 0) {
        const R2 = MR * (1.2 + 0.4 * ra);
        c.save(); c.globalAlpha = ra * 0.5; c.setLineDash([2, 11]); c.lineDashOffset = -lt * 9;
        c.strokeStyle = mix(WH, P.primary, 0.2, 0.7); // cool white hairline (was a fixed lavender literal) c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R2, 0, 6.2832); c.stroke();
        c.setLineDash([]); c.globalAlpha = ra * 0.9; c.lineWidth = 2.4; c.strokeStyle = grad;
        for (let k = 0; k < 3; k++) { const a0 = lt * 0.7 + k * 2.0944; c.beginPath(); c.arc(0, 0, R2, a0, a0 + 0.42); c.stroke(); }
        c.restore();
      }
      if (lt > MARK2 && lt < MARK2 + 0.6) {
        const k = ease.outExpo(clamp((lt - MARK2) / 0.6));
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - k) * 0.9; c.lineWidth = 5 * (1 - k) + 1.5; c.strokeStyle = grad;
        c.beginPath(); c.arc(0, 0, MR * 1.6 + 170 * k, 0, 6.2832); c.stroke(); c.restore();
      }
      c.restore();
    }

    function drawCta(c) {
      if (!L.cta) return;
      const t0 = SNAP + 4 * grid, q = ease.outBack(clamp((lt - t0) / 0.4));
      if (q <= 0.01) return;
      const w = L.ctaW + L.ctaPx * 2.4, h = L.ctaH, x = CX - w / 2, y = L.ctaY - h / 2;
      // no sweep-cued glow pulse: the light sweep leaves the CTA pill untouched (PO R5 c)
      c.save(); c.translate(CX, L.ctaY); c.scale(q, q); c.translate(-CX, -L.ctaY);
      api.glass(c, x, y, w, h, h / 2, { fill: rgba(P.primary, 0.16), border: rgba(P.primary, 0.8), glowColor: rgba(P.primary, 0.5), glowBlur: 30 });
      api.text(c, L.cta, CX, L.ctaY + L.ctaPx * 0.36, { size: L.ctaPx, weight: 700, track: 1, align: 'center', fill: WH, alpha: clamp((lt - t0) / 0.2) });
      c.restore();
    }

    function drawPill(c) {
      if (!L.command) return;
      const q = clamp((lt - PILL0) / 0.5); if (q <= 0) return;
      const h = L.pillH, y = L.pillY - h / 2;
      const w = L.pillW * ease.outBack(clamp((lt - PILL0) / 0.45)), x = CX - w / 2;
      const hit = 1.4 * pulseAt(ENT, 7); // ENTER only: the light sweep never touches the command chip (PO R5 c)
      c.save();
      const pd = lt - ENT, press = pd < 0 ? 1 - 0.035 * ease.inQuad(clamp((pd + 0.14) / 0.14)) : 1 + 0.045 * Math.exp(-pd * 11) * Math.cos(pd * 26);
      c.translate(CX, L.pillY); c.scale(press, press); c.translate(-CX, -L.pillY);
      c.save(); c.globalAlpha = clamp(q * 3);
      api.glass(c, x, y, Math.max(w, 2), h, h / 2, { fill: rgba(P.panel, 0.82), border: rgba(WH, 0.10), glowColor: rgba(P.primary, 0.35), glowBlur: 36 });
      rr(c, x + 0.5, y + 0.5, Math.max(w - 1, 1), h - 1, h / 2);
      c.lineWidth = 2; c.strokeStyle = api.brand(c, x, 0, x + w, 0, P.primary, P.secondary);
      c.globalAlpha *= 0.55 + 0.45 * hit * 1.5; c.stroke();
      c.restore();
      c.save();
      rr(c, x + 4, y, Math.max(w - 8, 1), h, h / 2); c.clip();
      const tx = CX - L.pillW / 2 + 46, ty = L.pillY + L.cmdPx * 0.36;
      const T1 = PILL0 + 0.15, n = clamp(Math.floor((lt - T1) / 0.016), 0, L.cmdCl.length);
      c.globalAlpha = clamp((lt - (PILL0 + 0.1)) / 0.15);
      api.chevron(c, tx, ty, L.cmdPx * 0.72, P.primary, 10);
      if (n > 0) api.text(c, L.command, tx + L.promptW, ty, { size: L.cmdPx, weight: 500, fill: P.text, slice: [0, L.cmdCl[n - 1].e] });
      const cx = tx + L.promptW + L.cmdXs[n] + 3;
      const typing = n < L.cmdCl.length, on = lt < ENT && (typing || (((lt - T1) % 1.0) + 1) % 1.0 < 0.55);
      if (on) { c.fillStyle = P.secondary; c.shadowColor = P.secondary; c.shadowBlur = 12; c.fillRect(cx, L.pillY - L.cmdPx * 0.6, Math.max(8, L.cmdPx * 0.4), L.cmdPx * 1.2); }
      c.restore();
      c.restore();
    }

    function lockupXform(c) {
      const br = 1 + BR_DRIFT * Math.sin(lt * 1.1) + BR_PUSH * ease.outQuad(clamp((lt - SNAP) / Math.max(0.5, dur - SNAP)));
      c.translate(CX, 540); c.scale(br, br); c.translate(-CX, -540);
    }
    // relight = the sweep's re-lit copy: title faces only (their glow re-lit on top of the sweep's glow boost
    // blows the letters out into one white smear), and never the CTA pill or the command chip (PO R5 c)
    function drawLockup(c, relight = false) {
      const lay = (d, fn) => { c.save(); c.translate(Math.sin(lt * 0.7) * d, Math.cos(lt * 0.55) * d * 0.7); fn(); c.restore(); };
      c.save();
      lockupXform(c);
      lay(4, () => drawMark(c));
      lay(1.5, () => { if (!relight) drawTitle(c, 'glow'); drawTitle(c, relight ? 'relight' : 'face'); });
      lay(TAG_DRIFT, () => { drawRule(c); drawTagline(c); });
      if (!relight) {
        lay(4, () => drawCta(c));
        lay(5.5, () => drawPill(c));
      }
      c.restore();
    }

    function drawAnticipation() {
      if (lt > SLAM + 1.0) return;
      const TM = L.titleMid;
      const y = lerp(H / 2, TM, ease.inOutExpo(clamp((lt - (SLAM - 0.2)) / 0.2)));
      const charge = clamp(lt / SLAM);
      const len = 800 * ease.outExpo(clamp(lt / 0.24));
      const dt = lt - SLAM, post = dt > 0 ? Math.exp(-dt * 3.6) : 1;
      const a = (0.6 + 0.4 * ease.inQuad(charge)) * (dt > 0 ? post : 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (dt < 0) for (let i = 0; i < 56; i++) {
        const h1 = hash(i * 1.7 + 3), h2 = hash(i * 2.9 + 8), h3 = hash(i * 4.1 + 1);
        const k = ease.inQuad(clamp((lt - h3 * 0.1) / Math.max(0.05, SLAM * 0.4 - h3 * 0.1)));
        const lx = (h1 * 2 - 1) * len * 0.95, off = (h2 > 0.5 ? 1 : -1) * (40 + 220 * h2);
        ctx.globalAlpha = (0.2 + 0.7 * k) * clamp(k * 3);
        ctx.fillStyle = i % 3 ? P.secondary : WH;
        ctx.beginPath(); ctx.arc(CX + lx * (1 - 0.15 * k), y + off * (1 - k), 1.4 + 1.6 * h3, 0, 7); ctx.fill();
      }
      if (dt < 0) for (let r = 0; r < 2; r++) {
        const k = clamp((lt - 0.02 - r * 0.07) / Math.max(0.05, SLAM * 0.4 - r * 0.07)), rad = 40 + 640 * (1 - ease.inQuart(k));
        ctx.globalAlpha = Math.sin(k * Math.PI * 0.5) * (0.5 - r * 0.2) * (k > 0 ? 1 : 0);
        ctx.lineWidth = 1.5 + 2 * k; ctx.strokeStyle = r ? P.secondary : P.primary;
        ctx.beginPath(); ctx.arc(CX, y, rad, 0, 6.2832); ctx.stroke();
      }
      const th = dt > 0 ? 2 + 4 * Math.exp(-dt * 25) : 2.6 + 2.2 * charge;
      ctx.globalAlpha = clamp(a);
      ctx.shadowColor = mix(P.primary, WH, 0.3); ctx.shadowBlur = 24 + 30 * charge;
      const lg = ctx.createLinearGradient(CX - len, 0, CX + len, 0);
      lg.addColorStop(0, rgba(WH, 0)); lg.addColorStop(0.5, WH); lg.addColorStop(1, rgba(WH, 0));
      ctx.fillStyle = lg; ctx.fillRect(CX - len, y - th / 2, len * 2, th);
      ctx.shadowBlur = 0;
      if (dt < 0) api.glowDot(ctx, CX, y, 70 + 90 * charge * charge, 0.55 + 0.4 * charge, api.hexToRgb(P.primary).join(','));
      ctx.restore();
    }

    function drawBurst() {
      const dt = lt - SLAM; if (dt < -0.02) return;
      const TM = L.titleMid;
      const fl = Math.exp(-dt * 8.5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (fl > 0.003) {
        const R = 520 + 700 * ease.outExpo(clamp(dt / 0.5));
        const g = ctx.createRadialGradient(CX, TM, 0, CX, TM, R);
        g.addColorStop(0, rgba(WH, 0.30 * fl)); g.addColorStop(0.18, rgba(P.primary, 0.34 * fl));
        g.addColorStop(0.5, rgba(P.secondary, 0.14 * fl)); g.addColorStop(1, rgba(P.secondary, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      const rl = ease.outExpo(clamp(dt / 0.35)), ra = Math.exp(-dt * 7);
      if (ra > 0.02) {
        ctx.beginPath();
        for (let k = 0; k < 34; k++) {
          const ang = (k / 34) * 6.2832 + hash(k * 2.3) * 0.25, len = (500 + 700 * hash(k * 5.1)) * rl, wd = 0.010 + 0.014 * hash(k * 1.3);
          ctx.moveTo(CX, TM); ctx.lineTo(CX + Math.cos(ang - wd) * len, TM + Math.sin(ang - wd) * len); ctx.lineTo(CX + Math.cos(ang + wd) * len, TM + Math.sin(ang + wd) * len); ctx.closePath();
        }
        const rg = ctx.createRadialGradient(CX, TM, 0, CX, TM, 1200);
        rg.addColorStop(0, rgba(WH, 0.8)); rg.addColorStop(1, rgba(P.primary, 0));
        ctx.globalAlpha = ra * 0.34; ctx.fillStyle = rg; ctx.fill();
      }
      const sa = Math.exp(-dt * 3.2);
      if (sa > 0.01) {
        ctx.globalAlpha = sa * 0.9;
        const ag = ctx.createLinearGradient(0, 0, W, 0);
        ag.addColorStop(0, rgba(P.primary, 0)); ag.addColorStop(0.35, rgba(P.primary, 0.8)); ag.addColorStop(0.5, WH); ag.addColorStop(0.65, rgba(P.secondary, 0.8)); ag.addColorStop(1, rgba(P.secondary, 0));
        ctx.fillStyle = ag; ctx.fillRect(0, TM - 2.5, W, 5);
        ctx.globalAlpha = Math.exp(-dt * 6) * 0.35; ctx.fillRect(0, TM - 14, W, 28);
      }
      ctx.restore();
      const ring = (delay, d0, maxR, w0, c0, c1, a0) => {
        const d = dt - delay; if (d < 0 || d > d0) return;
        const k = clamp(d / d0), r = 30 + maxR * ease.outExpo(k), lw = w0 * (1 - ease.outQuad(k)) + 1.2;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a0 * Math.pow(1 - k, 1.4);
        ctx.lineWidth = lw; ctx.strokeStyle = api.brand(ctx, CX - r, 0, CX + r, 0, c0, c1); ctx.shadowColor = c0; ctx.shadowBlur = 36;
        ctx.beginPath(); ctx.arc(CX, TM, r, 0, 6.2832); ctx.stroke(); ctx.restore();
      };
      ring(0, 0.95, 1500, 26, P.primary, P.secondary, 1);
      ring(0.07, 0.8, 1250, 8, WH, P.hot, 0.8);
      ring(0.16, 0.7, 800, 4, P.secondary, P.primary, 0.6);
      const sc = [P.secondary, WH, P.primary, P.hot, WH];
      api.sparks(ctx, dt, CX, TM, 190, 1, { a0: 0, a1: 6.2832, sMin: 300, sMax: 2300, pow: 1.6, drag: 3.2, grav: 380, lifeMin: 0.4, lifeMax: 1.3 }, sc, hash);
      api.sparks(ctx, dt - 0.05, CX, TM, 40, 2, { a0: 0, a1: 6.2832, sMin: 120, sMax: 650, pow: 1, drag: 1.6, grav: -60, lifeMin: 0.9, lifeMax: 2.0, alpha: 0.8 }, sc, hash);
      L.letters.forEach((Lt, n) => api.sparks(ctx, lt - landT(n), Lt.cx, L.titleBase + 4, 14, 10 + n, { a0: -2.9, a1: -0.25, sMin: 220, sMax: 900, pow: 1.3, drag: 5, grav: 1500, lifeMin: 0.25, lifeMax: 0.6, alpha: 0.9 }, sc, hash));
      if (L.tagline) api.sparks(ctx, lt - SNAP, CX, L.tagBase - L.tagPx * 0.5, 40, 30, { a0: -3.5, a1: 0.35, sMin: 300, sMax: 1400, pow: 1.5, drag: 4.5, grav: 900, lifeMin: 0.3, lifeMax: 0.7, alpha: 0.8 }, sc, hash);
    }

    function drawBackdrop() {
      const rev = clamp((lt - SLAM) / 0.7), pre = clamp(lt / 0.3), hit = cueHit(SLAM, 4);
      const gr = ease.outCubic(clamp((lt - (SLAM - 0.2)) / 0.4));
      if (gr > 0) { // grade the shared background toward the brand primary (multiply keeps one palette)
        ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = gr;
        const gg = ctx.createRadialGradient(CX, 520, 200, CX, 520, 1250);
        gg.addColorStop(0, WH); gg.addColorStop(0.6, mix(WH, P.primary, 0.3)); gg.addColorStop(1, mix(WH, P.primary, 0.55));
        ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const a = (0.5 * ease.outCubic(rev) + 0.1 * pre) * (0.92 + 0.08 * Math.sin(lt * 1.4)) + 0.25 * hit;
      ctx.save(); ctx.translate(CX, 470); ctx.scale(1.55, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 560);
      g.addColorStop(0, rgba(P.primary, 0.30 * a)); g.addColorStop(0.45, mix(P.primary, P.secondary, 0.5, 0.12 * a)); g.addColorStop(1, rgba(P.secondary, 0));
      ctx.fillStyle = g; ctx.fillRect(-560, -560, 1120, 1120); ctx.restore();
      const g2 = ctx.createRadialGradient(CX, 1000, 0, CX, 1000, 700);
      g2.addColorStop(0, mix(P.primary, P.secondary, 0.4, 0.10 * rev)); g2.addColorStop(1, rgba(P.secondary, 0));
      ctx.fillStyle = g2; ctx.fillRect(0, 300, W, 780);
      ctx.restore();
      const amb = ease.outCubic(clamp((lt - (SLAM + 0.3)) / 1.2));
      if (amb > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 46; i++) {
          const z = 0.35 + hash(i * 3.7) * 0.9;
          const x = hash(i * 1.9) * W + Math.sin(lt * 0.4 * z + i) * 26 * z;
          const y = (((hash(i * 5.3) * H * 1.2 - lt * 18 * z) % (H * 1.2)) + H * 1.2) % (H * 1.2) - H * 0.1;
          const tw = 0.5 + 0.5 * Math.sin(lt * 1.7 + i * 2.1);
          ctx.globalAlpha = amb * (0.12 + 0.4 * tw) * z;
          ctx.fillStyle = i % 2 ? P.secondary : mix(P.primary, WH, 0.4);
          ctx.beginPath(); ctx.arc(x, y, 1.2 + 2.0 * z, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
    }

    function drawFrame() {
      const q = ease.outExpo(clamp((lt - CALM) / 0.6)); if (q <= 0) return;
      const ins = 92, arm = 44 * q;
      ctx.save(); ctx.strokeStyle = mix(WH, P.primary, 0.15, 0.45); // cool white corner marks ctx.lineWidth = 2; ctx.lineCap = 'square';
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = sx > 0 ? ins : W - ins, y = sy > 0 ? ins : H - ins;
        ctx.beginPath(); ctx.moveTo(x + sx * arm, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * arm); ctx.stroke();
      }
      ctx.restore();
    }

    // final light sweep: the band centre crosses the lockup centre exactly on cue `sweep`. Two passes so the
    // light never costs legibility: the band itself goes BEHIND the lockup with every text silhouette cut out
    // of it (L.keepOut), and the lockup's own pixels are re-lit on top — mark, rule and title faces only: the
    // tagline, CTA and pill are cut out of the re-light too (L.keepSmall), since re-lit glow/glass around small
    // text lifts its background as much as its strokes. Both layers are built in the beat ctx's device space (scratch transform = ctx transform) and
    // blitted at identity, so text drawn on the scratch records the same manifest bbox as the real draw (C16).
    const SW_DUR = 0.7, swq = clamp((lt - (SWEEP - SW_DUR / 2)) / SW_DUR);
    const sweepOn = swq > 0 && swq < 1, env = Math.pow(Math.sin(swq * Math.PI), 0.6);
    const sang = 28 * Math.PI / 180, sdx = Math.cos(sang), sdy = Math.sin(sang);
    const sLn = W * sdx + H * sdy, sPos = CX * sdx + 540 * sdy + (swq - 0.5) * 2200;
    const sg = (c, alpha, band, c0, c1) => {
      const g = c.createLinearGradient(0, 0, sdx * sLn, sdy * sLn), u = (v) => clamp(v / sLn);
      g.addColorStop(0, rgba(c0, 0)); g.addColorStop(u(sPos - band), rgba(c0, 0));
      g.addColorStop(u(sPos), rgba(P.text, alpha)); g.addColorStop(u(sPos + band), rgba(c1, 0)); g.addColorStop(1, rgba(c1, 0));
      return g;
    };
    function sweepLayer(build) {
      const S = api.scratch(0), lc = S.ctx;
      lc.setTransform(ctx.getTransform());
      build(lc);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
      return { S, done: () => ctx.restore() };
    }
    function drawSweepBand() {
      if (!sweepOn) return;
      const { S, done } = sweepLayer((lc) => {
        lc.globalCompositeOperation = 'lighter';
        lc.globalAlpha = 0.20 * env; lc.fillStyle = sg(lc, 1, 300, P.primary, P.secondary); lc.fillRect(-W, -H, 3 * W, 3 * H);
        lc.globalAlpha = 0.38 * env; lc.fillStyle = sg(lc, 1, 34, P.text, P.text); lc.fillRect(-W, -H, 3 * W, 3 * H);
        lc.globalAlpha = 1; lc.globalCompositeOperation = 'destination-out';
        lc.save(); lockupXform(lc); lc.drawImage(L.keepOut.canvas, 0, 0, W, H); lc.restore();
      });
      ctx.drawImage(S.canvas, 0, 0); done();
    }
    function drawSweepRelight() {
      if (!sweepOn) return;
      const { S, done } = sweepLayer((lc) => {
        drawLockup(lc, true);
        lc.globalCompositeOperation = 'destination-in'; lc.fillStyle = sg(lc, 1, 260, P.text, P.text); lc.fillRect(-W, -H, 3 * W, 3 * H);
        lc.globalCompositeOperation = 'destination-out';
        lc.save(); lockupXform(lc); lc.drawImage(L.keepSmall.canvas, 0, 0, W, H); lc.restore();
      });
      ctx.globalAlpha = 0.7 * env; for (let k = 0; k < 2; k++) ctx.drawImage(S.canvas, 0, 0);
      done();
    }

    // closing: ENTER ping on the pill → light climbs to the mark → mark ignites
    function drawEnter() {
      const dt = lt - ENT; if (dt < 0 || dt > 0.9) return;
      const sc = [P.secondary, WH, P.primary];
      if (L.command) {
        const fullW = L.pillW, y = L.pillY;
        ctx.save(); lockupXform(ctx); ctx.globalCompositeOperation = 'lighter';
        for (let r = 0; r < 2; r++) {
          const d = dt - r * 0.08; if (d < 0) continue;
          const k = ease.outExpo(clamp(d / 0.7)), e = 14 + 190 * k, hh = L.pillH / 2 + e * 0.5;
          ctx.globalAlpha = (0.85 - r * 0.3) * Math.pow(1 - clamp(d / 0.7), 1.5); ctx.lineWidth = 4 * (1 - k) + 1.2;
          ctx.strokeStyle = api.brand(ctx, CX - fullW / 2 - e, 0, CX + fullW / 2 + e, 0, P.primary, P.secondary);
          ctx.shadowColor = P.primary; ctx.shadowBlur = 24;
          rr(ctx, CX - fullW / 2 - e, y - hh, fullW + 2 * e, hh * 2, hh); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.28 * Math.exp(-dt * 12); ctx.fillStyle = api.brand(ctx, CX - fullW / 2, 0, CX + fullW / 2, 0, P.primary, P.secondary);
        rr(ctx, CX - fullW / 2, y - L.pillH / 2, fullW, L.pillH, L.pillH / 2); ctx.fill();
        const kp = ease.inQuad(clamp((lt - ENT - 0.02) / (MARK2 - ENT - 0.02)));
        if (kp > 0 && kp < 1) {
          const y0 = y - L.pillH / 2 - 4, y1 = MARK_Y + MR * 0.6, hy = lerp(y0, y1, kp);
          for (let i = 0; i < 16; i++) {
            const ty = hy + i * 14 * (0.4 + kp), a = 1 - i / 16;
            ctx.globalAlpha = 0.9 * a; ctx.fillStyle = i ? P.secondary : WH;
            ctx.beginPath(); ctx.arc(CX + Math.sin(i * 0.9 + lt * 30) * 1.5, ty, 7 * a + 1.5, 0, 7); ctx.fill();
          }
          api.glowDot(ctx, CX, hy, 56, 0.8, api.hexToRgb(P.secondary).join(','));
        }
        ctx.restore();
        ctx.save(); lockupXform(ctx);
        api.sparks(ctx, dt, CX, y - 34, 46, 60, { a0: -2.7, a1: -0.45, sMin: 260, sMax: 1100, pow: 1.3, drag: 4, grav: 700, lifeMin: 0.3, lifeMax: 0.8, alpha: 0.9 }, sc, hash);
        ctx.restore();
      }
      ctx.save(); lockupXform(ctx);
      api.sparks(ctx, lt - MARK2, CX, MARK_Y, 40, 61, { a0: 0, a1: 6.2832, sMin: 200, sMax: 900, pow: 1.4, drag: 4, grav: 200, lifeMin: 0.2, lifeMax: 0.22, alpha: 0.9 }, sc, hash);
      ctx.restore();
    }

    ctx.save();
    drawBackdrop();
    drawAnticipation();
    drawSweepBand();
    drawLockup(ctx);
    drawSweepRelight();
    drawBurst();
    drawEnter();
    drawFrame();
    ctx.restore();
  },
};
