// S1 — IGNITION (0.0 → 3.0s)
// A hairline frame draws itself into a floating, perspective-tilted glass terminal. The npx command is typed
// on the master-timeline schedule, ENTER (2.30) detonates a shockwave, then the camera dives into the caret and
// the caret itself becomes a dark, rim-lit portal that opens to ink by ~2.9 so the wizard (s2) lands on a high-contrast
// ink backdrop (no milky flood, never neutral grey).
// Everything is a pure function of (lt, gt): no state, no Math.random.
(function () {
  const { W, H, TL, clamp, lerp, ease, prog, rng, hash, noise, pal, font, rr } = ENN;
  const TY = TL.typing, CMD = TY.text, N = CMD.length, E = TY.enterAt;

  // ───────── layout ─────────
  const PW = 1120, PH = 560, PAD = 48, RES = 2;      // terminal panel (local px), offscreen padding, offscreen resolution
  const PCX = 960, PCY = 470;                         // panel centre on screen
  const PX = PCX - PW / 2, PY = PCY - PH / 2;
  const FS = 48, X0 = 62, BASE = 290, CARET_H = 56;   // command typography (panel-local)
  const R = 22;                                       // panel corner radius
  const HORIZON = 792;                                // floor horizon (screen y)
  const ZOOM_T0 = 2.38, ZOOM_DUR = 0.52;              // dive window
  const PORTAL_T0 = 2.56, PORTAL_FADE = 2.86;          // portal opens / interior hands over to the real backdrop

  const C = { txt: '#eef1f8', violet: '#9a7dff', cyan: pal.cyan, mint: pal.mint, slash: '#7d88a8', dim: '#8a93a8' };
  const AT = CMD.indexOf('@'), SLASH = CMD.indexOf('/');
  const colorOf = (i) => (i < AT ? C.txt : i < SLASH ? C.violet : i === SLASH ? C.slash : C.cyan);

  // ───────── small helpers ─────────
  const hexRgb = (h) => (h[0] === 'r' ? h.match(/[\d.]+/g).slice(0, 3).map(Number) : [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${(lerp(A[0], B[0], t)) | 0},${(lerp(A[1], B[1], t)) | 0},${(lerp(A[2], B[2], t)) | 0})`; };
  const rgba = (h, a) => { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const typedCount = (lt) => (lt < TY.start ? 0 : Math.min(N, Math.floor((lt - TY.start) / TY.interval + 1e-9) + 1));
  const decay = (dt, k) => (dt < 0 ? 0 : Math.exp(-dt * k));
  const PERIM = 2 * (PW - 2 * R) + 2 * (PH - 2 * R) + 2 * Math.PI * R;

  const OC = document.createElement('canvas');
  OC.width = (PW + 2 * PAD) * RES; OC.height = (PH + 2 * PAD) * RES;
  const octx = OC.getContext('2d');

  function charW(g) { g.save(); g.font = font(FS, 500, 'mono'); const w = g.measureText('M').width; g.restore(); return w; }

  // ═════════════════════════════ PANEL CONTENTS (panel-local coords) ═════════════════════════════
  function drawPanel(g, lt) {
    const cw = charW(g), n = typedCount(lt), dE = lt - E;
    const A = ENN.anticipate(lt, E, 0.38);            // 0→1 inhale before ENTER
    const hot = Math.max(decay(dE, 7), 0);            // white-hot after ENTER
    const brandG = ENN.brand(g, 0, 0, PW, PH, pal.violet, pal.cyan);

    // glass body
    const fillA = prog(lt, 0.22, 0.35, ease.outQuad);
    g.save(); g.globalAlpha = fillA;
    rr(g, 0, 0, PW, PH, R);
    const fg = g.createLinearGradient(0, 0, 0, PH);
    fg.addColorStop(0, 'rgba(20,24,38,0.95)'); fg.addColorStop(1, 'rgba(8,10,17,0.96)');
    g.fillStyle = fg; g.fill();
    g.save(); rr(g, 0, 0, PW, PH, R); g.clip();
    // header bar + hairline
    g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, 0, PW, 72);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 72, PW, 1);
    // ambient light behind the command, swells on ENTER
    const ag = g.createRadialGradient(PW * 0.55, 280, 0, PW * 0.55, 280, 520);
    ag.addColorStop(0, `rgba(139,107,255,${0.10 + 0.3 * hot + 0.08 * A})`); ag.addColorStop(1, 'rgba(139,107,255,0)');
    g.fillStyle = ag; g.fillRect(0, 0, PW, PH);
    // slow slanted sheen
    g.globalCompositeOperation = 'lighter';
    g.save(); g.translate(lerp(-400, PW + 400, (lt * 0.28) % 1), 0); g.transform(1, 0, -0.45, 1, 0, 0);
    const sg = g.createLinearGradient(-110, 0, 110, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(190,200,255,0.045)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg; g.fillRect(-110, 0, 220, PH); g.restore();
    g.restore(); g.restore();

    // ── border: corner brackets race along the edges until they meet, then settle to a hairline ──
    const f = prog(lt, 0.04, 0.55, ease.outQuart);
    const legA = 1 - prog(lt, 0.5, 0.3, ease.inOutQuad);
    if (legA > 0.001 && f > 0) {
      const lh = f * (PW / 2 - R), lv = f * (PH / 2 - R);
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = brandG; g.lineWidth = 3; g.globalAlpha = legA; g.shadowColor = pal.cyan; g.shadowBlur = 16;
      g.beginPath();
      for (const [ox, oy, sx, sy] of [[0, 0, 1, 1], [PW, 0, -1, 1], [PW, PH, -1, -1], [0, PH, 1, -1]]) {
        g.moveTo(ox + sx * (R + lh), oy); g.lineTo(ox + sx * R, oy);
        g.arcTo(ox, oy, ox, oy + sy * R, R); g.lineTo(ox, oy + sy * (R + lv));
      }
      g.stroke();
      // white-hot tips
      g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 20;
      for (const [ox, oy, sx, sy] of [[0, 0, 1, 1], [PW, 0, -1, 1], [PW, PH, -1, -1], [0, PH, 1, -1]]) {
        g.beginPath(); g.arc(ox + sx * (R + lh), oy, 3.5, 0, 7); g.arc(ox, oy + sy * (R + lv), 3.5, 0, 7); g.fill();
      }
      g.restore();
    }
    const ringA = 0.6 * prog(lt, 0.42, 0.3, ease.outQuad);
    g.save(); g.globalAlpha = ringA; rr(g, 0.75, 0.75, PW - 1.5, PH - 1.5, R); g.strokeStyle = brandG; g.lineWidth = 1.5; g.stroke(); g.restore();

    // ── header: traffic lights + title ──
    [['#ff5d73', 0.36], ['#ffb347', 0.41], ['#5dffa0', 0.46]].forEach(([c, t0], i) => {
      const p = prog(lt, t0, 0.32, ease.outBack); if (p <= 0) return;
      g.save(); g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 12;
      g.beginPath(); g.arc(36 + i * 28, 36, 7.5 * p, 0, 7); g.fill(); g.restore();
    });
    const tp = prog(lt, 0.5, 0.4, ease.outCubic);
    ENN.text(g, '~/your-repo', PW / 2, 44, { f: font(24, 500, 'mono'), fill: '#b4bcd2', align: 'center', track: 1.2, alpha: tp });
    ENN.text(g, '# your repo is about to grow a brain', X0, 200 - 10 * (1 - tp), { f: font(28, 400, 'mono'), fill: '#8f99b6', alpha: prog(lt, 0.55, 0.5, ease.outCubic) });

    // ── prompt ──
    const pp = prog(lt, 0.34, 0.3, ease.outBack);
    if (pp > 0) {
      g.save(); g.translate(X0, BASE); g.scale(pp, pp);
      g.font = font(FS, 500, 'mono'); g.fillStyle = C.mint; g.shadowColor = C.mint; g.shadowBlur = 16;
      g.fillText('$', 0, 0); g.restore();
    }

    // ── keystroke FX (flash, spark bursts) under the glyphs ──
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = Math.max(0, n - 9); i < n; i++) {
      const a = lt - (TY.start + i * TY.interval); if (a < 0 || a > 0.5) continue;
      const col = colorOf(i), x = X0 + (2 + i) * cw + cw / 2, y = BASE - 14;
      // key-flash: soft bloom + underline bar
      const fk = Math.exp(-a * 24);
      const rg = g.createRadialGradient(x, y, 0, x, y, 90);
      rg.addColorStop(0, rgba(col, 0.4 * fk)); rg.addColorStop(1, rgba(col, 0));
      g.fillStyle = rg; g.fillRect(x - 90, y - 90, 180, 180);
      g.fillStyle = rgba(col, 0.9 * fk); g.fillRect(x - cw / 2, BASE + 17, cw, 3);
      // deterministic spark burst: ballistic streaks in an upward cone
      const r = rng(7000 + i * 31);
      g.strokeStyle = rgba(col, 0.95); g.lineWidth = 2; g.lineCap = 'round'; g.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = -Math.PI / 2 + (r() - 0.5) * 2.3, sp = 150 + r() * 360, life = 0.26 + r() * 0.22;
        if (a > life) continue;
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp + 520 * a;
        const px = x + Math.cos(ang) * sp * a, py = y - 22 + Math.sin(ang) * sp * a + 260 * a * a;
        const fade = 1 - a / life; g.globalAlpha = 1;
        g.moveTo(px, py); g.lineTo(px - vx * 0.028 * fade, py - vy * 0.028 * fade);
      }
      g.stroke();
    }
    g.restore();

    // ── typed command, glyph by glyph (landing pulse: pop, white-hot → colour) ──
    g.save(); g.font = font(FS, 500, 'mono'); g.textBaseline = 'alphabetic';
    for (let i = 0; i < n; i++) {
      const ch = CMD[i]; if (ch === ' ') continue;
      const a = lt - (TY.start + i * TY.interval);
      const k = Math.exp(-a * 15), settle = 1 - Math.exp(-a * 9);
      const base = colorOf(i);
      const heat = clamp(0.38 * A + 0.85 * hot);     // inhale warms the text, ENTER blasts it
      g.fillStyle = mix(mix('#ffffff', base, settle), '#ffffff', heat);
      g.shadowColor = base === C.txt ? 'rgba(220,230,255,0.5)' : base; g.shadowBlur = (base === C.txt ? 4 : 10) + 30 * k + 14 * hot;
      g.save();
      g.translate(X0 + (2 + i) * cw + cw / 2, BASE); g.scale(1 + 0.5 * k, 1 + 0.5 * k); g.translate(-cw / 2, -11 * k);
      g.fillText(ch, 0, 0); g.restore();
    }
    g.restore();

    // ── caret: blink when idle, solid while typing, flicker in the inhale, solid + hot at ENTER ──
    const lastAge = n > 0 ? lt - (TY.start + (n - 1) * TY.interval) : 99;
    let on;
    if (lt < 0.34) on = false;
    else if (lt >= E - 0.04) on = true;
    else if (lt >= 2.03) { const tau = lt - 2.03; on = ((3 * tau + 26 * tau * tau) % 1) < 0.55; }   // accelerating flicker
    else if (n > 0 && n < N + 1 && lastAge < 0.2) on = true;
    else on = (lt * 2) % 1 < 0.58;
    if (on) {
      const cxp = X0 + (2 + n) * cw, cy0 = BASE - CARET_H + 14;
      g.save();
      const cg = g.createLinearGradient(0, cy0, 0, cy0 + CARET_H);
      cg.addColorStop(0, mix(pal.violet, '#ffffff', 0.25 + 0.7 * hot)); cg.addColorStop(1, mix(pal.cyan, '#ffffff', 0.25 + 0.7 * hot));
      g.fillStyle = cg; g.shadowColor = pal.violet; g.shadowBlur = 22 + 24 * hot + 20 * A;
      g.globalAlpha = lt < TY.start ? 0.85 : 1;
      g.fillRect(cxp + 2, cy0, cw - 4, CARET_H); g.restore();
    }

    // ── charge line racing around the border (two heads, meets itself at ENTER) ──
    const q = ease.inQuad(clamp((lt - 1.98) / (E - 1.98)));
    if (q > 0 && dE < 0.6) {
      g.save(); rr(g, 0.75, 0.75, PW - 1.5, PH - 1.5, R);
      g.lineWidth = 3.5; g.shadowColor = pal.cyan; g.shadowBlur = 24; g.strokeStyle = mix(pal.cyan, '#ffffff', 0.55);
      g.globalAlpha = dE < 0 ? q : 0.9 * Math.exp(-dE * 9);
      const L = (dE < 0 ? q : 1) * PERIM / 2;
      g.setLineDash([L, PERIM]); g.lineDashOffset = 0; g.stroke();
      g.lineDashOffset = -PERIM / 2; g.stroke();
      g.restore();
    }
    if (dE >= 0 && dE < 0.5) {                     // edge flash on impact
      g.save(); rr(g, 0.75, 0.75, PW - 1.5, PH - 1.5, R);
      g.lineWidth = 4; g.strokeStyle = '#fff'; g.shadowColor = pal.violet; g.shadowBlur = 30; g.globalAlpha = 0.7 * Math.exp(-dE * 9); g.stroke(); g.restore();
    }

    // ── status line + progress, born on ENTER ──
    const sa = lt - (E + 0.05);
    if (sa > 0) {
      const sp = ease.outBack(clamp(sa / 0.3)), al = clamp(sa / 0.1);
      const sy = 382 + (1 - sp) * 26;
      g.save(); g.globalAlpha = al;
      // diamond bullet
      g.save(); g.translate(X0 + 9, sy - 10); g.rotate(Math.PI / 4 + sa * 2.2 * (sa < 0.3 ? 1 - sa / 0.3 : 0));
      const ds = 8 + 4 * Math.exp(-sa * 8) + 1.5 * Math.sin(sa * 14);
      g.fillStyle = pal.violet; g.shadowColor = pal.violet; g.shadowBlur = 18; g.fillRect(-ds / 2, -ds / 2, ds, ds); g.restore();
      // shimmering dim text
      g.font = font(29, 400, 'mono'); g.textBaseline = 'alphabetic';
      const label = 'scaffolding your repo…', tw = g.measureText(label).width;
      const bx = lerp(-160, tw + 160, ((sa * 1.5) % 1));
      const tg = g.createLinearGradient(X0 + 40 + bx - 130, 0, X0 + 40 + bx + 130, 0);
      tg.addColorStop(0, '#7f89a1'); tg.addColorStop(0.5, '#ffffff'); tg.addColorStop(1, '#7f89a1');
      g.fillStyle = tg; g.fillText(label, X0 + 40, sy);
      // progress bar
      const bw = PW - 2 * X0, bp = 0.07 + 0.36 * ease.outCubic(clamp(sa / 0.6)), by = 432 + (1 - sp) * 26;
      rr(g, X0, by, bw, 6, 3); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fill();
      rr(g, X0, by, bw * bp, 6, 3); g.fillStyle = ENN.brand(g, X0, 0, X0 + bw, 0); g.shadowColor = pal.cyan; g.shadowBlur = 16; g.fill();
      g.shadowBlur = 24; g.shadowColor = '#fff'; g.fillStyle = '#fff'; g.beginPath(); g.arc(X0 + bw * bp, by + 3, 4.5, 0, 7); g.fill();
      g.restore();
    }
  }

  // ═════════════════════════════ PLACEMENT (perspective via vertical strips) ═════════════════════════════
  function placePanel(ctx, lt, cx, cy, sc, theta) {
    if (Math.abs(theta) < 1e-4) {                      // flat: draw crisp vector straight onto the main ctx
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-PW / 2, -PH / 2); drawPanel(ctx, lt); ctx.restore(); return;
    }
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, OC.width, OC.height);
    octx.save(); octx.setTransform(RES, 0, 0, RES, PAD * RES, PAD * RES); drawPanel(octx, lt); octx.restore();
    const D = 1750, c = Math.cos(theta), s = Math.sin(theta), total = PW + 2 * PAD, SW = 6;
    ctx.save(); ctx.imageSmoothingQuality = 'high';
    for (let u0 = -total / 2; u0 < total / 2; u0 += SW) {
      const u1 = Math.min(u0 + SW, total / 2), um = (u0 + u1) / 2;
      const x0 = cx + (u0 * c * D / (D - u0 * s)) * sc, x1 = cx + (u1 * c * D / (D - u1 * s)) * sc;
      const hh = (PH + 2 * PAD) * (D / (D - um * s)) * sc;
      ctx.drawImage(OC, (u0 + total / 2) * RES, 0, (u1 - u0) * RES, OC.height, x0, cy - hh / 2, x1 - x0 + 0.8, hh);
    }
    ctx.restore();
  }

  // ═════════════════════════════ ENVIRONMENT ═════════════════════════════
  function drawFloor(ctx, lt, gt, alpha) {
    if (alpha <= 0.002) return;
    const rv = prog(lt, 0.05, 1.0, ease.outCubic), dE = lt - E, pulse = decay(dE, 6) * 0.7;
    ctx.save(); ctx.globalAlpha = alpha;
    const depth = H - HORIZON + 40;
    // pool of light under the terminal
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(PCX, HORIZON + 6); ctx.scale(1, 0.12);
    const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 760);
    pg.addColorStop(0, `rgba(139,107,255,${(0.16 + 0.35 * pulse) * rv})`); pg.addColorStop(0.5, `rgba(80,110,255,${0.1 * rv})`); pg.addColorStop(1, 'rgba(46,230,214,0)');
    ctx.fillStyle = pg; ctx.fillRect(-760, -760, 1520, 1520); ctx.restore();
    // perspective rays (cascade outward from the centre)
    const lg = ctx.createLinearGradient(0, HORIZON, 0, H + 40);
    lg.addColorStop(0, 'rgba(139,107,255,0)'); lg.addColorStop(1, `rgba(150,130,255,${0.5 + 0.4 * pulse})`);
    ctx.strokeStyle = lg; ctx.lineWidth = 1.4; ctx.beginPath();
    const S = 170;
    for (let i = -16; i <= 16; i++) {
      if (Math.abs(i) / 16 > rv * 1.05) continue;
      ctx.moveTo(PCX, HORIZON); ctx.lineTo(PCX + i * S * 1.0 * (depth / (H - HORIZON)), H + 40);
    }
    ctx.stroke();
    // receding cross-lines scrolling toward the camera
    const span = rv * 1700;
    for (let k = 0; k < 11; k++) {
      const qd = ((k + gt * 0.8) % 11) / 11, y = HORIZON + depth * Math.pow(qd, 2.2);
      ctx.strokeStyle = `rgba(${lerp(139, 46, qd) | 0},${lerp(107, 230, qd) | 0},${lerp(255, 214, qd) | 0},${(0.05 + 0.34 * qd) * (1 + pulse)})`;
      ctx.lineWidth = 0.8 + qd * 1.4; ctx.beginPath(); ctx.moveTo(PCX - span, y); ctx.lineTo(PCX + span, y); ctx.stroke();
    }
    // horizon light streak (draws outward from the middle) + a bright comet sweeping across it
    const hw = rv * 1100 * (1 + 0.3 * pulse);
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createLinearGradient(PCX - hw, 0, PCX + hw, 0);
    hg.addColorStop(0, 'rgba(139,107,255,0)'); hg.addColorStop(0.3, 'rgba(139,107,255,0.8)'); hg.addColorStop(0.5, 'rgba(255,255,255,1)');
    hg.addColorStop(0.7, 'rgba(46,230,214,0.8)'); hg.addColorStop(1, 'rgba(46,230,214,0)');
    ctx.fillStyle = hg; ctx.shadowColor = pal.violet; ctx.shadowBlur = 24; ctx.fillRect(PCX - hw, HORIZON - 1.2, hw * 2, 2.4); ctx.shadowBlur = 0;
    ctx.save(); ctx.translate(PCX, HORIZON); ctx.scale(1, 0.05);
    const hg2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 900);
    hg2.addColorStop(0, `rgba(170,150,255,${0.2 + 0.35 * pulse})`); hg2.addColorStop(1, 'rgba(139,107,255,0)');
    ctx.fillStyle = hg2; ctx.fillRect(-900, -900, 1800, 1800); ctx.restore();
    const cp = prog(lt, 0.12, 0.8, ease.inOutQuart);
    if (cp > 0 && cp < 1) {
      const cx = lerp(-300, W + 300, cp), cg = ctx.createLinearGradient(cx - 420, 0, cx + 30, 0);
      cg.addColorStop(0, 'rgba(46,230,214,0)'); cg.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = cg; ctx.fillRect(cx - 420, HORIZON - 1.5, 450, 3);
      ctx.save(); ctx.translate(cx, HORIZON); ctx.scale(1, 0.14);
      const fl = ctx.createRadialGradient(0, 0, 0, 0, 0, 110); fl.addColorStop(0, 'rgba(255,255,255,0.9)'); fl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fl; ctx.fillRect(-110, -110, 220, 220); ctx.restore();
    }
    ctx.restore();
  }

  // layered ghost frames behind the panel give depth + echo outward on ENTER
  function drawEchoes(ctx, lt, cx, cy, sc) {
    const dE = lt - E;
    [[1.045, 0.45, -1], [1.095, 0.6, 1]].forEach(([s0, t0, dir], i) => {
      const a = prog(lt, t0, 0.5, ease.outCubic); if (a <= 0) return;
      const burst = dE >= 0 ? ease.outExpo(clamp(dE / 0.5)) : 0;
      const s = s0 + (0.1 + 0.08 * i) * burst + 0.01 * Math.sin(lt * 1.2 + i * 2) * (1 - burst);
      const al = (0.11 * a) * (1 - burst) + (dE >= 0 ? 0.5 * Math.exp(-dE * 7) : 0);
      if (al < 0.003) return;
      ctx.save(); ctx.translate(cx + dir * 14 * (1 - burst), cy + 10 * (i + 1)); ctx.scale(s * sc, s * sc);
      rr(ctx, -PW / 2, -PH / 2, PW, PH, R + 6); ctx.lineWidth = 1.4 / s; ctx.strokeStyle = i ? pal.cyan : pal.violet; ctx.globalAlpha = al; ctx.stroke(); ctx.restore();
    });
  }

  function drawHalo(ctx, lt, cx, cy, sc, theta) {
    const dE = lt - E, k = 0.30 * prog(lt, 0.3, 0.6) + 0.4 * decay(dE, 7) + 0.25 * ENN.anticipate(lt, E, 0.38);
    if (k <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(cx, cy); ctx.scale(sc * Math.cos(theta), sc);
    [[-170, pal.violet, 1.0], [170, pal.cyan, 0.6]].forEach(([dx, c, w]) => {
      ctx.save(); ctx.translate(dx, 0); ctx.scale(1.55, 1);
      const g = ctx.createRadialGradient(0, 0, 120, 0, 0, 520);
      g.addColorStop(0, rgba(c, 0.20 * clamp(k) * w)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(-900, -600, 1800, 1200); ctx.restore();
    });
    ctx.restore();
  }

  // soft out-of-focus discs drifting in front of the lens
  const BOKEH = Array.from({ length: 15 }, (_, i) => ({
    x: hash(i * 5.1 + 1), y: hash(i * 9.7 + 3), r: 34 + hash(i * 2.3) * 96, z: 0.4 + hash(i * 8.9) * 1.1,
    c: [pal.violet, pal.cyan, '#ffffff', pal.violet, pal.cyan][i % 5], ph: hash(i * 3.3) * 6,
  }));
  function drawBokeh(ctx, lt, gt, ox, oy, s, zp) {
    const env = prog(lt, 0.25, 0.9, ease.outCubic) * Math.pow(1 - zp, 1.4); if (env <= 0.005) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of BOKEH) {
      let x = ((b.x * W * 1.3 + gt * 20 * b.z) % (W * 1.3)) - W * 0.15, y = b.y * H + Math.sin(gt * 0.7 + b.ph) * 26 * b.z;
      const sb = Math.pow(s, 0.45 + 0.55 * b.z);
      x = ox + (x - ox) * sb; y = oy + (y - oy) * sb; const r = b.r * sb * (1 + 0.1 * decay(lt - E, 6));
      const a = (0.03 + 0.04 * b.z) * env * (0.7 + 0.3 * Math.sin(gt * 1.4 + b.ph)) * (1 + 0.7 * decay(lt - E, 8));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(b.c, a * 0.5)); g.addColorStop(0.72, rgba(b.c, a * 0.9)); g.addColorStop(0.93, rgba(b.c, a * 1.6)); g.addColorStop(1, rgba(b.c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function drawLeaks(ctx, lt, gt, zp) {
    const env = prog(lt, 0.15, 0.8, ease.outCubic) * (1 - zp) , boost = 1 + 0.9 * decay(lt - E, 7);
    if (env <= 0.005) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    [[0.0, 0.12, 760, pal.violet, 0.11, 0.5], [1.02, 0.92, 820, pal.violet, 0.10, 1.3], [0.96, 0.02, 600, pal.cyan, 0.07, 2.1]].forEach(([fx, fy, rad, c, a, ph]) => {
      const x = fx * W + Math.sin(gt * 0.5 + ph) * 60, y = fy * H + Math.cos(gt * 0.4 + ph) * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, rgba(c, a * env * boost)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
    // slow diagonal light band sweeping the frame
    const sp = prog(lt, 0.2, 1.7, ease.inOutCubic);
    if (sp > 0 && sp < 1) {
      ctx.save(); ctx.translate(lerp(-500, W + 500, sp), H / 2); ctx.rotate(0.35);
      const g = ctx.createLinearGradient(-200, 0, 200, 0);
      g.addColorStop(0, 'rgba(190,170,255,0)'); g.addColorStop(0.5, `rgba(190,170,255,${0.07 * env})`); g.addColorStop(1, 'rgba(190,170,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-200, -1000, 400, 2000); ctx.restore();
    }
    ctx.restore();
  }

  // brand HUD: same mark + wordmark that s2 carries at the same spot, so it reads as one continuous system.
  // Crop marks stay; the debug slate (scene label / timecode / resolution) is gone.
  function drawHud(ctx, lt) {
    const a = prog(lt, 0.12, 0.5, ease.outCubic) * (1 - prog(lt, 2.5, 0.2, ease.inQuad));
    if (a <= 0.004) return;
    ctx.save(); ctx.globalAlpha = a;
    const m = 56, L = 30, d = prog(lt, 0.05, 0.5, ease.outQuart) * L;
    ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [W - m, H - m, -1, -1], [m, H - m, 1, -1]]) {
      ctx.moveTo(x + sx * d, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * d);
    }
    ctx.stroke();
    const hp = prog(lt, 0.3, 0.45, ease.outBack);
    ctx.save(); ctx.translate(76, 80); ctx.rotate(Math.PI / 4); ctx.scale(hp, hp); rr(ctx, -9, -9, 18, 18, 4);
    ctx.fillStyle = ENN.brand(ctx, -9, -9, 9, 9, pal.violet, pal.cyan); ctx.fill(); ctx.restore();
    ENN.text(ctx, 'ÉN NAM SCAFFOLD', 104, 87, { f: font(19, 600), fill: pal.text, track: 6, alpha: 0.85 * prog(lt, 0.4, 0.4, ease.outCubic) });
    ctx.restore();
  }

  // ═════════════════════════════ ENTER FX (screen space) ═════════════════════════════
  function drawEnterFX(ctx, lt, ox, oy) {
    const dE = lt - E; if (dE < 0 || dE > 1.0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';

    // anamorphic lens-flare streaks + ghosts along the lens axis
    const fa = 0.8 * Math.exp(-dE * 8);
    ctx.save(); ctx.translate(ox, oy);
    [[2400, 0.011, 0.85, ['255,255,255', '120,230,255']], [3200, 0.006, 0.8, ['190,160,255', '139,107,255']]].forEach(([len, th, k, cols]) => {
      ctx.save(); ctx.scale(1, th);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len / 2);
      g.addColorStop(0, `rgba(${cols[0]},${fa * k})`); g.addColorStop(0.18, `rgba(${cols[1]},${fa * k * 0.65})`); g.addColorStop(1, `rgba(${cols[1]},0)`);
      ctx.fillStyle = g; ctx.fillRect(-len / 2, -len / 2, len, len); ctx.restore();
    });
    ctx.restore();
    const gh = [[1.0, 46, pal.violet], [1.55, 90, pal.cyan], [2.2, 34, '#ffffff'], [-0.5, 120, pal.violet], [0.55, 60, pal.cyan]];
    for (const [k, rad, col] of gh) {
      const gx = ox + (960 - ox) * k, gy = oy + (540 - oy) * k, a = 0.2 * Math.exp(-dE * 5.5);
      const g = ctx.createRadialGradient(gx, gy, rad * 0.55, gx, gy, rad);
      g.addColorStop(0, rgba(col.length === 7 ? col : '#ffffff', 0)); g.addColorStop(0.8, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    }

    // shockwave rings
    [[0, '#ffffff', 13], [0.05, pal.violet, 11], [0.11, pal.cyan, 8]].forEach(([d, col, wd]) => {
      const a = dE - d; if (a <= 0 || a > 0.95) return;
      const p = ease.outExpo(a / 0.95), rad = 30 + p * 1650;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = wd * (1 - p) + 1.5; ctx.globalAlpha = Math.pow(1 - p, 1.3);
      ctx.shadowColor = col; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(ox, oy, rad, 0, 7); ctx.stroke(); ctx.restore();
    });

    // radial speed lines (3 colour batches, one stroke each)
    const cols = ['#ffffff', pal.violet, pal.cyan], batches = [[], [], []];
    for (let i = 0; i < 120; i++) {
      const r = hash(i * 1.37 + 5), r2 = hash(i * 2.91 + 2), r3 = hash(i * 4.13 + 9);
      const ang = (i / 120) * 6.2832 + r * 0.05, a = dE - r3 * 0.05;
      if (a <= 0) continue;
      const head = 80 + (700 + 2300 * r2) * ease.outExpo(clamp(a / 0.5)), tail = Math.max(60, head - (120 + 520 * r) * (1 - clamp(a / 0.55)));
      batches[i % 3].push([ang, tail, head, 1 - clamp(a / 0.58)]);
    }
    ctx.lineCap = 'round';
    batches.forEach((bt, bi) => {
      ctx.strokeStyle = cols[bi]; ctx.lineWidth = bi === 0 ? 2.2 : 1.6; ctx.globalAlpha = 0.85 * Math.max(0, bt.length ? bt[0][3] : 0); ctx.beginPath();
      for (const [ang, t0, t1] of bt) { const c = Math.cos(ang), s = Math.sin(ang); ctx.moveTo(ox + c * t0, oy + s * t0); ctx.lineTo(ox + c * t1, oy + s * t1); }
      ctx.stroke();
    });

    // debris sparks: drag-decelerated, analytic positions
    ctx.globalAlpha = 1; ctx.lineWidth = 3;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? pal.cyan : '#d8ccff'; ctx.beginPath();
      for (let i = pass; i < 90; i += 2) {
        const r = rng(500 + i * 17), ang = r() * 6.2832, v0 = 500 + r() * 1800, k = 3.5 + r() * 2, life = 0.35 + r() * 0.6;
        if (dE > life) continue;
        const d = v0 * (1 - Math.exp(-k * dE)) / k, v = v0 * Math.exp(-k * dE), c = Math.cos(ang), s = Math.sin(ang);
        const x = ox + c * d, y = oy + s * d + 160 * dE * dE, tl = v * 0.03 * (1 - dE / life);
        ctx.moveTo(x, y); ctx.lineTo(x - c * tl, y - s * tl);
      }
      ctx.stroke();
    }

    // white-hot flash: core bloom + quick full-frame wash
    const fl = Math.exp(-dE * 26);
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 560);
    g.addColorStop(0, `rgba(255,255,255,${0.42 * fl})`); g.addColorStop(0.25, `rgba(210,195,255,${0.22 * fl})`); g.addColorStop(1, 'rgba(139,107,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(255,255,255,${0.1 * Math.exp(-dE * 30)})`; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // streaks + portal for the dive. The caret rect (screen space) is the seed of the portal: it follows the zoom, then
  // an extra expansion pushes the rim past the frame. Interior is ink (not light) so the wizard lands on contrast.
  function drawDive(ctx, lt, ox, oy, zp, zk, s, pk, cw) {
    const handoff = 1 - prog(lt, PORTAL_FADE, 0.10, ease.inOutQuad);          // 1 -> 0 as the real backdrop takes over
    if (handoff <= 0.002) return;
    if (zp > 0.1) {
      const k = clamp((zp - 0.1) / 0.5) * handoff;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const cols = ['#ffffff', pal.violet, pal.cyan], B = [[], [], []];
      for (let i = 0; i < 150; i++) {
        const u = hash(i * 3.7 + 1), ph = hash(i * 7.1 + 4);
        const m = ((u + zk * (0.8 + ph * 1.4)) % 1), rad = 90 + 1900 * m * m, len = rad * (0.15 + 0.7 * zk) * (0.4 + ph);
        B[i % 3].push([(i / 150) * 6.2832 + ph * 0.04, rad, rad + len]);
      }
      B.forEach((bt, bi) => {
        ctx.strokeStyle = cols[bi]; ctx.lineWidth = 1.2 + 1.8 * k; ctx.globalAlpha = 0.75 * k; ctx.beginPath();
        for (const [a, r0, r1] of bt) { const c = Math.cos(a), s2 = Math.sin(a); ctx.moveTo(ox + c * r0, oy + s2 * r0); ctx.lineTo(ox + c * r1, oy + s2 * r1); }
        ctx.stroke();
      });
      ctx.restore();
    }
    const pt = lt - PORTAL_T0; if (pt <= 0) return;
    const grow = ease.inQuad(clamp((lt - 2.62) / 0.17));                       // blow the rim past the frame
    const hw = ((cw - 4) / 2) * pk * s * 1.15 + 2100 * grow, hh = 28 * pk * s * 1.15 + 1500 * grow;
    const rad = Math.min(hw, hh, 18 * pk * s + 120 * grow);
    const arm = ease.outCubic(clamp(pt / 0.1));                                // rim ignites quickly (no pop-in)
    ctx.save();
    // soft violet-white bloom around the rim (palette-tinted, only near the portal -> no fog on the frame edges)
    ctx.globalCompositeOperation = 'lighter';
    const bl = ctx.createRadialGradient(ox, oy, 0, ox, oy, 150 + hw * 0.9);
    const ba = 0.5 * arm * handoff * (1 - 0.7 * grow);
    bl.addColorStop(0, `rgba(255,255,255,${ba * 0.5})`); bl.addColorStop(0.35, `rgba(170,140,255,${ba * 0.6})`); bl.addColorStop(1, 'rgba(139,107,255,0)');
    ctx.fillStyle = bl; ctx.fillRect(ox - 150 - hw, oy - 150 - hw, 300 + 2 * hw, 300 + 2 * hw);
    ctx.globalCompositeOperation = 'source-over';
    // ink interior with a faint violet core
    rr(ctx, ox - hw, oy - hh, hw * 2, hh * 2, rad);
    const ig = ctx.createRadialGradient(ox, oy, 0, ox, oy, 760);
    ig.addColorStop(0, 'rgb(24,18,58)'); ig.addColorStop(0.55, 'rgb(10,9,26)'); ig.addColorStop(1, '#05060a');
    ctx.globalAlpha = arm * handoff; ctx.fillStyle = ig; ctx.fill();
    // rim: white-hot -> violet -> cyan
    const rg = ctx.createLinearGradient(ox - hw, oy - hh, ox + hw, oy + hh);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.45, '#b9a6ff'); rg.addColorStop(1, pal.cyan);
    ctx.lineWidth = 5 + 14 * (1 - grow); ctx.strokeStyle = rg; ctx.shadowColor = pal.violet; ctx.shadowBlur = 50;
    ctx.globalAlpha = arm * handoff; ctx.stroke();
    ctx.restore();
  }

  // ═════════════════════════════ SCENE ═════════════════════════════
  ENN.scene({
    id: 's1',
    draw(ctx, lt, gt, o) {
      const dE = lt - E;
      const cw = charW(ctx), caretX = PX + X0 + (2 + N) * cw + cw / 2, caretY = PY + BASE - 14;

      // dive camera: exponential scale into the caret; the caret drifts to screen centre
      const zp = clamp((lt - ZOOM_T0) / ZOOM_DUR);
      const zk = Math.pow(zp, 2.2);
      const s = Math.exp(Math.log(90) * zk), camP = ease.inOutCubic(zp);
      const ox = lerp(caretX, 960, camP), oy = lerp(caretY, 540, camP);
      const camTx = (k) => { ctx.translate(ox, oy); ctx.scale(k, k); ctx.translate(-caretX, -caretY); };

      // panel motion: float-in, parallax drift, inhale → snap → settle
      const settle = clamp(lt / 2.2);
      const theta = -0.23 * (1 - ease.outCubic(settle)) + 0.025 * Math.sin(lt * 1.3) * (1 - settle);
      const rise = 1 - ease.outExpo(clamp(lt / 1.0));
      const cx = PCX + Math.sin(lt * 0.8) * 12 * (1 - settle), cy = PCY + rise * 38 + Math.sin(lt * 1.7) * 5 * (1 - settle);
      let pk = 0.955 + 0.045 * ease.outQuart(clamp(lt / 0.9));                         // entry scale
      const A = ENN.anticipate(lt, E, 0.38);
      pk *= 1 - 0.022 * A;                                                             // inhale contraction
      if (dE >= 0) pk *= 1 + 0.065 * Math.exp(-dE * 9.5) * Math.cos(dE * 26);          // snap with overshoot
      const n = typedCount(lt);
      if (n > 0) pk *= 1 - 0.0035 * decay(lt - (TY.start + (n - 1) * TY.interval), 32); // per-keystroke thump

      const worldOn = lt < 2.80;                         // the portal fully covers the zoomed world by ~2.79
      if (lt < 2.97) {
      // 1) floor (pushes back at a slower rate for parallax)
      const floorA = (1 - clamp(zp * 1.15)) * prog(lt, 0.0, 0.2);
      ctx.save(); camTx(Math.pow(s, 0.5)); drawFloor(ctx, lt, gt, floorA); ctx.restore();

      // inhale: the room dims just before ENTER
      if (A > 0 && dE < 0) { ctx.fillStyle = `rgba(2,3,8,${0.34 * A})`; ctx.fillRect(0, 0, W, H); }

      // 2) panel world
      if (worldOn) {
      ctx.save(); camTx(s);
      drawHalo(ctx, lt, cx, cy, pk, theta);
      drawEchoes(ctx, lt, cx, cy, pk);
      placePanel(ctx, lt, cx, cy, pk, theta);
      ctx.restore();
      }

      // 3) screen-space layers
      drawBokeh(ctx, lt, gt, ox, oy, s, zp);
      drawLeaks(ctx, lt, gt, zp);
      drawHud(ctx, lt);
      drawEnterFX(ctx, lt, ox, oy);
      }
      drawDive(ctx, lt, ox, oy, zp, zk, s, pk, cw);
    },
  });
})();
