// S3 — "Install: the repo grows"   window 5.6 -> 9.2
// An isometric stack of four glass slabs lands on a wireframe platform (one per hit), a file tree ticks in
// on the left, a slot-machine counter locks to "0" on the right, then everything is sucked into the centre
// as energy that fuels the brain-core in S4.   Pure function of time: every effect is analytic in (seed, t).
(function () {
  'use strict';
  const { W, H, TL, clamp, lerp, ease, prog, hash, pal, font, rr, glass, text, measure } = ENN;

  const C30 = Math.cos(Math.PI / 6);
  const CX = W / 2, CY = H / 2;

  // ───────────────────────────── timing (all from the master timeline) ─────────────────────────────
  const hitT = (t) => TL.hits.reduce((b, h) => (Math.abs(h.t - t) < Math.abs(b - t) ? h.t : b), TL.hits[0].t);
  const T_SLAB = [6.30, 6.80, 7.30, 7.80].map(hitT);
  const T_LOCK = hitT(8.90);   // audio 'lock' stamp (ring + check + white caption); the 0 itself lands earlier
  const T_LAND = [6.30 - 0.012, 6.80 - 0.012, 7.30 - 0.03, 7.80 - 0.03]; // picture contact leads the audio hit so the thud reads ON the beat
  const T_ZERO = 8.58;        // the roll settles on 0 here, then holds crisp ~0.5s
  const T_COLLAPSE = 9.06;    // everything is pulled into the centre (short: scene ends 9.2)
  const T_PLAT = 5.98;        // comet lands, platform ignites
  const T_EXIT = T_COLLAPSE;
  const T_END = TL.scenes.s3.end;

  // ───────────────────────────── colour helpers ─────────────────────────────
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const VIO = hex(pal.violet), CYA = hex(pal.cyan), MAG = hex(pal.magenta), AMB = hex(pal.amber), MNT = hex(pal.mint);
  const WHITE = [255, 255, 255];

  // ───────────────────────────── stack geometry ─────────────────────────────
  const SX = 930, SY = 775;                 // platform centre on screen
  const HP = 190, PT = 20;                  // platform half-size / thickness (world units)
  const SLAB_T = 48, GAP0 = 36, PITCH = 88; // slab thickness, first hover height, bottom-to-bottom pitch
  const FALL_H = 720, FALL_D = 0.32;        // drop height and fall duration (gravity: inQuad)
  const zBottom = (k) => GAP0 + k * PITCH;

  const SLABS = [
    { name: 'SUPERPOWERS WORKFLOW', sub: 'plan → build → verify → review', c: [150, 124, 255], h: 166, kind: 'circuit' },
    { name: 'SERENA MEMORY', sub: 'decisions · checkpoints · comms', c: CYA, h: 144, kind: 'memory' },
    { name: 'ROLE AGENTS', sub: 'orchestrator · implementer · reviewer', c: MAG, h: 122, kind: 'agents' },
    { name: 'MCP SERVERS', sub: 'tools wired in via .mcp.json', c: AMB, h: 100, kind: 'ports' },
  ];

  // ───────────────────────────── small drawing helpers ─────────────────────────────
  function poly(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  // run fn with the canvas mapped to a plane given by two basis vectors (a,b) and origin (e,f)
  function basis(ctx, a, b, c, d, e, f, fn) { ctx.save(); ctx.transform(a, b, c, d, e, f); fn(); ctx.restore(); }
  // iso circle/ellipse path on the ground plane at height z, then stroke untransformed (uniform line width)
  function isoCircle(ctx, cx, cy, z, r) {
    ctx.save(); ctx.transform(C30, 0.5, -C30, 0.5, cx, cy - z); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.restore();
  }
  const hitPulse = (gt, decay = 7) => { let e = 0; for (let k = 0; k < 4; k++) { const d = gt - T_LAND[k]; if (d >= 0) e += Math.exp(-d * decay); } return e; };
  const latestAccent = (gt) => { let c = VIO, f = 0; for (let k = 0; k < 4; k++) if (gt >= T_LAND[k]) { c = SLABS[k].c; f = k; } return { c, f }; };

  // ───────────────────────────── suction (exit) ─────────────────────────────
  // returns where an element that starts at (x0,y0) is at time gt while being pulled into the centre
  function pull(gt, t0, dur, x0, y0, side) {
    const p = clamp((gt - t0) / dur), q = ease.inCubic(p);
    const dx = CX - x0, dy = CY - y0, L = Math.hypot(dx, dy) || 1, arc = Math.sin(q * Math.PI) * 150 * side;
    return {
      p, x: x0 + dx * q - (dy / L) * arc, y: y0 + dy * q + (dx / L) * arc,
      s: lerp(1, 0.04, ease.inQuad(p)), a: 1 - Math.pow(clamp((p - 0.62) / 0.38), 2),
    };
  }
  // motion streak behind a pulled element
  function streak(ctx, gt, t0, dur, x0, y0, side, col, w) {
    const now = pull(gt, t0, dur, x0, y0, side); if (now.p <= 0.02 || now.p >= 1) return;
    const old = pull(gt - 0.055, t0, dur, x0, y0, side);
    const g = ctx.createLinearGradient(old.x, old.y, now.x, now.y);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, 0.75 * now.a));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = g; ctx.lineWidth = w * now.s + 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(old.x, old.y); ctx.lineTo(now.x, now.y); ctx.stroke(); ctx.restore();
  }

  // ───────────────────────────── 1. floor, platform, intro comet ─────────────────────────────
  function drawFloor(ctx, gt, ex) {
    const rv = ease.outExpo(clamp((gt - T_PLAT) / 0.9)); if (rv <= 0 || ex <= 0) return;
    const { c } = latestAccent(gt);
    const R = 1050 * rv;
    // soft pool of light under the stack, tinted by the latest layer
    ctx.save(); ctx.translate(SX, SY + 8); ctx.scale(1, 0.5);
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, 520);
    const k = 0.16 + 0.08 * hitPulse(gt, 6);
    gl.addColorStop(0, rgba(c, k * ex)); gl.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = gl; ctx.fillRect(-540, -540, 1080, 1080); ctx.restore();
    // endless iso grid fading radially (one stroke, radial-gradient stroke style)
    const g = ctx.createRadialGradient(SX, SY, 0, SX, SY, R);
    g.addColorStop(0, rgba(mix(c, WHITE, 0.2), 0.34 * ex)); g.addColorStop(0.55, rgba(c, 0.10 * ex)); g.addColorStop(1, rgba(c, 0));
    ctx.save(); ctx.beginPath();
    ctx.transform(C30, 0.5, -C30, 0.5, SX, SY);
    const step = 80, ext = 900;
    for (let i = -ext; i <= ext; i += step) { ctx.moveTo(i, -ext); ctx.lineTo(i, ext); ctx.moveTo(-ext, i); ctx.lineTo(ext, i); }
    ctx.restore();
    ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.stroke();
  }

  function drawPlatform(ctx, gt, g) {
    const rev = ease.outExpo(clamp((gt - T_PLAT) / 0.42)); if (rev <= 0.002 || g.a <= 0.003) return;
    const h = HP * rev, s = g.s, ox = g.x, oy = g.y;
    const iso = (x, y, z) => [ox + (x - y) * C30 * s, oy + ((x + y) * 0.5 - z) * s];
    const pulse = hitPulse(gt, 6);
    const { c } = latestAccent(gt);
    ctx.save(); ctx.globalAlpha = g.a;
    // thickness (two visible side faces)
    const right = [iso(h, -h, 0), iso(h, h, 0), iso(h, h, -PT), iso(h, -h, -PT)];
    const left = [iso(h, h, 0), iso(-h, h, 0), iso(-h, h, -PT), iso(h, h, -PT)];
    poly(ctx, left); ctx.fillStyle = '#0d1020'; ctx.fill();
    poly(ctx, right); ctx.fillStyle = '#080a14'; ctx.fill();
    const top = [iso(-h, -h, 0), iso(h, -h, 0), iso(h, h, 0), iso(-h, h, 0)];
    poly(ctx, top);
    const tg = ctx.createLinearGradient(ox, oy - h * s * 0.5, ox, oy + h * s * 0.5);
    tg.addColorStop(0, 'rgba(26,30,52,0.96)'); tg.addColorStop(1, 'rgba(12,14,26,0.96)');
    ctx.fillStyle = tg; ctx.fill();
    // wireframe grid on the top face
    ctx.save(); poly(ctx, top); ctx.clip();
    basis(ctx, C30 * s, 0.5 * s, -C30 * s, 0.5 * s, ox, oy, () => {
      ctx.lineWidth = 1.2;
      const n = 8, st = (2 * HP) / n;
      ctx.beginPath();
      for (let i = -n / 2; i <= n / 2; i++) { ctx.moveTo(i * st, -HP); ctx.lineTo(i * st, HP); ctx.moveTo(-HP, i * st); ctx.lineTo(HP, i * st); }
      ctx.strokeStyle = rgba(mix(VIO, c, 0.5), 0.20 + 0.45 * Math.min(1, pulse)); ctx.stroke();
      // inner glow cross where the slabs land
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, HP);
      rg.addColorStop(0, rgba(c, 0.28 + 0.3 * Math.min(1, pulse))); rg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = rg; ctx.fillRect(-HP, -HP, 2 * HP, 2 * HP);
    });
    ctx.restore();
    // glowing rim in the brand gradient
    const lg = ctx.createLinearGradient(top[3][0], top[3][1], top[1][0], top[1][1]); lg.addColorStop(0, pal.violet); lg.addColorStop(1, pal.cyan);
    ctx.save(); ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = 22 + 20 * Math.min(1, pulse);
    ctx.lineWidth = 3; ctx.strokeStyle = lg; ctx.lineJoin = 'round'; poly(ctx, top); ctx.stroke(); ctx.restore();
    ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(mix(c, WHITE, 0.3), 0.55);
    ctx.beginPath(); ctx.moveTo(left[3][0], left[3][1]); ctx.lineTo(left[2][0], left[2][1]); ctx.lineTo(right[3][0], right[3][1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]); ctx.lineTo(left[3][0], left[3][1]); ctx.moveTo(right[1][0], right[1][1]); ctx.lineTo(right[2][0], right[2][1]); ctx.stroke();
    // corner brackets
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(WHITE, 0.9);
    const bl = 38;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const a = iso(sx * (h - bl), sy * h, 0), b = iso(sx * h, sy * h, 0), d = iso(sx * h, sy * (h - bl), 0);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
    }
    ctx.restore();
  }

  // the bright point left by S2 → dives into the platform centre (comet) and lights the platform
  function drawIntro(ctx, gt) {
    if (gt > T_PLAT + 0.7) return;
    const hold = 5.78, dive = ease.inCubic(clamp((gt - hold) / (T_PLAT - hold)));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const breath = gt < hold ? 1 - 0.35 * ease.inOutQuad(clamp((gt - 5.7) / 0.08)) : 1; // tiny inhale before the dive
    const pt = (u) => [lerp(CX, SX, u), lerp(CY, SY, u)];
    const [px, py] = pt(dive);
    const vis = gt < T_PLAT ? 1 : 0;
    if (vis) {
      // echoes trailing up the path
      for (let i = 10; i >= 1; i--) {
        const u = ease.inCubic(clamp((gt - hold - i * 0.011) / (T_PLAT - hold))); if (u <= 0) continue;
        const [x, y] = pt(u), r = 34 * (1 - i / 12) * breath, a = 0.30 * (1 - i / 11);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(WHITE, a)); g.addColorStop(1, rgba(VIO, 0));
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      const R = 80 * breath, g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, rgba(mix(VIO, WHITE, 0.6), 0.9)); g.addColorStop(0.5, rgba(VIO, 0.28)); g.addColorStop(1, rgba(VIO, 0));
      ctx.fillStyle = g; ctx.fillRect(px - R, py - R, 2 * R, 2 * R);
      if (gt < hold + 0.02) { // anamorphic flare while it rests in the centre
        const L = 520 * (1 - clamp((gt - 5.6) / 0.35) * 0.35), fg = ctx.createLinearGradient(px - L, py, px + L, py);
        fg.addColorStop(0, rgba(CYA, 0)); fg.addColorStop(0.5, 'rgba(255,255,255,0.8)'); fg.addColorStop(1, rgba(CYA, 0));
        ctx.fillStyle = fg; ctx.fillRect(px - L, py - 1.5, 2 * L, 3);
      }
    }
    // impact: flash + ground shock ring
    const dt = gt - T_PLAT;
    if (dt >= 0) {
      const f = Math.exp(-dt * 15); const R = 220 * f + 40;
      const g = ctx.createRadialGradient(SX, SY, 0, SX, SY, R); g.addColorStop(0, rgba(mix(VIO, WHITE, 0.55), 0.8 * f)); g.addColorStop(1, rgba(VIO, 0));
      ctx.fillStyle = g; ctx.fillRect(SX - R, SY - R, 2 * R, 2 * R);
      const p = clamp(dt / 0.6);
      isoCircle(ctx, SX, SY, 0, lerp(30, 520, ease.outExpo(p)));
      ctx.strokeStyle = rgba(mix(VIO, CYA, 0.4), 0.9 * (1 - p)); ctx.lineWidth = lerp(6, 1, p); ctx.stroke();
    }
    ctx.restore();
  }

  // ───────────────────────────── 2. slabs ─────────────────────────────
  function slabGeom(k, gt) {
    const hit = T_LAND[k], fs = hit - FALL_D, dt = gt - hit;
    let fall = 0, q = 0, vis = 1;
    if (gt < fs) vis = 0;
    else if (gt < hit) { const u = (gt - fs) / FALL_D; fall = FALL_H * (1 - u * u); q = -0.14 * u * u; } // stretch while falling
    else q = 0.36 * Math.exp(-9 * dt) * Math.cos(34 * dt);                                           // squash then rebound
    let nudge = 0; // weight of slabs that land on top of this one pushes it down
    for (let m = k + 1; m < 4; m++) { const d = gt - T_LAND[m]; if (d >= 0) nudge += (10 + 3 * (m - k)) * Math.exp(-7 * d) * Math.cos(20 * d); }
    const bob = clamp((gt - hit - 0.45) / 0.4) * 2.4 * Math.sin(gt * 2.4 + k * 1.7);
    const thick = SLAB_T * (1 - q), z0 = zBottom(k) - nudge + bob;
    return { k, vis, q, thick, xy: 1 + 0.07 * q, z0, cx: SX, cy: SY - (z0 + fall) - thick / 2,
      boot: prog(gt, hit + 0.05, 0.6, ease.outCubic), flash: gt >= hit ? Math.exp(-16 * (gt - hit)) : 0, fell: gt >= hit };
  }

  // --- top-face patterns, drawn in flat (u,v) plane coordinates in [-h,h] ---
  function patCircuit(ctx, h, t, b, c) { // violet: chip with routed traces and travelling pulses
    const cs = h * 0.26, dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const paths = [];
    for (let d = 0; d < 4; d++) for (let l = -1; l <= 1; l++) {
      const [dx, dy] = dirs[d], px = -dy, py = dx, off = l * cs * 0.5;
      const jog = (hash(d * 7 + l * 3 + 1) - 0.5) * h * 0.46, L1 = h * (0.46 + hash(d * 5 + l + 9) * 0.14), end = h * (0.88 + hash(d + l * 2 + 4) * 0.08);
      const f = (fw, lat) => [dx * fw + px * lat, dy * fw + py * lat];
      paths.push([f(cs, off), f(L1, off), f(L1 + Math.abs(jog), off + jog), f(end, off + jog)]);
    }
    paths.forEach((p, i) => {
      let len = 0; for (let j = 1; j < p.length; j++) len += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]);
      const draw = clamp(b * 1.5 - i * 0.03);
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let j = 1; j < p.length; j++) ctx.lineTo(p[j][0], p[j][1]);
      ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - draw);
      ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(c, 0.55); ctx.stroke();
      const e = p[p.length - 1]; ctx.setLineDash([]); ctx.fillStyle = rgba(c, 0.95 * draw); ctx.fillRect(e[0] - 4, e[1] - 4, 8, 8);
      if (b > 0.7) { // data pulse
        ctx.setLineDash([26, len + 40]); ctx.lineDashOffset = -((t * 150 + i * 53) % (len + 66)) + 26;
        ctx.lineWidth = 3.2; ctx.strokeStyle = rgba(WHITE, 0.95); ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let j = 1; j < p.length; j++) ctx.lineTo(p[j][0], p[j][1]); ctx.stroke();
      }
    });
    ctx.setLineDash([]);
    rr(ctx, -cs, -cs, 2 * cs, 2 * cs, 6); ctx.fillStyle = rgba(c, 0.22 * b); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(c, b); ctx.stroke();
    rr(ctx, -cs * 0.45, -cs * 0.45, cs * 0.9, cs * 0.9, 3); ctx.fillStyle = rgba(WHITE, 0.55 * b); ctx.fill();
  }
  function patMemory(ctx, h, t, b, c) { // cyan: grid of memory cells that flicker as data is written
    const n = 7, pad = h * 0.12, cell = (2 * h - 2 * pad) / n, gp = cell * 0.13, tick = Math.floor(t * 7);
    const sweep = ((t * 0.8) % 1.5) - 0.25;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -h + pad + i * cell, y = -h + pad + j * cell, d = (i + j) / (2 * (n - 1));
      const on = clamp((b * 1.5 - d) * 3); if (on <= 0) continue;
      const lit = hash(i * 17.3 + j * 31.1 + tick * 5.7) > 0.55 || Math.abs(d - sweep) < 0.07;
      rr(ctx, x + gp, y + gp, cell - 2 * gp, cell - 2 * gp, cell * 0.2);
      ctx.fillStyle = rgba(lit ? mix(c, WHITE, 0.25) : c, (lit ? 0.9 : 0.12) * on); ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(c, 0.5 * on); ctx.stroke();
    }
  }
  function patAgents(ctx, h, t, b, c) { // magenta: hub with six orbiting agent nodes + data packets
    const R = h * 0.68, nr = h * 0.14, N = 6;
    ctx.lineWidth = 1.8; ctx.setLineDash([8, 9]); ctx.strokeStyle = rgba(c, 0.25 * b); ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < N; i++) {
      const a = i * Math.PI / 3 + t * 0.4, x = Math.cos(a) * R, y = Math.sin(a) * R, on = clamp(b * 1.6 - i * 0.12);
      ctx.strokeStyle = rgba(c, 0.5 * on); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x * on, y * on); ctx.stroke();
      const ph = (t * 1.3 + i * 0.37) % 1; ctx.fillStyle = rgba(WHITE, 0.9 * on); ctx.beginPath(); ctx.arc(x * ph, y * ph, 3.6, 0, 7); ctx.fill();
      const pr = (t * 1.1 + i / N) % 1; ctx.strokeStyle = rgba(c, 0.6 * (1 - pr) * on); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, nr * (1 + pr * 1.1), 0, 7); ctx.stroke();
      ctx.fillStyle = rgba(c, 0.95 * on); ctx.beginPath(); ctx.arc(x, y, nr * ease.outBack(on), 0, 7); ctx.fill();
      ctx.fillStyle = rgba(WHITE, 0.8 * on); ctx.beginPath(); ctx.arc(x, y, nr * 0.38, 0, 7); ctx.fill();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(c, b); ctx.beginPath(); ctx.arc(0, 0, h * 0.2, 0, 7); ctx.stroke();
    ctx.fillStyle = rgba(c, 0.35 * b); ctx.fill();
  }
  function patPorts(ctx, h, t, b, c) { // amber: 2x2 sockets, plugs slide in, LEDs blink
    const sz = h * 0.36, cs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    cs.forEach(([sx, sy], i) => {
      const x = sx * h * 0.44, y = sy * h * 0.44, on = clamp(b * 1.5 - i * 0.14), plug = ease.outBack(clamp(b * 1.7 - 0.25 - i * 0.14));
      rr(ctx, x - sz, y - sz * 0.62, sz * 2, sz * 1.24, 8); ctx.fillStyle = 'rgba(6,7,12,0.9)'; ctx.fill();
      ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(c, 0.9 * on); ctx.stroke();
      ctx.fillStyle = rgba(c, 0.85 * on); for (let p = -1; p <= 1; p += 2) ctx.fillRect(x + p * sz * 0.38 - 3, y - sz * 0.22, 6, sz * 0.44);
      const py = y + (1 - plug) * -sz * 1.3; // plug glides in from above
      rr(ctx, x - sz * 0.56, py - sz * 0.46, sz * 1.12, sz * 0.92, 5); ctx.fillStyle = rgba(mix(c, WHITE, 0.15), 0.85 * clamp(plug * 3)); ctx.fill();
      const led = hash(i * 9 + Math.floor(t * 4)) > 0.35;
      ctx.fillStyle = led ? rgba(MNT, on) : rgba(MNT, 0.18 * on); ctx.beginPath(); ctx.arc(x + sz * 0.78, y - sz * 0.38, 3.8, 0, 7); ctx.fill();
    });
  }
  const TOP_PATTERN = { circuit: patCircuit, memory: patMemory, agents: patAgents, ports: patPorts };

  // --- side-face motifs, flat coords: u along the face (0..L), v down the face (0..T) ---
  function patSide(ctx, kind, L, T, t, b, c) {
    ctx.lineCap = 'round';
    if (kind === 'circuit') {
      const y = T * 0.5, pts = [[0, y], [L * 0.2, y], [L * 0.28, y - T * 0.28], [L * 0.52, y - T * 0.28], [L * 0.6, y + T * 0.2], [L * 0.82, y + T * 0.2], [L * 0.88, y], [L, y]];
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.setLineDash([L * 1.4, L * 1.4]); ctx.lineDashOffset = L * 1.4 * (1 - clamp(b * 1.3));
      ctx.lineWidth = 2; ctx.strokeStyle = rgba(c, 0.8); ctx.stroke();
      ctx.setLineDash([28, L * 0.5]); ctx.lineDashOffset = -(t * 180) % (L * 0.5 + 28); ctx.lineWidth = 3; ctx.strokeStyle = rgba(WHITE, 0.9 * b); ctx.stroke(); ctx.setLineDash([]);
      for (const p of pts) { ctx.fillStyle = rgba(c, b); ctx.fillRect(p[0] - 3, p[1] - 3, 6, 6); }
    } else if (kind === 'memory') {
      const cols = Math.round(L / 20), cw = L / cols;
      for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++) {
        const on = clamp(b * 1.5 - i / cols * 0.6), lit = hash(i * 3.3 + j * 11.7 + Math.floor(t * 6)) > 0.5;
        ctx.fillStyle = rgba(c, (lit ? 0.85 : 0.14) * on); ctx.fillRect(i * cw + 2.5, T * (0.18 + 0.38 * j), cw - 5, T * 0.28);
      }
    } else if (kind === 'agents') {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n * L, on = clamp(b * 1.6 - i * 0.1), ph = (t * 1.4 - i * 0.18) % 1;
        ctx.fillStyle = rgba(c, 0.25 * on); ctx.beginPath(); ctx.arc(x, T / 2, T * 0.3 * (1 + ph * 0.4), 0, 7); ctx.fill();
        ctx.fillStyle = rgba(c, on); ctx.beginPath(); ctx.arc(x, T / 2, T * 0.17, 0, 7); ctx.fill();
      }
    } else {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n * L, on = clamp(b * 1.5 - i * 0.12);
        rr(ctx, x - L * 0.07, T * 0.26, L * 0.14, T * 0.48, 4); ctx.fillStyle = 'rgba(4,5,9,0.85)'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = rgba(c, 0.85 * on); ctx.stroke();
        ctx.fillStyle = rgba(hash(i * 5 + Math.floor(t * 3)) > 0.3 ? MNT : c, 0.9 * on); ctx.beginPath(); ctx.arc(x, T * 0.5, 2.8, 0, 7); ctx.fill();
      }
    }
  }

  // energy standoffs that sprout under a landed slab and connect it to the layer below
  function drawPosts(ctx, g, ex, gt, below) {
    const sp = SLABS[g.k], h = sp.h * g.xy - 14, s = ex.s;
    const grow = ease.outBack(clamp((gt - T_LAND[g.k] - 0.02) / 0.3)); if (grow <= 0) return;
    const lowerTop = below ? below.z0 + below.thick : 0, len = Math.max(2, (g.z0 - lowerTop) * grow);
    const ox = ex.x, oy = ex.y + g.thick * s / 2;
    const iso = (x, y, z) => [ox + (x - y) * C30 * s, oy + ((x + y) * 0.5 - z) * s];
    ctx.save(); ctx.lineCap = 'round';
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    corners.forEach(([sx, sy], i) => {
      const a = iso(sx * h, sy * h, 0), b = iso(sx * h, sy * h, -len), back = i === 0;
      const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, rgba(sp.c, back ? 0.5 : 0.95)); gr.addColorStop(1, rgba(sp.c, back ? 0.1 : 0.35));
      ctx.strokeStyle = gr; ctx.lineWidth = back ? 2.4 : 4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      if (!back) { ctx.fillStyle = rgba(WHITE, 0.8); ctx.beginPath(); ctx.arc(b[0], b[1], 3.2, 0, 7); ctx.fill(); }
    });
    ctx.restore();
  }

  function drawSlab(ctx, g, ex, gt) {
    if (!g.vis || ex.a <= 0.004) return;
    const sp = SLABS[g.k], c = sp.c, h = sp.h * g.xy, T = g.thick, s = ex.s;
    const ox = ex.x, oy = ex.y + T * s / 2;                       // origin = bottom-centre of the slab
    const iso = (x, y, z) => [ox + (x - y) * C30 * s, oy + ((x + y) * 0.5 - z) * s];
    const top = [iso(-h, -h, T), iso(h, -h, T), iso(h, h, T), iso(-h, h, T)];
    const right = [iso(h, -h, T), iso(h, h, T), iso(h, h, 0), iso(h, -h, 0)];
    const left = [iso(h, h, T), iso(-h, h, T), iso(-h, h, 0), iso(h, h, 0)];
    ctx.save(); ctx.globalAlpha = ex.a * clamp(g.vis);
    // speed streaks while falling
    // --- side faces: dark glass + accent wash + motif
    poly(ctx, right); ctx.fillStyle = '#080a13'; ctx.fill();
    let gr = ctx.createLinearGradient(0, right[0][1], 0, right[3][1]); gr.addColorStop(0, rgba(c, 0.22)); gr.addColorStop(1, rgba(c, 0.05));
    ctx.fillStyle = gr; ctx.fill();
    ctx.save(); poly(ctx, right); ctx.clip();
    basis(ctx, -C30 * s, 0.5 * s, 0, s, right[0][0], right[0][1], () => patSide(ctx, sp.kind, 2 * h, T, gt, g.boot, c)); ctx.restore();
    poly(ctx, left); ctx.fillStyle = '#0c0f1b'; ctx.fill();
    gr = ctx.createLinearGradient(left[0][0], 0, left[1][0], 0); gr.addColorStop(0, rgba(c, 0.38)); gr.addColorStop(1, rgba(c, 0.12));
    ctx.fillStyle = gr; ctx.fill();
    ctx.save(); poly(ctx, left); ctx.clip();
    basis(ctx, -C30 * s, -0.5 * s, 0, s, left[0][0], left[0][1], () => patSide(ctx, sp.kind, 2 * h, T, gt + 0.3, g.boot, c)); ctx.restore();
    // --- top face
    poly(ctx, top); ctx.fillStyle = '#0d1121'; ctx.fill();
    gr = ctx.createLinearGradient(top[0][0], top[0][1], top[2][0], top[2][1]); gr.addColorStop(0, rgba(c, 0.42)); gr.addColorStop(0.55, rgba(c, 0.14)); gr.addColorStop(1, rgba(c, 0.06));
    ctx.fillStyle = gr; ctx.fill();
    ctx.save(); poly(ctx, top); ctx.clip();
    basis(ctx, C30 * s, 0.5 * s, -C30 * s, 0.5 * s, ox, oy - T * s, () => TOP_PATTERN[sp.kind](ctx, h, gt, g.boot, c));
    // glossy diagonal sheen that sweeps once after landing
    const sw = clamp((gt - T_LAND[g.k]) / 0.55);
    if (sw > 0 && sw < 1) {
      const sx = lerp(top[3][0] - 40, top[1][0] + 40, ease.outCubic(sw)), sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, `rgba(255,255,255,${0.35 * (1 - sw)})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 60, top[0][1] - 4, 120, top[2][1] - top[0][1] + 8);
    }
    ctx.restore();
    // --- landing flash over everything
    if (g.flash > 0.01) { ctx.fillStyle = rgba(mix(c, WHITE, 0.22), 0.38 * g.flash); poly(ctx, top); ctx.fill(); poly(ctx, left); ctx.fill(); poly(ctx, right); ctx.globalAlpha *= 0.7; ctx.fill(); ctx.globalAlpha = ex.a * clamp(g.vis); }
    // --- neon edges
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(c, 0.55);
    ctx.beginPath(); ctx.moveTo(top[1][0], top[1][1]); ctx.lineTo(right[3][0], right[3][1]); ctx.moveTo(top[2][0], top[2][1]); ctx.lineTo(left[3][0], left[3][1]); ctx.moveTo(top[3][0], top[3][1]); ctx.lineTo(left[2][0], left[2][1]); ctx.stroke();
    ctx.save(); ctx.shadowColor = rgba(c, 0.95); ctx.shadowBlur = 20 + 30 * g.flash;
    ctx.lineWidth = 2.8; ctx.strokeStyle = rgba(mix(c, WHITE, 0.25 + 0.5 * g.flash), 1); poly(ctx, top); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(c, 0.9);
    ctx.beginPath(); ctx.moveTo(left[3][0], left[3][1]); ctx.lineTo(right[3][0], right[3][1]); ctx.moveTo(left[2][0], left[2][1]); ctx.lineTo(left[3][0], left[3][1]); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; // specular hairline on the two front top edges
    ctx.beginPath(); ctx.moveTo(top[3][0], top[3][1] + 1.5); ctx.lineTo(top[2][0], top[2][1] + 1.5); ctx.lineTo(top[1][0], top[1][1] + 1.5); ctx.stroke();
    ctx.restore();
  }

  // vertical speed lines + light column that precede each landing
  function drawFall(ctx, k, gt) {
    const hit = T_LAND[k], fs = hit - FALL_D; if (gt < fs - 0.28 || gt > hit + 0.5) return;
    const sp = SLABS[k], c = sp.c, z = zBottom(k), cx = SX, yTop = SY - z - SLAB_T - sp.h * 0.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // anticipation: holographic target diamond pulsing where the slab will land
    const ant = clamp((gt - (fs - 0.28)) / 0.28) * (gt < hit ? 1 : Math.exp(-(gt - hit) * 18));
    if (ant > 0.01) {
      const h = sp.h, iso = (x, y, zz) => [cx + (x - y) * C30, SY + (x + y) * 0.5 - zz];
      const d = [iso(-h, -h, z), iso(h, -h, z), iso(h, h, z), iso(-h, h, z)];
      ctx.setLineDash([14, 10]); ctx.lineDashOffset = -gt * 60; ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(c, 0.7 * ant); poly(ctx, d); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = rgba(c, 0.10 * ant); poly(ctx, d); ctx.fill();
    }
    // falling light column
    if (gt >= fs && gt <= hit + 0.12) {
      const u = clamp((gt - fs) / FALL_D), yBot = SY - z - SLAB_T * 0.5 - FALL_H * (1 - u * u) + 0, a = (gt <= hit ? 1 : 1 - (gt - hit) / 0.12);
      const wdt = sp.h * C30 * 0.9, g = ctx.createLinearGradient(0, yBot - 700, 0, yBot);
      g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, rgba(c, 0.14 * a));
      ctx.fillStyle = g; for (const m of [1, 0.66, 0.34]) ctx.fillRect(cx - wdt * m, yBot - 700, wdt * 2 * m, 700);
      ctx.strokeStyle = rgba(WHITE, 0.35 * a); ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * wdt * 0.42, yBot - 260 - Math.abs(i) * 60); ctx.lineTo(cx + i * wdt * 0.42, yBot - 10); ctx.stroke(); }
    }
    // landing pillar of light
    const dt = gt - hit;
    if (dt >= 0 && dt < 0.5) {
      const a = Math.exp(-dt * 7), yy = SY - z - SLAB_T, wdt = sp.h * C30 * 0.9, g = ctx.createLinearGradient(0, yy - 520, 0, yy);
      g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, rgba(mix(c, WHITE, 0.12), 0.20 * a));
      ctx.fillStyle = g; for (const m of [1, 0.66, 0.34]) ctx.fillRect(SX - wdt * m, yy - 520, wdt * 2 * m, 520);
    }
    ctx.restore();
  }

  function drawRingAndSparks(ctx, k, gt) {
    const dt = gt - T_LAND[k]; if (dt < 0 || dt > 0.85) return;
    const sp = SLABS[k], c = sp.c, h = sp.h, z = zBottom(k) - 2;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const D = 0.6;
    if (dt < D) { // shock ring in the plane under the slab
      const p = dt / D, e = ease.outExpo(p), r = lerp(h * 1.45, h * 1.45 + 250, e);
      isoCircle(ctx, SX, SY, z, r); ctx.lineWidth = lerp(7, 1, p); ctx.strokeStyle = rgba(c, 0.8 * Math.pow(1 - p, 1.5)); ctx.stroke();
      isoCircle(ctx, SX, SY, z, r * 0.86); ctx.lineWidth = lerp(3, 0.5, p); ctx.strokeStyle = rgba(WHITE, 0.6 * Math.pow(1 - p, 1.6)); ctx.stroke();
      // dust: soft translucent crescent puffs
      const dg = ctx.createRadialGradient(SX, SY - z, r * 0.6, SX, SY - z, r * 1.05); dg.addColorStop(0, rgba(c, 0)); dg.addColorStop(0.7, rgba(c, 0.10 * (1 - p))); dg.addColorStop(1, rgba(c, 0));
      ctx.save(); ctx.translate(SX, SY - z); ctx.scale(1, 0.577); ctx.translate(-SX, -(SY - z)); ctx.fillStyle = dg; ctx.fillRect(SX - r * 1.1, SY - z - r * 1.1, r * 2.2, r * 2.2); ctx.restore();
    }
    // sparks: ballistic, analytic
    const life = 0.8, a = 1 - dt / life;
    const proj = (x, y, zz) => [SX + (x - y) * C30, SY + (x + y) * 0.5 - zz];
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(mix(c, WHITE, 0.4), 0.95 * a); ctx.beginPath();
    for (let i = 0; i < 30; i++) {
      const an = hash(i * 7.7 + k * 131.3) * Math.PI * 2, v = 110 + hash(i * 3.3 + k * 17.1) * 300, vz = 120 + hash(i * 5.1 + k * 3.7) * 380;
      const at = (d) => { const rad = h * 1.2 + v * d; return proj(Math.cos(an) * rad, Math.sin(an) * rad, z + vz * d - 560 * d * d); };
      const p0 = at(dt), p1 = at(Math.max(0, dt - 0.03));
      ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p0[0], p0[1]);
    }
    ctx.stroke(); ctx.restore();
  }

  // ───────────────────────────── 3. labels on leader lines ─────────────────────────────
  const T_TAGCOL = 8.12; // tags fold into index chips to make room for the counter
  const TAG_X = 1292, TAG_W = 470, TAG_H = 88;
  const tagY = (k) => 735 - 100 * k;
  function typed(str, t0, gt, cps) { return str.slice(0, Math.max(0, Math.floor((gt - t0) * cps))); }

  function drawTag(ctx, g, ex, gt) {
    const k = g.k, sp = SLABS[k], c = sp.c, t0 = T_SLAB[k] + 0.04, dt = gt - t0; if (dt < 0 || ex <= 0.003) return;
    const vx = g.cx + 2 * sp.h * g.xy * C30 + 6, vy = g.cy, ty = tagY(k), dy = ty - vy;
    const cp = ease.inOutCubic(clamp((gt - T_TAGCOL) / 0.2));         // collapses into an index chip when the counter arrives
    ctx.save(); ctx.globalAlpha = ex;
    // leader: anchor ring -> 45deg diagonal -> horizontal run, drawn on with a dash
    const dgl = Math.abs(dy), diagEnd = [vx + 10 + dgl, vy + dy], L = dgl * Math.SQRT2 + (TAG_X - diagEnd[0]);
    const lp = ease.outExpo(clamp(dt / 0.22));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = 10; ctx.strokeStyle = rgba(c, 0.95); ctx.lineWidth = 2;
    ctx.setLineDash([L * lp, L * 2]); ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + 10, vy); ctx.lineTo(diagEnd[0], diagEnd[1]); ctx.lineTo(TAG_X, ty); ctx.stroke(); ctx.restore();
    const pop = ease.outBack(clamp(dt / 0.2)), ph = (gt * 1.2 + k * 0.3) % 1;
    ctx.fillStyle = rgba(WHITE, 1); ctx.beginPath(); ctx.arc(vx, vy, 5 * pop, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba(c, 0.8 * (1 - ph)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(vx, vy, 5 + 14 * ph, 0, 7); ctx.stroke();
    // panel
    const rv = ease.outQuint(clamp((dt - 0.08) / 0.3)); if (rv > 0.01) {
      const w = lerp(TAG_W, 74, cp) * rv, x = TAG_X, y = ty - TAG_H / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y - 30, w + 8, TAG_H + 60); ctx.clip();
      ctx.save(); rr(ctx, x, y, lerp(TAG_W, 74, cp), TAG_H, 14); ctx.clip();
      glass(ctx, x, y, lerp(TAG_W, 74, cp), TAG_H, 14, { fill: 'rgba(14,17,28,0.82)', border: rgba(c, 0.7), glowColor: rgba(c, 0.55), glowBlur: 28 });
      ctx.fillStyle = rgba(c, 1); ctx.fillRect(x, y, 5, TAG_H);
      const wg = ctx.createLinearGradient(x, 0, x + 160, 0); wg.addColorStop(0, rgba(c, 0.22)); wg.addColorStop(1, rgba(c, 0)); ctx.fillStyle = wg; ctx.fillRect(x, y, 160, TAG_H);
      ctx.restore();
      const ta = 1 - clamp(cp * 2.4);
      if (ta > 0.01) {
        const title = typed(sp.name, t0 + 0.13, gt, 150);
        text(ctx, title, x + 24, y + 40, { f: font(28, 700), track: 2, fill: '#ffffff', alpha: ta });
        if (title.length < sp.name.length) { const mw = measure(ctx, title, font(28, 700), 2); ctx.fillStyle = rgba(c, ta); ctx.fillRect(x + 24 + mw + 2, y + 16, 3, 28); }
        text(ctx, typed(sp.sub, t0 + 0.3, gt, 130), x + 24, y + 72, { f: font(22, 500), track: 0.4, fill: rgba(mix(c, WHITE, 0.55), 1), alpha: ta });
        text(ctx, '0' + (k + 1), x + TAG_W - 18, y + 30, { f: font(20, 600, 'mono'), fill: rgba(mix(c, WHITE, 0.3), 1), align: 'right', alpha: ta });
      }
      if (cp > 0.35) text(ctx, '0' + (k + 1), x + 74 / 2 + 2, y + TAG_H / 2 + 8, { f: font(24, 600, 'mono'), fill: rgba(mix(c, WHITE, 0.3), 1), align: 'center', alpha: clamp((cp - 0.35) * 2.5) });
      ctx.restore();
    }
    ctx.restore();
  }

  // ───────────────────────────── 4. file tree ─────────────────────────────
  const TP = { x: 96, y: 236, w: 468, h: 404 };
  const TREE = [
    { name: 'AGENTS.md', t: 6.34 }, { name: 'CLAUDE.md', t: 6.58 }, { name: '.serena/memories/', t: 6.84 },
    { name: '.claude/agents/', t: 7.34 }, { name: '.mcp.json', t: 7.84 }, { name: '.ennam-scaffold-backup/', t: 8.14 },
  ];
  function checkMark(ctx, x, y, r, p) { // circle pops, tick strokes itself on
    const pop = ease.outBack(clamp(p * 1.6));
    ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
    ctx.fillStyle = rgba(MNT, 0.18); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = rgba(MNT, 0.9); ctx.stroke();
    const tp = clamp((p - 0.25) / 0.6);
    if (tp > 0) {
      const pts = [[-r * 0.42, 0], [-r * 0.1, r * 0.34], [r * 0.46, -r * 0.34]], l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = rgba(MNT, 1); ctx.shadowColor = rgba(MNT, 0.9); ctx.shadowBlur = 10;
      ctx.setLineDash([(l1 + l2) * ease.outCubic(tp), 100]); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTree(ctx, gt, ex) {
    const appear = ease.outQuint(clamp((gt - 6.10) / 0.4)); if (appear <= 0.002 || ex.a <= 0.003) return;
    const done = TREE.filter((r) => gt >= r.t + 0.12).length;
    ctx.save();
    ctx.translate(ex.x, ex.y); ctx.scale(ex.s, ex.s); ctx.translate(-(TP.x + TP.w / 2), -(TP.y + TP.h / 2));
    ctx.globalAlpha = ex.a * clamp(appear * 1.4); ctx.translate(lerp(-70, 0, appear), 0);
    glass(ctx, TP.x, TP.y, TP.w, TP.h, 22, { fill: 'rgba(12,15,26,0.78)', glowColor: 'rgba(139,107,255,0.25)', glowBlur: 36 });
    // header: window dots, path, n/6
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#ff5d73', '#ffb347', '#5dffa0'][i]; ctx.globalAlpha *= 0.85; ctx.beginPath(); ctx.arc(TP.x + 30 + i * 20, TP.y + 34, 5.5, 0, 7); ctx.fill(); ctx.globalAlpha /= 0.85; }
    text(ctx, 'your-repo/', TP.x + 110, TP.y + 41, { f: font(23, 500, 'mono'), fill: pal.text });
    const all = done === TREE.length, hc = all ? MNT : CYA;
    text(ctx, done + '/' + TREE.length, TP.x + TP.w - 26, TP.y + 41, { f: font(21, 600, 'mono'), fill: rgba(hc, 1), align: 'right' });
    // progress hairline
    const prg = TREE.reduce((a, r) => a + ease.outCubic(clamp((gt - r.t) / 0.3)), 0) / TREE.length;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(TP.x + 24, TP.y + 62, TP.w - 48, 2);
    const pg = ctx.createLinearGradient(TP.x + 24, 0, TP.x + TP.w - 24, 0); pg.addColorStop(0, pal.violet); pg.addColorStop(1, pal.cyan);
    ctx.save(); ctx.shadowColor = pal.cyan; ctx.shadowBlur = 10; ctx.fillStyle = pg; ctx.fillRect(TP.x + 24, TP.y + 62, (TP.w - 48) * prg, 2); ctx.restore();
    // rows + branch lines
    const r0 = TP.y + 108, rh = 52, bx = TP.x + 36;
    const lastShown = TREE.reduce((a, r, i) => (gt >= r.t ? i : a), -1);
    if (lastShown >= 0) { ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, TP.y + 78); ctx.lineTo(bx, r0 + lastShown * rh - 6 - (1 - ease.outCubic(clamp((gt - TREE[lastShown].t) / 0.2))) * rh * 0.6); ctx.stroke(); }
    TREE.forEach((r, i) => {
      const dt = gt - r.t; if (dt < 0) return;
      const y = r0 + i * rh, dur = Math.min(0.26, r.name.length * 0.014);
      // highlight sweep as the line is written
      const hl = Math.exp(-dt * 5.5) * 0.9; if (hl > 0.02) { const hg = ctx.createLinearGradient(TP.x, 0, TP.x + TP.w, 0); hg.addColorStop(0, rgba(MNT, 0)); hg.addColorStop(0.25, rgba(MNT, 0.16 * hl)); hg.addColorStop(1, rgba(MNT, 0)); ctx.fillStyle = hg; ctx.fillRect(TP.x + 12, y - 28, TP.w - 24, 46); }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, y - 6); ctx.lineTo(bx + 18, y - 6); ctx.stroke();
      const n = Math.min(r.name.length, Math.ceil(clamp(dt / dur) * r.name.length)), shown = r.name.slice(0, n);
      const isDir = r.name.endsWith('/'), base = isDir ? r.name.slice(0, -1) : r.name;
      const f = font(24, 500, 'mono');
      const part = shown.slice(0, base.length), slash = shown.length > base.length ? '/' : '';
      const w = text(ctx, part, TP.x + 68, y + 2, { f, fill: isDir ? '#bfe9ff' : pal.text });
      if (slash) text(ctx, slash, TP.x + 68 + w, y + 2, { f, fill: pal.dim });
      if (n < r.name.length) { ctx.fillStyle = rgba(CYA, 1); ctx.fillRect(TP.x + 68 + measure(ctx, shown, f) + 3, y - 18, 11, 24); }
      checkMark(ctx, TP.x + TP.w - 38, y - 7, 14, clamp((dt - dur * 0.6) / 0.28));
    });
    ctx.restore();
  }

  // ───────────────────────────── 5. the "0" counter ─────────────────────────────
  const CP = { x: 1580, y: 480 };                // counter centre
  const REEL = { w: 460, h: 580, pitch: 540, font: 560 };
  const reelC = document.createElement('canvas'); reelC.width = REEL.w; reelC.height = REEL.h; const rctx = reelC.getContext('2d');
  const T_REEL = 8.2, T_APPEAR = 8.18;

  function drawReel(ctx, gt, scale) {
    const u = clamp((gt - T_REEL) / (T_ZERO - T_REEL)), N = 20;
    const p = N * Math.pow(1 - u, 2.5);                                 // digits remaining; 0 exactly at the lock
    const v = (N * 2.5 * Math.pow(1 - u, 1.5) / (T_ZERO - T_REEL)) * REEL.pitch * (gt < T_ZERO ? 1 : 0); // px/s
    const stretch = 1 + Math.min(v / 40000, 0.5);   // light smear only: digits stay readable while rolling
    const white = ease.outCubic(clamp((gt - (T_ZERO - 0.12)) / 0.12));      // gradient digits cool to a crisp white 0
    rctx.setTransform(1, 0, 0, 1, 0, 0); rctx.clearRect(0, 0, REEL.w, REEL.h); rctx.globalCompositeOperation = 'source-over';
    const cx = REEL.w / 2, cy = REEL.h / 2;
    const gdig = rctx.createLinearGradient(0, cy - 230, 0, cy + 230); gdig.addColorStop(0, '#b7a4ff'); gdig.addColorStop(0.5, '#8b6bff'); gdig.addColorStop(1, '#2ee6d6');
    rctx.font = font(REEL.font, 700); rctx.textAlign = 'center'; rctx.textBaseline = 'alphabetic'; rctx.fillStyle = gdig;
    const i0 = Math.floor(p) - 2;
    for (let i = i0; i <= i0 + 5; i++) {
      const y = cy + (i - p) * REEL.pitch; if (Math.abs(y - cy) > REEL.pitch * 1.3) continue;
      const d = ((i % 10) + 10) % 10;
      rctx.save(); rctx.translate(cx, y); rctx.scale(1, stretch); rctx.globalAlpha = 1 / (1 + (stretch - 1) * 0.4);
      rctx.fillText(String(d), 0, REEL.font * 0.36);
      if (white > 0 && i === 0) { rctx.fillStyle = `rgba(255,255,255,${white})`; rctx.fillText(String(d), 0, REEL.font * 0.36); rctx.fillStyle = gdig; }
      rctx.restore();
    }
    // slot-window fade: digits dissolve at top and bottom
    rctx.globalCompositeOperation = 'destination-in';
    const m = rctx.createLinearGradient(0, 0, 0, REEL.h); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.12, 'rgba(0,0,0,1)'); m.addColorStop(0.88, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    rctx.fillStyle = m; rctx.fillRect(0, 0, REEL.w, REEL.h); rctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(reelC, -REEL.w / 2, -REEL.h / 2);
  }

  function drawCounter(ctx, gt, ex) {
    const appear = ease.outQuint(clamp((gt - T_APPEAR) / 0.3)); if (appear <= 0.002 || ex.a <= 0.003) return;
    const dl = gt - T_LOCK, lk = dl >= 0 ? Math.exp(-dl * 9) : 0;            // audio 'lock' stamp
    const dz = gt - T_ZERO, lz = dz >= 0 ? Math.exp(-dz * 10) : 0;           // the roll settling on 0
    ctx.save(); ctx.translate(ex.x, ex.y); ctx.scale(ex.s, ex.s); ctx.translate(-CP.x, -CP.y);
    ctx.globalAlpha = ex.a * clamp(appear * 1.3);
    // halo behind the digit: kept low so the white 0 reads as the brightest thing on screen
    const hr = 340 + 90 * lk, hg = ctx.createRadialGradient(CP.x, CP.y, 0, CP.x, CP.y, hr);
    hg.addColorStop(0, rgba(mix(VIO, CYA, 0.35), 0.16 + 0.10 * lz + 0.2 * lk)); hg.addColorStop(1, rgba(VIO, 0)); ctx.fillStyle = hg; ctx.fillRect(CP.x - hr, CP.y - hr, hr * 2, hr * 2);
    // frame corners
    const fx = CP.x - 180, fy = CP.y - 262, fw = 360, fh = 524, ll = 46 * ease.outBack(appear);
    ctx.save(); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(mix(CYA, WHITE, 0.5 * lk), 0.9); ctx.shadowColor = rgba(CYA, 0.9); ctx.shadowBlur = 14 + 30 * lk;
    for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = fx + sx * fw, y = fy + sy * fh, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x + dx * ll, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * ll); ctx.stroke();
    }
    ctx.restore();
    // reel: lands on 0 at T_ZERO with a spring settle, then holds crisp. No inner shading, just a thin outer glow.
    const punch = 1 + 0.07 * lz * Math.cos(dz * 30) + (dl >= 0 ? 0.06 * Math.exp(-dl * 9) * Math.cos(dl * 34) : 0);
    ctx.save(); ctx.translate(CP.x, CP.y + 8); ctx.scale(punch, punch);
    ctx.shadowColor = rgba(mix(VIO, CYA, 0.3), 0.55); ctx.shadowBlur = 18 + 16 * lk;
    drawReel(ctx, gt, 1);
    if (gt >= T_ZERO) { // additive pass keeps the settled 0 pure white after bloom/vignette grading
      ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'lighter'; ctx.font = font(REEL.font, 700); ctx.textAlign = 'center'; ctx.fillStyle = `rgba(255,255,255,${0.30 + 0.5 * lk})`; ctx.fillText('0', 0, REEL.font * 0.36);
    }
    ctx.restore();
    // caption (types in while the 0 holds) + reversible badge
    const capT = 8.34, cap = 'lines of your app code touched', capShown = typed(cap, capT, gt, 90);
    if (capShown.length) {
      const f = font(30, 500), wC = measure(ctx, cap, f, 0.4), x0 = CP.x - wC / 2;
      text(ctx, capShown, x0, CP.y + 330, { f, fill: capShown.length === cap.length || lk > 0.05 ? '#ffffff' : '#dfe4f2', track: 0.4 });
      if (capShown.length < cap.length) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + measure(ctx, capShown, f, 0.4) + 3, CP.y + 304, 3, 34); }
    }
    const bp = ease.outBack(clamp((gt - 8.56) / 0.3));
    if (bp > 0.01) {
      const bw = 388, bh = 52, bx = CP.x - bw / 2, by = CP.y + 366;
      ctx.save(); ctx.translate(CP.x, by + bh / 2); ctx.scale(bp, bp); ctx.translate(-CP.x, -(by + bh / 2));
      glass(ctx, bx, by, bw, bh, 26, { fill: 'rgba(93,255,160,0.12)', border: rgba(MNT, 0.7), glowColor: rgba(MNT, 0.4), glowBlur: 18 });
      ctx.strokeStyle = rgba(MNT, 1); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(bx + 32, by + bh / 2, 9, Math.PI * 0.2, Math.PI * 1.55); ctx.stroke();
      ctx.fillStyle = rgba(MNT, 1); ctx.beginPath(); ctx.moveTo(bx + 21, by + bh / 2 - 13); ctx.lineTo(bx + 31, by + bh / 2 - 6); ctx.lineTo(bx + 18, by + bh / 2 - 3); ctx.closePath(); ctx.fill();
      text(ctx, 'reversible · backed up', bx + 58, by + bh / 2 + 7.5, { f: font(22, 500, 'mono'), fill: '#e6fff0' });
      ctx.restore();
    }
    // landing ring on the settle, bigger ring + tick on the audio lock
    if (dz >= 0 && dz < 0.4) {
      const p = clamp(dz / 0.4), r = lerp(150, 235, ease.outExpo(p));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(CYA, 0.45 * (1 - p)); ctx.lineWidth = lerp(4, 1, p); ctx.beginPath(); ctx.arc(CP.x, CP.y, r, 0, 7); ctx.stroke(); ctx.restore();
    }
    if (dl >= 0 && dl < 0.6) {
      const p = clamp(dl / 0.55), r = lerp(120, 330, ease.outExpo(p));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(mix(MNT, WHITE, 0.3), 0.55 * (1 - p)); ctx.lineWidth = lerp(5, 1, p); ctx.beginPath(); ctx.arc(CP.x, CP.y, r, 0, 7); ctx.stroke(); ctx.restore();
    }
    if (dl >= 0.03) checkMark(ctx, CP.x + 180, CP.y - 262, 28, clamp((dl - 0.03) / 0.35));
    ctx.restore();
  }

  // ───────────────────────────── 6. exit: energy streams into the centre ─────────────────────────────
  const PARTS = (() => { // constant seed table (not per-frame state)
    const regions = [{ x: 640, y: 330, w: 580, h: 640, d: 0.0, n: 50 }, { x: 96, y: 236, w: 468, h: 404, d: 0.015, n: 30 }, { x: 1416, y: 220, w: 360, h: 560, d: 0.03, n: 36 }];
    const cols = [VIO, CYA, MAG, AMB, WHITE], out = [];
    regions.forEach((rg, ri) => { for (let i = 0; i < rg.n; i++) {
      const s = ri * 211 + i * 7.31, r = hash(s + 1.1), start = T_EXIT + 0.005 + rg.d + r * 0.03;
      out.push({ x: rg.x + hash(s + 2.2) * rg.w, y: rg.y + hash(s + 3.3) * rg.h, start, life: Math.max(0.04, Math.min(0.09 + hash(s + 4.4) * 0.04, T_END - 0.02 - start)), side: hash(s + 5.5) > 0.5 ? 1 : -1, bow: 0.1 + hash(s + 6.6) * 0.28, col: cols[(hash(s + 7.7) * 5) | 0], w: 1.5 + hash(s + 8.8) * 2.5 });
    } });
    return out;
  })();
  function drawStream(ctx, gt) {
    if (gt < T_EXIT) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const bez = (P, q) => { const mx = (P.x + CX) / 2, my = (P.y + CY) / 2, dx = CX - P.x, dy = CY - P.y; const kx = mx - dy * P.bow * P.side, ky = my + dx * P.bow * P.side; const m = 1 - q; return [m * m * P.x + 2 * m * q * kx + q * q * CX, m * m * P.y + 2 * m * q * ky + q * q * CY]; };
    for (const P of PARTS) {
      const p = (gt - P.start) / P.life; if (p <= 0 || p >= 1) continue;
      const q = ease.inCubic(p), q0 = ease.inCubic(Math.max(0, p - 0.22)), a = clamp(p * 8) * (1 - Math.pow(p, 6));
      const h = bez(P, q), t = bez(P, q0);
      ctx.strokeStyle = rgba(P.col, 0.8 * a); ctx.lineWidth = P.w * (1 - 0.5 * p);
      ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
    }
    ctx.restore();
  }
  function drawCore(ctx, gt) {
    if (gt < T_EXIT + 0.02) return;
    const g = clamp((gt - T_EXIT) / (T_END - T_EXIT - 0.02)), grow = ease.inQuad(g);
    const fade = 1 - clamp((gt - (T_END - 0.05)) / 0.05);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade;
    // converging rings (energy drawn in)
    for (let i = 0; i < 4; i++) {
      const t0 = T_EXIT + 0.005 + i * 0.03, p = clamp((gt - t0) / 0.09); if (p <= 0 || p >= 1) continue;
      const r = lerp(400, 30, ease.inQuad(p)); ctx.strokeStyle = rgba(i % 2 ? CYA : VIO, 0.5 * Math.sin(p * Math.PI)); ctx.lineWidth = 3 * (1 - p) + 1; ctx.beginPath(); ctx.arc(CX, CY, r, 0, 7); ctx.stroke();
    }
    const R = 40 + 230 * grow, rg = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.12, rgba(mix(VIO, WHITE, 0.7), 0.95)); rg.addColorStop(0.4, rgba(mix(VIO, CYA, 0.4), 0.35 + 0.25 * grow)); rg.addColorStop(1, rgba(VIO, 0));
    ctx.fillStyle = rg; ctx.fillRect(CX - R, CY - R, 2 * R, 2 * R);
    const L = 120 + 560 * grow, fg = ctx.createLinearGradient(CX - L, 0, CX + L, 0); fg.addColorStop(0, rgba(CYA, 0)); fg.addColorStop(0.5, `rgba(255,255,255,${0.35 + 0.5 * grow})`); fg.addColorStop(1, rgba(CYA, 0));
    ctx.fillStyle = fg; ctx.fillRect(CX - L, CY - 1.5 - 2 * grow, 2 * L, 3 + 4 * grow);
    ctx.restore();
  }

  // ───────────────────────────── scene ─────────────────────────────
  ENN.scene({
    id: 's3',
    draw(ctx, lt, gt) {
      const tx = (t0, dur, x0, y0, side) => pull(gt, t0, dur, x0, y0, side);
      drawFloor(ctx, gt, 1 - ease.inQuad(clamp((gt - T_EXIT) / 0.12)));
      drawIntro(ctx, gt);

      // platform + slabs (pulled in bottom-last)
      const pl = tx(T_EXIT + 0.02, 0.12, SX, SY, 1);
      drawPlatform(ctx, gt, { x: pl.x, y: pl.y, s: pl.s, a: pl.a });
      const geoms = [0, 1, 2, 3].map((k) => slabGeom(k, gt));
      for (let k = 0; k < 4; k++) drawFall(ctx, k, gt);
      for (let k = 0; k < 4; k++) {
        const g = geoms[k], ex = tx(T_EXIT + (3 - k) * 0.01, 0.12, g.cx, g.cy, k % 2 ? -1 : 1);
        drawPosts(ctx, g, ex, gt, k ? geoms[k - 1] : null);
        drawSlab(ctx, g, ex, gt);
        if (ex.p > 0 && ex.p < 1) streak(ctx, gt, T_EXIT + (3 - k) * 0.01, 0.12, g.cx, g.cy, k % 2 ? -1 : 1, SLABS[k].c, 10);
      }
      for (let k = 0; k < 4; k++) drawRingAndSparks(ctx, k, gt);
      for (let k = 0; k < 4; k++) drawTag(ctx, geoms[k], 1 - ease.inQuad(clamp((gt - T_EXIT) / 0.06)), gt);

      const tr = tx(T_EXIT, 0.13, TP.x + TP.w / 2, TP.y + TP.h / 2, -1);
      drawTree(ctx, gt, tr);
      if (tr.p > 0 && tr.p < 1) streak(ctx, gt, T_EXIT, 0.13, TP.x + TP.w / 2, TP.y + TP.h / 2, -1, CYA, 14);

      const ct = tx(T_EXIT + 0.01, 0.12, CP.x, CP.y, 1);
      drawCounter(ctx, gt, ct);
      if (ct.p > 0 && ct.p < 1) streak(ctx, gt, T_EXIT + 0.01, 0.12, CP.x, CP.y, 1, MNT, 16);

      drawStream(ctx, gt);
      drawCore(ctx, gt);
    },
  });
})();
