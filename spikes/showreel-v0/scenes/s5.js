// S5 "LOCKUP" — 11.9 -> 15.0s. Anticipation line -> ÉN NAM slam (12.20) -> SCAFFOLD snap (12.70)
// -> mark draw-on + tagline + command pill -> light sweep (13.80) -> calm, pristine end card (held to 15.0, no fade).
// Everything is a pure function of time: particles are analytic, sprites are static caches.
(function () {
  const { W, H, TL, clamp, lerp, ease, rng, hash, noise, pal, font, fonts, rr, brand, glass, hitAt } = ENN;
  const CX = W / 2;
  const HI = (t) => TL.hits.findIndex((h) => Math.abs(h.t - t) < 1e-6); // look hits up by time (indices shift if hits are added)
  const H_SLAM = HI(12.2), H_SNAP = HI(12.7), H_SWEEP = HI(13.8);
  const T_SLAM = TL.hits[H_SLAM].t, T_SNAP = TL.hits[H_SNAP].t, T_SWEEP = TL.hits[H_SWEEP].t; // 12.20, 12.70, 13.80
  const T_START = TL.scenes.s5.start;
  // Closing beat (NOT in TL.hits, soft by design): ENTER ping on the command pill, light runs up to the mark, mark ignites.
  const T_ENT = 14.55, T_MARK2 = 14.78;

  // ───────────────────────────── layout (1920x1080) ─────────────────────────────
  const LAY = {
    markY: 184, markR: 70,
    titleBase: 524, titleSize: 280, titleTrack: -5,
    scBase: 698, scSize: 148,
    tag: [786, 832, 876],
    pillY: 954, pillH: 76,
  };
  const TITLE_STR = 'ÉN NAM';
  const SC_STR = 'SCAFFOLD';

  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const pt = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const lg = (ctx, x0, y0, x1, y1, stops) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g;
  };

  // ───────────────────────────── cached sprites (static, built once) ─────────────────────────────
  let TITLE = null;
  function buildTitle() {
    const size = LAY.titleSize, track = LAY.titleTrack, f = font(size, 700);
    const m = mkCanvas(8, 8).getContext('2d');
    m.font = f; m.letterSpacing = track + 'px';
    const total = m.measureText(TITLE_STR).width - track;
    m.letterSpacing = '0px';
    const capH = m.measureText('N').actualBoundingBoxAscent;
    // The font's own acute renders as a detached diamond; we draw 'E' + a custom slanted acute instead (see paint()).
    const ACC_GAP = 16, ACC_H = 58, accentAsc = capH + ACC_GAP + ACC_H + 4;
    const paint = (c, ch, x, y, adv) => {
      c.fillText(ch === 'É' ? 'E' : ch, x, y);
      if (ch !== 'É') return;
      const cx = x + adv * 0.50, bot = y - capH - ACC_GAP, top = bot - ACC_H;
      c.beginPath(); c.moveTo(cx - 24, bot); c.lineTo(cx + 8, bot); c.lineTo(cx + 40, top); c.lineTo(cx - 2, top); c.closePath(); c.fill();
    };
    const left = CX - total / 2;
    const pad = 130, baseLocal = pad + Math.ceil(accentAsc) + 10, sh = baseLocal + 30 + pad;
    const letters = [];
    for (let i = 0; i < TITLE_STR.length; i++) {
      const ch = TITLE_STR[i];
      if (ch === ' ') continue;
      m.letterSpacing = track + 'px';
      const x = m.measureText(TITLE_STR.slice(0, i)).width;
      m.letterSpacing = '0px';
      const adv = m.measureText(ch === 'É' ? 'E' : ch).width;
      const sw = Math.ceil(adv) + pad * 2;
      const edge = (g) => lg(g, pad - x, 0, pad - x + total, 0, [[0, pal.violet], [1, pal.cyan]]);
      // face: white metal + brand-gradient inner glow + crisp gradient edge
      const face = mkCanvas(sw, sh), g = face.getContext('2d');
      g.font = f; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
      g.fillStyle = lg(g, 0, baseLocal - capH, 0, baseLocal, [[0, '#ffffff'], [0.55, '#f3f0ff'], [1, '#d6f3ff']]);
      paint(g, ch, pad, baseLocal, adv);
      // inner glow = blurred INVERSE of the glyph, clipped inside it (strokeText would expose overlapping contours)
      const inv = mkCanvas(sw, sh), iv = inv.getContext('2d');
      iv.fillStyle = edge(iv); iv.fillRect(0, 0, sw, sh);
      iv.globalCompositeOperation = 'destination-out'; iv.font = f; iv.textBaseline = 'alphabetic'; iv.fillStyle = '#000'; paint(iv, ch, pad, baseLocal, adv);
      g.globalCompositeOperation = 'source-atop';
      g.filter = 'blur(13px)'; g.globalAlpha = 1; g.drawImage(inv, 0, 0); g.drawImage(inv, 0, 0);
      g.filter = 'blur(2px)'; g.globalAlpha = 1; g.drawImage(inv, 0, 0);
      g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // outer glow sprite
      const gl = mkCanvas(sw, sh), h = gl.getContext('2d');
      h.font = f; h.textBaseline = 'alphabetic';
      h.fillStyle = edge(h); h.filter = 'blur(34px)'; paint(h, ch, pad, baseLocal, adv);
      h.filter = 'blur(12px)'; h.globalAlpha = 0.6; paint(h, ch, pad, baseLocal, adv);
      letters.push({ ch, i, x, adv, sx: left + x - pad, cx: left + x + adv / 2, face, glow: gl, sw });
    }
    TITLE = { letters, total, left, capH, accentAsc, baseLocal, pad, mid: LAY.titleBase - capH / 2 };
    // SCAFFOLD target tracking: justify to the title width
    const sf = font(LAY.scSize, 600);
    m.font = sf; m.letterSpacing = '0px';
    const w0 = m.measureText(SC_STR).width;
    const capSc = m.measureText('S').actualBoundingBoxAscent;
    TITLE.sc = { f: sf, trackF: (total - w0) / (SC_STR.length - 1), cap: capSc };
  }

  // ───────────────────────────── title letters ─────────────────────────────
  const landT = (n) => T_SLAM - 0.14 + n * 0.035;   // letter n lands; the last one (M) lands exactly ON the 12.20 hit
  const FALL = 0.08;
  const pulseAt = (t0, gt, decay) => (gt >= t0 ? Math.exp(-(gt - t0) * decay) : 0);

  function letterState(n, gt, i) {
    const L = landT(n), s = L - FALL;
    if (gt < s) return null;
    const fall = clamp((gt - s) / FALL), dt = gt - L;
    const k = dt > 0 ? Math.exp(-dt * 13) * Math.cos(dt * 40) : 0; // squash spring after impact
    const shk = dt > 0 ? Math.exp(-dt * 16) : 0;
    let dx = noise(i * 13 + gt * 80) * 7 * shk;
    let dy = -(1 - ease.inCubic(fall)) * 210 + (dt > 0 ? 9 * Math.exp(-dt * 20) + noise(i * 7 + gt * 80 + 50) * 5 * shk : 0);
    let sx = 1 + (dt > 0 ? 0.055 * k : -0.10 * (1 - fall));
    let sy = 1 + (dt > 0 ? -0.10 * k : 0.28 * (1 - fall));
    return { fall, dt, dx, dy, sx, sy };
  }

  function drawTitle(ctx, gt, pass) {
    const T = TITLE, TB = LAY.titleBase;
    const slotTop = TB - T.accentAsc - 8, slotBot = TB + 90;
    for (let n = 0; n < T.letters.length; n++) {
      const Lt = T.letters[n], st = letterState(n, gt, n);
      if (!st) continue;
      ctx.save();
      ctx.translate(Lt.cx + st.dx, TB + st.dy); ctx.scale(st.sx, st.sy); ctx.translate(-Lt.cx, -TB);
      const spX = Lt.sx, spY = TB - T.baseLocal;
      if (pass === 'glow') {
        const a = (0.30 + 0.06 * Math.sin(gt * 2.2 + n) + 0.45 * Math.exp(-Math.max(0, st.dt) * 6) + 0.9 * hitAt(H_SWEEP, gt, 5) + 0.45 * pulseAt(T_ENT, gt, 6) + 0.6 * pulseAt(T_MARK2, gt, 7)) * st.fall * st.fall;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(a, 0, 1.4);
        ctx.drawImage(Lt.glow, spX, spY);
        if (st.fall < 1) { // motion echoes above the falling letter
          ctx.globalAlpha = 0.35; ctx.drawImage(Lt.glow, spX, spY - 70);
          ctx.globalAlpha = 0.18; ctx.drawImage(Lt.glow, spX, spY - 140);
        }
      } else {
        ctx.beginPath(); ctx.rect(Lt.sx, slotTop, Lt.sw, slotBot - slotTop); ctx.clip(); // vertical mask slot
        ctx.drawImage(Lt.face, spX, spY);
        const fl = 0.5 * Math.exp(-Math.max(0, st.dt) * 22) * (st.dt >= 0 ? 1 : 0);
        if (fl > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl; ctx.drawImage(Lt.face, spX, spY); }
      }
      ctx.restore();
    }
  }

  // ───────────────────────────── SCAFFOLD + rule ─────────────────────────────
  function drawScaffold(ctx, gt) {
    const T = TITLE, sc = T.sc;
    const p = clamp((gt - T_SNAP) / 0.65);
    if (p <= 0) return;
    const track = lerp(150, sc.trackF, ease.outExpo(p));
    const wipe = ease.outExpo(clamp((gt - T_SNAP) / 0.5));
    const half = 1000;
    const x0 = CX - half, xf = x0 + 2 * half * wipe;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, LAY.scBase - sc.cap - 30, xf - x0, sc.cap + 60); ctx.clip();
    ctx.font = sc.f; ctx.letterSpacing = track + 'px'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(SC_STR).width - track;
    ctx.fillStyle = lg(ctx, T.left, 0, T.left + T.total, 0, [[0, '#a287ff'], [0.5, '#5fb0ff'], [1, '#2ee6d6']]);
    ctx.shadowColor = 'rgba(120,120,255,0.55)'; ctx.shadowBlur = 26;
    ctx.globalAlpha = clamp(p * 4);
    const bounce = 1 - ease.outBack(clamp((gt - T_SNAP) / 0.35)); // tiny settle lift
    ctx.fillText(SC_STR, CX - w / 2, LAY.scBase + bounce * 18);
    ctx.restore();
    // wipe leading edge
    if (wipe < 0.995) {
      const a = (1 - wipe) * 1.2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(a);
      ctx.fillStyle = lg(ctx, 0, LAY.scBase - sc.cap - 30, 0, LAY.scBase + 30, [[0, 'rgba(255,255,255,0)'], [0.5, '#fff'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(xf - 2, LAY.scBase - sc.cap - 30, 4, sc.cap + 60);
      ctx.restore();
    }
  }

  function drawRule(ctx, gt) {
    const T = TITLE, y = (LAY.titleBase + (LAY.scBase - T.sc.cap)) / 2 + 2;
    const p = ease.outExpo(clamp((gt - T_SNAP) / 0.45));
    if (p <= 0) return;
    const half = (T.total / 2) * p;
    const flash = Math.exp(-(gt - T_SNAP) * 6);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lg(ctx, CX - half, 0, CX + half, 0, [[0, 'rgba(139,107,255,0)'], [0.15, pal.violet], [0.85, pal.cyan], [1, 'rgba(46,230,214,0)']]);
    ctx.globalAlpha = 0.34 + 0.9 * flash;
    ctx.shadowColor = pal.violet; ctx.shadowBlur = 14 * (0.3 + flash * 2);
    ctx.fillRect(CX - half, y - 1, half * 2, 2);
    ctx.restore();
  }

  // ───────────────────────────── logo mark: node-lattice cube ─────────────────────────────
  const MR = LAY.markR;
  const MV = [0, 1, 2, 3, 4, 5].map((k) => { const a = (-90 + 60 * k) * Math.PI / 180; return [Math.cos(a) * MR, Math.sin(a) * MR]; });
  const MC = [0, 0];
  const M0 = 12.30; // draw-on start
  const SEGS = [ // a, b, start offset, duration, weight class
    [MV[0], MV[1], 0.00, 0.28, 'T'], [MV[0], MV[5], 0.00, 0.28, 'T'],
    [MV[1], MV[2], 0.10, 0.28, 'T'], [MV[5], MV[4], 0.10, 0.28, 'T'],
    [MV[2], MV[3], 0.20, 0.28, 'T'], [MV[4], MV[3], 0.20, 0.28, 'T'],
    [MC, MV[1], 0.26, 0.26, 'T'], [MC, MV[3], 0.32, 0.26, 'T'], [MC, MV[5], 0.38, 0.26, 'T'],
    [MV[5], MV[1], 0.46, 0.26, 'b'], [MV[1], MV[3], 0.54, 0.26, 'b'], [MV[3], MV[5], 0.62, 0.26, 'b'],
  ];
  const NODES = [[MV[0], 0.0], [MV[1], 0.2], [MV[5], 0.2], [MV[2], 0.3], [MV[4], 0.3], [MV[3], 0.4], [MC, 0.26]];
  const FACES = [[[MV[5], MV[0], MV[1], MC], 0.17], [[MV[1], MV[2], MV[3], MC], 0.10], [[MV[3], MV[4], MV[5], MC], 0.05]];

  function drawMark(ctx, gt) {
    if (gt < M0) return;
    const lt = gt - M0;
    ctx.save();
    ctx.translate(CX, LAY.markY);
    const mp = pulseAt(T_MARK2, gt, 6), hit = hitAt(H_SWEEP, gt, 6) + 1.1 * mp, beat = Math.exp(-(((gt - M0) % 0.5)) * 9);
    const calm = clamp((gt - 13.0) / 0.4);
    const ms = 1 + 0.04 * hit + 0.012 * calm * beat + 0.05 * mp; ctx.scale(ms, ms);
    const grad = lg(ctx, -MR, -MR, MR, MR, [[0, pal.violet], [1, pal.cyan]]);

    // backing glow disc
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, MR * 2.4);
    const da = clamp(lt / 0.6) * (0.5 + 0.5 * calm) * (0.8 + 0.6 * hit + 0.15 * beat);
    dg.addColorStop(0, `rgba(139,107,255,${0.30 * da})`); dg.addColorStop(0.5, `rgba(46,230,214,${0.10 * da})`); dg.addColorStop(1, 'rgba(46,230,214,0)');
    ctx.fillStyle = dg; ctx.fillRect(-MR * 2.4, -MR * 2.4, MR * 4.8, MR * 4.8); ctx.restore();

    // glass faces (fade in once the frame is built)
    const fa = ease.outCubic(clamp((gt - 12.95) / 0.5));
    if (fa > 0) for (const [f, a] of FACES) {
      ctx.beginPath(); f.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.globalAlpha = a * fa * (1 + 0.8 * hit); ctx.fillStyle = grad; ctx.fill(); ctx.globalAlpha = 1;
    }

    // beams: glow pass + crisp pass + white core
    const run = (cls) => {
      ctx.beginPath();
      for (const [a, b, o, d, c] of SEGS) {
        if (c !== cls) continue;
        const k = ease.outCubic(clamp((lt - o) / d)); if (k <= 0) continue;
        const e = pt(a, b, k); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]);
      }
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [cls, w] of [['T', 6], ['b', 3]]) {
      run(cls); ctx.strokeStyle = grad; ctx.lineWidth = w;
      ctx.shadowColor = 'rgba(120,130,255,0.9)'; ctx.shadowBlur = 20 + 18 * hit; ctx.stroke();
      ctx.shadowBlur = 0; ctx.stroke();
      run(cls); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = w * 0.3; ctx.stroke();
    }

    // draw-on tip sparks
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [a, b, o, d] of SEGS) {
      const raw = (lt - o) / d; if (raw <= 0 || raw >= 1) continue;
      const e = pt(a, b, ease.outCubic(raw));
      const g = ctx.createRadialGradient(e[0], e[1], 0, e[0], e[1], 16);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(160,150,255,0)');
      ctx.fillStyle = g; ctx.fillRect(e[0] - 16, e[1] - 16, 32, 32);
    }
    ctx.restore();

    // nodes at every joint
    for (const [p, o] of NODES) {
      const k = ease.outBack(clamp((lt - o) / 0.3)); if (k <= 0) continue;
      const pulse = 1 + (calm > 0 ? 0.28 * beat : 0) + 0.4 * hit;
      const r = 8 * k * pulse;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7);
      ctx.fillStyle = pal.ink2; ctx.shadowColor = pal.violet; ctx.shadowBlur = 16;
      ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 2.6; ctx.strokeStyle = grad; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.42, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    }

    // light comet circling the hex perimeter
    if (gt > 13.0) {
      const cA = clamp((gt - 13.0) / 0.3), per = [0, 1, 2, 3, 4, 5, 0];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let s = 0; s < 14; s++) {
        const u = (((gt - 13.0) / 1.7) - s * 0.006) % 1, uu = (u + 1) % 1;
        const e = Math.floor(uu * 6), fr = uu * 6 - e;
        const p = pt(MV[per[e]], MV[per[e + 1]], fr);
        ctx.globalAlpha = cA * (1 - s / 14) * 0.9;
        ctx.fillStyle = s === 0 ? '#fff' : pal.cyan;
        ctx.beginPath(); ctx.arc(p[0], p[1], 5.5 * (1 - s / 18), 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    // orbit ring
    const ra = ease.outExpo(clamp((gt - 12.9) / 0.6));
    if (ra > 0) {
      const R2 = MR * (1.2 + 0.4 * ra);
      ctx.save(); ctx.globalAlpha = ra * 0.5; ctx.setLineDash([2, 11]); ctx.lineDashOffset = -gt * 9;
      ctx.strokeStyle = 'rgba(200,210,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R2, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = ra * 0.9; ctx.lineWidth = 2.4; ctx.strokeStyle = grad;
      for (let k = 0; k < 3; k++) {
        const a0 = gt * 0.7 + k * 2.0944; ctx.beginPath(); ctx.arc(0, 0, R2, a0, a0 + 0.42); ctx.stroke();
      }
      ctx.restore();
    }
    if (gt > T_MARK2 && gt < T_MARK2 + 0.6) { // closing shock ring from the mark
      const k = ease.outExpo(clamp((gt - T_MARK2) / 0.6));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * 0.9; ctx.lineWidth = 5 * (1 - k) + 1.5; ctx.strokeStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, MR * 1.6 + 170 * k, 0, 6.2832); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  // ───────────────────────────── tagline ─────────────────────────────
  const TAG = [
    [{ t: 'One ', f: font(44, 600), c: '#f2f4fb' }, { t: 'npx', f: font(42, 600, 'mono'), c: pal.cyan }, { t: '.', f: font(44, 600), c: '#f2f4fb' }],
    [{ t: 'A repo with a ', f: font(37, 400), c: '#98a1b8' }, { t: 'brain', f: font(37, 600), c: '#e8ecf8' }, { t: ', a ', f: font(37, 400), c: '#98a1b8' }, { t: 'memory', f: font(37, 600), c: '#e8ecf8' }, { t: ',', f: font(37, 400), c: '#98a1b8' }],
    [{ t: 'and a small ', f: font(37, 400), c: '#98a1b8' }, { t: 'army of agents', f: font(37, 600), c: '#e8ecf8' }, { t: '.', f: font(37, 400), c: '#98a1b8' }],
  ];
  function drawTagline(ctx, gt) {
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '0.4px';
    TAG.forEach((segs, i) => {
      const p = ease.outQuart(clamp((gt - (13.0 + i * 0.22)) / 0.42)); if (p <= 0) return;
      let w = 0; for (const s of segs) { ctx.font = s.f; s.w = ctx.measureText(s.t).width; w += s.w; }
      let x = CX - w / 2; const y = LAY.tag[i] + 26 * (1 - p);
      ctx.save(); ctx.globalAlpha = p; ctx.filter = p < 1 ? `blur(${(1 - p) * 7}px)` : 'none';
      for (const s of segs) { ctx.font = s.f; ctx.fillStyle = s.c; ctx.fillText(s.t, x, y); x += s.w; }
      ctx.restore();
    });
    ctx.restore();
  }

  // ───────────────────────────── command pill ─────────────────────────────
  const CMD = 'npx @ennamjsc/agents-scaffold';
  const PILL = { fullW: 0 }; // filled by drawPill so drawEnter can match the pill outline
  function drawPill(ctx, gt) {
    const T0 = 13.4, p = clamp((gt - T0) / 0.5); if (p <= 0) return;
    const f = font(31, 500, 'mono');
    ctx.save(); ctx.font = f; ctx.letterSpacing = '0px';
    const promptW = ctx.measureText('$ ').width, cmdW = ctx.measureText(CMD).width;
    ctx.restore();
    const fullW = promptW + cmdW + 2 * 46 + 22, h = LAY.pillH, y = LAY.pillY - h / 2;
    PILL.fullW = fullW;
    const w = fullW * ease.outBack(clamp((gt - T0) / 0.45)) , x = CX - w / 2;
    const hit = hitAt(H_SWEEP, gt, 6) + 1.4 * pulseAt(T_ENT, gt, 7);
    ctx.save(); // outer: ENTER key-press transform shared by outline + contents
    // ENTER key-press: anticipation squeeze before T_ENT, spring overshoot after
    const pd = gt - T_ENT, press = pd < 0 ? 1 - 0.035 * ease.inQuad(clamp((pd + 0.14) / 0.14)) : 1 + 0.045 * Math.exp(-pd * 11) * Math.cos(pd * 26);
    ctx.translate(CX, LAY.pillY); ctx.scale(press, press); ctx.translate(-CX, -LAY.pillY);
    ctx.save();
    ctx.globalAlpha = clamp(p * 3);
    glass(ctx, x, y, Math.max(w, 2), h, h / 2, { fill: 'rgba(16,19,30,0.82)', border: 'rgba(255,255,255,0.10)', glowColor: 'rgba(120,110,255,0.35)', glowBlur: 36 });
    // gradient border
    rr(ctx, x + 0.5, y + 0.5, Math.max(w - 1, 1), h - 1, h / 2);
    ctx.lineWidth = 2; ctx.strokeStyle = lg(ctx, x, 0, x + w, 0, [[0, pal.violet], [1, pal.cyan]]);
    ctx.globalAlpha *= 0.55 + 0.45 * hit * 1.5; ctx.stroke();
    ctx.restore();
    // contents (clipped to the growing pill)
    ctx.save();
    rr(ctx, x + 4, y, Math.max(w - 8, 1), h, h / 2); ctx.clip();
    ctx.font = f; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '0px';
    const tx = CX - fullW / 2 + 46, ty = LAY.pillY + 2;
    const n = clamp(Math.floor((gt - 13.55) / 0.016), 0, CMD.length);
    ctx.globalAlpha = clamp((gt - 13.5) / 0.15);
    ctx.fillStyle = lg(ctx, tx, 0, tx + promptW, 0, [[0, pal.violet], [1, pal.cyan]]); ctx.fillText('$', tx, ty);
    ctx.fillStyle = pal.text; ctx.fillText(CMD.slice(0, n), tx + promptW, ty);
    const cx = tx + promptW + ctx.measureText(CMD.slice(0, n)).width + 3;
    const typing = n < CMD.length, on = gt < T_ENT && (typing || (((gt - 14.05) % 1.0) + 1) % 1.0 < 0.55); // cursor is spent by ENTER
    if (on) { ctx.fillStyle = pal.cyan; ctx.shadowColor = pal.cyan; ctx.shadowBlur = 12; ctx.fillRect(cx, LAY.pillY - 20, 13, 40); }
    ctx.restore();
    ctx.restore();
  }

  // ───────────────────────────── lockup (everything the sweep re-lights) ─────────────────────────────
  function lockupXform(ctx, gt) { // shared by lockup + closing FX so they stay registered
    const br = 1 + 0.004 * Math.sin(gt * 1.1) + 0.05 * ease.outQuad(clamp((gt - 12.7) / 2.3));
    ctx.translate(CX, 540); ctx.scale(br, br); ctx.translate(-CX, -540);
  }
  function drawLockup(ctx, gt) {
    // very subtle depth parallax + breathing, per layer
    const lay = (d, fn) => { ctx.save(); ctx.translate(Math.sin(gt * 0.7) * d, Math.cos(gt * 0.55) * d * 0.7); fn(); ctx.restore(); };
    ctx.save();
    // slow push-in 12.7 -> 15.0 (eases out) keeps the end card alive, plus breathing
    lockupXform(ctx, gt);
    lay(4, () => drawMark(ctx, gt));
    lay(1.5, () => { drawTitle(ctx, gt, 'glow'); drawTitle(ctx, gt, 'face'); });
    lay(2.5, () => { drawRule(ctx, gt); drawScaffold(ctx, gt); });
    lay(4, () => drawTagline(ctx, gt));
    lay(5.5, () => drawPill(ctx, gt));
    ctx.restore();
  }

  // ───────────────────────────── FX: anticipation, burst, rings, sparks ─────────────────────────────
  function glowDot(ctx, x, y, r, a, inner) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.18, `rgba(${inner},${a * 0.7})`); g.addColorStop(1, `rgba(${inner},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawAnticipation(ctx, gt) {
    const TM = TITLE.mid;
    if (gt > T_SLAM + 1.0) return;
    const y = lerp(H / 2, TM, ease.inOutExpo(clamp((gt - 12.0) / 0.2)));
    const charge = clamp((gt - T_START) / (T_SLAM - T_START));
    const len = 800 * ease.outExpo(clamp((gt - T_START) / 0.24));
    const dt = gt - T_SLAM;
    const post = dt > 0 ? Math.exp(-dt * 3.6) : 1;
    const a = (0.6 + 0.4 * ease.inQuad(charge)) * (dt > 0 ? post : 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // inward-sucked dust (held breath)
    if (dt < 0) for (let i = 0; i < 56; i++) {
      const h1 = hash(i * 1.7 + 3), h2 = hash(i * 2.9 + 8), h3 = hash(i * 4.1 + 1);
      const k = ease.inQuad(clamp((gt - T_START - h3 * 0.1) / (0.3 - h3 * 0.1)));
      const lx = (h1 * 2 - 1) * len * 0.95, off = (h2 > 0.5 ? 1 : -1) * (40 + 220 * h2);
      const px = CX + lx * (1 - 0.15 * k), py = y + off * (1 - k);
      ctx.globalAlpha = (0.2 + 0.7 * k) * (1 - 0.0) * clamp(k * 3);
      ctx.fillStyle = i % 3 ? pal.cyan : '#fff';
      ctx.beginPath(); ctx.arc(px, py, 1.4 + 1.6 * h3, 0, 7); ctx.fill();
    }
    // implosion rings: the held breath, energy collapsing into the line
    if (dt < 0) for (let r = 0; r < 2; r++) {
      const k = clamp((gt - T_START - 0.02 - r * 0.07) / (0.28 - r * 0.07)), rad = 40 + 640 * (1 - ease.inQuart(k));
      ctx.globalAlpha = Math.sin(k * Math.PI * 0.5) * (0.5 - r * 0.2) * (k > 0 ? 1 : 0);
      ctx.lineWidth = 1.5 + 2 * k; ctx.strokeStyle = r ? pal.cyan : pal.violet;
      ctx.beginPath(); ctx.arc(CX, y, rad, 0, 6.2832); ctx.stroke();
    }
    // thin charging line
    const th = dt > 0 ? 2 + 4 * Math.exp(-dt * 25) : 2.6 + 2.2 * charge;
    ctx.globalAlpha = clamp(a);
    ctx.shadowColor = '#9b8cff'; ctx.shadowBlur = 24 + 30 * charge;
    ctx.fillStyle = lg(ctx, CX - len, 0, CX + len, 0, [[0, 'rgba(255,255,255,0)'], [0.5, '#ffffff'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(CX - len, y - th / 2, len * 2, th);
    ctx.shadowBlur = 0;
    if (dt < 0) glowDot(ctx, CX, y, 70 + 90 * charge * charge, 0.55 + 0.4 * charge, '150,130,255');
    ctx.restore();
  }

  // omnidirectional spark streaks from (ox,oy), analytic position(dt) with drag + gravity
  function sparks(ctx, gt, t0, ox, oy, n, seed, o) {
    const dt = gt - t0; if (dt < 0 || dt > o.lifeMax) return;
    const cols = [pal.cyan, '#ffffff', pal.violet, pal.amber, '#ffffff'];
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let j = 0; j < n; j++) {
      const hh = (k) => hash(seed * 97 + j * 7.13 + k * 3.31);
      const life = lerp(o.lifeMin, o.lifeMax, hh(2)); if (dt > life) continue;
      const ang = lerp(o.a0, o.a1, hh(0)), sp = lerp(o.sMin, o.sMax, Math.pow(hh(1), o.pow || 1));
      const pos = (d) => [ox + Math.cos(ang) * sp * (1 - Math.exp(-o.drag * d)) / o.drag, oy + Math.sin(ang) * sp * (1 - Math.exp(-o.drag * d)) / o.drag + o.grav * d * d * 0.5];
      const p1 = pos(dt), p0 = pos(Math.max(0, dt - 0.035));
      const k = 1 - dt / life;
      ctx.globalAlpha = clamp(k * 1.3) * (o.alpha || 1);
      ctx.strokeStyle = cols[Math.floor(hh(3) * cols.length)];
      ctx.lineWidth = (1.2 + 2.2 * hh(4)) * (0.5 + 0.5 * k);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBurst(ctx, gt) {
    const dt = gt - T_SLAM; if (dt < -0.02) return;
    const TM = TITLE.mid;
    // brightest flash + light bloom
    const fl = Math.exp(-dt * 8.5);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const R = 520 + 700 * ease.outExpo(clamp(dt / 0.5));
    const g = ctx.createRadialGradient(CX, TM, 0, CX, TM, R);
    g.addColorStop(0, `rgba(255,255,255,${0.30 * fl})`); g.addColorStop(0.18, `rgba(190,170,255,${0.34 * fl})`);
    g.addColorStop(0.5, `rgba(80,140,255,${0.2 * fl})`); g.addColorStop(1, 'rgba(46,230,214,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // starburst rays (single path, radial fade)
    const rl = ease.outExpo(clamp(dt / 0.35)), ra = Math.exp(-dt * 7);
    if (ra > 0.02) {
      ctx.beginPath();
      for (let k = 0; k < 34; k++) {
        const ang = (k / 34) * 6.2832 + hash(k * 2.3) * 0.25, len = (500 + 700 * hash(k * 5.1)) * rl, wd = 0.010 + 0.014 * hash(k * 1.3);
        ctx.moveTo(CX, TM); ctx.lineTo(CX + Math.cos(ang - wd) * len, TM + Math.sin(ang - wd) * len); ctx.lineTo(CX + Math.cos(ang + wd) * len, TM + Math.sin(ang + wd) * len); ctx.closePath();
      }
      const rg = ctx.createRadialGradient(CX, TM, 0, CX, TM, 1200);
      rg.addColorStop(0, 'rgba(255,255,255,0.8)'); rg.addColorStop(1, 'rgba(160,150,255,0)');
      ctx.globalAlpha = ra * 0.34; ctx.fillStyle = rg; ctx.fill();
    }
    // anamorphic streak across the whole frame
    ctx.globalAlpha = Math.exp(-dt * 3.2) * 0.9;
    ctx.fillStyle = lg(ctx, 0, 0, W, 0, [[0, 'rgba(120,120,255,0)'], [0.35, 'rgba(170,150,255,0.8)'], [0.5, '#fff'], [0.65, 'rgba(80,235,225,0.8)'], [1, 'rgba(46,230,214,0)']]);
    ctx.fillRect(0, TM - 2.5, W, 5);
    ctx.globalAlpha = Math.exp(-dt * 6) * 0.35; ctx.fillRect(0, TM - 14, W, 28);
    ctx.restore();

    // shockwave rings
    const ring = (delay, dur, maxR, w0, cols, a0) => {
      const d = dt - delay; if (d < 0 || d > dur) return;
      const k = clamp(d / dur), r = 30 + maxR * ease.outExpo(k), lw = w0 * (1 - ease.outQuad(k)) + 1.2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a0 * Math.pow(1 - k, 1.4);
      ctx.lineWidth = lw; ctx.strokeStyle = lg(ctx, CX - r, 0, CX + r, 0, cols);
      ctx.shadowColor = cols[0][1]; ctx.shadowBlur = 36;
      ctx.beginPath(); ctx.arc(CX, TM, r, 0, 6.2832); ctx.stroke(); ctx.restore();
    };
    ring(0, 0.95, 1500, 26, [[0, pal.violet], [1, pal.cyan]], 1);
    ring(0.07, 0.8, 1250, 8, [[0, '#ffffff'], [1, pal.magenta]], 0.8);
    ring(0.16, 0.7, 800, 4, [[0, pal.cyan], [1, pal.violet]], 0.6);

    // main burst
    sparks(ctx, gt, T_SLAM, CX, TM, 190, 1, { a0: 0, a1: 6.2832, sMin: 300, sMax: 2300, pow: 1.6, drag: 3.2, grav: 380, lifeMin: 0.4, lifeMax: 1.3 });
    // embers that linger
    sparks(ctx, gt, T_SLAM + 0.05, CX, TM, 40, 2, { a0: 0, a1: 6.2832, sMin: 120, sMax: 650, pow: 1, drag: 1.6, grav: -60, lifeMin: 0.9, lifeMax: 2.0, alpha: 0.8 });
    // per-letter landing dust
    TITLE.letters.forEach((Lt, n) => sparks(ctx, gt, landT(n), Lt.cx, LAY.titleBase + 4, 14, 10 + n, { a0: -2.9, a1: -0.25, sMin: 220, sMax: 900, pow: 1.3, drag: 5, grav: 1500, lifeMin: 0.25, lifeMax: 0.6, alpha: 0.9 }));
    // snap burst for SCAFFOLD
    sparks(ctx, gt, T_SNAP, CX, LAY.scBase - 40, 40, 30, { a0: -3.5, a1: 0.35, sMin: 300, sMax: 1400, pow: 1.5, drag: 4.5, grav: 900, lifeMin: 0.3, lifeMax: 0.7, alpha: 0.8 });
  }

  // ───────────────────────────── backdrop: spotlight + end-card ambience ─────────────────────────────
  function drawBackdrop(ctx, gt) {
    const rev = clamp((gt - T_SLAM) / 0.7);
    const pre = clamp((gt - T_START) / 0.3);
    const hit = hitAt(H_SLAM, gt, 4);
    // colour grade: pull the shared background's green-teal toward violet-ink (multiply cuts G, keeps the film one palette)
    const gr = ease.outCubic(clamp((gt - 12.0) / 0.4));
    if (gr > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = gr;
      const gg = ctx.createRadialGradient(CX, 520, 200, CX, 520, 1250);
      gg.addColorStop(0, 'rgb(255,255,255)'); gg.addColorStop(0.6, 'rgb(205,170,255)'); gg.addColorStop(1, 'rgb(150,110,235)');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const a = (0.5 * ease.outCubic(rev) + 0.1 * pre) * (0.92 + 0.08 * Math.sin(gt * 1.4)) + 0.25 * hit;
    ctx.save(); ctx.translate(CX, 470); ctx.scale(1.55, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 560);
    g.addColorStop(0, `rgba(120,95,255,${0.30 * a})`); g.addColorStop(0.45, `rgba(60,110,230,${0.12 * a})`); g.addColorStop(1, 'rgba(30,200,200,0)');
    ctx.fillStyle = g; ctx.fillRect(-560, -560, 1120, 1120); ctx.restore();
    // cool counter-light low
    const g2 = ctx.createRadialGradient(CX, 1000, 0, CX, 1000, 700);
    g2.addColorStop(0, `rgba(110,130,255,${0.10 * rev})`); g2.addColorStop(1, 'rgba(46,230,214,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 300, W, 780);
    ctx.restore();

    // end-card dust: slow rising motes, two depth layers, additive
    const amb = ease.outCubic(clamp((gt - 12.5) / 1.2));
    if (amb > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 46; i++) {
        const z = 0.35 + hash(i * 3.7) * 0.9;
        const x = hash(i * 1.9) * W + Math.sin(gt * 0.4 * z + i) * 26 * z;
        const y = (((hash(i * 5.3) * H * 1.2 - gt * 18 * z) % (H * 1.2)) + H * 1.2) % (H * 1.2) - H * 0.1;
        const tw = 0.5 + 0.5 * Math.sin(gt * 1.7 + i * 2.1);
        ctx.globalAlpha = amb * (0.12 + 0.4 * tw) * z;
        ctx.fillStyle = i % 2 ? pal.cyan : '#b8a8ff';
        ctx.beginPath(); ctx.arc(x, y, 1.2 + 2.0 * z, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ───────────────────────────── frame furniture (brackets + micro labels) ─────────────────────────────
  function drawFrame(ctx, gt) {
    const p = ease.outExpo(clamp((gt - 13.0) / 0.6)); if (p <= 0) return;
    const ins = 92, arm = 44 * p, lab = clamp((gt - 13.25) / 0.5);
    ctx.save(); ctx.strokeStyle = 'rgba(210,218,255,0.45)'; ctx.lineWidth = 2; ctx.lineCap = 'square';
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = sx > 0 ? ins : W - ins, y = sy > 0 ? ins : H - ins;
      ctx.beginPath(); ctx.moveTo(x + sx * arm, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * arm); ctx.stroke();
    }
    ctx.font = font(20, 500, 'mono'); ctx.letterSpacing = '3px'; ctx.fillStyle = '#c9d0ea'; ctx.globalAlpha = lab * 0.78; ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillText('29 PROFILES', ins + 62, ins + 1); ctx.fillText('SUPERPOWERS + SERENA', ins + 64, H - ins - 1);
    ctx.textAlign = 'right'; ctx.fillText('ZERO APP CODE TOUCHED', W - ins - 64 + 3, ins + 1); ctx.fillText('ROLE AGENTS + MCP', W - ins - 64 + 3, H - ins - 1);
    ctx.restore();
  }

  // ───────────────────────────── final light sweep ─────────────────────────────
  // The band's CENTRE crosses the lockup centre exactly at T_SWEEP (13.80): linear travel over 0.7s (13.45 -> 14.15).
  let sweepLayer = null;
  const SW_DUR = 0.7, SW_T0 = T_SWEEP - SW_DUR / 2;
  function drawSweep(ctx, gt) {
    const p = clamp((gt - SW_T0) / SW_DUR); if (p <= 0 || p >= 1) return;
    if (!sweepLayer) sweepLayer = mkCanvas(W, H);
    const ang = 28 * Math.PI / 180, dx = Math.cos(ang), dy = Math.sin(ang);
    const L = W * dx + H * dy;
    const sC = CX * dx + 540 * dy;                       // projection of the lockup centre on the sweep axis
    const s = sC + (p - 0.5) * 2200;                     // linear: -1100 .. +1100 around the centre
    // gradient along the sweep axis; `band` = half-width, tint optional
    const sg = (alpha, band, c0 = '255,255,255', c1 = c0) => {
      const g = ctx.createLinearGradient(0, 0, dx * L, dy * L); const c = (v) => clamp(v / L);
      g.addColorStop(0, `rgba(${c0},0)`); g.addColorStop(c(s - band), `rgba(${c0},0)`);
      g.addColorStop(c(s), `rgba(255,255,255,${alpha})`); g.addColorStop(c(s + band), `rgba(${c1},0)`); g.addColorStop(1, `rgba(${c1},0)`);
      return g;
    };
    const lc = sweepLayer.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1; lc.clearRect(0, 0, W, H);
    drawLockup(lc, gt);
    lc.globalCompositeOperation = 'destination-in'; lc.fillStyle = sg(1, 260); lc.fillRect(0, 0, W, H);
    lc.globalCompositeOperation = 'source-over';
    const env = Math.pow(Math.sin(p * Math.PI), 0.6);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7 * env; for (let k = 0; k < 2; k++) ctx.drawImage(sweepLayer, 0, 0); // re-lit lockup inside the band
    ctx.globalAlpha = 0.20 * env; ctx.fillStyle = sg(1, 300, '139,107,255', '46,230,214'); ctx.fillRect(0, 0, W, H); // brand-tinted haze
    ctx.globalAlpha = 0.38 * env; ctx.fillStyle = sg(1, 34); ctx.fillRect(0, 0, W, H);                               // crisp white glint core
    ctx.restore();
  }

  // ───────────────────────────── closing: ENTER ping -> light climbs to the mark ─────────────────────────────
  function drawEnter(ctx, gt) {
    const dt = gt - T_ENT; if (dt < 0 || dt > 0.9) return;
    const fullW = PILL.fullW, y = LAY.pillY;
    ctx.save(); lockupXform(ctx, gt); ctx.globalCompositeOperation = 'lighter';
    // two rounded-rect shock rings expanding off the pill
    for (let r = 0; r < 2; r++) {
      const d = dt - r * 0.08; if (d < 0) continue;
      const k = ease.outExpo(clamp(d / 0.7)), e = 14 + 190 * k, hh = LAY.pillH / 2 + e * 0.5;
      ctx.globalAlpha = (0.85 - r * 0.3) * Math.pow(1 - clamp(d / 0.7), 1.5); ctx.lineWidth = 4 * (1 - k) + 1.2;
      ctx.strokeStyle = lg(ctx, CX - fullW / 2 - e, 0, CX + fullW / 2 + e, 0, [[0, pal.violet], [1, pal.cyan]]);
      ctx.shadowColor = pal.violet; ctx.shadowBlur = 24;
      rr(ctx, CX - fullW / 2 - e, y - hh, fullW + 2 * e, hh * 2, hh); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // pill flash
    ctx.globalAlpha = 0.28 * Math.exp(-dt * 12); ctx.fillStyle = lg(ctx, CX - fullW / 2, 0, CX + fullW / 2, 0, [[0, pal.violet], [1, pal.cyan]]);
    rr(ctx, CX - fullW / 2, y - LAY.pillH / 2, fullW, LAY.pillH, LAY.pillH / 2); ctx.fill();
    // light packet climbing the centre line from the pill to the mark (accelerating), with a fading tail
    const kp = ease.inQuad(clamp((gt - T_ENT - 0.02) / (T_MARK2 - T_ENT - 0.02)));
    if (kp > 0 && kp < 1) {
      const y0 = y - LAY.pillH / 2 - 4, y1 = LAY.markY + MR * 0.6, hy = lerp(y0, y1, kp);
      for (let i = 0; i < 16; i++) {
        const ty = hy + i * 14 * (0.4 + kp), a = (1 - i / 16);
        ctx.globalAlpha = 0.9 * a; ctx.fillStyle = i ? pal.cyan : '#fff';
        ctx.beginPath(); ctx.arc(CX + Math.sin(i * 0.9 + gt * 30) * 1.5, ty, 7 * a + 1.5, 0, 7); ctx.fill();
      }
      glowDot(ctx, CX, hy, 56, 0.8, '140,170,255');
    }
    ctx.restore();
    ctx.save(); lockupXform(ctx, gt);
    sparks(ctx, gt, T_ENT, CX, y - 34, 46, 60, { a0: -2.7, a1: -0.45, sMin: 260, sMax: 1100, pow: 1.3, drag: 4, grav: 700, lifeMin: 0.3, lifeMax: 0.8, alpha: 0.9 });
    sparks(ctx, gt, T_MARK2, CX, LAY.markY, 40, 61, { a0: 0, a1: 6.2832, sMin: 200, sMax: 900, pow: 1.4, drag: 4, grav: 200, lifeMin: 0.2, lifeMax: 0.22, alpha: 0.9 });
    ctx.restore();
  }

  // ───────────────────────────── scene ─────────────────────────────
  ENN.scene({
    id: 's5',
    draw(ctx, lt, gt) {
      if (!TITLE) buildTitle();
      ctx.save(); ctx.letterSpacing = '0px'; ctx.textAlign = 'left';
      drawBackdrop(ctx, gt);
      drawAnticipation(ctx, gt);
      drawLockup(ctx, gt);
      drawSweep(ctx, gt);
      drawBurst(ctx, gt);
      drawEnter(ctx, gt);
      drawFrame(ctx, gt);
      ctx.restore();
    },
  });
})();
