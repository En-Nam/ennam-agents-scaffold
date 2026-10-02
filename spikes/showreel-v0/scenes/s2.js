// SCENE 2 — "WIZARD"  (global 2.6 -> 6.0)
//   Part A  3.0 -> ~4.8   three slot-machine reels lock on the beat (3.20 / 3.90 / 4.60) and fly into a breadcrumb
//   Part B  ~4.8 -> 5.75  camera pulls back out of the wizard into the install flow graph, the chosen path lights,
//                         then the whole graph implodes to a single point on hit[5] (5.75) -> hand-off to s3.
// Pure function of time: everything below is analytic in (gt).
(function () {
  'use strict';
  const { W, H, clamp, lerp, ease, prog, rr, pal, font, glow, glass, text, measure, hitEnergy, hash, brand } = ENN;
  const CX = W / 2, CY = H / 2;
  const mod = (a, n) => ((a % n) + n) % n;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const VIO = [139, 107, 255], CYA = [46, 230, 214], MINT = [93, 255, 160];
  const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ───────────────────────── soft-light sprites (batched glow without shadowBlur) ─────────────────────────
  function makeSprite(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
  }
  const SPR = {
    white: makeSprite([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.85)'], [0.55, 'rgba(190,200,255,0.22)'], [1, 'rgba(150,150,255,0)']]),
    cyan: makeSprite([[0, 'rgba(210,255,250,1)'], [0.25, 'rgba(46,230,214,0.8)'], [0.6, 'rgba(46,230,214,0.18)'], [1, 'rgba(46,230,214,0)']]),
    violet: makeSprite([[0, 'rgba(235,225,255,1)'], [0.25, 'rgba(139,107,255,0.8)'], [0.6, 'rgba(139,107,255,0.18)'], [1, 'rgba(139,107,255,0)']]),
  };
  const spot = (ctx, s, x, y, r, a) => { ctx.globalAlpha = a; ctx.drawImage(s, x - r, y - r, r * 2, r * 2); };

  // ───────────────────────── PART A: wizard ─────────────────────────
  const PANEL = { x: 540, y: 270, w: 840, h: 600 };
  const BAND = { x: 600, w: 720, h: 84, cy: 600 };
  const CLIP = { y: 392, h: 416 };
  const RH = 78, DRUM_R = 2.83 * RH;
  const STEPS = [
    { no: '01', title: 'ROLE', lock: 3.20, spin: 0.50, D: 22, idx: 0,
      items: ['Developer', 'QA-QC', 'BA', 'PM', 'Tech-Writer', 'Data', 'HR', 'DevOps', 'Game-Dev', 'Agent-Org'] },
    { no: '02', title: 'PROJECT', lock: 3.90, spin: 0.56, D: 13, idx: 1, items: ['Local-root', 'Existing repository', null, null, null] }, // null = skeleton row (placeholder option) so a 2-item list doesn't visibly loop
    { no: '03', title: 'STACK', lock: 4.60, spin: 0.56, D: 17, idx: 0,
      items: ['Next.js', 'React Vite SPA', 'React Native Expo', 'Flutter', 'Python', 'Go', '.NET MVC', 'Express.js'] },
  ];
  STEPS.forEach((s) => { s.choice = s.items[s.idx]; });
  const LAST = STEPS.length - 1;

  const WS = 1.1; // wizard base scale (about screen centre); the panel recedes + fades from PB_T0 while the chips fly out into the graph
  const PB_T0 = 4.66;

  // reel position in rows. Normalised expo-out so it lands EXACTLY on the choice at the lock time, then a damped wobble.
  function reelPos(st, gt) {
    const u = clamp((gt - (st.lock - st.spin)) / st.spin);
    const e = (1 - Math.pow(2, -7 * u)) / (1 - Math.pow(2, -7));
    const dt = gt - st.lock;
    const wob = dt > 0 ? 0.13 * Math.exp(-dt * 15) * Math.sin(dt * 44) : 0;
    return st.idx - st.D * (1 - e) + wob;
  }
  const reelSpeed = (st, gt) => Math.abs(reelPos(st, gt) - reelPos(st, gt - 0.01)) / 0.01 * RH; // px/s

  function reelState(i, gt) {
    const st = STEPS[i], start = st.lock - st.spin;
    const enter = clamp((gt - (i === 0 ? start : Math.max(start, STEPS[i - 1].lock + 0.2))) / 0.16);
    const exit = i === LAST ? 0 : clamp((gt - (st.lock + 0.14)) / 0.18);   // chosen label is held ~8 frames so the choice can be READ
    return { enter, exit, alpha: ease.outQuad(enter) * (1 - ease.inQuad(exit)),
      yShift: (1 - ease.outCubic(enter)) * 70 - ease.inCubic(exit) * 80, pos: reelPos(st, gt), speed: reelSpeed(st, gt) };
  }

  // ghost numerals — the parallax backdrop. returns centre x (global slide in/out) for step i
  function numeralX(i, gt) {
    const inT = i === 0 ? 2.76 : STEPS[i - 1].lock + 0.16;
    const inP = clamp((gt - inT) / 0.6), outP = i === LAST ? 0 : clamp((gt - (STEPS[i].lock + 0.03)) / 0.42);
    return CX + (1 - ease.outExpo(inP)) * 1250 - ease.inOutCubic(outP) * 1400;
  }
  function drawNumerals(ctx, gt) {
    for (let i = 0; i < STEPS.length; i++) {
      const x = numeralX(i, gt); if (x < -900 || x > W + 900) continue;
      const v = (x - numeralX(i, gt - 0.012)) / 0.012;            // px/s, for the echo smear
      const a0 = i === 0 ? sm(2.7, 3.05, gt) : 1;
      const echoes = Math.abs(v) > 400 ? 3 : 0;
      for (let k = echoes; k >= 0; k--) {
        const ex = x - v * 0.011 * k, al = k === 0 ? 1 : 0.22 / k;
        ctx.save(); ctx.globalAlpha *= a0 * al;
        ctx.font = font(1000, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '-20px';
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillText(STEPS[i].no, ex, 905);
        ctx.lineWidth = 2.5; ctx.strokeStyle = brand(ctx, ex - 500, 200, ex + 500, 900, 'rgba(139,107,255,0.45)', 'rgba(46,230,214,0.35)');
        ctx.strokeText(STEPS[i].no, ex, 905);
        ctx.restore();
      }
    }
  }

  function drawBrackets(ctx, gt) {
    const e = hitEnergy(gt, 10), k = ease.outExpo(prog(gt, 2.8, 0.6, (v) => v));
    const off = 16 + (1 - k) * 34 + Math.min(e, 1) * 8, L = 38;
    ctx.save(); ctx.globalAlpha *= 0.85 * k; ctx.strokeStyle = pal.cyan; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.shadowColor = pal.cyan; ctx.shadowBlur = 14;
    const { x, y, w, h } = PANEL;
    for (const [cx, cy, sx, sy] of [[x - off, y - off, 1, 1], [x + w + off, y - off, -1, 1], [x - off, y + h + off, 1, -1], [x + w + off, y + h + off, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(cx + sx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * L); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeader(ctx, gt) {
    for (let i = 0; i < STEPS.length; i++) {
      const st = STEPS[i], inT = i === 0 ? 2.86 : STEPS[i - 1].lock + 0.2;
      const ai = ease.outExpo(clamp((gt - inT) / 0.4)), ao = i === LAST ? 0 : ease.inCubic(clamp((gt - (st.lock + 0.03)) / 0.16));
      const al = ai * (1 - ao); if (al < 0.003) continue;
      const dy = (1 - ai) * 30 - ao * 30, y = PANEL.y + 78 + dy;
      ctx.save(); ctx.globalAlpha *= al;
      ctx.fillStyle = brand(ctx, 0, 0, 1, 0, pal.violet, pal.cyan); // accent tick
      rr(ctx, PANEL.x + 44, y - 32, 6, 38, 3); ctx.fillStyle = brand(ctx, 0, y - 32, 0, y + 6, pal.violet, pal.cyan); ctx.fill();
      text(ctx, st.title, PANEL.x + 66, y, { f: font(40, 700), fill: pal.text, track: 9 });
      text(ctx, `STEP ${st.no} / 03`, PANEL.x + PANEL.w - 44, y - 4, { f: font(24, 500, 'mono'), fill: '#b4bcd0', align: 'right', track: 2 });
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= 0.9; // hairline divider under the header
    ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fillRect(PANEL.x + 30, PANEL.y + 112, PANEL.w - 60, 1.5); ctx.restore();
  }

  function drawReel(ctx, i, gt) {
    const st = STEPS[i], r = reelState(i, gt); if (r.alpha < 0.003) return;
    const dtL = gt - st.lock;
    // speed streaks scroll with the reel itself
    const sp = clamp(r.speed / 3500);
    if (sp > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 22; k++) {
        const x = PANEL.x + 40 + hash(k * 3.7 + i) * (PANEL.w - 80), len = 70 + hash(k * 9.1) * 160;
        const y = CLIP.y + mod(hash(k * 5.3) * 520 - r.pos * RH * (1.6 + hash(k) * 1.4) * 2, CLIP.h + len) - len;
        const g = ctx.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, 'rgba(139,107,255,0)'); g.addColorStop(0.7, rgba(k % 2 ? CYA : VIO, 0.5 * sp * r.alpha)); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, 2, len);
      }
      ctx.restore();
    }
    // ----- selection band
    const settle = sm(st.lock, st.lock + 0.2, gt), flash = dtL >= 0 ? Math.exp(-dtL * 9) : 0;
    const bandY = BAND.cy + r.yShift * 0.3;
    ctx.save(); ctx.globalAlpha *= r.alpha;
    const sx = 1 + (dtL >= 0 ? 0.045 * Math.exp(-dtL * 11) * Math.cos(dtL * 30) : 0);
    ctx.translate(CX, bandY); ctx.scale(sx, 1 + (sx - 1) * 1.5); ctx.translate(-CX, -bandY);
    const bx = BAND.x, by = bandY - BAND.h / 2;
    const fillA = 0.10 + 0.24 * settle + 0.3 * flash;
    rr(ctx, bx, by, BAND.w, BAND.h, 18);
    const bg = ctx.createLinearGradient(bx, 0, bx + BAND.w, 0);
    bg.addColorStop(0, rgba(VIO, fillA)); bg.addColorStop(1, rgba(CYA, fillA * 0.85));
    if (settle > 0.01) { ctx.shadowColor = rgba(mixRGB(VIO, CYA, 0.5), 0.9); ctx.shadowBlur = 34 * settle + 36 * flash; }
    ctx.fillStyle = bg; ctx.fill(); ctx.shadowBlur = 0;
    rr(ctx, bx + 0.5, by + 0.5, BAND.w - 1, BAND.h - 1, 18); ctx.lineWidth = 1.5 + 1.5 * settle;
    ctx.strokeStyle = brand(ctx, bx, 0, bx + BAND.w, 0, `rgba(139,107,255,${0.35 + 0.65 * settle})`, `rgba(46,230,214,${0.35 + 0.65 * settle})`); ctx.stroke();
    ctx.restore();

    // ----- lock FX (all driven by dtL). Drawn BEHIND the label: the ring starts on the band's edge and expands OUTWARD,
    //       so it never crosses the selected word; it is ~gone 3 frames after the hit.
    if (dtL >= 0 && dtL < 0.5) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const dk = dtL - k * 0.045, uk = clamp(dk / 0.3); if (dk < 0 || uk >= 1) continue;
        const o = lerp(0, 120, ease.outExpo(uk));
        ctx.globalAlpha = 0.9 * Math.exp(-dk * 26) * r.alpha; ctx.lineWidth = lerp(6, 1.5, uk);
        ctx.strokeStyle = brand(ctx, BAND.x - o, 0, BAND.x + BAND.w + o, 0, pal.violet, pal.cyan);
        rr(ctx, BAND.x - o, bandY - BAND.h / 2 - o * 0.8, BAND.w + 2 * o, BAND.h + 1.6 * o, 18 + o * 0.45); ctx.stroke();
      }
      // flash lines ride the band's top and bottom edges (not the text line)
      const hw = lerp(0, 700, ease.outExpo(clamp(dtL / 0.22)));
      const lg = ctx.createLinearGradient(CX - hw, 0, CX + hw, 0);
      lg.addColorStop(0, 'rgba(46,230,214,0)'); lg.addColorStop(0.5, `rgba(255,255,255,${0.5 * Math.exp(-dtL * 14)})`); lg.addColorStop(1, 'rgba(139,107,255,0)');
      ctx.globalAlpha = r.alpha; ctx.fillStyle = lg;
      ctx.fillRect(CX - hw, bandY - BAND.h / 2 - 1.5, hw * 2, 3); ctx.fillRect(CX - hw, bandY + BAND.h / 2 - 1.5, hw * 2, 3);
      // sparks from both band ends
      ctx.globalAlpha = 1;
      for (let j = 0; j < 18; j++) {
        const sd = j % 2 ? 1 : -1, ox = CX + sd * (BAND.w / 2 - 10), ang = (hash(j * 4.1 + i * 9) - 0.5) * 1.2;
        const v = 350 + hash(j * 7.7 + i) * 700, dd = v * (1 - Math.exp(-6 * dtL)) / 6, life = 1 - clamp(dtL / (0.35 + hash(j) * 0.25));
        if (life <= 0) continue;
        spot(ctx, j % 3 === 0 ? SPR.white : j % 3 === 1 ? SPR.cyan : SPR.violet, ox + sd * Math.cos(ang) * dd, bandY + Math.sin(ang) * dd * 0.9 + 60 * dtL * dtL, 4 + 8 * life, life);
      }
      ctx.restore();
    }

    // ----- rows on a virtual drum (cos squash + fade -> 3D feel)
    const rowsAlpha = r.alpha;
    const speedPx = r.speed, nearestSlot = Math.round(r.pos);
    const fadeOthers = 1 - 0.8 * sm(st.lock + 0.04, st.lock + 0.3, gt);
    for (let slot = Math.floor(r.pos) - 5; slot <= Math.ceil(r.pos) + 5; slot++) {
      const d = (slot - r.pos) * RH, a = d / DRUM_R; if (Math.abs(a) > 1.32) continue;
      const sc = Math.cos(a), y = bandY + DRUM_R * Math.sin(a);
      const item = st.items[mod(slot, st.items.length)];
      const isChosen = slot === nearestSlot && gt >= st.lock - 0.02;
      const near = clamp(1 - Math.abs(d) / (RH * 0.75));
      let al = Math.pow(sc, 2.2) * rowsAlpha * (isChosen || gt < st.lock ? 1 : fadeOthers);
      if (isChosen && i < LAST) al *= 1 - sm(st.lock + 0.15, st.lock + 0.21, gt);   // handed over to the flying chip (3-frame crossfade)
      if (al < 0.01) continue;
      const echoes = speedPx > 600 ? 3 : 0;
      for (let k = echoes; k >= 0; k--) {
        const ey = y + k * Math.min(speedPx, 4000) * 0.0075, ea = k === 0 ? 1 : 0.2 / k;
        ctx.save(); ctx.translate(CX, ey); ctx.scale(1, sc);
        if (item === null) { // skeleton option row
          const sw = 170 + hash(slot * 3.3 + i) * 190; rr(ctx, -sw / 2, -8, sw, 16, 8);
          ctx.fillStyle = 'rgba(190,200,235,1)'; ctx.globalAlpha *= al * ea * 0.2; ctx.fill(); ctx.restore(); continue;
        }
        text(ctx, item, 0, 0, { f: font(42, 600), fill: pal.dim, align: 'center', base: 'middle', track: 1, alpha: al * ea * (1 - near * 0.7) });
        text(ctx, item, 0, 0, { f: font(42, 700), fill: '#fff', align: 'center', base: 'middle', track: 1, alpha: al * ea * near });
        ctx.restore();
      }
    }

    // check pop
    const cp = gt - (st.lock + 0.05);
    if (cp > 0) {
      const sc = ease.spring(clamp(cp / 0.4), 11) * (i < LAST ? 1 - sm(st.lock + 0.15, st.lock + 0.21, gt) : 1);
      ctx.save(); ctx.translate(BAND.x + BAND.w - 50, bandY); ctx.scale(sc, sc); ctx.globalAlpha *= r.alpha;
      ctx.shadowColor = pal.mint; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(0, 0, 19, 0, 7);
      ctx.fillStyle = brand(ctx, -19, -19, 19, 19, pal.mint, pal.cyan); ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-2, 7); ctx.lineTo(9, -7); ctx.lineWidth = 4; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#06100e'; ctx.stroke();
      ctx.restore();
    }
  }

  // ───────── breadcrumb chips: slide out of the band, dock above the panel, then FLY into the graph and BECOME its nodes
  const CHIP_Y = 205, CHIP_F = font(26, 600), SEP_W = 40, CHIP_H = 50;
  const wz = (x, y) => [CX + (x - CX) * WS, CY + (y - CY) * WS];      // wizard space -> screen space
  function chipLayout(ctx) {
    let x = PANEL.x; const out = [];
    STEPS.forEach((s) => { const w = measure(ctx, s.choice, CHIP_F, 0.5) + 52; out.push({ x, w }); x += w + SEP_W; });
    return out;
  }
  // [depart, land] of the flight into the graph. land == pop time of the matching graph node (it takes over seamlessly)
  const FLY = [[4.70, 4.95], [4.72, 5.15], [STEPS[LAST].lock + 0.16, 5.29]];
  function chipPose(i, g, lay) {
    const st = STEPS[i], L = lay[i], t0 = st.lock + 0.16, [td, tl] = FLY[i];
    if (g < td) {                                                      // phase 1: band -> breadcrumb dock
      const u = clamp((g - t0) / 0.5), e = ease.outQuart(u);
      const [sx, sy] = wz(lerp(CX, L.x + L.w / 2, e), lerp(BAND.cy, CHIP_Y, e) - Math.sin(Math.PI * e) * 46);
      return { x: sx, y: sy, sc: lerp(1.65, 1, ease.outCubic(u)) * WS };
    }
    const a = i < LAST ? { p: wz(L.x + L.w / 2, CHIP_Y), sc: WS } : { p: wz(CX, BAND.cy), sc: 1.65 * WS };
    const F = gframe(g), n = CHIP_NODES[i], T = P(F, n.x, n.y, 0);
    const u = clamp((g - td) / (tl - td)), e = ease.inOutQuart(u);   // phase 2: breadcrumb -> graph node, in an arc (chip 3 bows under, the others over: no collision)
    return { x: lerp(a.p[0], T[0], e), y: lerp(a.p[1], T[1], e) - Math.sin(Math.PI * e) * (i === LAST ? -70 : 90), sc: lerp(a.sc, F.s, ease.outCubic(u)) };
  }
  function drawChipBody(ctx, st, L, p, alpha, lf) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.sc, p.sc); ctx.globalAlpha *= alpha;
    glass(ctx, -L.w / 2, -CHIP_H / 2, L.w, CHIP_H, CHIP_H / 2, { fill: `rgba(${lerp(30, 90, lf) | 0},${lerp(30, 70, lf) | 0},${lerp(60, 170, lf) | 0},0.82)`,
      border: 'rgba(139,107,255,0.9)', glowColor: rgba(VIO, 0.35 + 0.5 * lf), glowBlur: 18 + 24 * lf });
    ctx.beginPath(); ctx.arc(-L.w / 2 + 24, 0, 6, 0, 7); ctx.fillStyle = pal.mint; ctx.shadowColor = pal.mint; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
    text(ctx, st.choice, -L.w / 2 + 40, 0, { f: CHIP_F, fill: '#fff', base: 'middle', track: 0.5 });
    ctx.restore();
  }
  function drawChips(ctx, gt) {
    const lay = chipLayout(ctx);
    STEPS.forEach((st, i) => {
      const t0 = st.lock + 0.16, [td, tl] = FLY[i]; if (gt < t0) return;
      const L = lay[i];
      if (i < LAST) { // chevron separator, gone as the chips depart
        const sa = sm(t0 + 0.32, t0 + 0.55, gt) * (1 - sm(td - 0.02, td + 0.1, gt)), [cx, cy] = wz(L.x + L.w + SEP_W / 2, CHIP_Y + 1);
        if (sa > 0.01) text(ctx, '›', cx, cy, { f: font(34 * WS, 500), fill: pal.cyan, align: 'center', base: 'middle', alpha: sa * 0.9 });
      }
      if (gt >= tl) return;
      const p = chipPose(i, gt, lay), landT = t0 + 0.5, land = gt - landT;
      const pop = i < LAST && land > 0 && gt < td ? 1 + 0.1 * Math.exp(-land * 13) * Math.cos(land * 34) : 1;
      const lf = i < LAST && land > 0 && gt < td ? Math.exp(-land * 7) : gt >= td ? 0.45 : 0;
      if (gt > td) { // motion echoes while in flight
        for (let k = 3; k >= 1; k--) {
          const q = chipPose(i, gt - 0.014 * k, lay); ctx.save(); ctx.translate(q.x, q.y); ctx.scale(q.sc, q.sc);
          rr(ctx, -L.w / 2, -CHIP_H / 2, L.w, CHIP_H, CHIP_H / 2); ctx.globalAlpha *= 0.2 / k; ctx.fillStyle = 'rgba(160,140,255,1)'; ctx.fill(); ctx.restore();
        }
      }
      drawChipBody(ctx, st, L, { x: p.x, y: p.y, sc: p.sc * pop }, clamp((gt - t0) / 0.05), lf);
    });
  }

  function drawProgress(ctx, gt) {
    const segW = 150, gap = 14, x0 = CX - (3 * segW + 2 * gap) / 2, y = PANEL.y + PANEL.h - 40;
    for (let i = 0; i < 3; i++) {
      const st = STEPS[i], x = x0 + i * (segW + gap);
      ctx.save(); rr(ctx, x, y, segW, 6, 3); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
      const active = clamp((gt - (st.lock - st.spin)) / st.spin) * 0.4;
      const done = gt >= st.lock ? ease.outBack(clamp((gt - st.lock) / 0.3)) : 0;
      const f = Math.max(active * (done > 0 ? 0 : 1), done) * (gt >= st.lock - st.spin ? 1 : 0);
      if (f > 0.001) {
        rr(ctx, x, y, segW * Math.min(f, 1.04), 6, 3);
        ctx.fillStyle = brand(ctx, x, 0, x + segW, 0, pal.violet, pal.cyan); ctx.shadowColor = pal.cyan; ctx.shadowBlur = done > 0 ? 14 : 4; ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawWizard(ctx, gt, alpha, scale) {
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.translate(CX, CY); ctx.scale(scale, scale); ctx.translate(-CX, -CY);
    drawNumerals(ctx, gt);
    // panel
    const pa = prog(gt, 2.70, 0.35, ease.outCubic), ps = lerp(0.9, 1, ease.outBack(clamp((gt - 2.70) / 0.55)));
    const kick = 1 + 0.03 * Math.min(hitEnergy(gt, 12), 1);
    ctx.save(); ctx.globalAlpha *= pa;
    ctx.translate(CX, PANEL.y + PANEL.h / 2); ctx.scale(ps * kick, ps * kick); ctx.translate(-CX, -(PANEL.y + PANEL.h / 2));
    glass(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 30, { fill: 'rgba(12,15,26,0.62)', border: 'rgba(255,255,255,0.16)', glowColor: 'rgba(139,107,255,0.35)', glowBlur: 80 });
    drawBrackets(ctx, gt);
    drawHeader(ctx, gt);
    ctx.save(); ctx.beginPath(); ctx.rect(PANEL.x + 2, CLIP.y, PANEL.w - 4, CLIP.h); ctx.clip();
    for (let i = 0; i < STEPS.length; i++) drawReel(ctx, i, gt);
    ctx.restore();
    drawProgress(ctx, gt);
    ctx.restore();
    ctx.restore();
  }

  // ───────────────────────── PART B: flow graph (chips become nodes, graph fills the frame, then implodes) ─────────────────────────
  const CV0 = 5.50, CV1 = 5.75;   // convergence window — ends exactly on hit[5] (5.75)
  const HIT = 5.75;
  const MC = document.createElement('canvas').getContext('2d');
  const F_PILL = font(26, 600), F_PILLB = font(26, 700), F_START = font(26, 700, 'mono'), F_PROF = font(28, 700);
  const mw = (str, f) => measure(MC, str, f, 0.4);
  const GY = 560, PITCH = 66, PH = 54, HEXH = 76, PAD = 30;
  const ROLES = ['Tech-Writer', 'PM', 'BA', 'QA-QC', 'Developer', 'Data', 'HR', 'DevOps', 'Game-Dev', 'Agent-Org'];
  const STACKS = ['Flutter', 'React Native Expo', 'React Vite SPA', 'Next.js', 'Python', 'Go', '.NET MVC', 'Express.js'];
  const wMax = (arr, f) => Math.max(...arr.map((s) => mw(s, f))) + PAD * 2;
  const COL = { start: 96, roleQ: mw('Role?', F_PILLB) + 84, roles: wMax(ROLES, F_PILLB), projQ: mw('Project?', F_PILLB) + 84,
    projs: wMax(['Existing repository', 'Local-root'], F_PILLB), stacks: wMax(STACKS, F_PILLB), prof: mw('next profile', F_PROF) + 52 };
  const GAPS = [44, 76, 56, 56, 68, 40];
  const colX = {}; { // left-to-right, centred as a whole
    const keys = ['start', 'roleQ', 'roles', 'projQ', 'projs', 'stacks', 'prof'];
    let total = GAPS.reduce((a, b) => a + b, 0); keys.forEach((k) => { total += COL[k]; });
    let x = (W - total) / 2; keys.forEach((k, j) => { colX[k] = x + COL[k] / 2; x += COL[k] + (GAPS[j] || 0); });
  }
  // timing table: chips land exactly when their node "pops"
  const T = { start: 4.70, roleQ: 4.78, fan1: 4.82, devLand: FLY[0][1], projQ: 5.02, fan2: 5.04, existLand: FLY[1][1], fan3: FLY[1][1] - 0.05, nextLand: FLY[2][1], prof: 5.34 };

  const NODES = [], EDGES = [], PATH_EDGES = [];
  const N = (o) => { NODES.push(o); return o; };
  const startN = N({ kind: 'start', x: colX.start, y: GY, w: COL.start, h: PH, label: 'npx', path: true, pop: T.start });
  const roleD = N({ kind: 'hex', x: colX.roleQ, y: GY, w: COL.roleQ, h: HEXH, label: 'Role?', path: true, pop: T.roleQ });
  const projD = N({ kind: 'hex', x: colX.projQ, y: GY, w: COL.projQ, h: HEXH, label: 'Project?', path: true, pop: T.projQ });
  const existN = N({ kind: 'pill', x: colX.projs, y: GY, w: COL.projs, h: PH, label: 'Existing repository', path: true, pop: T.existLand, chip: 1 });
  const localN = N({ kind: 'pill', x: colX.projs, y: GY + 76, w: COL.projs, h: PH, label: 'Local-root', path: false, pop: T.existLand + 0.04 });
  const profileN = N({ kind: 'profile', x: colX.prof, y: GY, w: COL.prof, h: 66, label: 'next profile', path: true, pop: T.prof });
  const CHIP_NODES = []; // node each chip becomes (index = wizard step)

  const bezPt = (a, b, u) => { // horizontal-tangent S-curve
    const dx = (b[0] - a[0]) * 0.55, x1 = a[0] + dx, x2 = b[0] - dx, v = 1 - u;
    return [v * v * v * a[0] + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * b[0],
      v * v * v * a[1] + 3 * v * v * u * a[1] + 3 * v * u * u * b[1] + u * u * u * b[1]];
  };
  const SAMP = 20;
  function addEdge(a, b, o) {
    const A = [a.x + a.w / 2, a.y], B = [b.x - b.w / 2, b.y], pts = [];
    for (let k = 0; k <= SAMP; k++) pts.push(bezPt(A, B, k / SAMP));
    const e = Object.assign({ a, b, A, B, pts, path: false, dur: 0.14, ph: hash(EDGES.length * 4.3), idx: EDGES.length }, o);
    EDGES.push(e); return e;
  }
  const rankBy = (names, ys) => names.slice().sort((p, q) => (Math.abs(ys[p] - GY) + (ys[p] > GY ? 1 : 0)) - (Math.abs(ys[q] - GY) + (ys[q] > GY ? 1 : 0)));
  const roleY = {}; ROLES.forEach((r, k) => { roleY[r] = GY + (k - 4) * PITCH; });
  const stackY = {}; STACKS.forEach((r, k) => { stackY[r] = GY + (k - 3) * PITCH; });

  PATH_EDGES.push(addEdge(startN, roleD, { path: true, t0: T.start + 0.04, dur: 0.12 }));
  const roleNodes = {};
  rankBy(ROLES, roleY).forEach((name, rank) => {
    const dev = name === 'Developer', t0 = T.fan1 + rank * 0.02;
    const n = N({ kind: 'pill', x: colX.roles, y: roleY[name], w: COL.roles, h: PH, label: name, path: dev, pop: dev ? T.devLand : t0 + 0.11, chip: dev ? 0 : null });
    roleNodes[name] = n;
    const e = addEdge(roleD, n, { path: dev, t0, dur: 0.14 }); if (dev) PATH_EDGES.push(e);
  });
  PATH_EDGES.push(addEdge(roleNodes.Developer, projD, { path: true, t0: T.devLand, dur: 0.12 }));
  PATH_EDGES.push(addEdge(projD, existN, { path: true, t0: T.fan2, dur: 0.12 }));
  addEdge(projD, localN, { t0: T.fan2 + 0.02, dur: 0.12 });
  const stackNodes = {};
  rankBy(STACKS, stackY).forEach((name, rank) => {
    const nx = name === 'Next.js', t0 = T.fan3 + rank * 0.018;
    const n = N({ kind: 'pill', x: colX.stacks, y: stackY[name], w: COL.stacks, h: PH, label: name, path: nx, pop: nx ? T.nextLand : t0 + 0.09, chip: nx ? 2 : null });
    stackNodes[name] = n;
    const e = addEdge(existN, n, { path: nx, t0, dur: 0.13 }); if (nx) PATH_EDGES.push(e);
  });
  PATH_EDGES.push(addEdge(stackNodes['Next.js'], profileN, { path: true, t0: T.nextLand - 0.01, dur: 0.12 }));
  const CHIP_NODES_ = [roleNodes.Developer, existN, stackNodes['Next.js']]; CHIP_NODES_.forEach((n, k) => { CHIP_NODES[k] = n; });
  PATH_EDGES.forEach((e, k) => { e.k = k; e.lit0 = e.t0 + 0.05; e.litDur = 0.13; });
  NODES.forEach((n) => { if (n.path) n.lit = n.pop + 0.02; });
  const PATH_COLOR_IDX = new Map([[startN, 0], [roleD, 1], [roleNodes.Developer, 2], [projD, 3], [existN, 4], [stackNodes['Next.js'], 5], [profileN, 6]]);

  // lanes: glass columns behind each option list (fills the vertical space, gives the graph structure)
  function laneOf(label, xc, w, ys, t) {
    const y0 = Math.min(...ys) - PH / 2 - 76, y1 = Math.max(...ys) + PH / 2 + 30;
    return { label, x0: xc - w / 2 - 26, x1: xc + w / 2 + 26, y0, y1, t };
  }
  const LANES = [
    laneOf('ROLE', colX.roles, COL.roles, ROLES.map((r) => roleY[r]), T.roleQ + 0.02),
    laneOf('PROJECT', colX.projs, COL.projs, [GY, GY + 76], T.projQ),
    laneOf('STACK', colX.stacks, COL.stacks, STACKS.map((r) => stackY[r]), T.existLand - 0.04),
  ];

  function gframe(gt) {
    const u0 = clamp((gt - CV0) / (CV1 - CV0)), c = ease.inQuart(u0);
    const s = lerp(1.14, 1, ease.outCubic(clamp((gt - PB_T0) / 0.7)));   // gentle pull-back while the graph builds
    return { s, c, ns: s * (1 - 0.85 * c), vis: 1 - sm(0.9, 1, c), dim: sm(5.25, 5.5, gt) };
  }
  function P(F, x, y, cc = F.c) { // graph space -> screen: camera scale, then straight radial implosion toward the core
    const bx = CX + (x - CX) * F.s, by = GY + (y - GY) * F.s;
    return [CX + (bx - CX) * (1 - cc), CY + (by - CY) * (1 - cc)];
  }

  const edgeDraw = (e, gt) => ease.outCubic(clamp((gt - e.t0) / e.dur));
  function tracePartial(ctx, e, F, dp) {
    const k = dp * SAMP, n = Math.floor(k), fr = k - n;
    let p = P(F, e.pts[0][0], e.pts[0][1]); ctx.moveTo(p[0], p[1]);
    for (let j = 1; j <= n; j++) { p = P(F, e.pts[j][0], e.pts[j][1]); ctx.lineTo(p[0], p[1]); }
    if (n < SAMP && fr > 0) {
      const a = e.pts[n], b = e.pts[n + 1]; p = P(F, lerp(a[0], b[0], fr), lerp(a[1], b[1], fr)); ctx.lineTo(p[0], p[1]);
    }
  }
  const pathColor = (k) => mixRGB(VIO, CYA, clamp(k / 6));

  function drawLanes(ctx, F, gt) {
    for (const L of LANES) {
      const a = sm(L.t, L.t + 0.2, gt) * F.vis; if (a < 0.01) continue;
      const [x0, y0] = P(F, L.x0, L.y0), [x1, y1] = P(F, L.x1, L.y1), [cx, ly] = P(F, (L.x0 + L.x1) / 2, L.y0 + 40);
      ctx.save(); ctx.globalAlpha = a * (1 - 0.3 * F.dim);
      rr(ctx, x0, y0, x1 - x0, y1 - y0, 24 * F.ns); ctx.fillStyle = 'rgba(20,24,42,0.46)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(190,200,255,0.16)'; ctx.stroke();
      text(ctx, L.label, cx, ly, { f: font(22 * F.ns, 600, 'mono'), fill: pal.text, align: 'center', base: 'middle', track: 5 * F.ns, alpha: 0.7 });
      ctx.restore();
    }
  }

  function drawEdges(ctx, F, gt) {
    const vis = F.vis; if (vis < 0.01) return;
    const dimMul = 1 - 0.4 * F.dim;
    // 1) all dim edges batched in one stroke
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, 2 * F.ns); ctx.strokeStyle = `rgba(165,178,225,${0.4 * dimMul * vis})`;
    ctx.beginPath();
    for (const e of EDGES) { const dp = edgeDraw(e, gt); if (dp > 0.001) tracePartial(ctx, e, F, dp); }
    ctx.stroke(); ctx.restore();
    // 2) packets (additive sprites)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const e of EDGES) {
      const dp = edgeDraw(e, gt); if (dp < 0.12 || gt > HIT - 0.01) continue;
      const cnt = e.path ? 2 : 1, rate = e.path ? 2.2 : 1.2;
      for (let q = 0; q < cnt; q++) {
        const u = mod((gt - e.t0) * rate + e.ph + q * 0.5, 1); if (u > dp) continue;
        const pt = bezPt(e.A, e.B, u), p = P(F, pt[0], pt[1]);
        spot(ctx, e.path ? SPR.white : (e.idx % 2 ? SPR.cyan : SPR.violet), p[0], p[1], (e.path ? 15 : 9) * F.ns, (e.path ? 0.95 : 0.6 * dimMul) * vis * Math.sin(Math.PI * clamp(u / Math.max(dp, 0.2))));
      }
    }
    ctx.restore();
    // 3) lit path with glow
    ctx.save(); ctx.lineCap = 'round';
    for (const e of PATH_EDGES) {
      const lp = ease.outCubic(clamp((gt - e.lit0) / e.litDur)); if (lp < 0.001) continue;
      const a = P(F, e.A[0], e.A[1]), b = P(F, e.B[0], e.B[1]);
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, rgba(pathColor(e.k), 1)); g.addColorStop(1, rgba(pathColor(e.k + 1), 1));
      ctx.strokeStyle = g; ctx.shadowColor = rgba(pathColor(e.k + 0.5), 0.95); ctx.shadowBlur = 22 * F.ns;
      ctx.globalAlpha = vis;
      ctx.lineWidth = 5 * F.ns; ctx.beginPath(); tracePartial(ctx, e, F, Math.min(lp, edgeDraw(e, gt))); ctx.stroke();
      // white-hot head
      const hp = bezPt(e.A, e.B, Math.min(lp, edgeDraw(e, gt))), hs = P(F, hp[0], hp[1]);
      ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'lighter';
      spot(ctx, SPR.white, hs[0], hs[1], 22 * F.ns, (lp < 0.999 ? 1 : 0.45 * Math.exp(-(gt - e.lit0 - e.litDur) * 6)) * vis);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  function nodeShape(ctx, n, w, h) {
    if (n.kind === 'hex') { // elongated hexagon = decision node (keeps the label wide enough for 26px type)
      const k = h * 0.5; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2 + k, -h / 2); ctx.lineTo(w / 2 - k, -h / 2);
      ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2 - k, h / 2); ctx.lineTo(-w / 2 + k, h / 2); ctx.closePath(); ctx.lineJoin = 'round';
    } else rr(ctx, -w / 2, -h / 2, w, h, n.kind === 'pill' || n.kind === 'start' ? 16 : h / 2);
  }
  function drawNode(ctx, n, F, gt) {
    const age = gt - n.pop; if (age < 0) return;
    const [x, y] = P(F, n.x, n.y), isChip = n.chip != null;
    const sc = F.ns * (isChip ? 1 + 0.1 * Math.exp(-age * 10) * Math.cos(age * 28) : lerp(0.3, 1, ease.outBack(clamp(age / 0.3))));
    const lit = n.path ? sm(n.lit, n.lit + 0.12, gt) : 0, flash = n.path && gt > n.lit ? Math.exp(-(gt - n.lit) * 7) : 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha = (isChip ? 1 : clamp(age / 0.08)) * F.vis * (n.path ? 1 : 1 - 0.4 * F.dim);
    const w = n.w * (n.kind === 'profile' ? 1 + 0.06 * flash : 1), h = n.h;
    const c = pathColor(PATH_COLOR_IDX.has(n) ? PATH_COLOR_IDX.get(n) : 6);
    nodeShape(ctx, n, w, h);
    if (lit > 0.01) {
      ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = (26 + 40 * flash) * Math.min(1, 1.4 - F.s * 0.2);
      const fg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      const fk = n.kind === 'profile' ? 0.15 : 0.3; // keep text contrast high during the landing flash
      fg.addColorStop(0, `rgba(139,107,255,${0.20 + 0.3 * lit + fk * flash})`); fg.addColorStop(1, `rgba(46,230,214,${0.14 + 0.28 * lit + fk * flash})`);
      ctx.fillStyle = 'rgba(14,17,30,0.92)'; ctx.fill(); ctx.fillStyle = fg; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5; ctx.strokeStyle = brand(ctx, -w / 2, 0, w / 2, 0, pal.violet, pal.cyan); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(16,19,32,0.94)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(200,210,255,0.26)'; ctx.stroke();
    }
    const fnt = n.kind === 'start' ? F_START : n.kind === 'profile' ? F_PROF : lit > 0.5 ? F_PILLB : F_PILL;
    text(ctx, n.label, 0, 1, { f: fnt, fill: lit > 0.3 ? '#fff' : '#d0d6e8', align: 'center', base: 'middle', track: n.kind === 'start' ? 0 : 0.4 });
    ctx.restore();
  }

  function drawGraph(ctx, F, gt) {
    if (gt < T.start - 0.02) return;
    drawLanes(ctx, F, gt);
    drawEdges(ctx, F, gt);
    // convergence streaks (UNDER the nodes so labels stay clean): every node drags a bright trail into the point
    if (F.c > 0.02 && F.c < 0.999) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const n of NODES) {
        if (gt < n.pop) continue;
        const a = P(F, n.x, n.y), b = P(F, n.x, n.y, Math.max(0, F.c - 0.2));
        ctx.lineWidth = (n.path ? 7 : 4) * F.ns; ctx.strokeStyle = n.path ? 'rgba(190,240,255,0.55)' : 'rgba(150,130,255,0.4)'; ctx.globalAlpha = 1 - sm(0.85, 1, F.c);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.restore();
    }
    for (const n of NODES) if (!n.path) drawNode(ctx, n, F, gt);
    for (const n of NODES) if (n.path) drawNode(ctx, n, F, gt);
  }

  // ───────── hit 5.75: IRIS + SHOCKWAVE (ink stays ink — energy lives in a bright core, rings and radial rays, no full-frame wash)
  function drawCore(ctx, gt) {
    const u0 = clamp((gt - CV0) / (CV1 - CV0)), c = ease.inQuart(u0), dt = gt - HIT;
    // iris: darkness closes in around the point as the graph is sucked in, then irises open on the hit
    const irisR = dt < 0 ? lerp(1500, 300, ease.inOutCubic(u0)) : lerp(300, 2000, ease.outExpo(clamp(dt / 0.55)));
    const irisA = dt < 0 ? 0.6 * sm(0, 0.5, u0) : 0.6 * (1 - clamp(dt / 0.35));
    if (irisA > 0.01) {
      const g = ctx.createRadialGradient(CX, CY, irisR * 0.8, CX, CY, irisR);
      g.addColorStop(0, 'rgba(5,6,10,0)'); g.addColorStop(1, `rgba(5,6,10,${irisA})`);
      ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (c > 0.01) {
      const a = dt < 0 ? c * c : 1, pulse = dt > 0 ? 1 + 0.12 * Math.sin(dt * 40) * Math.exp(-dt * 6) : 1;
      spot(ctx, SPR.violet, CX, CY, lerp(20, 120, a) * pulse, 0.85 * a);
      spot(ctx, SPR.white, CX, CY, lerp(8, 34, a) * pulse, a);
    }
    if (dt >= 0) {
      spot(ctx, SPR.white, CX, CY, lerp(150, 300, ease.outExpo(clamp(dt / 0.45))), 0.9 * Math.exp(-dt * 8));
      // 56 radial rays (analytic from index)
      ctx.lineCap = 'round';
      for (let k = 0; k < 56; k++) {
        const ang = (k / 56) * 6.2832 + hash(k * 2.3) * 0.08, sp = 0.6 + hash(k * 7.1) * 0.7, len = 40 + hash(k * 3.9) * 240;
        const r1 = 170 + 1100 * ease.outExpo(clamp(dt * sp / 0.5)), r0 = Math.max(80, r1 - len * (0.6 + 0.4 * ease.outCubic(clamp(dt / 0.25))));
        ctx.globalAlpha = Math.exp(-dt * 6.5) * (k % 4 === 0 ? 0.9 : 0.55); ctx.lineWidth = k % 4 === 0 ? 3 : 1.6;
        ctx.strokeStyle = k % 2 ? 'rgba(130,245,235,1)' : 'rgba(190,170,255,1)';
        ctx.beginPath(); ctx.moveTo(CX + Math.cos(ang) * r0, CY + Math.sin(ang) * r0); ctx.lineTo(CX + Math.cos(ang) * r1, CY + Math.sin(ang) * r1); ctx.stroke();
      }
      // anamorphic sweep line
      const hw = lerp(60, W * 0.6, ease.outExpo(clamp(dt / 0.3)));
      const g = ctx.createLinearGradient(CX - hw, 0, CX + hw, 0);
      g.addColorStop(0, 'rgba(139,107,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${Math.exp(-dt * 7)})`); g.addColorStop(1, 'rgba(46,230,214,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; const th = 10 * Math.exp(-dt * 6) + 2; ctx.fillRect(CX - hw, CY - th / 2, hw * 2, th);
      // two shock rings (brand gradient), the second trails the first
      for (let k = 0; k < 2; k++) {
        const dk = dt - k * 0.07; if (dk < 0) continue; const uk = clamp(dk / 0.55);
        ctx.globalAlpha = 0.85 * Math.exp(-dk * 4.5); ctx.lineWidth = lerp(14, 1.5, uk);
        ctx.strokeStyle = brand(ctx, CX - 700, 0, CX + 700, 0, pal.violet, pal.cyan);
        ctx.beginPath(); ctx.arc(CX, CY, lerp(110, 1000, ease.outExpo(uk)), 0, 7); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ───────────────────────── HUD (screen-fixed) ─────────────────────────
  function drawHud(ctx, gt, a) {
    ctx.save(); ctx.globalAlpha *= a * sm(2.8, 3.2, gt);
    ctx.save(); ctx.translate(76, 80); ctx.rotate(Math.PI / 4); rr(ctx, -9, -9, 18, 18, 4);
    ctx.fillStyle = brand(ctx, -9, -9, 9, 9, pal.violet, pal.cyan); ctx.fill(); ctx.restore();
    text(ctx, 'ÉN NAM SCAFFOLD', 104, 88, { f: font(22, 600), fill: pal.text, track: 6, alpha: 0.92 });
    const n = Math.round(29 * sm(4.9, 5.4, gt));
    ctx.restore();
    if (gt > 4.85) {
      const al = a * sm(4.85, 5.1, gt) * (1 - sm(5.58, 5.74, gt));
      ctx.save(); ctx.globalAlpha *= al;
      text(ctx, 'PROFILES', W - 76, 88, { f: font(22, 600, 'mono'), fill: '#c4cbe0', align: 'right', track: 5 });
      text(ctx, String(n).padStart(2, '0'), W - 76 - measure(ctx, 'PROFILES', font(22, 600, 'mono'), 5) - 22, 90, { f: font(40, 700, 'mono'), fill: pal.cyan, align: 'right' });
      ctx.restore();
    }
  }

  // brand-coloured arrival ring behind the panel (replaces the old flat white light-leak that read as grey fog)
  function drawArrival(ctx, gt) {
    const u = clamp((gt - 2.62) / 0.42); if (u <= 0 || u >= 1) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 * Math.pow(1 - u, 1.5); ctx.lineWidth = lerp(9, 1.5, u);
    ctx.strokeStyle = brand(ctx, CX - 900, 0, CX + 900, 0, pal.violet, pal.cyan);
    ctx.beginPath(); ctx.arc(CX, CY, lerp(240, 1250, ease.outExpo(u)), 0, 7); ctx.stroke(); ctx.restore();
  }

  ENN.scene({
    id: 's2',
    draw(ctx, lt, gt) {
      const F = gframe(gt);
      const rec = clamp((gt - PB_T0) / 0.35), wa = 1 - ease.inQuad(clamp((gt - PB_T0) / 0.3));  // wizard recedes + fades as chips fly out
      drawArrival(ctx, gt);
      drawGraph(ctx, F, gt);
      if (wa > 0.003) drawWizard(ctx, gt, wa, WS * (1 - 0.1 * ease.inCubic(rec)));
      drawChips(ctx, gt);
      drawHud(ctx, gt, 1 - sm(5.5, 5.72, gt));
      drawCore(ctx, gt);
    },
  });
})();
