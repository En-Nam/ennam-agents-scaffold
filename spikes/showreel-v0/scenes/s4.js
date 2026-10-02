// SCENE s4 "Army" (8.9 -> 12.2s)
// Brain-core ignites at hit[11], six agent badges pop onto a tilted 3D orbit (hits[12..17]), beams + packets +
// relay arcs, a ring of memory cells, a word-by-word stat line, then the whole system spirals into a point
// that scene s5 detonates at hit[18]. Everything is an analytic function of time (no carried state).
(function () {
  const { clamp, lerp, ease, prog, hash, pal, font, rr, glass, text, measure, hitAt, rng, anticipate } = ENN;
  const TL = ENN.TL, WIN = TL.scenes.s4, W = ENN.W, H = ENN.H;

  // locate impacts by kind (indices in TL.hits, not hard-coded)
  const IGN = TL.hits.findIndex((h) => h.kind === 'ignite');
  const POPS = TL.hits.map((h, i) => (h.kind === 'pop' ? i : -1)).filter((i) => i >= 0);
  const T = {
    start: WIN.start, end: WIN.end,
    ignite: TL.hits[IGN].t,
    pop: POPS.map((i) => TL.hits[i].t),
    brain: 9.9, memory: 10.35, army: 10.8,
    exit: 11.8,       // 3D system collapse starts
    textExit: 11.9, textDur: 0.2,   // tagline + HUD held fully readable (>=0.6s) until here, then sucked into the point
  };
  const CX = 960, CY = 500, FOC = 2200, SPH = 200;
  const ORBIT_R = 500, ORBIT_TILT = 0.40;
  const MEM_R = 318, MEM_TILT = 0.95, MEM_ROLL = -0.5, MEM_N = 30;
  const TAU = Math.PI * 2;
  const LANE = 770;   // y below this is reserved for the tagline (chips never enter y>~830)

  // ───────────────────────── colour helpers ─────────────────────────
  const RGB = {};
  function rgb(hex) { return RGB[hex] || (RGB[hex] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]); }
  const rgba = (hex, a) => { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const mixc = (a, b, k, al = 1) => {
    const A = rgb(a), B = rgb(b);
    return `rgba(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))},${al})`;
  };
  const fract = (v) => v - Math.floor(v);

  // ───────────────────────── exit / timing curves ─────────────────────────
  const exitU = (gt) => clamp((gt - T.exit) / (T.end - T.exit));
  const orbitSpin = (gt) => 0.62 * (gt - T.ignite) + 4.5 * Math.pow(exitU(gt), 2);   // speed ramp on exit
  const sysScale = (U) => 1 - Math.pow(U, 3.2);                                      // spiral inward
  const orbitTilt = (U) => ORBIT_TILT + 1.12 * ease.inOutCubic(U);                  // flattens edge-on -> a line
  const winFade = (gt) => 1 - ease.inQuad(clamp((exitU(gt) - 0.68) / 0.32));

  function pulseEnergy(gt) {
    let e = hitAt(IGN, gt, 6);
    for (const i of POPS) e += hitAt(i, gt, 9) * 1.3;
    return Math.min(e, 1.5);
  }

  // ───────────────────────── 3D projection ─────────────────────────
  // x,y,z in system space; rotate about X by tilt, then screen-roll; perspective divide.
  function proj(x, y, z, tilt, roll, cx = CX, cy = CY) {
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    let y1 = y * ct + z * st, z1 = -y * st + z * ct, x1 = x;
    if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll); const xr = x1 * cr - y1 * sr; y1 = x1 * sr + y1 * cr; x1 = xr; }
    const s = FOC / (FOC - z1);
    return { x: cx + x1 * s, y: cy + y1 * s, z: z1, s };
  }

  // ───────────────────────── neural sphere data (constant geometry) ─────────────────────────
  const NODES = [], EDGES = [], EDGE_R = [];
  (function buildBrain() {
    const rn = rng(77), golden = Math.PI * (3 - Math.sqrt(5));
    const SHELL = 104, INNER = 38;
    for (let i = 0; i < SHELL; i++) {
      const y = 1 - ((i + 0.5) / SHELL) * 2, r = Math.sqrt(1 - y * y), th = golden * i, k = 0.96 + 0.07 * rn();
      NODES.push([Math.cos(th) * r * k, y * k, Math.sin(th) * r * k]);
    }
    for (let i = 0; i < INNER; i++) {
      const y = 1 - ((i + 0.5) / INNER) * 2, r = Math.sqrt(1 - y * y), th = golden * i + 1.3, k = 0.32 + 0.42 * rn();
      NODES.push([Math.cos(th) * r * k, y * k, Math.sin(th) * r * k]);
    }
    const seen = new Set();
    for (let i = 0; i < NODES.length; i++) {
      const ds = [];
      for (let j = 0; j < NODES.length; j++) {
        if (j === i) continue;
        const dx = NODES[i][0] - NODES[j][0], dy = NODES[i][1] - NODES[j][1], dz = NODES[i][2] - NODES[j][2];
        ds.push([dx * dx + dy * dy + dz * dz, j]);
      }
      ds.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < 4; k++) {
        const j = ds[k][1], key = Math.min(i, j) * 1000 + Math.max(i, j);
        if (seen.has(key)) continue; seen.add(key);
        EDGES.push([Math.min(i, j), Math.max(i, j)]);
      }
    }
    for (const [a, b] of EDGES) {
      const mx = (NODES[a][0] + NODES[b][0]) / 2, my = (NODES[a][1] + NODES[b][1]) / 2, mz = (NODES[a][2] + NODES[b][2]) / 2;
      EDGE_R.push(Math.sqrt(mx * mx + my * my + mz * mz));
    }
  })();
  // travelling signals: which edge, phase, speed, direction
  const SIGS = (() => { const r = rng(5), a = []; for (let i = 0; i < 64; i++) a.push({ e: Math.floor(r() * EDGES.length), ph: r(), sp: 0.7 + r() * 1.1, dir: r() < 0.5 ? 1 : -1 }); return a; })();
  const WAVES = [{ t0: T.ignite, amp: 1.0 }, { t0: T.brain, amp: 0.85 }, { t0: T.army, amp: 0.5 }];
  // brightness of a node/edge at unit radius r, from outward-travelling activation waves
  function waveLit(gt, r) {
    let l = 0;
    for (const w of WAVES) {
      const dt = gt - w.t0; if (dt < 0) continue;
      const d = (r - dt * 2.7) / 0.2;
      l += w.amp * Math.exp(-d * d) * Math.exp(-dt * 0.9);
    }
    return Math.min(l, 1.2);
  }

  // ───────────────────────── agents ─────────────────────────
  function icoStroke(ctx, col, fn) { ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; fn(); ctx.restore(); }
  const ICONS = {
    hub(ctx, col) { // orchestrator: a hub with three satellites
      icoStroke(ctx, col, () => {
        ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + k * TAU / 3, x = Math.cos(a) * 10, y = Math.sin(a) * 10;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 3.4, Math.sin(a) * 3.4); ctx.lineTo(x * 0.78, y * 0.78); ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.stroke();
        }
      });
    },
    code(ctx, col) { // implementer: </>
      icoStroke(ctx, col, () => {
        ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(-10, 0); ctx.lineTo(-4, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(10, 0); ctx.lineTo(4, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-2, 9); ctx.stroke();
      });
    },
    review(ctx, col) { // reviewer: magnifier with a check
      icoStroke(ctx, col, () => {
        ctx.beginPath(); ctx.arc(-2, -2, 7.5, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3.6, 3.6); ctx.lineTo(10, 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5.4, -2); ctx.lineTo(-2.6, 1); ctx.lineTo(1.8, -5); ctx.stroke();
      });
    },
    crown(ctx, col) { // team-lead
      icoStroke(ctx, col, () => {
        ctx.beginPath(); ctx.moveTo(-10, 5); ctx.lineTo(-10, -6); ctx.lineTo(-4.5, 0); ctx.lineTo(0, -9); ctx.lineTo(4.5, 0); ctx.lineTo(10, -6); ctx.lineTo(10, 5); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(10, 10); ctx.stroke();
      });
    },
    browser(ctx, col) { // web-dev
      icoStroke(ctx, col, () => {
        rr(ctx, -10.5, -9, 21, 18, 3.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-10.5, -3.5); ctx.lineTo(10.5, -3.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(-6.6, -6.3, 0.9, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-3.6, -6.3, 0.9, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-6, 1.5); ctx.lineTo(6, 1.5); ctx.moveTo(-6, 5.5); ctx.lineTo(1.5, 5.5); ctx.stroke();
      });
    },
    flag(ctx, col) { // project-owner
      icoStroke(ctx, col, () => {
        ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-6, 10.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(9, -5); ctx.lineTo(-6, 1.5); ctx.closePath(); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      });
    },
  };
  const AGENTS = [
    { name: 'orchestrator', c: pal.violet, icon: ICONS.hub },
    { name: 'implementer', c: pal.cyan, icon: ICONS.code },
    { name: 'reviewer', c: pal.amber, icon: ICONS.review },
    { name: 'team-lead', c: pal.magenta, icon: ICONS.crown },
    { name: 'web-dev', c: pal.mint, icon: ICONS.browser },
    { name: 'project-owner', c: '#6fa8ff', icon: ICONS.flag },
  ];
  AGENTS.forEach((a, i) => { a.a0 = 2.35 + i * (TAU / 6); });

  // screen position of badge i at time gt (also used for spark origins & speed trails)
  function badge(i, gt) {
    const pt = T.pop[i], U = exitU(gt), emerge = ease.outExpo(clamp((gt - pt) / 0.4));
    const R = ORBIT_R * lerp(0.28, 1, emerge) * sysScale(U);
    const th = AGENTS[i].a0 + orbitSpin(gt);
    const p = proj(R * Math.cos(th), 0, R * Math.sin(th), orbitTilt(U), 0, CX, CY);
    p.d = clamp((p.z / ORBIT_R + 1) / 2);   // 0 back .. 1 front
    if (p.y > LANE) p.y = LANE + (p.y - LANE) * 0.2; // soft-compress: orbiting chips avoid the tagline lane
    return p;
  }

  // relay arcs: agent -> agent hops (deterministic schedule)
  const ARCS = [];
  for (let k = 0; k < 14; k++) {
    const a = Math.floor(hash(k * 3.7 + 1) * 6), b = (a + 1 + Math.floor(hash(k * 5.3 + 2) * 5)) % 6;
    ARCS.push({ t0: 10.55 + k * 0.17, dur: 0.5, a, b });
  }
  const PK_SP = 1.25; // beam packet cycles per second
  const packetOff = (i, k) => fract(hash(i * 7.1 + k * 3.3) + k * 0.5);

  // glow amount of a chip = recent pop flash / packet arrival / relay arrival / army flare
  function chipGlow(i, gt) {
    let g = 0;
    const dp = gt - T.pop[i]; if (dp >= 0) g = Math.max(g, Math.exp(-dp * 5));
    for (let k = 0; k < 2; k++) { // outward packets arrive at the chip when their phase wraps
      if (gt > T.pop[i] + 0.45) g = Math.max(g, 0.55 * Math.exp(-8 * fract(gt * PK_SP + packetOff(i, k)) / PK_SP));
    }
    for (const A of ARCS) if (A.b === i) { const d = gt - (A.t0 + A.dur * 0.86); if (d >= 0) g = Math.max(g, 0.9 * Math.exp(-d * 8)); }
    const da = gt - (T.army + i * 0.045); if (da >= 0) g = Math.max(g, Math.exp(-da * 4));
    return g;
  }

  // ───────────────────────── atoms ─────────────────────────
  function dotGlow(ctx, x, y, r, col, a) { // soft additive blob (no shadowBlur)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, rgba(col, a * Math.pow(1 - k / 6, 2.4))); // eased falloff, no banding
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function ping(ctx, x, y, p, col, rMax = 95, w = 3.5) {
    if (p <= 0 || p >= 1) return;
    const e = ease.outExpo(p);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.9 * Math.pow(1 - p, 1.4)); ctx.lineWidth = lerp(w, 0.6, p);
    ctx.beginPath(); ctx.arc(x, y, 14 + rMax * e, 0, TAU); ctx.stroke(); ctx.restore();
  }
  function ringPolyline(ctx, R, tilt, roll, alphaBack, alphaFront, col, lw) {
    const N = 120, pts = [];
    for (let k = 0; k <= N; k++) { const th = k / N * TAU; pts.push(proj(R * Math.cos(th), 0, R * Math.sin(th), tilt, roll)); }
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let k = 0; k < N; k++) {
        const front = (pts[k].z + pts[k + 1].z) > 0;
        if (front !== (pass === 1)) continue;
        ctx.moveTo(pts[k].x, pts[k].y); ctx.lineTo(pts[k + 1].x, pts[k + 1].y);
      }
      ctx.strokeStyle = rgba(col, pass ? alphaFront : alphaBack); ctx.lineWidth = lw; ctx.stroke();
    }
  }
  // bright comet that chases around a ring
  function ringComet(ctx, R, tilt, roll, thHead, col, a, lw, len = 0.9) {
    const n = 26; let prev = null;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let k = 0; k <= n; k++) {
      const th = thHead - (k / n) * len, p = proj(R * Math.cos(th), 0, R * Math.sin(th), tilt, roll);
      if (prev) { ctx.strokeStyle = rgba(col, a * Math.pow(1 - k / n, 1.6) * (0.5 + 0.5 * clamp((p.z / R + 1) / 2))); ctx.lineWidth = lw * (1 - k / n * 0.6); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      prev = p;
    }
    ctx.restore();
  }

  // ───────────────────────── pre-ignite & inflow streaks ─────────────────────────
  function drawInflow(ctx, gt, t0, t1, seed, n, swirlMag, rScale, wMul) {
    if (gt < t0 || gt > t1) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const cols = [pal.cyan, pal.violet, '#ffffff'];
    for (let i = 0; i < n; i++) {
      const h1 = hash(seed + i * 1.13), h2 = hash(seed + i * 2.71 + 5), h3 = hash(seed + i * 0.37 + 9);
      const delay = h3 * (t1 - t0) * 0.45, p = clamp((gt - t0 - delay) / (t1 - t0 - delay));
      if (p <= 0 || p >= 1) continue;
      const a0 = h1 * TAU, R0 = (380 + h2 * 1000) * rScale, sw = (h3 > 0.5 ? 1 : -1) * swirlMag;
      const at = (q) => { const r = R0 * (1 - ease.inCubic(q)), a = a0 + sw * q; return [CX + Math.cos(a) * r, CY + Math.sin(a) * r * 0.82]; };
      // curved, tapered trail (spiral inward): 4 short segments fading toward the tail
      let prev = at(p);
      for (let k = 1; k <= 4; k++) {
        const q = at(Math.max(0, p - 0.15 * k / 4));
        ctx.strokeStyle = rgba(cols[i % 3], (0.12 + 0.8 * p) * (1 - (k - 1) / 4)); ctx.lineWidth = (1 + 2.4 * p) * wMul * (1 - (k - 1) / 5);
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); prev = q;
      }
      ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.7 * p})`; ctx.beginPath(); ctx.arc(at(p)[0], at(p)[1], 1.2 + 1.6 * p, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawEmber(ctx, gt) { // the hot point s3 drained energy into
    const a = anticipate(gt, T.ignite, 0.42), k = ease.inQuad(a);
    if (gt >= T.ignite || gt < T.start) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    dotGlow(ctx, CX, CY, 60 + 190 * k, pal.violet, 0.15 + 0.5 * k);
    dotGlow(ctx, CX, CY, 24 + 70 * k, pal.cyan, 0.3 + 0.6 * k);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * k})`; ctx.beginPath(); ctx.arc(CX, CY, 3 + 11 * k, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ───────────────────────── ignition flash, shock rings, sparks ─────────────────────────
  function drawIgnition(ctx, gt) {
    const dt = gt - T.ignite; if (dt < 0 || dt > 1.4) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // tight white-hot core wrapped in saturated cyan/violet (keeps contrast + brand colour, no grey fog)
    const fa = Math.exp(-dt * 9);
    dotGlow(ctx, CX, CY, 640, pal.violet, 0.55 * Math.exp(-dt * 6));
    dotGlow(ctx, CX, CY, 470, pal.cyan, 0.5 * Math.exp(-dt * 5));
    dotGlow(ctx, CX, CY, 360, '#ffffff', 0.62 * fa);
    ctx.fillStyle = `rgba(120,96,255,${0.14 * Math.exp(-dt * 16)})`; ctx.fillRect(0, 0, W, H);
    // anamorphic streaks
    const L = 1900 * ease.outExpo(clamp(dt / 0.45));
    for (const [h, col, al] of [[5, '#ffffff', 0.95], [2, pal.cyan, 0.7]]) {
      const hh = h * Math.exp(-dt * 4.5) + 1, g = ctx.createLinearGradient(CX - L, 0, CX + L, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(col, al * Math.exp(-dt * 4))); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(CX - L, CY - hh / 2, L * 2, hh);
    }
    // concentric shockwaves
    for (let k = 0; k < 3; k++) {
      const p = ease.outExpo(clamp((dt - k * 0.09) / 0.95)); if (p <= 0 || p >= 1) continue;
      const col = k === 0 ? '#ffffff' : k === 1 ? pal.cyan : pal.violet;
      ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = 26;
      ctx.strokeStyle = rgba(col, Math.pow(1 - p, 1.2) * 0.9); ctx.lineWidth = 1.5 + 16 * (1 - p);
      ctx.beginPath(); ctx.arc(CX, CY, 1500 * p * (1 - 0.18 * k), 0, TAU); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  // radial sparks with drag; one path per colour
  function drawSparks(ctx, gt, t0, ox, oy, n, seed, vMin, vMax, lifeMul, cols) {
    const dt = gt - t0; if (dt < 0 || dt > 1.8 * lifeMul) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const K = 3.4;
    for (let i = 0; i < n; i++) {
      const h1 = hash(seed + i * 1.37), h2 = hash(seed + i * 2.11 + 3), h3 = hash(seed + i * 0.73 + 8);
      const life = (0.5 + h3 * 1.1) * lifeMul; if (dt > life) continue;
      const ang = h1 * TAU, v = vMin + h2 * (vMax - vMin);
      const d = v * (1 - Math.exp(-K * dt)) / K, vel = v * Math.exp(-K * dt);
      const x = ox + Math.cos(ang) * d, y = oy + Math.sin(ang) * d + 40 * dt * dt;
      const len = Math.min(26, 3 + vel * 0.03);
      const a = Math.pow(1 - dt / life, 1.4);
      ctx.strokeStyle = mixc(cols[i % cols.length], '#ffffff', 0.5 * (1 - dt / life), a); ctx.lineWidth = 1 + 1.6 * a;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); ctx.stroke();
    }
    ctx.restore();
  }

  // ───────────────────────── brain core ─────────────────────────
  function drawBrain(ctx, gt) {
    const lt = gt - T.ignite; if (lt < 0) return;
    const U = exitU(gt), pulse = pulseEnergy(gt);
    const spread = 1 + 2.5 * (1 - ease.spring(clamp(lt / 0.75), 7));       // nodes condense inward from the flash
    const Rs = SPH * (1 + 0.075 * pulse) * (1 - Math.pow(U, 4)) * clamp(lt / 0.12);
    if (Rs < 0.6) return;
    const yaw = 0.3 + 0.75 * lt + 6 * U * U, tilt = 0.34 + 0.1 * Math.sin(lt * 0.9);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const jx = (hash(Math.floor(gt * 90)) - 0.5) * 9 * U, jy = (hash(Math.floor(gt * 90) + 7) - 0.5) * 9 * U; // tremble before collapse
    const cx = CX + jx, cy = CY + jy;
    const nIn = clamp(lt / 0.22), eIn = clamp((lt - 0.12) / 0.4);

    // inner light, fresnel rim
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hot = Math.exp(-lt * 3.2) + 0.9 * Math.pow(U, 1.6);
    dotGlow(ctx, cx, cy, Rs * 2.5, pal.violet, 0.22 + 0.12 * pulse);
    dotGlow(ctx, cx, cy, Rs * 1.25, pal.cyan, 0.16 + 0.1 * pulse);
    dotGlow(ctx, cx, cy, Rs * 0.9, '#ffffff', clamp(0.1 + 0.55 * hot + 0.15 * pulse, 0, 0.95));
    const rim = ctx.createRadialGradient(cx, cy, Rs * 0.82, cx, cy, Rs * 1.32);
    rim.addColorStop(0, 'rgba(139,107,255,0)'); rim.addColorStop(0.42, rgba(pal.violet, 0.14 * nIn)); rim.addColorStop(0.62, rgba(pal.cyan, 0.12 * nIn)); rim.addColorStop(1, 'rgba(46,230,214,0)');
    ctx.fillStyle = rim; ctx.fillRect(cx - Rs * 1.4, cy - Rs * 1.4, Rs * 2.8, Rs * 2.8);
    ctx.restore();

    // project nodes
    const n = NODES.length, X = new Array(n), Y = new Array(n), Z = new Array(n), S = new Array(n), LIT = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = NODES[i], k = Rs * spread;
      const x = p[0] * k, y = p[1] * k, z = p[2] * k;
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      const y2 = y * ct + z1 * st, z2 = -y * st + z1 * ct;
      const s = FOC / (FOC - z2);
      X[i] = cx + x1 * s; Y[i] = cy + y2 * s; Z[i] = clamp(z2 / (Rs * spread) * 0.5 + 0.5); S[i] = s;
      LIT[i] = waveLit(gt, Math.hypot(p[0], p[1], p[2]));
    }
    // edges, bucketed by depth so each bucket is one stroke
    const buckets = [[], [], [], []];
    for (let e = 0; e < EDGES.length; e++) {
      const z = (Z[EDGES[e][0]] + Z[EDGES[e][1]]) / 2;
      buckets[Math.min(3, Math.floor(z * 4))].push(e);
    }
    ctx.save(); ctx.lineCap = 'round';
    for (let b = 0; b < 4; b++) {
      ctx.beginPath();
      for (const e of buckets[b]) { const [a, c] = EDGES[e]; ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[c], Y[c]); }
      ctx.strokeStyle = mixc(pal.violet, pal.cyan, b / 3, (0.1 + 0.2 * b / 3) * eIn); ctx.lineWidth = 1 + 0.25 * b; ctx.stroke();
    }
    // wave-lit edges
    ctx.globalCompositeOperation = 'lighter';
    for (let e = 0; e < EDGES.length; e++) {
      const l = waveLit(gt, EDGE_R[e]) * eIn; if (l < 0.08) continue;
      const [a, c] = EDGES[e];
      ctx.strokeStyle = `rgba(190,255,248,${Math.min(0.95, l * 0.75)})`; ctx.lineWidth = 1.2 + 1.8 * l;
      ctx.beginPath(); ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[c], Y[c]); ctx.stroke();
    }
    // travelling signals
    if (lt > 0.3) {
      const heads = [], tails = [];
      for (const s of SIGS) {
        const [a, c] = EDGES[s.e]; let f = fract(gt * s.sp + s.ph); if (s.dir < 0) f = 1 - f;
        const f0 = clamp(f - s.dir * 0.22);
        heads.push([lerp(X[a], X[c], f), lerp(Y[a], Y[c], f), lerp(Z[a], Z[c], f)]);
        tails.push([lerp(X[a], X[c], f0), lerp(Y[a], Y[c], f0), lerp(X[a], X[c], f), lerp(Y[a], Y[c], f)]);
      }
      ctx.strokeStyle = 'rgba(120,255,240,0.65)'; ctx.lineWidth = 2; ctx.beginPath();
      for (const t of tails) { ctx.moveTo(t[0], t[1]); ctx.lineTo(t[2], t[3]); } ctx.stroke();
      ctx.fillStyle = 'rgba(46,230,214,0.2)'; ctx.beginPath();
      for (const h of heads) { ctx.moveTo(h[0] + 8, h[1]); ctx.arc(h[0], h[1], 8, 0, TAU); } ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath();
      for (const h of heads) { const r = 1.5 + 1.8 * h[2]; ctx.moveTo(h[0] + r, h[1]); ctx.arc(h[0], h[1], r, 0, TAU); } ctx.fill();
    }
    // nodes, back to front
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Z[a] - Z[b]);
    for (const i of order) {
      const d = Z[i], l = LIT[i], tw = 0.5 + 0.5 * Math.sin(gt * 3 + i * 1.7);
      const r = (1.7 + 2 * d + 3.4 * l + 0.6 * tw) * S[i] * (Rs / SPH) * nIn;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = mixc(pal.violet, pal.cyan, d, (0.04 + 0.3 * l) * nIn); ctx.beginPath(); ctx.arc(X[i], Y[i], r * 2.5, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = mixc(mixc2(pal.violet, pal.cyan, d), '#ffffff', clamp(l * 0.9 + 0.18 * d), (0.45 + 0.55 * d) * nIn);
      ctx.beginPath(); ctx.arc(X[i], Y[i], r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // mixc returns an rgba string; this helper returns a hex-ish source for a second mix
  function mixc2(a, b, k) { const A = rgb(a), B = rgb(b); const h = (v) => ('0' + Math.round(v).toString(16)).slice(-2); return '#' + h(lerp(A[0], B[0], k)) + h(lerp(A[1], B[1], k)) + h(lerp(A[2], B[2], k)); }

  // ───────────────────────── orbit system ─────────────────────────
  function drawRings(ctx, gt) {
    const lt = gt - T.ignite; if (lt < 0.03) return;
    const U = exitU(gt), rk = ease.outExpo(clamp((lt - 0.02) / 0.65)), sc = sysScale(U) * rk, fade = winFade(gt);
    if (sc < 0.01) return;
    const spin = orbitSpin(gt), otilt = orbitTilt(U);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // HUD tick ring, counter-rotating
    {
      const R = 655 * sc, N = 96, ph = -0.12 * lt; ctx.lineWidth = 1.2;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let k = 0; k < N; k++) {
          const th = ph + k / N * TAU, len = k % 8 === 0 ? 16 : 7, a = proj(R * Math.cos(th), 0, R * Math.sin(th), otilt, 0), b = proj((R + len) * Math.cos(th), 0, (R + len) * Math.sin(th), otilt, 0);
          if ((a.z > 0) !== (pass === 1)) continue; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.strokeStyle = `rgba(200,210,255,${(pass ? 0.3 : 0.12) * rk * fade})`; ctx.stroke();
      }
    }
    // main orbit ring + comet
    ringPolyline(ctx, ORBIT_R * sc, otilt, 0, 0.16 * fade, 0.42 * fade, '#b8c4ff', 1.6);
    ringComet(ctx, ORBIT_R * sc, otilt, 0, spin + 0.4, pal.cyan, 0.8 * fade, 3.4, 1.0);
    ringComet(ctx, ORBIT_R * sc, otilt, 0, spin + 0.4 + Math.PI, pal.violet, 0.7 * fade, 3.0, 0.8);
    // memory ring (own plane, opposite spin) — appears with the word "memory"
    const mk = ease.outExpo(clamp((gt - T.memory + 0.05) / 0.5));
    if (mk > 0.01) {
      const mR = MEM_R * sc * mk, mt = MEM_TILT * (1 - 0.8 * ease.inOutCubic(U)), mspin = -0.42 * lt - 3 * U * U;
      ringPolyline(ctx, mR, mt, MEM_ROLL, 0.1 * fade * mk, 0.3 * fade * mk, pal.amber, 1.3);
      ringComet(ctx, mR, mt, MEM_ROLL, mspin + 0.3, pal.amber, 0.85 * fade * mk, 3, 0.9);
    }
    ctx.restore();
  }

  function drawDust(ctx, gt) {
    const lt = gt - T.ignite; if (lt < 0.1) return;
    const U = exitU(gt), a = clamp((lt - 0.1) / 0.5) * winFade(gt), sc = sysScale(U);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 64; i++) {
      const R = (230 + hash(i * 2.3) * 520) * sc, th = hash(i * 5.1) * TAU + (0.2 + hash(i * 1.9) * 0.5) * lt * (i % 2 ? 1 : -1) + 2.5 * U * U;
      const p = proj(R * Math.cos(th), (hash(i * 8.7) - 0.5) * 220 * sc, R * Math.sin(th), 0.3 + hash(i * 4.4) * 0.6, 0);
      const d = clamp((p.z / 700 + 1) / 2), r = (0.8 + 1.6 * d) * p.s;
      ctx.fillStyle = rgba(i % 3 ? pal.cyan : pal.violet, (0.15 + 0.5 * d) * a * (0.6 + 0.4 * Math.sin(gt * 2 + i)));
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ───────────────────────── agent chip ─────────────────────────
  function drawChip(ctx, A, x, y, sc, alpha, gl, gt) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha *= alpha;
    const h = 82, f = font(31, 600), lw = measure(ctx, A.name, f, 0.3), w = h + lw + 42;
    glass(ctx, -w / 2, -h / 2, w, h, 30, { fill: 'rgba(11,14,25,0.88)', border: rgba(A.c, 0.3 + 0.6 * gl), glowColor: rgba(A.c, 0.2 + 0.55 * gl), glowBlur: 20 + 34 * gl });
    if (gl > 0.02) { rr(ctx, -w / 2, -h / 2, w, h, 30); ctx.fillStyle = rgba(A.c, 0.12 * gl); ctx.fill(); }
    const ix = -w / 2 + h / 2;
    const g = ctx.createRadialGradient(ix, -6, 2, ix, 0, 31); g.addColorStop(0, rgba(A.c, 0.42)); g.addColorStop(1, rgba(A.c, 0.08));
    ctx.beginPath(); ctx.arc(ix, 0, 29, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rgba(A.c, 0.8); ctx.lineWidth = 1.6; ctx.stroke();
    ctx.save(); ctx.translate(ix, 0); ctx.scale(1.25, 1.25); A.icon(ctx, mixc(A.c, '#ffffff', 0.5)); ctx.restore();
    text(ctx, A.name, -w / 2 + h + 1, 2, { f, base: 'middle', track: 0.3, fill: mixc('#eef1f8', '#ffffff', gl) });
    const sp = 0.5 + 0.5 * Math.sin(gt * 4 + A.a0 * 3); // status dot
    ctx.beginPath(); ctx.arc(w / 2 - 24, 0, 4.6, 0, TAU); ctx.fillStyle = rgba(pal.mint, 0.7 + 0.3 * sp); ctx.shadowColor = pal.mint; ctx.shadowBlur = 8 + 8 * sp; ctx.fill();
    ctx.restore();
  }

  // beam core -> badge with dashes + zipping packets in both directions
  function drawBeam(ctx, i, P, gt) {
    const A = AGENTS[i], bp = ease.outCubic(clamp((gt - T.pop[i] - 0.08) / 0.32)); if (bp <= 0) return;
    const U = exitU(gt), fade = winFade(gt), x1 = lerp(CX, P.x, bp), y1 = lerp(CY, P.y, bp);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const flare = Math.max(0, Math.exp(-(gt - T.army - i * 0.045) * 5)) * (gt >= T.army ? 1 : 0);
    const g = ctx.createLinearGradient(CX, CY, P.x, P.y);
    g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(0.3, rgba(A.c, 0.55)); g.addColorStop(1, rgba(A.c, 0.4));
    ctx.strokeStyle = g; ctx.globalAlpha = fade * (0.55 + 0.45 * P.d); ctx.lineWidth = 9 + 6 * flare; ctx.globalAlpha *= 0.1 + 0.12 * flare;
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.globalAlpha = fade * (0.55 + 0.45 * P.d); ctx.lineWidth = 1.6 + 1.5 * flare; ctx.stroke();
    ctx.setLineDash([2, 16]); ctx.lineDashOffset = -gt * 70; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2.2; ctx.stroke(); ctx.setLineDash([]);
    // packets
    if (bp >= 1) {
      const dx = P.x - CX, dy = P.y - CY;
      for (let k = 0; k < 2; k++) {
        for (const dir of [1, -1]) {
          const ph = fract(gt * PK_SP + packetOff(i, k) + (dir < 0 ? 0.25 : 0)), q = ease.inOutCubic(ph), q0 = ease.inOutCubic(Math.max(0, ph - 0.09));
          const f = dir > 0 ? q : 1 - q, f0 = dir > 0 ? q0 : 1 - q0;
          const hx = CX + dx * f, hy = CY + dy * f, tx = CX + dx * f0, ty = CY + dy * f0;
          ctx.strokeStyle = dir > 0 ? rgba(A.c, 0.95) : 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3.4;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, TAU); ctx.fill();
          dotGlow(ctx, hx, hy, 15, dir > 0 ? A.c : '#ffffff', 0.5);
        }
      }
    }
    ctx.restore();
  }

  // streak behind a badge during the exit speed ramp
  function drawTrail(ctx, i, gt) {
    const U = exitU(gt); if (U < 0.08) return;
    const len = 0.05 + 0.2 * U, n = 14, A = AGENTS[i]; let prev = null;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let k = 0; k <= n; k++) {
      const p = badge(i, gt - (k / n) * len);
      if (prev) { ctx.strokeStyle = rgba(A.c, 0.7 * Math.pow(1 - k / n, 1.4) * winFade(gt)); ctx.lineWidth = lerp(9, 1.5, k / n) * (0.6 + 0.6 * p.d); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      prev = p;
    }
    ctx.restore();
  }

  // relay arcs between badges
  function drawRelays(ctx, gt) {
    if (gt > T.exit + 0.35) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const R of ARCS) {
      const p = (gt - R.t0) / R.dur; if (p <= 0 || p >= 1 || gt < T.pop[5] + 0.3) continue;
      const A = badge(R.a, gt), B = badge(R.b, gt), ca = AGENTS[R.a].c, cb = AGENTS[R.b].c;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, ox = mx - CX, oy = my - CY, ol = Math.hypot(ox, oy) || 1, span = Math.hypot(A.x - B.x, A.y - B.y);
      const cxp = mx + (ol > 40 ? ox / ol : 0) * span * 0.22, cyp = my + (ol > 40 ? oy / ol : -1) * span * 0.22 - 70;
      const at = (s) => { const u = 1 - s; return [u * u * A.x + 2 * u * s * cxp + s * s * B.x, u * u * A.y + 2 * u * s * cyp + s * s * B.y]; };
      const head = ease.inOutCubic(clamp(p / 0.86)), tail = Math.max(0, head - 0.38), fade = Math.min(1, (1 - p) * 6) * winFade(gt), n = 20;
      let prev = at(tail);
      for (let k = 1; k <= n; k++) {
        const s = lerp(tail, head, k / n), q = at(s);
        ctx.strokeStyle = mixc(ca, cb, s, Math.pow(k / n, 1.5) * 0.9 * fade); ctx.lineWidth = 1 + 3.2 * (k / n);
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); prev = q;
      }
      const hd = at(head); ctx.fillStyle = `rgba(255,255,255,${fade})`; ctx.beginPath(); ctx.arc(hd[0], hd[1], 4.2, 0, TAU); ctx.fill(); dotGlow(ctx, hd[0], hd[1], 24, cb, 0.55 * fade);
    }
    ctx.restore();
  }

  // memory cells on the amber ring
  function memoryCells(gt, items, ctx) {
    const lt = gt - T.ignite, U = exitU(gt), sc = sysScale(U), fade = winFade(gt);
    const mt = MEM_TILT * (1 - 0.8 * ease.inOutCubic(U)), mspin = -0.42 * lt - 3 * U * U, mk = ease.outExpo(clamp((gt - T.memory + 0.05) / 0.5));
    for (let j = 0; j < MEM_N; j++) {
      const t0 = T.memory + j * 0.018, dp = gt - t0; if (dp < 0) continue;
      const th = j / MEM_N * TAU + mspin, R = MEM_R * sc * mk, p = proj(R * Math.cos(th), 0, R * Math.sin(th), mt, MEM_ROLL);
      const wave = Math.pow(0.5 + 0.5 * Math.sin(th * 2 - gt * 5.5), 4), flash = Math.exp(-dp * 5), lit = clamp(0.18 + 0.6 * wave + flash);
      const d = clamp((p.z / MEM_R + 1) / 2), sp = ease.outBack(clamp(dp / 0.35));
      items.push({ z: p.z, f() {
        const half = (5.2 + 3 * d) * p.s * sp * (0.8 + 0.4 * lit), a = (0.4 + 0.6 * d) * fade;
        ctx.save(); ctx.translate(p.x, p.y); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(pal.amber, (0.03 + 0.2 * lit) * a); ctx.beginPath(); ctx.arc(0, 0, half * 2.8, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over'; ctx.rotate(Math.PI / 4 + gt * 0.6);
        rr(ctx, -half, -half, half * 2, half * 2, 2.2); ctx.fillStyle = mixc(pal.amber, '#ffffff', clamp(lit - 0.4) * 1.2, (0.25 + 0.7 * lit) * a); ctx.fill();
        ctx.strokeStyle = rgba(pal.amber, 0.9 * a); ctx.lineWidth = 1.3; ctx.stroke();
        ctx.restore();
      } });
    }
  }

  // ───────────────────────── typography layer ─────────────────────────
  function sucked(ctx, gt, fn) { // everything typographic is pulled into the singularity on exit
    const v = clamp((gt - T.textExit) / T.textDur), g = 1 - 0.55 * ease.inCubic(v);
    if (g < 0.03) return;
    ctx.save(); ctx.translate(CX, CY); ctx.scale(g, g); ctx.translate(-CX, -CY); ctx.globalAlpha *= 1 - ease.inQuad(clamp(v / 0.75)); fn(); ctx.restore();
  }

  function drawHud(ctx, gt) {
    const p = ease.outExpo(clamp((gt - 9.4) / 0.6)); if (p <= 0) return;
    const ix = 84, iy = 60, L = 46;
    ctx.save(); ctx.strokeStyle = 'rgba(210,220,255,0.34)'; ctx.lineWidth = 2; ctx.lineCap = 'square';
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = sx > 0 ? ix : W - ix, y = sy > 0 ? iy : H - iy, l = L * p;
      ctx.beginPath(); ctx.moveTo(x, y + sy * l); ctx.lineTo(x, y); ctx.lineTo(x + sx * l, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawKicker(ctx, gt) {
    const p = prog(gt, 9.45, 0.8, ease.outExpo); if (p <= 0) return;
    const x = 132, y = 142, track = lerp(24, 3, p), f = font(27, 600, 'mono');
    ctx.save(); ctx.globalAlpha *= clamp(p * 2);
    const bl = 0.5 + 0.5 * Math.sin(gt * 7);
    ctx.fillStyle = pal.mint; ctx.shadowColor = pal.mint; ctx.shadowBlur = 10 + 8 * bl; ctx.beginPath(); ctx.arc(x + 5, y - 9, 6, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    const w1 = text(ctx, '29', x + 28, y, { f, fill: mixc(pal.cyan, '#ffffff', 0.3), track });
    const w2 = text(ctx, ' PROFILES', x + 28 + w1, y, { f, fill: pal.text, track });
    text(ctx, '·  ONE COMMAND', x + 28 + w1 + w2, y, { f, fill: 'rgba(214,222,242,0.7)', track });
    // hairline with a travelling highlight
    const lw = 420 * p, g = ctx.createLinearGradient(x, 0, x + 420, 0);
    g.addColorStop(0, rgba(pal.violet, 0.9)); g.addColorStop(1, rgba(pal.cyan, 0));
    ctx.fillStyle = g; ctx.fillRect(x, y + 22, lw, 2);
    const sx = x + fract(gt * 0.5) * 420; ctx.fillStyle = 'rgba(255,255,255,0.8)'; if (sx - x < lw) ctx.fillRect(sx, y + 22, 26, 2);
    ctx.restore();
  }

  function drawCounter(ctx, gt) {
    const p = prog(gt, 9.5, 0.8, ease.outExpo); if (p <= 0) return;
    let n = 0, last = -1; T.pop.forEach((t, i) => { if (gt >= t) { n = i + 1; last = t; } });
    const x = W - 132, y = 142, pulse = last > 0 ? Math.exp(-(gt - last) * 8) : 0, f = font(27, 600, 'mono');
    ctx.save(); ctx.globalAlpha *= clamp(p * 2);
    const num = '0' + n, nf = font(40 + 8 * pulse, 700, 'mono');
    const wn = measure(ctx, num, nf, 2);
    text(ctx, num, x, y + 1, { f: nf, fill: mixc(pal.cyan, '#ffffff', Math.max(0.3, pulse)), align: 'right', track: 2 });
    text(ctx, 'AGENTS ONLINE', x - wn - 20, y, { f, fill: 'rgba(214,222,242,0.7)', align: 'right', track: lerp(24, 3, p) });
    ctx.restore();
  }

  // headline: "a brain · a memory · a small army", word by word
  function drawHeadline(ctx, gt) {
    const size = 86, y = 944, keyF = font(size, 700), dimF = font(size * 0.78, 300);
    const KEYS = [
      { w: 'brain', t: T.brain, c: '#a58bff', pre: 'a' },
      { w: 'memory', t: T.memory, c: pal.amber, pre: 'a' },
      { w: 'army', t: T.army, c: pal.cyan, pre: 'a small' },
    ];
    const gap = 26, dotW = 64, tk = -1.2;
    // layout (centered)
    const parts = []; let total = 0;
    KEYS.forEach((k, i) => {
      if (i > 0) { parts.push({ dot: true, w: dotW, t: k.t - 0.06 }); total += dotW; }
      const pw = measure(ctx, k.pre, dimF), kw = measure(ctx, k.w, keyF, tk);
      parts.push({ s: k.pre, f: dimF, w: pw, t: k.t - 0.08, dim: true, k }); parts.push({ s: k.w, f: keyF, w: kw, t: k.t, key: true, k });
      total += pw + gap + kw;
    });
    let x = CX - total / 2;
    for (const P of parts) {
      if (P.dot) {
        const q = ease.spring(clamp((gt - P.t) / 0.45), 8);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; dotGlow(ctx, x + dotW / 2, y - size * 0.3, 30 * q, pal.cyan, 0.5);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + dotW / 2, y - size * 0.3, 5.5 * q, 0, TAU); ctx.fill();
        x += P.w; continue;
      }
      const rise = P.key ? size * 1.0 : size * 0.8;
      ctx.save(); ctx.beginPath(); ctx.rect(x - 40, y - size * 1.08, P.w + 80, size * 1.42); ctx.clip();
      for (let j = 0; j < P.s.length; j++) {
        const t0 = P.t + j * (P.key ? 0.034 : 0.028), q = ease.outExpo(clamp((gt - t0) / 0.55)); if (q <= 0) continue;
        const cx0 = x + (j ? measure(ctx, P.s.slice(0, j), P.f, P.key ? tk : 0) : 0);
        const hotK = P.key ? Math.exp(-Math.max(0, gt - t0 - 0.1) * 4.2) : 0;
        let fill = P.dim ? 'rgba(200,208,228,0.72)' : P.k.c;
        if (P.key && P.k.w === 'army') { const g = ctx.createLinearGradient(x, 0, x + P.w, 0); g.addColorStop(0, '#9d84ff'); g.addColorStop(1, pal.mint); fill = g; }
        ctx.save(); ctx.globalAlpha *= clamp(q * 2.2);
        text(ctx, P.s[j], cx0, y + (1 - q) * rise, { f: P.f, fill, track: P.key ? tk : 0 });
        if (hotK > 0.02) text(ctx, P.s[j], cx0, y + (1 - q) * rise, { f: P.f, fill: '#ffffff', track: tk, alpha: Math.min(1, hotK * 1.1) });
        ctx.restore();
      }
      ctx.restore();
      if (P.key) { // glow of the word, keyed to its visual + accent underline
        const done = clamp((gt - P.t - 0.3) / 0.35), pu = P.k.w === 'brain' ? pulseEnergy(gt) * 0.5 : P.k.w === 'army' ? Math.max(0, Math.exp(-(gt - T.army) * 3)) * 0.8 : Math.exp(-(gt - T.memory) * 3) * 0.8;
        if (done > 0) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(18px)'; ctx.globalAlpha *= done * clamp(0.5 + pu) * 0.8;
          text(ctx, P.s, x, y, { f: P.f, fill: P.k.w === 'army' ? pal.cyan : P.k.c, track: tk }); ctx.restore();
        }
        const ul = ease.outExpo(clamp((gt - P.t - 0.28) / 0.5));
        if (ul > 0) { ctx.save(); ctx.globalAlpha *= 0.9; const g = ctx.createLinearGradient(x, 0, x + P.w, 0); g.addColorStop(0, P.k.c); g.addColorStop(1, rgba(P.k.w === 'army' ? pal.mint : P.k.c, 0)); ctx.fillStyle = g; ctx.fillRect(x, y + 20, P.w * ul, 3); ctx.restore(); }
      }
      x += P.w + (P.dim ? gap : 0);
    }
  }

  // soft dark scrim behind the tagline lane so the line stays legible over beams / chips / memory cells
  function drawScrim(ctx, gt) {
    const a = prog(gt, T.brain - 0.2, 0.5, ease.outCubic); if (a <= 0) return;
    const v = clamp((gt - T.textExit) / T.textDur), k = a * (1 - ease.inQuad(v));
    const g = ctx.createLinearGradient(0, 760, 0, H);
    g.addColorStop(0, 'rgba(5,6,12,0)'); g.addColorStop(0.45, `rgba(5,6,12,${0.5 * k})`); g.addColorStop(1, `rgba(5,6,12,${0.72 * k})`);
    ctx.fillStyle = g; ctx.fillRect(0, 760, W, H - 760);
  }

  // each headline word is a beat: a soft ring leaves the core in the colour of the word
  function drawWordRings(ctx, gt) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    [[T.brain, pal.violet, 0.55, 640], [T.memory, pal.amber, 0.6, 700], [T.army, pal.cyan, 0.8, 900]].forEach(([t0, col, a, rMax]) => {
      const p = (gt - t0) / 0.9; if (p <= 0 || p >= 1) return;
      const e = ease.outExpo(p);
      ctx.shadowColor = rgba(col, 0.8); ctx.shadowBlur = 14;
      ctx.strokeStyle = rgba(col, a * 0.8 * Math.pow(1 - p, 1.5)); ctx.lineWidth = 1 + 3 * (1 - e);
      ctx.beginPath(); ctx.arc(CX, CY, 120 + rMax * e, 0, TAU); ctx.stroke();
    });
    ctx.restore();
  }

  // ───────────────────────── exit: the singularity ─────────────────────────
  function drawSingularity(ctx, gt) {
    const U = exitU(gt); if (U <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // imploding shock rings
    [11.84, 11.95, 12.04].forEach((s, k) => {
      const p = clamp((gt - s) / (T.end - s)); if (p <= 0 || p >= 1) return;
      const r = 780 * (1 - ease.inCubic(p)) * (1 - 0.1 * k);
      ctx.strokeStyle = rgba(k === 1 ? pal.cyan : pal.violet, Math.sin(Math.PI * Math.pow(p, 0.8)) * 0.55); ctx.lineWidth = 1.5 + 2.5 * p;
      ctx.beginPath(); ctx.arc(CX, CY, r, 0, TAU); ctx.stroke();
    });
    // anamorphic line that grows then contracts to the point
    const L = 170 + 1250 * Math.pow(Math.sin(Math.PI * Math.pow(U, 2)), 1.0) * 1.0;
    const g = ctx.createLinearGradient(CX - L, 0, CX + L, 0), a = clamp(U * 1.6);
    g.addColorStop(0, 'rgba(46,230,214,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.95 * a})`); g.addColorStop(1, 'rgba(139,107,255,0)');
    ctx.fillStyle = g; const hh = 2 + 5 * U; ctx.fillRect(CX - L, CY - hh / 2, L * 2, hh);
    // hot centre
    const hot = Math.pow(U, 1.5);
    dotGlow(ctx, CX, CY, 70 + 230 * hot, pal.violet, 0.2 + 0.4 * hot);
    dotGlow(ctx, CX, CY, 34 + 80 * hot, pal.cyan, 0.3 + 0.55 * hot);
    dotGlow(ctx, CX, CY, 24 + 20 * hot, '#ffffff', 0.5 + 0.5 * hot);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(CX, CY, 3 + 8 * hot, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ───────────────────────── scene ─────────────────────────
  ENN.scene({
    id: 's4',
    draw(ctx, lt, gt) {
      const U = exitU(gt), fade = winFade(gt);
      drawInflow(ctx, gt, T.start, T.ignite, 11, 120, 2.4, 1, 1);
      drawEmber(ctx, gt);
      drawScrim(ctx, gt);

      if (gt >= T.ignite) {
        drawRings(ctx, gt);
        drawDust(ctx, gt);
        drawWordRings(ctx, gt);
        const items = [{ z: 0, f: () => drawBrain(ctx, gt) }];
        AGENTS.forEach((A, i) => {
          if (gt < T.pop[i]) return;
          const P = badge(i, gt), dp = gt - T.pop[i];
          const popS = ease.outBack(clamp(dp / 0.5)), flareS = gt >= T.army + i * 0.045 ? 1 + 0.13 * Math.exp(-(gt - T.army - i * 0.045) * 7) : 1;
          const sc = P.s * popS * flareS * (0.9 + 0.1 * P.d) * (0.35 + 0.65 * sysScale(U));
          const alpha = clamp(dp / 0.1) * (0.55 + 0.45 * P.d) * fade;
          const bz = P.z >= 0 ? P.z * 0.5 : P.z - 1;
          items.push({ z: bz, f: () => { drawBeam(ctx, i, P, gt); drawTrail(ctx, i, gt); } });
          items.push({ z: P.z, f: () => { if (alpha > 0.01) drawChip(ctx, A, P.x, P.y, sc, alpha, chipGlow(i, gt), gt); } });
        });
        memoryCells(gt, items, ctx);
        items.sort((a, b) => a.z - b.z);
        for (const it of items) it.f();
        drawRelays(ctx, gt);

        // pings on pop + army flare, pop sparks
        AGENTS.forEach((A, i) => {
          const P = badge(i, gt);
          ping(ctx, P.x, P.y, (gt - T.pop[i]) / 0.65, A.c);
          const q = (gt - (T.army + i * 0.045)) / 0.6; if (gt < T.exit) ping(ctx, P.x, P.y, q, A.c, 70, 2.5);
          const p0 = badge(i, T.pop[i]);
          drawSparks(ctx, gt, T.pop[i], p0.x, p0.y, 16, 40 + i * 13, 120, 420, 0.7, [A.c, '#ffffff']);
        });
        drawSparks(ctx, gt, T.ignite, CX, CY, 150, 3, 260, 1500, 1, [pal.cyan, pal.violet, '#ffffff', pal.amber]);
        drawIgnition(ctx, gt);
      }

      drawInflow(ctx, gt, 11.85, T.end, 71, 90, 3.2, 0.9, 1.1);
      sucked(ctx, gt, () => { drawHud(ctx, gt); drawKicker(ctx, gt); drawCounter(ctx, gt); drawHeadline(ctx, gt); });
      drawSingularity(ctx, gt);
    },
  });
})();
