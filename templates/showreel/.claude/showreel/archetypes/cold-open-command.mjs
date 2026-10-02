// cold-open-command (C9) — port of spike s1 "IGNITION". A hairline frame draws itself into a floating,
// perspective-tilted glass terminal; the command fact is typed glyph by glyph on the timeline.typing
// schedule; ENTER (cue `enter`) detonates a shockwave and the caption phrase arrives as the status line.
// The spike's dive/portal is NOT here: leaving the beat is the transition's job (zoom-through).
// Pure function of localT: every time is anchored to typing / cues / dur (D10); particles are seeded.
//
// Slots: command (fact, mono, typed) · caption (phrase, optional, status line after ENTER).

const PW = 1120, PH = 560, PAD = 48, R = 22;   // terminal panel (panel-local px), strip padding, corner radius
const PCX = 960, PCY = 470;                    // panel centre on screen
const X0 = 62, BASE = 300;                     // command origin (panel-local)
const CMD_X = X0 + 58;                         // command starts after the prompt chevron
const HORIZON = 792;                           // floor horizon (screen y)
const FS_MAX = 52, CAP_MAX = 40;

export default {
  id: 'cold-open-command',

  layout(rb, variant, api) {
    const cmd = rb.slots.command.items[0];
    const cap = rb.slots.caption?.items[0] ?? null;
    api.cue('enter'); // the compiler always emits it (default cue): a missing one fails the boot
    const fs = api.fitSlot('command', { maxW: PW - CMD_X - X0 - 40, maxPx: FS_MAX, weight: 500 });
    const capPx = cap ? api.fitSlot('caption', { maxW: PW - 2 * X0 - 60, maxPx: CAP_MAX, weight: 500 }) : 0;
    const m = api.makeCanvas('cache', 8, 8).ctx;
    // per-glyph x offsets from prefix widths (exact for any font, not only mono)
    const cl = api.clusters(cmd.text);
    const xs = cl.map(({ s }) => api.measure(m, cmd, { size: fs, weight: 500, slice: [0, s] }).width);
    const total = api.measure(m, cmd, { size: fs, weight: 500 }).width;
    xs.push(total);
    const cw = cl.length ? total / cl.length : fs * 0.6;
    // token colouring: program → text, 2nd token → primary tint, flags → dim, rest → secondary
    const tok = [];
    let ti = 0, prevSpace = true;
    for (const { ch } of cl) {
      if (ch === ' ') { tok.push(-1); prevSpace = true; continue; }
      if (prevSpace && tok.length) ti++;
      prevSpace = false; tok.push(ti);
    }
    const flag = cl.map((_, i) => {
      let j = i; while (j > 0 && cl[j - 1].ch !== ' ') j--;
      return cl[j].ch === '-';
    });
    const P = api.palette;
    const colors = tok.map((t, i) => (t <= 0 ? P.text : flag[i] ? P.dim : t === 1 ? api.mix(P.primary, '#ffffff', 0.2) : P.secondary));
    const glyphs = cl.map(({ s, e, ch }, i) => ({ s, e, space: ch === ' ', x: xs[i], color: colors[i] }));
    const capW = cap ? api.measure(m, cap, { size: capPx, weight: 500 }).width : 0;
    const perim = 2 * (PW - 2 * R) + 2 * (PH - 2 * R) + 2 * Math.PI * R;
    // bokeh table (constant, seeded by index)
    const bokeh = Array.from({ length: 15 }, (_, i) => ({
      x: api.hash(i * 5.1 + 1), y: api.hash(i * 9.7 + 3), r: 34 + api.hash(i * 2.3) * 96, z: 0.4 + api.hash(i * 8.9) * 1.1,
      c: [P.primary, P.secondary, '#ffffff', P.primary, P.secondary][i % 5], ph: api.hash(i * 3.3) * 6,
    }));
    return { cmd, cap, fs, capPx, capW, glyphs, total, cw, perim, bokeh };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L, typing } = p;
    const { W, H, clamp, lerp, ease, prog, rng, hash, rr, rgba, mix, palette: P } = api;
    const N = L.glyphs.length;
    // schedule (local seconds): typing from timeline.typing, ENTER from the compiled cue (api.cue throws if missing)
    const E = api.cue('enter');
    const TS = typing ? typing.t0 : p.dur * 0.13;
    const IV = typing ? typing.interval : Math.max(0.02, (E - TS - api.grid * 3) / Math.max(1, N));
    const I = clamp(TS / 0.6, 0.5, 1.5);             // intro choreography scales with the typing lead-in
    const typedCount = (x) => (x < TS ? 0 : Math.min(N, Math.floor((x - TS) / IV + 1e-9) + 1));
    const decay = (dt, k) => (dt < 0 ? 0 : Math.exp(-dt * k));
    const anticipate = (x) => api.anticipate(x, E, 0.38);
    const dE = lt - E;

    // ═════════════ panel contents (panel-local coords) ═════════════
    function drawPanel(g) {
      const n = typedCount(lt), A = anticipate(lt), hot = decay(dE, 7);
      const brandG = api.brand(g, 0, 0, PW, PH, P.primary, P.secondary);
      // glass body
      g.save(); g.globalAlpha = prog(lt, 0.22 * I, 0.35, ease.outQuad);
      rr(g, 0, 0, PW, PH, R);
      const fg = g.createLinearGradient(0, 0, 0, PH);
      fg.addColorStop(0, 'rgba(20,24,38,0.95)'); fg.addColorStop(1, 'rgba(8,10,17,0.96)');
      g.fillStyle = fg; g.fill();
      g.save(); rr(g, 0, 0, PW, PH, R); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, 0, PW, 72);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 72, PW, 1);
      const ag = g.createRadialGradient(PW * 0.5, BASE - 20, 0, PW * 0.5, BASE - 20, 520);
      ag.addColorStop(0, rgba(P.primary, 0.10 + 0.3 * hot + 0.08 * A)); ag.addColorStop(1, rgba(P.primary, 0));
      g.fillStyle = ag; g.fillRect(0, 0, PW, PH);
      g.globalCompositeOperation = 'lighter';
      g.save(); g.translate(lerp(-400, PW + 400, (lt * 0.28) % 1), 0); g.transform(1, 0, -0.45, 1, 0, 0);
      const sg = g.createLinearGradient(-110, 0, 110, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(190,200,255,0.045)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg; g.fillRect(-110, 0, 220, PH); g.restore();
      g.restore(); g.restore();

      // border: corner brackets race along the edges, then settle to a hairline
      const f = prog(lt, 0.04 * I, 0.55 * I, ease.outQuart);
      const legA = 1 - prog(lt, 0.5 * I, 0.3, ease.inOutQuad);
      const corners = [[0, 0, 1, 1], [PW, 0, -1, 1], [PW, PH, -1, -1], [0, PH, 1, -1]];
      if (legA > 0.001 && f > 0) {
        const lh = f * (PW / 2 - R), lv = f * (PH / 2 - R);
        g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = brandG; g.lineWidth = 3; g.globalAlpha = legA; g.shadowColor = P.secondary; g.shadowBlur = 16;
        g.beginPath();
        for (const [ox, oy, sx, sy] of corners) {
          g.moveTo(ox + sx * (R + lh), oy); g.lineTo(ox + sx * R, oy);
          g.arcTo(ox, oy, ox, oy + sy * R, R); g.lineTo(ox, oy + sy * (R + lv));
        }
        g.stroke();
        g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 20;
        for (const [ox, oy, sx, sy] of corners) {
          g.beginPath(); g.arc(ox + sx * (R + lh), oy, 3.5, 0, 7); g.arc(ox, oy + sy * (R + lv), 3.5, 0, 7); g.fill();
        }
        g.restore();
      }
      g.save(); g.globalAlpha = 0.6 * prog(lt, 0.42 * I, 0.3, ease.outQuad); rr(g, 0.75, 0.75, PW - 1.5, PH - 1.5, R); g.strokeStyle = brandG; g.lineWidth = 1.5; g.stroke(); g.restore();

      // header: traffic lights + a faint path bar (no text: every string must be a resolved fact/phrase)
      [[P.red, 0.36], [P.amber, 0.41], [P.mint, 0.46]].forEach(([c, t0], i) => {
        const q = prog(lt, t0 * I, 0.32, ease.outBack); if (q <= 0) return;
        g.save(); g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 12;
        g.beginPath(); g.arc(36 + i * 28, 36, 7.5 * q, 0, 7); g.fill(); g.restore();
      });
      const tp = prog(lt, 0.5 * I, 0.4, ease.outCubic);
      if (tp > 0) {
        g.save(); g.globalAlpha = tp * 0.5; rr(g, PW / 2 - 110 * tp, 28, 220 * tp, 16, 8); g.fillStyle = 'rgba(180,188,210,0.25)'; g.fill(); g.restore();
        g.save(); g.globalAlpha = prog(lt, 0.55 * I, 0.5) * 0.35;
        for (let i = 0; i < 3; i++) { rr(g, X0, 150 + i * 22 - 10 * (1 - tp), [380, 520, 300][i], 8, 4); g.fillStyle = 'rgba(143,153,182,0.35)'; g.fill(); }
        g.restore();
      }

      // prompt chevron
      const pp = prog(lt, 0.34 * I, 0.3, ease.outBack);
      if (pp > 0) {
        g.save(); g.translate(X0 + 6, BASE - L.fs * 0.36); g.scale(pp, pp);
        api.chevron(g, -L.fs * 0.2, L.fs * 0.36, L.fs * 0.72, P.mint, 16);
        g.restore();
      }

      // keystroke FX (flash, spark bursts) under the glyphs
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = Math.max(0, n - 9); i < n; i++) {
        const gl = L.glyphs[i]; if (gl.space) continue;
        const a = lt - (TS + i * IV); if (a < 0 || a > 0.5) continue;
        const col = gl.color;
        const x = CMD_X + gl.x + L.cw / 2, y = BASE - L.fs * 0.3;
        const fk = Math.exp(-a * 24);
        const rg = g.createRadialGradient(x, y, 0, x, y, 90);
        rg.addColorStop(0, mix(col, col, 0, 0.4 * fk)); rg.addColorStop(1, mix(col, col, 0, 0));
        g.fillStyle = rg; g.fillRect(x - 90, y - 90, 180, 180);
        g.fillStyle = mix(col, col, 0, 0.9 * fk); g.fillRect(x - L.cw / 2, BASE + 17, L.cw, 3);
        const r = rng(7000 + i * 31);
        g.strokeStyle = mix(col, col, 0, 0.95); g.lineWidth = 2; g.lineCap = 'round'; g.beginPath();
        for (let k = 0; k < 8; k++) {
          const ang = -Math.PI / 2 + (r() - 0.5) * 2.3, sp = 150 + r() * 360, life = 0.26 + r() * 0.22;
          if (a > life) continue;
          const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp + 520 * a;
          const px = x + Math.cos(ang) * sp * a, py = y - 22 + Math.sin(ang) * sp * a + 260 * a * a;
          const fade = 1 - a / life;
          g.moveTo(px, py); g.lineTo(px - vx * 0.028 * fade, py - vy * 0.028 * fade);
        }
        g.stroke();
      }
      g.restore();

      // typed command, glyph by glyph (landing pulse: pop, white-hot → colour)
      const heat = clamp(0.38 * A + 0.85 * hot);
      for (let i = 0; i < n; i++) {
        const gl = L.glyphs[i]; if (gl.space) continue;
        const a = lt - (TS + i * IV);
        const k = Math.exp(-a * 15), settle = 1 - Math.exp(-a * 9);
        const base = gl.color;
        g.save();
        g.shadowColor = base === P.text ? 'rgba(220,230,255,0.5)' : base; g.shadowBlur = (base === P.text ? 4 : 10) + 30 * k + 14 * hot;
        g.translate(CMD_X + gl.x + L.cw / 2, BASE); g.scale(1 + 0.5 * k, 1 + 0.5 * k); g.translate(-L.cw / 2, -11 * k);
        const fill = mix(mix('#ffffff', base, settle), '#ffffff', heat);
        api.text(g, L.cmd, 0, 0, { size: L.fs, weight: 500, fill, slice: [gl.s, gl.e] });
        g.restore();
      }

      // caret: blink idle, solid while typing, accelerating flicker in the inhale, solid + hot at ENTER
      const lastAge = n > 0 ? lt - (TS + (n - 1) * IV) : 99;
      const flick = E - 0.27;
      let on;
      if (lt < I * 0.34) on = false;
      else if (lt >= E - 0.04) on = true;
      else if (lt >= flick) { const tau = lt - flick; on = ((3 * tau + 26 * tau * tau) % 1) < 0.55; }
      else if (n > 0 && lastAge < 0.2) on = true;
      else on = (lt * 2) % 1 < 0.58;
      if (on) {
        const ch = L.fs * 1.15, cxp = CMD_X + (n < N ? L.glyphs[n].x : L.total) + 2, cy0 = BASE - L.fs * 0.88;
        g.save();
        const cg = g.createLinearGradient(0, cy0, 0, cy0 + ch);
        cg.addColorStop(0, mix(P.primary, '#ffffff', 0.25 + 0.7 * hot)); cg.addColorStop(1, mix(P.secondary, '#ffffff', 0.25 + 0.7 * hot));
        g.fillStyle = cg; g.shadowColor = P.primary; g.shadowBlur = 22 + 24 * hot + 20 * A;
        g.globalAlpha = lt < TS ? 0.85 : 1;
        g.fillRect(cxp, cy0, Math.max(6, L.cw - 4), ch); g.restore();
      }

      // charge line racing around the border, meets itself at ENTER
      const c0 = E - 0.32, q = ease.inQuad(clamp((lt - c0) / (E - c0)));
      if (q > 0 && dE < 0.6) {
        g.save(); rr(g, 0.75, 0.75, PW - 1.5, PH - 1.5, R);
        g.lineWidth = 3.5; g.shadowColor = P.secondary; g.shadowBlur = 24; g.strokeStyle = mix(P.secondary, '#ffffff', 0.55);
        g.globalAlpha = dE < 0 ? q : 0.9 * Math.exp(-dE * 9);
        const len = (dE < 0 ? q : 1) * L.perim / 2;
        g.setLineDash([len, L.perim]); g.lineDashOffset = 0; g.stroke();
        g.lineDashOffset = -L.perim / 2; g.stroke();
        g.restore();
      }
      if (dE >= 0 && dE < 0.5) {
        g.save(); rr(g, 0.75, 0.75, PW - 1.5, PH - 1.5, R);
        g.lineWidth = 4; g.strokeStyle = '#fff'; g.shadowColor = P.primary; g.shadowBlur = 30; g.globalAlpha = 0.7 * Math.exp(-dE * 9); g.stroke(); g.restore();
      }

      // status line (caption phrase) + progress, born on ENTER
      const sa = lt - (E + 0.05);
      if (sa > 0) {
        const sp = ease.outBack(clamp(sa / 0.3)), al = clamp(sa / 0.1);
        const sy = BASE + 92 + (1 - sp) * 26;
        g.save(); g.globalAlpha = al;
        g.save(); g.translate(X0 + 9, sy - L.capPx * 0.34); g.rotate(Math.PI / 4 + sa * 2.2 * (sa < 0.3 ? 1 - sa / 0.3 : 0));
        const ds = 8 + 4 * Math.exp(-sa * 8) + 1.5 * Math.sin(sa * 14);
        g.fillStyle = P.primary; g.shadowColor = P.primary; g.shadowBlur = 18; g.fillRect(-ds / 2, -ds / 2, ds, ds); g.restore();
        if (L.cap) {
          const bx = lerp(-160, L.capW + 160, (sa * 1.5) % 1);
          const tg = g.createLinearGradient(X0 + 40 + bx - 130, 0, X0 + 40 + bx + 130, 0);
          tg.addColorStop(0, '#9aa3bb'); tg.addColorStop(0.5, '#ffffff'); tg.addColorStop(1, '#9aa3bb');
          api.text(g, L.cap, X0 + 40, sy, { size: L.capPx, weight: 500, fill: tg });
        }
        const bw = PW - 2 * X0, bp = 0.07 + 0.36 * ease.outCubic(clamp(sa / 0.6)), by = sy + 50;
        rr(g, X0, by, bw, 6, 3); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fill();
        rr(g, X0, by, bw * bp, 6, 3); g.fillStyle = api.brand(g, X0, 0, X0 + bw, 0, P.primary, P.secondary); g.shadowColor = P.secondary; g.shadowBlur = 16; g.fill();
        g.shadowBlur = 24; g.shadowColor = '#fff'; g.fillStyle = '#fff'; g.beginPath(); g.arc(X0 + bw * bp, by + 3, 4.5, 0, 7); g.fill();
        g.restore();
      }
    }

    // ═════════════ placement (perspective via vertical strips through a scratch layer) ═════════════
    function placePanel(c, cx, cy, sc, theta) {
      if (Math.abs(theta) < 1e-4) {
        c.save(); c.translate(cx, cy); c.scale(sc, sc); c.translate(-PW / 2, -PH / 2); drawPanel(c); c.restore(); return;
      }
      const S = api.scratch(0);
      S.ctx.save(); S.ctx.translate(PAD, PAD); drawPanel(S.ctx); S.ctx.restore();
      const D = 1750, co = Math.cos(theta), si = Math.sin(theta), total = PW + 2 * PAD, SW = 6, TH = PH + 2 * PAD;
      c.save(); c.imageSmoothingQuality = 'high';
      for (let u0 = -total / 2; u0 < total / 2; u0 += SW) {
        const u1 = Math.min(u0 + SW, total / 2), um = (u0 + u1) / 2;
        const x0 = cx + (u0 * co * D / (D - u0 * si)) * sc, x1 = cx + (u1 * co * D / (D - u1 * si)) * sc;
        const hh = TH * (D / (D - um * si)) * sc;
        c.drawImage(S.canvas, u0 + total / 2, 0, u1 - u0, TH, x0, cy - hh / 2, x1 - x0 + 0.8, hh);
      }
      c.restore();
    }

    // ═════════════ environment ═════════════
    const PR = api.hexToRgb(P.primary), SR = api.hexToRgb(P.secondary);
    function drawFloor(alpha) {
      if (alpha <= 0.002) return;
      const rv = prog(lt, 0.05, 1.0, ease.outCubic), pulse = decay(dE, 6) * 0.7;
      ctx.save(); ctx.globalAlpha = alpha;
      const depth = H - HORIZON + 40;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(PCX, HORIZON + 6); ctx.scale(1, 0.12);
      const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 760);
      pg.addColorStop(0, rgba(P.primary, (0.16 + 0.35 * pulse) * rv)); pg.addColorStop(0.5, rgba(P.primary, 0.08 * rv)); pg.addColorStop(1, rgba(P.secondary, 0));
      ctx.fillStyle = pg; ctx.fillRect(-760, -760, 1520, 1520); ctx.restore();
      const lg = ctx.createLinearGradient(0, HORIZON, 0, H + 40);
      lg.addColorStop(0, rgba(P.primary, 0)); lg.addColorStop(1, rgba(P.primary, 0.5 + 0.4 * pulse));
      ctx.strokeStyle = lg; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let i = -16; i <= 16; i++) {
        if (Math.abs(i) / 16 > rv * 1.05) continue;
        ctx.moveTo(PCX, HORIZON); ctx.lineTo(PCX + i * 170 * (depth / (H - HORIZON)), H + 40);
      }
      ctx.stroke();
      const span = rv * 1700;
      for (let k = 0; k < 11; k++) {
        const qd = ((k + lt * 0.8) % 11) / 11, y = HORIZON + depth * Math.pow(qd, 2.2);
        ctx.strokeStyle = `rgba(${lerp(PR[0], SR[0], qd) | 0},${lerp(PR[1], SR[1], qd) | 0},${lerp(PR[2], SR[2], qd) | 0},${(0.05 + 0.34 * qd) * (1 + pulse)})`;
        ctx.lineWidth = 0.8 + qd * 1.4; ctx.beginPath(); ctx.moveTo(PCX - span, y); ctx.lineTo(PCX + span, y); ctx.stroke();
      }
      const hw = rv * 1100 * (1 + 0.3 * pulse);
      ctx.globalCompositeOperation = 'lighter';
      const hg = ctx.createLinearGradient(PCX - hw, 0, PCX + hw, 0);
      hg.addColorStop(0, rgba(P.primary, 0)); hg.addColorStop(0.3, rgba(P.primary, 0.8)); hg.addColorStop(0.5, 'rgba(255,255,255,1)');
      hg.addColorStop(0.7, rgba(P.secondary, 0.8)); hg.addColorStop(1, rgba(P.secondary, 0));
      ctx.fillStyle = hg; ctx.shadowColor = P.primary; ctx.shadowBlur = 24; ctx.fillRect(PCX - hw, HORIZON - 1.2, hw * 2, 2.4); ctx.shadowBlur = 0;
      const cp = prog(lt, 0.12, 0.8, ease.inOutQuart);
      if (cp > 0 && cp < 1) {
        const cx = lerp(-300, W + 300, cp), cg = ctx.createLinearGradient(cx - 420, 0, cx + 30, 0);
        cg.addColorStop(0, rgba(P.secondary, 0)); cg.addColorStop(1, 'rgba(255,255,255,1)');
        ctx.fillStyle = cg; ctx.fillRect(cx - 420, HORIZON - 1.5, 450, 3);
      }
      ctx.restore();
    }
    function drawEchoes(cx, cy, sc) {
      [[1.045, 0.45, -1], [1.095, 0.6, 1]].forEach(([s0, t0, dir], i) => {
        const a = prog(lt, t0 * I, 0.5, ease.outCubic); if (a <= 0) return;
        const burst = dE >= 0 ? ease.outExpo(clamp(dE / 0.5)) : 0;
        const s = s0 + (0.1 + 0.08 * i) * burst + 0.01 * Math.sin(lt * 1.2 + i * 2) * (1 - burst);
        const al = (0.11 * a) * (1 - burst) + (dE >= 0 ? 0.5 * Math.exp(-dE * 7) : 0);
        if (al < 0.003) return;
        ctx.save(); ctx.translate(cx + dir * 14 * (1 - burst), cy + 10 * (i + 1)); ctx.scale(s * sc, s * sc);
        rr(ctx, -PW / 2, -PH / 2, PW, PH, R + 6); ctx.lineWidth = 1.4 / s; ctx.strokeStyle = i ? P.secondary : P.primary; ctx.globalAlpha = al; ctx.stroke(); ctx.restore();
      });
    }
    function drawHalo(cx, cy, sc, theta) {
      const k = 0.30 * prog(lt, 0.3 * I, 0.6) + 0.4 * decay(dE, 7) + 0.25 * anticipate(lt);
      if (k <= 0.01) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(cx, cy); ctx.scale(sc * Math.cos(theta), sc);
      [[-170, P.primary, 1.0], [170, P.secondary, 0.6]].forEach(([dx, c, w]) => {
        ctx.save(); ctx.translate(dx, 0); ctx.scale(1.55, 1);
        const g = ctx.createRadialGradient(0, 0, 120, 0, 0, 520);
        g.addColorStop(0, rgba(c, 0.20 * clamp(k) * w)); g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g; ctx.fillRect(-900, -600, 1800, 1200); ctx.restore();
      });
      ctx.restore();
    }
    function drawBokeh() {
      const env = prog(lt, 0.25, 0.9, ease.outCubic); if (env <= 0.005) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const b of L.bokeh) {
        const x = ((b.x * W * 1.3 + lt * 20 * b.z) % (W * 1.3)) - W * 0.15, y = b.y * H + Math.sin(lt * 0.7 + b.ph) * 26 * b.z;
        const r = b.r * (1 + 0.1 * decay(dE, 6));
        const a = (0.03 + 0.04 * b.z) * env * (0.7 + 0.3 * Math.sin(lt * 1.4 + b.ph)) * (1 + 0.7 * decay(dE, 8));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(b.c, a * 0.5)); g.addColorStop(0.72, rgba(b.c, a * 0.9)); g.addColorStop(0.93, rgba(b.c, a * 1.6)); g.addColorStop(1, rgba(b.c, 0));
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    function drawLeaks() {
      const env = prog(lt, 0.15, 0.8, ease.outCubic), boost = 1 + 0.9 * decay(dE, 7);
      if (env <= 0.005) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      [[0.0, 0.12, 760, P.primary, 0.11, 0.5], [1.02, 0.92, 820, P.primary, 0.10, 1.3], [0.96, 0.02, 600, P.secondary, 0.07, 2.1]].forEach(([fx, fy, rad, c, a, ph]) => {
        const x = fx * W + Math.sin(lt * 0.5 + ph) * 60, y = fy * H + Math.cos(lt * 0.4 + ph) * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, rgba(c, a * env * boost)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });
      ctx.restore();
    }
    function drawCrop() {
      const a = prog(lt, 0.12, 0.5, ease.outCubic); if (a <= 0.004) return;
      ctx.save(); ctx.globalAlpha = a;
      const m = 56, d = prog(lt, 0.05, 0.5, ease.outQuart) * 30;
      ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [W - m, H - m, -1, -1], [m, H - m, 1, -1]]) {
        ctx.moveTo(x + sx * d, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * d);
      }
      ctx.stroke();
      ctx.restore();
    }
    function drawEnterFX(ox, oy) {
      if (dE < 0 || dE > 1.0) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fa = 0.8 * Math.exp(-dE * 8);
      ctx.save(); ctx.translate(ox, oy);
      [[2400, 0.011, 0.85, '#ffffff', P.secondary], [3200, 0.006, 0.8, mix(P.primary, '#ffffff', 0.3), P.primary]].forEach(([len, th, k, c0, c1]) => {
        ctx.save(); ctx.scale(1, th);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len / 2);
        const c0h = mix(c0, c0, 0, fa * k);
        g.addColorStop(0, c0h); g.addColorStop(0.18, rgba(c1, fa * k * 0.65)); g.addColorStop(1, rgba(c1, 0));
        ctx.fillStyle = g; ctx.fillRect(-len / 2, -len / 2, len, len); ctx.restore();
      });
      ctx.restore();
      // shockwave rings
      [[0, '#ffffff', 13], [0.05, P.primary, 11], [0.11, P.secondary, 8]].forEach(([d, col, wd]) => {
        const a = dE - d; if (a <= 0 || a > 0.95) return;
        const q = ease.outExpo(a / 0.95), rad = 30 + q * 1650;
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = wd * (1 - q) + 1.5; ctx.globalAlpha = Math.pow(1 - q, 1.3);
        ctx.shadowColor = col; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(ox, oy, rad, 0, 7); ctx.stroke(); ctx.restore();
      });
      // radial speed lines (3 colour batches)
      const cols = ['#ffffff', P.primary, P.secondary], batches = [[], [], []];
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
        ctx.strokeStyle = pass ? P.secondary : mix(P.primary, '#ffffff', 0.6); ctx.beginPath();
        for (let i = pass; i < 90; i += 2) {
          const r = rng(500 + i * 17), ang = r() * 6.2832, v0 = 500 + r() * 1800, k = 3.5 + r() * 2, life = 0.35 + r() * 0.6;
          if (dE > life) continue;
          const d = v0 * (1 - Math.exp(-k * dE)) / k, v = v0 * Math.exp(-k * dE), c = Math.cos(ang), s = Math.sin(ang);
          const x = ox + c * d, y = oy + s * d + 160 * dE * dE, tl = v * 0.03 * (1 - dE / life);
          ctx.moveTo(x, y); ctx.lineTo(x - c * tl, y - s * tl);
        }
        ctx.stroke();
      }
      // white-hot flash
      const fl = Math.exp(-dE * 26);
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 560);
      g.addColorStop(0, `rgba(255,255,255,${0.42 * fl})`); g.addColorStop(0.25, rgba(P.primary, 0.22 * fl)); g.addColorStop(1, rgba(P.primary, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${0.1 * Math.exp(-dE * 30)})`; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ═════════════ scene ═════════════
    const settle = clamp(lt / Math.max(0.5, E - 0.1));
    const theta = -0.23 * (1 - ease.outCubic(settle)) + 0.025 * Math.sin(lt * 1.3) * (1 - settle);
    const rise = 1 - ease.outExpo(clamp(lt / 1.0));
    const cx = PCX + Math.sin(lt * 0.8) * 12 * (1 - settle), cy = PCY + rise * 38 + Math.sin(lt * 1.7) * 5 * (1 - settle);
    let pk = 0.955 + 0.045 * ease.outQuart(clamp(lt / 0.9));
    pk *= 1 - 0.022 * anticipate(lt);
    if (dE >= 0) pk *= 1 + 0.065 * Math.exp(-dE * 9.5) * Math.cos(dE * 26);
    const n = typedCount(lt);
    if (n > 0) pk *= 1 - 0.0035 * decay(lt - (TS + (n - 1) * IV), 32);
    // ENTER origin = end of the command, in screen space
    const ox = cx + (CMD_X + L.total - PW / 2) * pk, oy = cy + (BASE - L.fs * 0.3 - PH / 2) * pk;

    drawFloor(prog(lt, 0, 0.2));
    const A = anticipate(lt);
    if (A > 0 && dE < 0) { ctx.fillStyle = `rgba(2,3,8,${0.34 * A})`; ctx.fillRect(0, 0, W, H); }
    drawHalo(cx, cy, pk, theta);
    drawEchoes(cx, cy, pk);
    placePanel(ctx, cx, cy, pk, theta);
    drawBokeh();
    drawLeaks();
    drawCrop();
    drawEnterFX(ox, oy);
  },
};
