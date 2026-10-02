// orbit-network (C9 / C13) — port of spike s4 "Army". A neural brain-core IGNITES on cue `ignite`; one glass
// badge per node fact POPS onto a tilted 3D orbit on its cue-map hit `node.<i>` (C14); beams with zipping
// packets link core and badges, relay arcs hop between badges, a ring of memory cells spins in its own plane,
// and the hub label (the app.name fact) rises letter by letter in the lower lane. On exit the whole system
// spirals into a point (the singularity) — a natural hand-off to a zoom-through / column-wipe / cut.
//   orbit — the only variant.
// Slots: hub (app.name, 1) · nodes (stack.item | feature | route, 3–8; routes render in mono via familyOf).
// Colours: every colour comes from params.palette (roles primary/secondary/hot, badge colours = api.accents(N),
// text/ink, and the mint status dot);
// no colour literals (static test). Text: only api.text on the beat ctx (manifest + C16 bbox). The hub glow is a
// blur-filtered CACHE sprite built once in layout() (M0 root cause: blur sprites must be CPU-pinned).
// Pure function of localT: phase marks derive from cues + params.dur + api.grid; no absolute seconds (D10).

const TAU = Math.PI * 2;
const CX = 960, CY = 500, FOC = 2200, SPH = 200;
const MEM_R = 318, MEM_TILT = 0.95, MEM_ROLL = -0.5, MEM_N = 30;
const LANE = 770;                  // badges soft-compress above this y: the lower lane belongs to the hub label
const HUB_MAX = 84, HUB_W = 1500, HUB_TRACK = -1.2, HUB_BASE = 944;   // ≤ 96 device px → GPU text path
const CHIP_H = 82, CHIP_LABEL_W = 360;  // a 20-char (C13 maxChars) label fits at 28 px in display AND mono (one shared px per slot)
const PK_SP = 1.25;                // beam packet cycles per second
const ORBIT_W = 0.62;              // orbit spin (rad/s) — ONE constant for the spin and the badge phase below
const GLOW_PAD = 60;
const LABEL_GAP = 34;              // clear air between a badge label and the brain-core silhouette (R5 legibility)
const ICON_BY_KIND = { route: 'browser', 'stack.item': 'hub', feature: 'code' };

const fract = (v) => v - Math.floor(v);

// N-dependent orbit geometry: more badges → wider, slightly steeper orbit (less overlap at the sides)
const orbitFor = (N) => (N <= 6 ? { R: 500, tilt: 0.4 } : { R: 560, tilt: 0.46 });

function buildBrain(rng) {
  const nodes = [], edges = [], edgeR = [];
  const rn = rng(77), golden = Math.PI * (3 - Math.sqrt(5));
  const SHELL = 104, INNER = 38;
  for (let i = 0; i < SHELL; i++) {
    const y = 1 - ((i + 0.5) / SHELL) * 2, r = Math.sqrt(1 - y * y), th = golden * i, k = 0.96 + 0.07 * rn();
    nodes.push([Math.cos(th) * r * k, y * k, Math.sin(th) * r * k]);
  }
  for (let i = 0; i < INNER; i++) {
    const y = 1 - ((i + 0.5) / INNER) * 2, r = Math.sqrt(1 - y * y), th = golden * i + 1.3, k = 0.32 + 0.42 * rn();
    nodes.push([Math.cos(th) * r * k, y * k, Math.sin(th) * r * k]);
  }
  const seen = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const ds = [];
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const dx = nodes[i][0] - nodes[j][0], dy = nodes[i][1] - nodes[j][1], dz = nodes[i][2] - nodes[j][2];
      ds.push([dx * dx + dy * dy + dz * dz, j]);
    }
    ds.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let k = 0; k < 4; k++) {
      const j = ds[k][1], key = Math.min(i, j) * 1000 + Math.max(i, j);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([Math.min(i, j), Math.max(i, j)]);
    }
  }
  for (const [a, b] of edges) {
    const mx = (nodes[a][0] + nodes[b][0]) / 2, my = (nodes[a][1] + nodes[b][1]) / 2, mz = (nodes[a][2] + nodes[b][2]) / 2;
    edgeR.push(Math.sqrt(mx * mx + my * my + mz * mz));
  }
  const r = rng(5), sigs = [];
  for (let i = 0; i < 64; i++) sigs.push({ e: Math.floor(r() * edges.length), ph: r(), sp: 0.7 + r() * 1.1, dir: r() < 0.5 ? 1 : -1 });
  return { nodes, edges, edgeR, sigs };
}

// spike s4 agent icons, drawn as paths (no glyphs) in a 24-px box around (0,0)
function icon(ctx, kind, col, rr) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'hub') {
    ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * TAU) / 3, x = Math.cos(a) * 10, y = Math.sin(a) * 10;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 3.4, Math.sin(a) * 3.4); ctx.lineTo(x * 0.78, y * 0.78); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.stroke();
    }
  } else if (kind === 'browser') {
    rr(ctx, -10.5, -9, 21, 18, 3.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10.5, -3.5); ctx.lineTo(10.5, -3.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(-6.6, -6.3, 0.9, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-3.6, -6.3, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, 1.5); ctx.lineTo(6, 1.5); ctx.moveTo(-6, 5.5); ctx.lineTo(1.5, 5.5); ctx.stroke();
  } else { // code </>
    ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(-10, 0); ctx.lineTo(-4, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(10, 0); ctx.lineTo(4, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-2, 9); ctx.stroke();
  }
  ctx.restore();
}

export default {
  id: 'orbit-network',

  layout(rb, variant, api) {
    const P = api.palette;
    const hub = rb.slots.hub.items[0];
    const nodes = rb.slots.nodes.items;
    const N = nodes.length;
    const m = api.makeCanvas('cache', 8, 8).ctx;
    // the compiler emits ignite + node.<i> per node (C14): a missing one fails the boot, never a made-up time
    for (const name of ['ignite', ...nodes.map((_, i) => `node.${i}`)]) api.cue(name);

    const hubPx = api.fitSlot('hub', { maxW: HUB_W, maxPx: HUB_MAX, weight: 700, track: HUB_TRACK });
    const nodePx = api.fitSlot('nodes', { maxW: CHIP_LABEL_W, maxPx: N <= 6 ? 31 : 28, weight: 600, track: 0.3 });

    // badge colours: accents derived from the palette roles only (never a named hue the palette did not pick)
    const cycle = api.accents(N);
    const chips = nodes.map((item, i) => {
      const lw = api.measure(m, item, { size: nodePx, weight: 600, track: 0.3 }).width;
      return { item, w: CHIP_H + lw + 42, c: cycle[i], icon: ICON_BY_KIND[api.kindOf(item)] ?? 'code', a0: 2.35 + (i * TAU) / N };
    });

    // hub label: per-letter offsets (letters rise one by one) + one blurred glow sprite on a CACHE canvas
    const hm = api.measure(m, hub, { size: hubPx, weight: 700, track: HUB_TRACK });
    const full = hm.width - HUB_TRACK;
    const left = Math.round(CX - full / 2);
    const letters = api.clusters(hub.text).filter((cl) => cl.ch !== ' ').map((cl) => ({
      s: cl.s, e: cl.e, x: left + api.measure(m, hub, { size: hubPx, weight: 700, track: HUB_TRACK, slice: [0, cl.s] }).width,
    }));
    const asc = Math.max(hm.ascent, hubPx * 0.72), desc = Math.max(hm.descent, hubPx * 0.05);
    const gw = Math.ceil(full) + GLOW_PAD * 2, gh = Math.ceil(asc + desc) + GLOW_PAD * 2;
    const glow = api.makeCanvas('cache', gw, gh), g = glow.ctx;
    g.filter = 'blur(18px)';
    api.text(g, hub, GLOW_PAD, GLOW_PAD + asc, { size: hubPx, weight: 700, track: HUB_TRACK, fill: api.brand(g, GLOW_PAD, 0, GLOW_PAD + full, 0, P.primary, P.secondary) });
    g.filter = 'none';

    // relay arcs: badge → badge hops (deterministic schedule over the badge count)
    const arcs = [];
    for (let k = 0; k < 14; k++) {
      const a = Math.floor(api.hash(k * 3.7 + 1) * N), b = (a + 1 + Math.floor(api.hash(k * 5.3 + 2) * (N - 1))) % N;
      arcs.push({ k, a, b });
    }

    return {
      hub, hubPx, letters, full, left, base: HUB_BASE, asc, desc,
      glow: { canvas: glow.canvas, x: left - GLOW_PAD, y: HUB_BASE - asc - GLOW_PAD, w: gw, h: gh },
      chips, nodePx, arcs, ...orbitFor(N), brain: buildBrain(api.rng),
    };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L, dur } = p;
    const { W, H, clamp, lerp, ease, hash, mix, palette: P, grid, rr } = api;
    const C = (c, a) => mix(c, c, 0, a);   // any palette colour (hex or rgba) at alpha a
    const snapG = (x) => Math.max(grid, Math.round(x / grid) * grid);
    const N = L.chips.length;
    const ex = (dt, decay) => (dt >= 0 ? Math.exp(-dt * decay) : 0);

    // ── phase marks (local seconds): the compiled cues (C14), never a private schedule ──
    const ign = api.cue('ignite');
    const pop = L.chips.map((_, i) => api.cue(`node.${i}`));
    const lastPop = Math.max(...pop);
    const T = {
      ign, pop, end: dur,
      brain: Math.max(ign + 2 * grid, snapG(dur * 0.3)),
      memory: lastPop,
      army: Math.max(lastPop + 3 * grid, snapG(dur * 0.58)),
      exit: dur - 3 * grid,
      textExit: dur - 2 * grid, textDur: 1.6 * grid,
    };
    const relay0 = lastPop + 2 * grid;
    // orbit phase — an archetype invariant, not a reviewer frame: at the ARMY flare (T.army: every badge flashes in
    // turn, the moment the labels are read) the back-centre of the orbit (θ = −π/2, behind the brain-core) sits
    // midway between two badges, so no label is hidden by the core then. Pure function of the cues + dur.
    const ph0 = -Math.PI / 2 + Math.PI / N - ORBIT_W * (T.army - T.ign);

    const exitU = (u) => clamp((u - T.exit) / (T.end - T.exit));
    const orbitSpin = (u) => ORBIT_W * (u - T.ign) + 4.5 * Math.pow(exitU(u), 2);
    const sysScale = (U) => 1 - Math.pow(U, 3.2);
    const orbitTilt = (U) => L.tilt + 1.12 * ease.inOutCubic(U);
    const winFade = (u) => 1 - ease.inQuad(clamp((exitU(u) - 0.68) / 0.32));
    function pulseEnergy(u) {
      let e = 0.8 * ex(u - T.ign, 6);
      for (const pt of T.pop) e += 0.15 * ex(u - pt, 9) * 1.3;
      return Math.min(e, 1.5);
    }
    function proj(x, y, z, tilt, roll) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      let y1 = y * ct + z * st, x1 = x;
      const z1 = -y * st + z * ct;
      if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll); const xr = x1 * cr - y1 * sr; y1 = x1 * sr + y1 * cr; x1 = xr; }
      const s = FOC / (FOC - z1);
      return { x: CX + x1 * s, y: CY + y1 * s, z: z1, s };
    }
    function badge(i, u) {
      const U = exitU(u), emerge = ease.outExpo(clamp((u - T.pop[i]) / 0.4));
      const R = L.R * lerp(0.28, 1, emerge) * sysScale(U);
      const th = ph0 + (i * TAU) / N + orbitSpin(u);
      const q = proj(R * Math.cos(th), 0, R * Math.sin(th), orbitTilt(U), 0);
      q.d = clamp((q.z / L.R + 1) / 2);
      if (q.y > LANE) q.y = LANE + (q.y - LANE) * 0.2;
      return q;
    }
    // brain-core size at u — ONE formula for the brain drawing and the label clearance below
    function core(u) {
      const bt = u - T.ign;
      if (bt < 0) return { Rs: 0, spread: 1 };
      return {
        Rs: SPH * (1 + 0.075 * pulseEnergy(u)) * (1 - Math.pow(exitU(u), 4)) * clamp(bt / 0.12),
        spread: 1 + 2.5 * (1 - ease.spring(clamp(bt / 0.75), 7)),
      };
    }
    // badge pose at u: orbit point + scale, then (R5 legibility) pushed out along the ray from the core until the
    // LABEL rect clears the core silhouette by LABEL_GAP — the minimal push, so it is continuous in u.
    function pose(i, u) {
      const B = badge(i, u), A = L.chips[i], dp = u - T.pop[i], da = u - T.army - i * 0.045;
      const popS = ease.outBack(clamp(dp / 0.5)), flareS = da >= 0 ? 1 + 0.13 * Math.exp(-da * 7) : 1;
      B.sc = B.s * popS * flareS * (0.9 + 0.1 * B.d) * (0.35 + 0.65 * sysScale(exitU(u)));
      const { Rs, spread } = core(u);
      if (Rs < 0.6) return B;
      const R = Rs * Math.max(1, spread) * 1.03 + 10 + LABEL_GAP * (Rs / SPH);   // shell jitter ≤ 1.03, node dot ≤ 10
      const lx0 = (-A.w / 2 + CHIP_H - 4) * B.sc, lx1 = (A.w / 2 - 36) * B.sc, ly = (CHIP_H / 2 - 8) * B.sc;
      let px = B.x - CX, py = B.y - CY;
      if (Math.hypot(px, py) < 1) { px = 0; py = -1; }
      const clear = (k) => {
        const x = CX + px * k, y = CY + py * k;
        return Math.hypot(Math.max(x + lx0 - CX, 0, CX - x - lx1), Math.max(y - ly - CY, 0, CY - y - ly)) >= R;
      };
      if (clear(1)) return B;
      let lo = 1, hi = 2;
      while (!clear(hi) && hi < 1024) { lo = hi; hi *= 2; }
      // fail loud (Rule 12): R is bounded, so 1024× the ray always clears a sane geometry — if it does not, the
      // pose is corrupt (NaN size, broken core bound); never fling the badge off-frame and carry on
      if (!clear(hi)) throw new Error(`orbit-network: badge ${i} cannot clear the brain-core at localT ${u} (clearance ${R}, label ${lx0}..${lx1} × ±${ly})`);
      for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (clear(mid)) hi = mid; else lo = mid; }
      B.x = CX + px * hi; B.y = CY + py * hi;
      return B;
    }
    const packetOff = (i, k) => fract(hash(i * 7.1 + k * 3.3) + k * 0.5);
    function chipGlow(i, u) {
      let gl = 0;
      const dp = u - T.pop[i];
      if (dp >= 0) gl = Math.exp(-dp * 5);
      for (let k = 0; k < 2; k++) if (u > T.pop[i] + 0.45) gl = Math.max(gl, 0.55 * Math.exp((-8 * fract(u * PK_SP + packetOff(i, k))) / PK_SP));
      for (const A of L.arcs) if (A.b === i) { const d = u - (relay0 + A.k * 0.17 + 0.5 * 0.86); if (d >= 0) gl = Math.max(gl, 0.9 * Math.exp(-d * 8)); }
      const da = u - (T.army + i * 0.045);
      if (da >= 0) gl = Math.max(gl, Math.exp(-da * 4));
      return gl;
    }

    // ── atoms ──
    function dotGlow(x, y, r, col, a) {
      if (!(r > 0)) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, C(col, a * Math.pow(1 - k / 6, 2.4)));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // pulse = a badge-shaped halo that grows OUTWARD from the pill (never a ring across the label)
    function ping(i, B, q, col, gMax = 36, w = 3, a = 0.8) {
      if (q <= 0 || q >= 1 || !(B.sc > 0)) return;
      const e = ease.outExpo(q), g = 3 + gMax * e, A = L.chips[i];
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(B.x, B.y); ctx.scale(B.sc, B.sc);
      ctx.strokeStyle = C(col, a * Math.pow(1 - q, 2)); ctx.lineWidth = lerp(w, 0.6, q);
      rr(ctx, -A.w / 2 - g, -CHIP_H / 2 - g, A.w + 2 * g, CHIP_H + 2 * g, 30 + g); ctx.stroke(); ctx.restore();
    }
    function ringPolyline(R, tilt, roll, aBack, aFront, col, lw) {
      const n = 120, pts = [];
      for (let k = 0; k <= n; k++) { const th = (k / n) * TAU; pts.push(proj(R * Math.cos(th), 0, R * Math.sin(th), tilt, roll)); }
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          if ((pts[k].z + pts[k + 1].z > 0) !== (pass === 1)) continue;
          ctx.moveTo(pts[k].x, pts[k].y); ctx.lineTo(pts[k + 1].x, pts[k + 1].y);
        }
        ctx.strokeStyle = C(col, pass ? aFront : aBack); ctx.lineWidth = lw; ctx.stroke();
      }
    }
    function ringComet(R, tilt, roll, thHead, col, a, lw, len = 0.9) {
      const n = 26;
      let prev = null;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let k = 0; k <= n; k++) {
        const th = thHead - (k / n) * len, q = proj(R * Math.cos(th), 0, R * Math.sin(th), tilt, roll);
        if (prev) {
          ctx.strokeStyle = C(col, a * Math.pow(1 - k / n, 1.6) * (0.5 + 0.5 * clamp((q.z / R + 1) / 2))); ctx.lineWidth = lw * (1 - (k / n) * 0.6);
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
        prev = q;
      }
      ctx.restore();
    }
    function sparks(t0, ox, oy, n, seed, vMin, vMax, lifeMul, cols) {
      const dt = lt - t0;
      if (dt < 0 || dt > 1.8 * lifeMul) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const K = 3.4;
      for (let i = 0; i < n; i++) {
        const h1 = hash(seed + i * 1.37), h2 = hash(seed + i * 2.11 + 3), h3 = hash(seed + i * 0.73 + 8);
        const life = (0.5 + h3 * 1.1) * lifeMul;
        if (dt > life) continue;
        const ang = h1 * TAU, v = vMin + h2 * (vMax - vMin);
        const d = (v * (1 - Math.exp(-K * dt))) / K, vel = v * Math.exp(-K * dt);
        const x = ox + Math.cos(ang) * d, y = oy + Math.sin(ang) * d + 40 * dt * dt;
        const len = Math.min(26, 3 + vel * 0.03), a = Math.pow(1 - dt / life, 1.4);
        ctx.strokeStyle = mix(cols[i % cols.length], P.text, 0.5 * (1 - dt / life), a); ctx.lineWidth = 1 + 1.6 * a;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); ctx.stroke();
      }
      ctx.restore();
    }

    // ── pre-ignite inflow streaks + ember ──
    function inflow(t0, t1, seed, n, swirlMag, rScale, wMul) {
      if (lt < t0 || lt > t1) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const cols = [P.secondary, P.primary, P.text];
      for (let i = 0; i < n; i++) {
        const h1 = hash(seed + i * 1.13), h2 = hash(seed + i * 2.71 + 5), h3 = hash(seed + i * 0.37 + 9);
        const delay = h3 * (t1 - t0) * 0.45, q = clamp((lt - t0 - delay) / (t1 - t0 - delay));
        if (q <= 0 || q >= 1) continue;
        const a0 = h1 * TAU, R0 = (380 + h2 * 1000) * rScale, sw = (h3 > 0.5 ? 1 : -1) * swirlMag;
        const at = (s) => { const r = R0 * (1 - ease.inCubic(s)), a = a0 + sw * s; return [CX + Math.cos(a) * r, CY + Math.sin(a) * r * 0.82]; };
        let prev = at(q);
        for (let k = 1; k <= 4; k++) {
          const s = at(Math.max(0, q - (0.15 * k) / 4));
          ctx.strokeStyle = C(cols[i % 3], (0.12 + 0.8 * q) * (1 - (k - 1) / 4)); ctx.lineWidth = (1 + 2.4 * q) * wMul * (1 - (k - 1) / 5);
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(s[0], s[1]); ctx.stroke(); prev = s;
        }
        const hd = at(q);
        ctx.fillStyle = C(P.text, 0.2 + 0.7 * q); ctx.beginPath(); ctx.arc(hd[0], hd[1], 1.2 + 1.6 * q, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    function ember() {
      if (lt >= T.ign) return;
      const k = ease.inQuad(api.anticipate(lt, T.ign, 0.42));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      dotGlow(CX, CY, 60 + 190 * k, P.primary, 0.15 + 0.5 * k);
      dotGlow(CX, CY, 24 + 70 * k, P.secondary, 0.3 + 0.6 * k);
      ctx.fillStyle = C(P.text, 0.5 + 0.5 * k); ctx.beginPath(); ctx.arc(CX, CY, 3 + 11 * k, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ── ignition flash, anamorphic streaks, shockwaves ──
    function ignition() {
      const dt = lt - T.ign;
      if (dt < 0 || dt > 1.4) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      dotGlow(CX, CY, 640, P.primary, 0.55 * Math.exp(-dt * 6));
      dotGlow(CX, CY, 470, P.secondary, 0.5 * Math.exp(-dt * 5));
      dotGlow(CX, CY, 360, P.text, 0.62 * Math.exp(-dt * 9));
      ctx.fillStyle = C(P.primary, 0.14 * Math.exp(-dt * 16)); ctx.fillRect(0, 0, W, H);
      const Ls = 1900 * ease.outExpo(clamp(dt / 0.45));
      for (const [h, col, al] of [[5, P.text, 0.95], [2, P.secondary, 0.7]]) {
        const hh = h * Math.exp(-dt * 4.5) + 1, g = ctx.createLinearGradient(CX - Ls, 0, CX + Ls, 0);
        g.addColorStop(0, C(col, 0)); g.addColorStop(0.5, C(col, al * Math.exp(-dt * 4))); g.addColorStop(1, C(col, 0));
        ctx.fillStyle = g; ctx.fillRect(CX - Ls, CY - hh / 2, Ls * 2, hh);
      }
      for (let k = 0; k < 3; k++) {
        const q = ease.outExpo(clamp((dt - k * 0.09) / 0.95));
        if (q <= 0 || q >= 1) continue;
        const col = k === 0 ? P.text : k === 1 ? P.secondary : P.primary;
        ctx.shadowColor = C(col, 0.9); ctx.shadowBlur = 26;
        ctx.strokeStyle = C(col, Math.pow(1 - q, 1.2) * 0.9); ctx.lineWidth = 1.5 + 16 * (1 - q);
        ctx.beginPath(); ctx.arc(CX, CY, 1500 * q * (1 - 0.18 * k), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }

    // ── neural brain-core ──
    function brain() {
      const bt = lt - T.ign;
      if (bt < 0) return;
      const { nodes, edges, edgeR, sigs } = L.brain;
      const U = exitU(lt), pulse = pulseEnergy(lt);
      const { Rs, spread } = core(lt);
      if (Rs < 0.6) return;
      const waves = [[T.ign, 1.0], [T.brain, 0.85], [T.army, 0.5]];
      const waveLit = (r) => {
        let l = 0;
        for (const [w0, amp] of waves) { const dt = lt - w0; if (dt < 0) continue; const d = (r - dt * 2.7) / 0.2; l += amp * Math.exp(-d * d) * Math.exp(-dt * 0.9); }
        return Math.min(l, 1.2);
      };
      const yaw = 0.3 + 0.75 * bt + 6 * U * U, tilt = 0.34 + 0.1 * Math.sin(bt * 0.9);
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
      const fr = Math.floor(lt * 90);
      const cx = CX + (hash(fr) - 0.5) * 9 * U, cy = CY + (hash(fr + 7) - 0.5) * 9 * U;   // tremble before collapse
      const nIn = clamp(bt / 0.22), eIn = clamp((bt - 0.12) / 0.4);

      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const hot = Math.exp(-bt * 3.2) + 0.9 * Math.pow(U, 1.6);
      dotGlow(cx, cy, Rs * 2.5, P.primary, 0.22 + 0.12 * pulse);
      dotGlow(cx, cy, Rs * 1.25, P.secondary, 0.16 + 0.1 * pulse);
      dotGlow(cx, cy, Rs * 0.9, P.text, clamp(0.1 + 0.55 * hot + 0.15 * pulse, 0, 0.95));
      const rim = ctx.createRadialGradient(cx, cy, Rs * 0.82, cx, cy, Rs * 1.32);
      rim.addColorStop(0, C(P.primary, 0)); rim.addColorStop(0.42, C(P.primary, 0.14 * nIn)); rim.addColorStop(0.62, C(P.secondary, 0.12 * nIn)); rim.addColorStop(1, C(P.secondary, 0));
      ctx.fillStyle = rim; ctx.fillRect(cx - Rs * 1.4, cy - Rs * 1.4, Rs * 2.8, Rs * 2.8);
      ctx.restore();

      const n = nodes.length, X = new Array(n), Y = new Array(n), Z = new Array(n), S = new Array(n), LIT = new Array(n);
      for (let i = 0; i < n; i++) {
        const q = nodes[i], k = Rs * spread;
        const x = q[0] * k, y = q[1] * k, z = q[2] * k;
        const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
        const y2 = y * ct + z1 * st, z2 = -y * st + z1 * ct;
        const s = FOC / (FOC - z2);
        X[i] = cx + x1 * s; Y[i] = cy + y2 * s; Z[i] = clamp((z2 / (Rs * spread)) * 0.5 + 0.5); S[i] = s;
        LIT[i] = waveLit(Math.hypot(q[0], q[1], q[2]));
      }
      const buckets = [[], [], [], []];
      for (let e = 0; e < edges.length; e++) buckets[Math.min(3, Math.floor(((Z[edges[e][0]] + Z[edges[e][1]]) / 2) * 4))].push(e);
      ctx.save(); ctx.lineCap = 'round';
      for (let b = 0; b < 4; b++) {
        ctx.beginPath();
        for (const e of buckets[b]) { const [a, c] = edges[e]; ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[c], Y[c]); }
        ctx.strokeStyle = mix(P.primary, P.secondary, b / 3, (0.1 + (0.2 * b) / 3) * eIn); ctx.lineWidth = 1 + 0.25 * b; ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let e = 0; e < edges.length; e++) {
        const l = waveLit(edgeR[e]) * eIn;
        if (l < 0.08) continue;
        const [a, c] = edges[e];
        ctx.strokeStyle = mix(P.secondary, P.text, 0.6, Math.min(0.95, l * 0.75)); ctx.lineWidth = 1.2 + 1.8 * l;
        ctx.beginPath(); ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[c], Y[c]); ctx.stroke();
      }
      if (bt > 0.3) {   // travelling signals
        const heads = [], tails = [];
        for (const s of sigs) {
          const [a, c] = edges[s.e];
          let f = fract(lt * s.sp + s.ph);
          if (s.dir < 0) f = 1 - f;
          const f0 = clamp(f - s.dir * 0.22);
          heads.push([lerp(X[a], X[c], f), lerp(Y[a], Y[c], f), lerp(Z[a], Z[c], f)]);
          tails.push([lerp(X[a], X[c], f0), lerp(Y[a], Y[c], f0), lerp(X[a], X[c], f), lerp(Y[a], Y[c], f)]);
        }
        ctx.strokeStyle = mix(P.secondary, P.text, 0.35, 0.65); ctx.lineWidth = 2; ctx.beginPath();
        for (const q of tails) { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); }
        ctx.stroke();
        ctx.fillStyle = C(P.secondary, 0.2); ctx.beginPath();
        for (const h of heads) { ctx.moveTo(h[0] + 8, h[1]); ctx.arc(h[0], h[1], 8, 0, TAU); }
        ctx.fill();
        ctx.fillStyle = C(P.text, 0.95); ctx.beginPath();
        for (const h of heads) { const r = 1.5 + 1.8 * h[2]; ctx.moveTo(h[0] + r, h[1]); ctx.arc(h[0], h[1], r, 0, TAU); }
        ctx.fill();
      }
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Z[a] - Z[b] || a - b);
      for (const i of order) {
        const d = Z[i], l = LIT[i], tw = 0.5 + 0.5 * Math.sin(lt * 3 + i * 1.7);
        const r = (1.7 + 2 * d + 3.4 * l + 0.6 * tw) * S[i] * (Rs / SPH) * nIn;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = mix(P.primary, P.secondary, d, (0.04 + 0.3 * l) * nIn); ctx.beginPath(); ctx.arc(X[i], Y[i], r * 2.5, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = mix(mix(P.primary, P.secondary, d), P.text, clamp(l * 0.9 + 0.18 * d), (0.45 + 0.55 * d) * nIn);
        ctx.beginPath(); ctx.arc(X[i], Y[i], r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ── orbit system: HUD tick ring, orbit ring + comets, memory ring ──
    function rings() {
      const bt = lt - T.ign;
      if (bt < 0.03) return;
      const U = exitU(lt), rk = ease.outExpo(clamp((bt - 0.02) / 0.65)), sc = sysScale(U) * rk, fade = winFade(lt);
      if (sc < 0.01) return;
      const spin = orbitSpin(lt), otilt = orbitTilt(U), tick = mix(P.primary, P.text, 0.75);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      {
        const R = (L.R + 155) * sc, n = 96, ph = -0.12 * bt;
        ctx.lineWidth = 1.2;
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          for (let k = 0; k < n; k++) {
            const th = ph + (k / n) * TAU, len = k % 8 === 0 ? 16 : 7;
            const a = proj(R * Math.cos(th), 0, R * Math.sin(th), otilt, 0), b = proj((R + len) * Math.cos(th), 0, (R + len) * Math.sin(th), otilt, 0);
            if ((a.z > 0) !== (pass === 1)) continue;
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          }
          ctx.strokeStyle = C(tick, (pass ? 0.3 : 0.12) * rk * fade); ctx.stroke();
        }
      }
      ringPolyline(L.R * sc, otilt, 0, 0.16 * fade, 0.42 * fade, mix(P.primary, P.text, 0.6), 1.6);
      ringComet(L.R * sc, otilt, 0, spin + 0.4, P.secondary, 0.8 * fade, 3.4, 1.0);
      ringComet(L.R * sc, otilt, 0, spin + 0.4 + Math.PI, P.primary, 0.7 * fade, 3.0, 0.8);
      const mk = ease.outExpo(clamp((lt - T.memory + 0.05) / 0.5));
      if (mk > 0.01) {
        const mR = MEM_R * sc * mk, mt = MEM_TILT * (1 - 0.8 * ease.inOutCubic(U)), mspin = -0.42 * bt - 3 * U * U;
        ringPolyline(mR, mt, MEM_ROLL, 0.1 * fade * mk, 0.3 * fade * mk, P.hot, 1.3);
        ringComet(mR, mt, MEM_ROLL, mspin + 0.3, P.hot, 0.85 * fade * mk, 3, 0.9);
      }
      ctx.restore();
    }
    function dust() {
      const bt = lt - T.ign;
      if (bt < 0.1) return;
      const U = exitU(lt), a = clamp((bt - 0.1) / 0.5) * winFade(lt), sc = sysScale(U);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 64; i++) {
        const R = (230 + hash(i * 2.3) * 520) * sc, th = hash(i * 5.1) * TAU + (0.2 + hash(i * 1.9) * 0.5) * bt * (i % 2 ? 1 : -1) + 2.5 * U * U;
        const q = proj(R * Math.cos(th), (hash(i * 8.7) - 0.5) * 220 * sc, R * Math.sin(th), 0.3 + hash(i * 4.4) * 0.6, 0);
        const d = clamp((q.z / 700 + 1) / 2);
        ctx.fillStyle = C(i % 3 ? P.secondary : P.primary, (0.15 + 0.5 * d) * a * (0.6 + 0.4 * Math.sin(lt * 2 + i)));
        ctx.beginPath(); ctx.arc(q.x, q.y, (0.8 + 1.6 * d) * q.s, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ── badge (glass chip with icon disc, node label via api.text, status dot) ──
    // drawn LAST in the frame (R5 legibility): an opaque pill first, so nothing the scene drew behind shows through
    // the label; depth dims the glass, never the label below 0.78.
    function chip(i, x, y, sc, on, d, gl) {
      const A = L.chips[i], h = CHIP_H, w = A.w;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha *= on;
      const ga = ctx.globalAlpha;
      rr(ctx, -w / 2, -h / 2, w, h, 30); ctx.fillStyle = P.ink2; ctx.fill();
      ctx.globalAlpha = ga * (0.55 + 0.45 * d);
      api.glass(ctx, -w / 2, -h / 2, w, h, 30, { fill: C(P.ink2, 0.88), border: C(A.c, 0.3 + 0.6 * gl), glowColor: C(A.c, 0.2 + 0.55 * gl), glowBlur: 20 + 34 * gl });
      if (gl > 0.02) { rr(ctx, -w / 2, -h / 2, w, h, 30); ctx.fillStyle = C(A.c, 0.12 * gl); ctx.fill(); }
      const ix = -w / 2 + h / 2;
      const g = ctx.createRadialGradient(ix, -6, 2, ix, 0, 31);
      g.addColorStop(0, C(A.c, 0.42)); g.addColorStop(1, C(A.c, 0.08));
      ctx.beginPath(); ctx.arc(ix, 0, 29, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = C(A.c, 0.8); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.save(); ctx.translate(ix, 0); ctx.scale(1.25, 1.25); icon(ctx, A.icon, mix(A.c, P.text, 0.5), rr); ctx.restore();
      const sp = 0.5 + 0.5 * Math.sin(lt * 4 + A.a0 * 3);
      ctx.save(); ctx.beginPath(); ctx.arc(w / 2 - 24, 0, 4.6, 0, TAU); ctx.fillStyle = C(P.mint, 0.7 + 0.3 * sp); ctx.shadowColor = P.mint; ctx.shadowBlur = 8 + 8 * sp; ctx.fill(); ctx.restore();
      ctx.globalAlpha = ga * (0.78 + 0.22 * d);
      api.text(ctx, A.item, -w / 2 + h + 1, 2, { size: L.nodePx, weight: 600, base: 'middle', track: 0.3, fill: P.text });   // the label is the chip's last draw
      ctx.restore();
    }
    // beam core → badge: soft wide stroke + hairline + travelling dashes + packets both ways
    function beam(i, B) {
      const A = L.chips[i], bp = ease.outCubic(clamp((lt - T.pop[i] - 0.08) / 0.32));
      if (bp <= 0) return;
      const fade = winFade(lt), x1 = lerp(CX, B.x, bp), y1 = lerp(CY, B.y, bp);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const da = lt - T.army - i * 0.045, flare = da >= 0 ? Math.exp(-da * 5) : 0;
      const g = ctx.createLinearGradient(CX, CY, B.x, B.y);
      g.addColorStop(0, C(P.text, 0.3)); g.addColorStop(0.3, C(A.c, 0.55)); g.addColorStop(1, C(A.c, 0.4));
      ctx.strokeStyle = g; ctx.lineWidth = 9 + 6 * flare; ctx.globalAlpha = fade * (0.55 + 0.45 * B.d) * (0.1 + 0.12 * flare);
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = fade * (0.55 + 0.45 * B.d); ctx.lineWidth = 1.6 + 1.5 * flare; ctx.stroke();
      ctx.setLineDash([2, 16]); ctx.lineDashOffset = -lt * 70; ctx.strokeStyle = C(P.text, 0.45); ctx.lineWidth = 2.2; ctx.stroke(); ctx.setLineDash([]);
      if (bp >= 1) {
        const dx = B.x - CX, dy = B.y - CY;
        for (let k = 0; k < 2; k++) {
          for (const dir of [1, -1]) {
            const ph = fract(lt * PK_SP + packetOff(i, k) + (dir < 0 ? 0.25 : 0)), q = ease.inOutCubic(ph), q0 = ease.inOutCubic(Math.max(0, ph - 0.09));
            const f = dir > 0 ? q : 1 - q, f0 = dir > 0 ? q0 : 1 - q0;
            const hx = CX + dx * f, hy = CY + dy * f, tx = CX + dx * f0, ty = CY + dy * f0;
            ctx.strokeStyle = dir > 0 ? C(A.c, 0.95) : C(P.text, 0.9); ctx.lineWidth = 3.4;
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
            ctx.fillStyle = C(P.text, 0.95); ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, TAU); ctx.fill();
            dotGlow(hx, hy, 15, dir > 0 ? A.c : P.text, 0.5);
          }
        }
      }
      ctx.restore();
    }
    function trail(i) {
      const U = exitU(lt);
      if (U < 0.08) return;
      const len = 0.05 + 0.2 * U, n = 14, A = L.chips[i];
      let prev = null;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let k = 0; k <= n; k++) {
        const q = pose(i, lt - (k / n) * len);
        if (prev) { ctx.strokeStyle = C(A.c, 0.7 * Math.pow(1 - k / n, 1.4) * winFade(lt)); ctx.lineWidth = lerp(9, 1.5, k / n) * (0.6 + 0.6 * q.d); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        prev = q;
      }
      ctx.restore();
    }
    function relays() {
      if (lt > T.exit + 0.35 || N < 2) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const R of L.arcs) {
        const q = (lt - (relay0 + R.k * 0.17)) / 0.5;
        if (q <= 0 || q >= 1) continue;
        const A = pose(R.a, lt), B = pose(R.b, lt), ca = L.chips[R.a].c, cb = L.chips[R.b].c;
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, ox = mx - CX, oy = my - CY, ol = Math.hypot(ox, oy) || 1, span = Math.hypot(A.x - B.x, A.y - B.y);
        const cxp = mx + (ol > 40 ? ox / ol : 0) * span * 0.22, cyp = my + (ol > 40 ? oy / ol : -1) * span * 0.22 - 70;
        const at = (s) => { const u = 1 - s; return [u * u * A.x + 2 * u * s * cxp + s * s * B.x, u * u * A.y + 2 * u * s * cyp + s * s * B.y]; };
        const head = ease.inOutCubic(clamp(q / 0.86)), tail = Math.max(0, head - 0.38), fade = Math.min(1, (1 - q) * 6) * winFade(lt), n = 20;
        let prev = at(tail);
        for (let k = 1; k <= n; k++) {
          const s = lerp(tail, head, k / n), pt = at(s);
          ctx.strokeStyle = mix(ca, cb, s, Math.pow(k / n, 1.5) * 0.9 * fade); ctx.lineWidth = 1 + 3.2 * (k / n);
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); prev = pt;
        }
        const hd = at(head);
        ctx.fillStyle = C(P.text, fade); ctx.beginPath(); ctx.arc(hd[0], hd[1], 4.2, 0, TAU); ctx.fill(); dotGlow(hd[0], hd[1], 24, cb, 0.55 * fade);
      }
      ctx.restore();
    }
    function memoryCells(items) {
      const bt = lt - T.ign, U = exitU(lt), sc = sysScale(U), fade = winFade(lt);
      const mt = MEM_TILT * (1 - 0.8 * ease.inOutCubic(U)), mspin = -0.42 * bt - 3 * U * U, mk = ease.outExpo(clamp((lt - T.memory + 0.05) / 0.5));
      for (let j = 0; j < MEM_N; j++) {
        const dp = lt - (T.memory + j * 0.018);
        if (dp < 0) continue;
        const th = (j / MEM_N) * TAU + mspin, R = MEM_R * sc * mk, q = proj(R * Math.cos(th), 0, R * Math.sin(th), mt, MEM_ROLL);
        const wave = Math.pow(0.5 + 0.5 * Math.sin(th * 2 - lt * 5.5), 4), lit = clamp(0.18 + 0.6 * wave + Math.exp(-dp * 5));
        const d = clamp((q.z / MEM_R + 1) / 2), sp = ease.outBack(clamp(dp / 0.35));
        items.push({ z: q.z, o: 2, f() {
          const half = (5.2 + 3 * d) * q.s * sp * (0.8 + 0.4 * lit), a = (0.4 + 0.6 * d) * fade;
          ctx.save(); ctx.translate(q.x, q.y); ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = C(P.hot, (0.03 + 0.2 * lit) * a); ctx.beginPath(); ctx.arc(0, 0, half * 2.8, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over'; ctx.rotate(Math.PI / 4 + lt * 0.6);
          rr(ctx, -half, -half, half * 2, half * 2, 2.2); ctx.fillStyle = mix(P.hot, P.text, clamp(lit - 0.4) * 1.2, (0.25 + 0.7 * lit) * a); ctx.fill();
          ctx.strokeStyle = C(P.hot, 0.9 * a); ctx.lineWidth = 1.3; ctx.stroke();
          ctx.restore();
        } });
      }
    }

    // ── typography lane: scrim, HUD corners, hub label (letters rise; glow sprite; accent rule) ──
    function sucked(fn) {
      const v = clamp((lt - T.textExit) / T.textDur), g = 1 - 0.55 * ease.inCubic(v);
      ctx.save(); ctx.translate(CX, CY); ctx.scale(g, g); ctx.translate(-CX, -CY); ctx.globalAlpha *= 1 - ease.inQuad(clamp(v / 0.75)); fn(); ctx.restore();
    }
    function scrim() {
      const a = ease.outCubic(clamp((lt - T.brain + 0.2) / 0.5));
      if (a <= 0) return;
      const k = a * (1 - ease.inQuad(clamp((lt - T.textExit) / T.textDur)));
      const g = ctx.createLinearGradient(0, 760, 0, H);
      g.addColorStop(0, C(P.ink, 0)); g.addColorStop(0.45, C(P.ink, 0.5 * k)); g.addColorStop(1, C(P.ink, 0.72 * k));
      ctx.fillStyle = g; ctx.fillRect(0, 760, W, H - 760);
    }
    function hud() {
      const q = ease.outExpo(clamp((lt - T.ign + 0.1) / 0.6));
      if (q <= 0) return;
      const ix = 84, iy = 60, l = 46 * q;
      ctx.save(); ctx.strokeStyle = mix(P.primary, P.text, 0.8, 0.34); ctx.lineWidth = 2; ctx.lineCap = 'square';
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = sx > 0 ? ix : W - ix, y = sy > 0 ? iy : H - iy;
        ctx.beginPath(); ctx.moveTo(x, y + sy * l); ctx.lineTo(x, y); ctx.lineTo(x + sx * l, y); ctx.stroke();
      }
      ctx.restore();
    }
    function hubLabel() {
      const size = L.hubPx, y = L.base, rise = size * 0.5;
      const per = Math.min(0.034, 0.35 / Math.max(1, L.letters.length));
      const fill = api.brand(ctx, L.left, 0, L.left + L.full, 0, mix(P.primary, P.text, 0.15), P.secondary);
      for (let j = 0; j < L.letters.length; j++) {
        const lg = L.letters[j], t0 = T.brain + j * per, q = ease.outExpo(clamp((lt - t0) / 0.55));
        if (q <= 0) continue;
        const hotK = Math.exp(-Math.max(0, lt - t0 - 0.1) * 4.2);
        const o = { size, weight: 700, track: HUB_TRACK, slice: [lg.s, lg.e] };
        ctx.save(); ctx.globalAlpha *= clamp(q * 2.2);
        api.text(ctx, L.hub, lg.x, y + (1 - q) * rise, { ...o, fill });
        if (hotK > 0.02) { ctx.globalCompositeOperation = 'lighter'; api.text(ctx, L.hub, lg.x, y + (1 - q) * rise, { ...o, fill: P.text, alpha: Math.min(1, hotK * 1.1) }); }
        ctx.restore();
      }
      const done = clamp((lt - T.brain - 0.3) / 0.35);
      if (done > 0) {
        const pu = pulseEnergy(lt) * 0.5 + 0.8 * ex(lt - T.army, 3);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= done * clamp(0.5 + pu) * 0.8;
        ctx.drawImage(L.glow.canvas, L.glow.x, L.glow.y, L.glow.w, L.glow.h); // bloom, not text: no manifest box
        ctx.restore();
      }
      const ul = ease.outExpo(clamp((lt - T.brain - 0.28) / 0.5));
      if (ul > 0) {
        const g = ctx.createLinearGradient(L.left, 0, L.left + L.full, 0);
        g.addColorStop(0, P.primary); g.addColorStop(1, C(P.secondary, 0));
        ctx.save(); ctx.globalAlpha *= 0.9; ctx.fillStyle = g; ctx.fillRect(L.left, y + 22, L.full * ul, 3); ctx.restore();
      }
    }
    function wordRings() {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [t0, col, a, rMax] of [[T.brain, P.primary, 0.55, 640], [T.memory, P.hot, 0.6, 700], [T.army, P.secondary, 0.8, 900]]) {
        const q = (lt - t0) / 0.9;
        if (q <= 0 || q >= 1) continue;
        const e = ease.outExpo(q);
        ctx.shadowColor = C(col, 0.8); ctx.shadowBlur = 14;
        ctx.strokeStyle = C(col, a * 0.8 * Math.pow(1 - q, 1.5)); ctx.lineWidth = 1 + 3 * (1 - e);
        ctx.beginPath(); ctx.arc(CX, CY, 120 + rMax * e, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    function singularity() {
      const U = exitU(lt);
      if (U <= 0) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const span = T.end - T.exit;
      [0.1, 0.38, 0.6].forEach((f, k) => {   // imploding shock rings
        const s = T.exit + f * span, q = clamp((lt - s) / (T.end - s));
        if (q <= 0 || q >= 1) return;
        ctx.strokeStyle = C(k === 1 ? P.secondary : P.primary, Math.sin(Math.PI * Math.pow(q, 0.8)) * 0.55); ctx.lineWidth = 1.5 + 2.5 * q;
        ctx.beginPath(); ctx.arc(CX, CY, 780 * (1 - ease.inCubic(q)) * (1 - 0.1 * k), 0, TAU); ctx.stroke();
      });
      const Ls = 170 + 1250 * Math.sin(Math.PI * Math.pow(U, 2)), a = clamp(U * 1.6);
      const g = ctx.createLinearGradient(CX - Ls, 0, CX + Ls, 0);
      g.addColorStop(0, C(P.secondary, 0)); g.addColorStop(0.5, C(P.text, 0.95 * a)); g.addColorStop(1, C(P.primary, 0));
      const hh = 2 + 5 * U;
      ctx.fillStyle = g; ctx.fillRect(CX - Ls, CY - hh / 2, Ls * 2, hh);
      const hot = Math.pow(U, 1.5);
      dotGlow(CX, CY, 70 + 230 * hot, P.primary, 0.2 + 0.4 * hot);
      dotGlow(CX, CY, 34 + 80 * hot, P.secondary, 0.3 + 0.55 * hot);
      dotGlow(CX, CY, 24 + 20 * hot, P.text, 0.5 + 0.5 * hot);
      ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(CX, CY, 3 + 8 * hot, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ───────────────────────── scene ─────────────────────────
    const fade = winFade(lt);
    inflow(0, T.ign, 11, 120, 2.4, 1, 1);
    ember();
    scrim();
    const poses = L.chips.map((_, i) => (lt >= T.ign && lt >= T.pop[i] ? pose(i, lt) : null));
    if (lt >= T.ign) {
      rings();
      dust();
      wordRings();
      const items = [{ z: 0, o: 0, i: -1, f: brain }];
      L.chips.forEach((A, i) => {
        const B = poses[i];
        if (B) items.push({ z: B.z >= 0 ? B.z * 0.5 : B.z - 1, o: 1, i, f: () => { beam(i, B); trail(i); } });
      });
      memoryCells(items);
      items.sort((a, b) => a.z - b.z || a.o - b.o || (a.i ?? 0) - (b.i ?? 0));
      for (const it of items) it.f();
      relays();
      L.chips.forEach((A, i) => {
        const B = poses[i] ?? pose(i, lt);
        ping(i, B, (lt - T.pop[i]) / 0.65, A.c);
        if (lt < T.exit) ping(i, B, (lt - (T.army + i * 0.045)) / 0.45, A.c, 18, 2.2, 0.6);
        const b0 = pose(i, T.pop[i]);
        sparks(T.pop[i], b0.x, b0.y, 16, 40 + i * 13, 120, 420, 0.7, [A.c, P.text]);
      });
      sparks(T.ign, CX, CY, 150, 3, 260, 1500, 1, [P.secondary, P.primary, P.text, P.hot]);
      ignition();
    }
    inflow(T.exit + 0.05, T.end, 71, 90, 3.2, 0.9, 1.1);
    sucked(() => { hud(); hubLabel(); });
    singularity();
    // badges LAST, back to front (R5 legibility): no ring / beam / pulse / spark / relay is ever drawn over a label.
    // Accepted visual changes vs the M1/HEAD-c4af0fa z-sort (badges interleaved with brain / beams / memory cells):
    //   (a) a badge behind the core (z < 0) now paints over front memory cells and beams — legibility over depth cue;
    //   (b) through the exit collapse the shrinking badges paint over the singularity (rings + white-hot core) until
    //       winFade / sysScale take them out — they read as falling INTO the point, not behind it.
    // The hub-lane clearance of these opaque pills (they also draw after hubLabel) is pinned by the browser test (e).
    const order = poses.map((B, i) => i).filter((i) => poses[i]).sort((a, b) => poses[a].z - poses[b].z || a - b);
    for (const i of order) {
      const B = poses[i], on = clamp((lt - T.pop[i]) / 0.1) * fade;
      if (on > 0.01) chip(i, B.x, B.y, B.sc, on, B.d, chipGlow(i, lt));
    }
  },
};
