// flow-graph (C9 / C13) — port of spike s2 PART B, the install flow graph. Lanes of options fan out, one
// chosen path lights node by node on the cue map `step.<i>` (C14), packets ride the edges, then the whole
// graph IMPLODES into a single point on cue `converge` (iris + core flare + rays + shock rings). Cue times come
// only from api.cue (a missing cue fails at boot, never a re-derived schedule).
//   converge — lanes with skeleton option pills (the paths not taken) + the lit path, imploding at the end
//   chain    — the same path as a clean pipeline (ghost nodes fill in on their cue), no fan; on `converge`
//              a light runs the whole chain and it LOCKS with a check instead of imploding
// Layout: 3 steps → one row; 4..6 → two rows read as a snake (row 2 runs right → left), so 6 near-maxChars
// labels still fit the safe area at or above the family minimum (fitSlot fails `check` otherwise).
// Scale (R5): labels take the LARGEST px the column width allows (up to STEP_MAX_PX) and the columns spread
// over the whole graph band (GX0..GX1), so short labels read big and the graph always spans most of the frame.
// The paths not taken are drawn as secondary branch stubs (a dim port dot + a fading line, no box, no text),
// so nothing reads as a missing label; they fan over the branch band (BAND_Y0..BAND_Y1) so the graph fills the
// frame height too. Chain ghost slots (future nodes) are port dots only, for the same reason.
// Accepted vignette floor: the engine vignette still dims the outermost lit label a little (worst measured glyph
// ratio vs the centre label ≈ 0.86, pinned ≥ 0.84 in the R5 rendered test); lifting it further needs engine changes.
// Slots: steps (3–6 facts; route/command render mono) · lead (flow phrase, optional, screen-fixed header).
// Colours come only from params.palette (no literals); the soft-light dots are per-dot radial gradients, not a
// reused sprite (see SPR); draw() is a pure function of localT and the cues (D9/D10).

// text band = api.safeRect (x0 ≈ 139.5, x1 ≈ 1780.5): clear of the 48 px safe margin under the worst camera
const TEXT_MAX_W = 620, STEP_MAX_PX = 48, STEP_W = 700, STEP_TRACK = 0.4;
const PAD_K = 0.7, PAD_MIN = 20;          // pill side padding = PAD_K·px, at least PAD_MIN
const GAP_MIN = 48, GAP_MAX = 400;      // 3 columns of 28 mono chars still fit at 28 px (display minimum)
// pill band (one row / snake: room on the right for the turn edge). Kept inside x ≈ 290..1630 (still ≥ 65% of the
// frame): the engine vignette (0 inside r = 0.35·H, 0.62 at r = H) takes ~20% off a white label ~660 px off-axis
const GX0 = 290, GX1 = [1630, 1590];
const ROW_Y1 = 600, ROW_Y2 = [420, 770];  // node centre rows: one row / two-row snake
const LANE_PAD = 18;
const LEAD_Y = 170, LEAD_MAX_PX = 40;
// branch band (converge): the option branches fan out to fill ~60–65% of the frame height like spike A's option
// lists. Lane glass stays below the lead header's rule (LEAD_Y + 29) and above BAND_Y1; pitch capped at PITCH_MAX
const BAND_Y0 = [140, LEAD_Y + 50], BAND_Y1 = 980, PITCH_MAX = 110;
const SAMP = 20;                          // samples per edge curve
const LOCK_O_MAX = 90;                    // chain lock ring: final growth off the last pill's edge

/** cubic bezier through 4 control points, sampled SAMP+1 times (graph space, pure) */
function curve(A, C1, C2, B) {
  const pts = [];
  for (let k = 0; k <= SAMP; k++) {
    const u = k / SAMP, v = 1 - u;
    pts.push([
      v * v * v * A[0] + 3 * v * v * u * C1[0] + 3 * v * u * u * C2[0] + u * u * u * B[0],
      v * v * v * A[1] + 3 * v * v * u * C1[1] + 3 * v * u * u * C2[1] + u * u * u * B[1],
    ]);
  }
  return pts;
}
/** edge geometry between two boxes {x, y, w, h}: 'h' = horizontal S-curve in direction dir, 'turn' = C-bracket on the right */
function edgeBetween(a, b, kind, dir) {
  if (kind === 'turn') {
    const A = [a.x + a.w / 2, a.y], B = [b.x + b.w / 2, b.y], bulge = 70 + Math.abs(B[1] - A[1]) * 0.12;
    const R = Math.max(A[0], B[0]) + bulge;
    return curve(A, [R, A[1]], [R, B[1]], B);
  }
  const A = [a.x + (dir * a.w) / 2, a.y], B = [b.x - (dir * b.w) / 2, b.y];
  const dx = (B[0] - A[0]) * 0.55;
  return curve(A, [A[0] + dx, A[1]], [B[0] - dx, B[1]], B);
}

export default {
  id: 'flow-graph',

  layout(rb, variant, api) {
    const P = api.palette;
    const items = rb.slots.steps.items;
    const lead = rb.slots.lead?.items[0] ?? null;
    const N = items.length;
    const chain = variant === 'chain';
    // the compiler emits step.<i> per step + converge (C14): a missing one fails the boot, never a made-up time
    for (const name of [...items.map((_, i) => `step.${i}`), 'converge']) api.cue(name);
    const rows = N <= 3 ? 1 : 2;
    const cols = rows === 1 ? N : Math.ceil(N / 2);
    const TEXT_L = Math.ceil(api.safeRect.x0), TEXT_R = Math.floor(api.safeRect.x1);
    const span = TEXT_R - TEXT_L, gx1 = GX1[rows - 1];
    const twMax = Math.min(TEXT_MAX_W, Math.floor((span - (cols - 1) * (2 * PAD_MIN + GAP_MIN)) / cols));
    const px = api.fitSlot('steps', { maxW: twMax, maxPx: STEP_MAX_PX, weight: STEP_W, track: STEP_TRACK });
    const leadPx = lead ? api.fitSlot('lead', { maxW: 1300, maxPx: LEAD_MAX_PX, weight: 700, track: 4 }) : 0;
    const m = api.makeCanvas('cache', 8, 8).ctx;

    // snake placement: row 0 left → right, row 1 right → left (short turn edge on the right)
    const place = (i) => (i < cols ? { row: 0, col: i } : { row: 1, col: cols - 1 - (i - cols) });
    const tws = items.map((it) => Math.min(twMax, api.measure(m, it, { size: px, weight: STEP_W, track: STEP_TRACK }).width));
    const colTw = Array.from({ length: cols }, () => 0);
    items.forEach((_, i) => { const c = place(i).col; colTw[c] = Math.max(colTw[c], tws[i]); });
    const twSum = colTw.reduce((s, w) => s + w, 0);
    // pill padding grows with px but never pushes text past TEXT_L/TEXT_R (the tight extent is span + 2·PAD_MIN)
    const padRoom = Math.floor((span + 2 * PAD_MIN - twSum - (cols - 1) * GAP_MIN) / (2 * cols));
    const PADX = Math.max(PAD_MIN, Math.min(Math.round(PAD_K * px), padRoom));
    const PH = Math.round(px * 2), RAD = Math.round(PH * 0.28);
    const pillSum = twSum + 2 * PADX * cols;
    // columns spread over the pill band: the graph spans most of the frame whatever the label lengths
    const gap = cols > 1 ? Math.max(GAP_MIN, Math.min(GAP_MAX, (gx1 - GX0 - pillSum) / (cols - 1))) : 0;
    const total = pillSum + (cols - 1) * gap;
    let x = (total > gx1 - GX0 ? 960 : (GX0 + gx1) / 2) - total / 2;
    const colX = colTw.map((w) => { const cx = x + w / 2 + PADX; x += w + 2 * PADX + gap; return cx; });
    const rowY = rows === 1 ? [ROW_Y1] : ROW_Y2;
    const nodes = items.map((item, i) => {
      const { row, col } = place(i);
      return { item, i, row, col, x: colX[col], y: rowY[row], w: Math.round(tws[i] + 2 * PADX), h: PH, tw: tws[i] };
    });

    // origin (a glowing diamond, no text) just left of the first node
    const origin = { x: nodes[0].x - nodes[0].w / 2 - 44, y: nodes[0].y, w: 0, h: 0 };
    const kindInto = (i) => (i === 0 ? 'h' : nodes[i].row !== nodes[i - 1].row ? 'turn' : 'h');
    const dirOf = (i) => (nodes[i].row === 0 ? 1 : -1);
    const pathEdges = nodes.map((n, i) => ({ i, pts: edgeBetween(i === 0 ? origin : nodes[i - 1], n, kindInto(i), dirOf(i)) }));

    // converge: every path step sits in a lane of option branches (the paths not taken), fanned from the previous
    // node. A branch is a port dot on the lane's entry side + a fading stub line: clearly secondary, never a box
    // (an empty box reads as a missing label) and never text (nothing on screen is invented).
    const rnd = api.rng(api.seed);
    const lanes = [], decoys = [], fan = [];
    if (!chain) {
      // 3 branches per side fill the room between the node row and the band edge (one row: both sides; a snake row
      // fans outward only), never closer to the node than its pill edge + a port dot
      const top = BAND_Y0[lead ? 1 : 0] + LANE_PAD + 10, bot = BAND_Y1 - LANE_PAD - 10;
      const room = Math.min(rowY[0] - top, bot - rowY[rows - 1]);
      const pitch = Math.round(Math.max(PH / 2 + 12, Math.min(PITCH_MAX, room / 3)));
      nodes.forEach((n, i) => {
        const dir = dirOf(i);
        const offs = rows === 1 ? [-1, 1, -2, 2, -3, 3] : n.row === 0 ? [-1, -2, -3] : [1, 2, 3];
        const mine = offs.map((o, r) => ({
          lane: i, rank: r, far: Math.abs(o), x: n.x - dir * (n.w / 2 - PADX), y: n.y + o * pitch, w: 0, h: 0,
          dir, len: Math.round((n.w - 2 * PADX) * (0.5 + 0.45 * rnd())),
        }));
        decoys.push(...mine);
        const ys = [n.y - PH / 2, n.y + PH / 2, ...mine.map((d) => d.y)];
        const y0 = Math.min(...ys) - LANE_PAD - 10, y1 = Math.max(...ys) + LANE_PAD + 10;
        lanes.push({ i, x0: n.x - n.w / 2 - LANE_PAD, x1: n.x + n.w / 2 + LANE_PAD, y0, y1, ny: n.y });
        mine.forEach((d) => fan.push({ lane: i, rank: d.rank, ph: rnd(), pts: edgeBetween(i === 0 ? origin : nodes[i - 1], d, kindInto(i), dir) }));
      });
    }

    // soft-light dots (glow without shadowBlur): radial-gradient colour stops, palette colours only. Painted as a
    // fresh gradient per dot in draw(): blitting one build-once CPU sprite many times per frame made the SAME frame
    // hash differently on its first and later renders in a page (measured: the dirty-page AC3 test), which the
    // final render — every frame in one page — would turn into a film that differs from verify's fresh re-render
    const tint = (c) => [[0, api.mix(P.text, c, 0.15)], [0.25, api.rgba(c, 0.8)], [0.6, api.rgba(c, 0.18)], [1, api.rgba(c, 0)]];
    const SPR = {
      white: [[0, api.rgba(P.text, 1)], [0.2, api.rgba(P.text, 0.85)], [0.55, api.mix(P.text, P.primary, 0.3, 0.22)], [1, api.rgba(P.primary, 0)]],
      primary: tint(P.primary),
      secondary: tint(P.secondary),
    };

    const ys = [...nodes, ...decoys].flatMap((d) => [d.y - d.h / 2, d.y + d.h / 2]);
    const gc = (Math.min(...ys) + Math.max(...ys)) / 2;
    const leadW = lead ? api.measure(m, lead, { size: leadPx, weight: 700, track: 4 }).width - 4 : 0;
    return { chain, N, rows, px, PH, PADX, RAD, nodes, origin, pathEdges, lanes, decoys, fan, SPR, gc, lead, leadPx, leadW };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L } = p;
    const { W, H, clamp, lerp, ease, hash, rgba, mix, rr, palette: P, grid } = api;
    const CX = W / 2, CY = H / 2;
    const sm = (a, b, v) => { const u = clamp((v - a) / (b - a)); return u * u * (3 - 2 * u); };
    const mod = (a, n) => ((a % n) + n) % n;
    const N = L.N;
    const STEP = L.nodes.map((_, i) => api.cue(`step.${i}`));
    const CV = api.cue('converge');
    const CV0 = CV - 2 * grid;                         // implosion window ends exactly on the cue
    const laneT = (i) => Math.max(0, STEP[i] - 4 * grid);
    const edgeT0 = (i) => STEP[i] - 2 * grid, EDGE_D = 2 * grid;
    const pathColor = (k, a = 1) => mix(P.primary, P.secondary, clamp(k / Math.max(1, N)), a);
    const spot = (c, stops, x, y, r, a) => {
      if (!(r > 0) || !(a > 0)) return;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      for (const [o, col] of stops) g.addColorStop(o, col);
      c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    };

    // camera: gentle pull-back while the graph builds; converge pulls everything radially into the core
    const c = L.chain ? 0 : ease.inQuart(clamp((lt - CV0) / (CV - CV0)));
    const s = lerp(1.05, 1, ease.outCubic(clamp(lt / (STEP[0] + 4 * grid))));
    const F = { s, c, ns: s * (1 - 0.85 * c), vis: 1 - sm(0.9, 1, c), dim: L.chain ? 0 : sm(CV - 6 * grid, CV - 3 * grid, lt) };
    const Pt = (x, y, cc = F.c) => {
      const bx = CX + (x - CX) * F.s, by = L.gc + (y - L.gc) * F.s;
      return [CX + (bx - CX) * (1 - cc), CY + (by - CY) * (1 - cc)];
    };
    const at = (pts, u) => { // point at parameter u along sampled curve
      const k = clamp(u) * SAMP, n = Math.min(SAMP - 1, Math.floor(k)), fr = k - n;
      return [lerp(pts[n][0], pts[n + 1][0], fr), lerp(pts[n][1], pts[n + 1][1], fr)];
    };
    const trace = (c2, pts, dp) => {
      const k = dp * SAMP, n = Math.floor(k), fr = k - n;
      let q = Pt(pts[0][0], pts[0][1]); c2.moveTo(q[0], q[1]);
      for (let j = 1; j <= n; j++) { q = Pt(pts[j][0], pts[j][1]); c2.lineTo(q[0], q[1]); }
      if (n < SAMP && fr > 0) { q = Pt(lerp(pts[n][0], pts[n + 1][0], fr), lerp(pts[n][1], pts[n + 1][1], fr)); c2.lineTo(q[0], q[1]); }
    };
    const fanT0 = (f) => laneT(f.lane) + f.rank * 0.25 * grid;
    const pathDraw = (i) => ease.outCubic(clamp((lt - edgeT0(i)) / EDGE_D));
    // chain: the ghost pipeline is laid out before the first step lights
    const ghostT0 = (i) => (STEP[0] - 4 * grid) * (i / Math.max(1, N)), GHOST_D = 3 * grid;

    // ── arrival ring (spike drawArrival) ──
    function drawArrival() {
      const u = clamp(lt / (3.5 * grid)); if (u <= 0 || u >= 1) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 * Math.pow(1 - u, 1.5); ctx.lineWidth = lerp(9, 1.5, u);
      ctx.strokeStyle = api.brand(ctx, CX - 900, 0, CX + 900, 0, P.primary, P.secondary);
      ctx.beginPath(); ctx.arc(CX, CY, lerp(240, 1250, ease.outExpo(u)), 0, 7); ctx.stroke(); ctx.restore();
    }

    // ── lanes: glass columns behind each option list ──
    function drawLanes() {
      for (const ln of L.lanes) {
        // the glass fades in with its contents (first branch stub → node pop), never ahead of them as an empty panel
        const a = sm(laneT(ln.i) + 1.1 * grid, edgeT0(ln.i) + grid, lt) * F.vis; if (a < 0.01) continue;
        const [x0, y0] = Pt(ln.x0, ln.y0), [x1, y1] = Pt(ln.x1, ln.y1);
        ctx.save(); ctx.globalAlpha = a * (1 - 0.3 * F.dim);
        // the glass is densest on the chosen node's row and thins out over the branch stubs (no empty panel)
        const ny = Pt(0, ln.ny)[1], far = Math.abs(y0 - ny) > Math.abs(y1 - ny) ? y0 : y1;
        const lg = ctx.createLinearGradient(0, ny, 0, far + Math.sign(far - ny) * 1e-3);
        lg.addColorStop(0, mix(P.panel2, P.primary, 0.1, 0.46)); lg.addColorStop(1, mix(P.panel2, P.primary, 0.1, 0.1));
        const sg = ctx.createLinearGradient(0, ny, 0, far + Math.sign(far - ny) * 1e-3);
        sg.addColorStop(0, mix(P.text, P.primary, 0.3, 0.16)); sg.addColorStop(1, mix(P.text, P.primary, 0.3, 0.04));
        rr(ctx, x0, y0, x1 - x0, y1 - y0, 24 * F.ns); ctx.fillStyle = lg; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = sg; ctx.stroke();
        // lane index pips (no text: a dot per step position, the lit one in brand colour)
        const [px0, py0] = Pt((ln.x0 + ln.x1) / 2, ln.y0 + 12);
        for (let k = 0; k < N; k++) {
          ctx.beginPath(); ctx.arc(px0 + (k - (N - 1) / 2) * 12 * F.ns, py0, 2.6 * F.ns, 0, 7);
          ctx.fillStyle = k === ln.i ? pathColor(k) : rgba(P.dim, 0.5); ctx.fill();
        }
        ctx.restore();
      }
    }

    // ── edges: dim fan (batched) → packets → lit path with white-hot head ──
    function drawEdges() {
      if (F.vis < 0.01) return;
      const dimMul = 1 - 0.4 * F.dim;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, 2 * F.ns); ctx.strokeStyle = mix(P.dim, P.primary, 0.3, 0.4 * dimMul * F.vis);
      ctx.beginPath();
      for (const f of L.fan) { const dp = ease.outCubic(clamp((lt - fanT0(f)) / (1.2 * grid))); if (dp > 0.001) trace(ctx, f.pts, dp); }
      if (L.chain) L.pathEdges.forEach((e, i) => { const dp = ease.outCubic(clamp((lt - ghostT0(i)) / GHOST_D)); if (dp > 0.001) trace(ctx, e.pts, dp); });
      ctx.stroke(); ctx.restore();

      // packets (additive sprites) ride every drawn edge until the implosion
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const packet = (pts, t0, dp, path, ph, idx) => {
        const cnt = path ? 2 : 1, rate = path ? 2.2 : 1.2;
        for (let q = 0; q < cnt; q++) {
          const u = mod((lt - t0) * rate + ph + q * 0.5, 1); if (u > dp) continue;
          const pp = at(pts, u), sp = Pt(pp[0], pp[1]);
          const spr = path ? L.SPR.white : idx % 2 ? L.SPR.secondary : L.SPR.primary;
          spot(ctx, spr, sp[0], sp[1], (path ? 15 : 9) * F.ns, (path ? 0.95 : 0.6 * dimMul) * F.vis * Math.sin(Math.PI * clamp(u / Math.max(dp, 0.2))));
        }
      };
      if (lt < CV0 || L.chain) {
        L.fan.forEach((f, k) => { const dp = ease.outCubic(clamp((lt - fanT0(f)) / (1.2 * grid))); if (dp >= 0.12) packet(f.pts, fanT0(f), dp, false, f.ph, k); });
        L.pathEdges.forEach((e, i) => { const dp = pathDraw(i); if (dp >= 0.12) packet(e.pts, edgeT0(i), dp, true, hash(i * 4.3), i); });
      }
      ctx.restore();

      // lit path: brand gradient stroke with glow, head arrives at node i exactly on step.i
      ctx.save(); ctx.lineCap = 'round';
      L.pathEdges.forEach((e, i) => {
        const lp = pathDraw(i); if (lp < 0.001) return;
        const a = Pt(e.pts[0][0], e.pts[0][1]), b = Pt(e.pts[SAMP][0], e.pts[SAMP][1]);
        const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        g.addColorStop(0, pathColor(i)); g.addColorStop(1, pathColor(i + 1));
        ctx.strokeStyle = g; ctx.shadowColor = pathColor(i + 0.5, 0.95); ctx.shadowBlur = 22 * F.ns;
        ctx.globalAlpha = F.vis; ctx.lineWidth = 5 * F.ns;
        ctx.beginPath(); trace(ctx, e.pts, lp); ctx.stroke();
        const hp = at(e.pts, lp), hs = Pt(hp[0], hp[1]);
        ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'lighter';
        spot(ctx, L.SPR.white, hs[0], hs[1], 22 * F.ns, (lp < 0.999 ? 1 : 0.45 * Math.exp(-(lt - STEP[i]) * 6)) * F.vis);
        ctx.globalCompositeOperation = 'source-over';
      });
      ctx.restore();
    }

    function shape(c2, w, h, r) { rr(c2, -w / 2, -h / 2, w, h, r); }

    // option branch (a path not taken): a port dot where its fan edge lands + a stub that fades into the lane.
    // Secondary by construction: thin, dim, fainter the further it sits from the chosen node, no box, no text.
    function drawDecoy(d) {
      const t0 = laneT(d.lane) + d.rank * 0.25 * grid + 1.1 * grid, age = lt - t0; if (age < 0) return;
      const [x, y] = Pt(d.x, d.y), grow = ease.outCubic(clamp(age / (1.6 * grid)));
      const a = clamp(age / (0.6 * grid)) * F.vis * (1 - 0.45 * F.dim) * (1.1 - 0.16 * d.far);
      if (a < 0.01) return;
      const len = d.len * grow * F.ns, x1 = x + d.dir * len;
      ctx.save(); ctx.lineCap = 'round';
      const g = ctx.createLinearGradient(x, 0, x1 + d.dir * 1e-3, 0);
      g.addColorStop(0, mix(P.dim, P.primary, 0.45, 0.75)); g.addColorStop(1, mix(P.dim, P.primary, 0.45, 0));
      ctx.globalAlpha = a; ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, 2 * F.ns);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 5.5 * F.ns, 0, 7); ctx.fillStyle = rgba(P.ink2, 0.9); ctx.fill();
      ctx.lineWidth = Math.max(1, 1.8 * F.ns); ctx.strokeStyle = mix(P.dim, P.primary, 0.5, 0.8); ctx.stroke();
      ctx.restore();
    }

    // path node: pops as its edge departs, LIGHTS on step.<i> (flash + ring + sparks)
    function drawNode(n) {
      const i = n.i, pop = edgeT0(i), age = lt - pop;
      const ghost = L.chain ? clamp((lt - ghostT0(i) - GHOST_D * 0.6) / (1.5 * grid)) : 0;
      if (age < 0 && ghost <= 0) return;
      const [x, y] = Pt(n.x, n.y);
      const dl = lt - STEP[i];
      const lit = sm(STEP[i], STEP[i] + grid, lt), flash = dl > 0 ? Math.exp(-dl * 7) : 0;
      const kick = dl > 0 ? 1 + 0.08 * Math.exp(-dl * 10) * Math.cos(dl * 28) : 1;
      const grow = age < 0 ? 1 : lerp(0.3, 1, ease.outBack(clamp(age / (2.4 * grid))));
      const sc = F.ns * (L.chain ? Math.max(ghost > 0 ? 1 : 0, grow) : grow) * kick;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.max(ghost * 0.85, clamp(age / (0.6 * grid))) * F.vis;
      const w = n.w * (1 + 0.04 * flash), h = n.h;
      shape(ctx, w, h, L.RAD);
      if (lit > 0.01) {
        ctx.shadowColor = pathColor(i, 0.9); ctx.shadowBlur = (26 + 40 * flash) * Math.min(1, 1.4 - F.s * 0.2);
        const fg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        // a dark tinted body keeps the label readable under bloom; colour lives in the border + glow (+ the landing flash)
        // flash term capped low so the freshly lit label stays crisp under the landing flash (ring + glow carry it)
        fg.addColorStop(0, rgba(P.primary, 0.04 + 0.06 * lit + 0.1 * flash)); fg.addColorStop(1, rgba(P.secondary, 0.03 + 0.05 * lit + 0.1 * flash));
        ctx.fillStyle = rgba(P.ink2, 0.92); ctx.fill(); ctx.fillStyle = fg; ctx.fill(); ctx.shadowBlur = 0;
        ctx.lineWidth = 2.5; ctx.strokeStyle = api.brand(ctx, -w / 2, 0, w / 2, 0, P.primary, P.secondary); ctx.stroke();
      } else if (age >= 0) {
        ctx.fillStyle = rgba(P.panel, 0.94); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = mix(P.text, P.primary, 0.2, 0.26); ctx.stroke();
      } else {
        // chain ghost slot (before its label pops): structure only — the two port dots its edges attach to, no
        // outline (an empty box reads as a missing label), no fill, no placeholder bar
        for (const sx of [-w / 2, w / 2]) {
          ctx.beginPath(); ctx.arc(sx, 0, 5.5, 0, 7); ctx.fillStyle = rgba(P.ink2, 0.9); ctx.fill();
          ctx.lineWidth = 1.8; ctx.strokeStyle = mix(P.dim, P.primary, 0.5, 0.8); ctx.stroke();
        }
      }
      if (age >= 0) {
        api.text(ctx, n.item, 0, 1, { size: L.px, weight: STEP_W, track: STEP_TRACK, align: 'center', base: 'middle',
          fill: lit > 0.3 ? P.text : mix(P.text, P.dim, 0.45), alpha: clamp(age / grid) });
      }
      ctx.restore();

      // lock FX: an outward ring off the pill edge + sparks from both ends
      if (dl >= 0 && dl < 4 * grid && F.vis > 0.01) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 2; k++) {
          const dk = dl - k * 0.4 * grid, uk = clamp(dk / (2.4 * grid)); if (dk < 0 || uk >= 1) continue;
          const o = lerp(0, 70, ease.outExpo(uk)) * F.ns, ww = w * F.ns, hh = h * F.ns;
          ctx.globalAlpha = 0.9 * Math.exp(-dk * 26) * F.vis; ctx.lineWidth = lerp(5, 1.5, uk);
          ctx.strokeStyle = api.brand(ctx, x - ww / 2 - o, 0, x + ww / 2 + o, 0, P.primary, P.secondary);
          rr(ctx, x - ww / 2 - o, y - hh / 2 - o * 0.8, ww + 2 * o, hh + 1.6 * o, L.RAD + o * 0.45); ctx.stroke();
        }
        ctx.restore();
        const sc2 = [P.text, P.secondary, P.primary];
        api.sparks(ctx, dl, x + (n.w / 2) * F.ns, y, 12, 40 + i, { a0: -0.7, a1: 0.7, sMin: 250, sMax: 800, pow: 1.3, drag: 6, grav: 300, lifeMin: 0.25, lifeMax: 0.5, alpha: 0.8 * F.vis }, sc2, hash);
        api.sparks(ctx, dl, x - (n.w / 2) * F.ns, y, 12, 60 + i, { a0: Math.PI - 0.7, a1: Math.PI + 0.7, sMin: 250, sMax: 800, pow: 1.3, drag: 6, grav: 300, lifeMin: 0.25, lifeMax: 0.5, alpha: 0.8 * F.vis }, sc2, hash);
      }
    }

    function drawOrigin() {
      const a = ease.outBack(clamp(lt / (2 * grid))) * F.vis; if (a <= 0.01) return;
      const [x, y] = Pt(L.origin.x, L.origin.y);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.scale(a * F.ns, a * F.ns);
      rr(ctx, -10, -10, 20, 20, 4); ctx.fillStyle = api.brand(ctx, -10, -10, 10, 10, P.primary, P.secondary);
      ctx.shadowColor = P.primary; ctx.shadowBlur = 18; ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; spot(ctx, L.SPR.white, x, y, 26 * F.ns, 0.55 * F.vis); ctx.restore();
    }

    function drawGraph() {
      drawLanes();
      drawEdges();
      // convergence streaks UNDER the nodes: every node drags a bright trail into the point
      if (F.c > 0.02 && F.c < 0.999) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.globalAlpha = 1 - sm(0.85, 1, F.c);
        const streak = (d, path) => {
          const a = Pt(d.x, d.y), b = Pt(d.x, d.y, Math.max(0, F.c - 0.2));
          ctx.lineWidth = (path ? 7 : 4) * F.ns; ctx.strokeStyle = path ? mix(P.secondary, P.text, 0.6, 0.55) : mix(P.primary, P.text, 0.3, 0.4);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        };
        L.decoys.forEach((d) => streak(d, false)); L.nodes.forEach((n) => { if (lt >= edgeT0(n.i)) streak(n, true); });
        ctx.restore();
      }
      drawOrigin();
      L.decoys.forEach(drawDecoy);
      L.nodes.forEach(drawNode);
    }

    // ── converge: IRIS + core + SHOCKWAVE (ink stays ink — energy lives in the core, rings and rays) ──
    function drawCore() {
      const u0 = clamp((lt - CV0) / (CV - CV0)), cc = ease.inQuart(u0), dt = lt - CV;
      if (u0 <= 0) return;
      const irisR = dt < 0 ? lerp(1500, 300, ease.inOutCubic(u0)) : lerp(300, 2000, ease.outExpo(clamp(dt / (4.4 * grid))));
      const irisA = dt < 0 ? 0.6 * sm(0, 0.5, u0) : 0.6 * (1 - clamp(dt / (2.8 * grid)));
      if (irisA > 0.01) {
        const g = ctx.createRadialGradient(CX, CY, irisR * 0.8, CX, CY, irisR);
        g.addColorStop(0, rgba(P.ink, 0)); g.addColorStop(1, rgba(P.ink, irisA));
        ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (cc > 0.01) {
        const a = dt < 0 ? cc * cc : 1, pulse = dt > 0 ? 1 + 0.12 * Math.sin(dt * 40) * Math.exp(-dt * 6) : 1;
        spot(ctx, L.SPR.primary, CX, CY, lerp(20, 120, a) * pulse, 0.85 * a);
        spot(ctx, L.SPR.white, CX, CY, lerp(8, 34, a) * pulse, a);
      }
      if (dt >= 0) {
        spot(ctx, L.SPR.white, CX, CY, lerp(150, 300, ease.outExpo(clamp(dt / (3.6 * grid)))), 0.9 * Math.exp(-dt * 8));
        ctx.lineCap = 'round';
        for (let k = 0; k < 56; k++) {
          const ang = (k / 56) * 6.2832 + hash(k * 2.3) * 0.08, sp = 0.6 + hash(k * 7.1) * 0.7, len = 40 + hash(k * 3.9) * 240;
          const r1 = 170 + 1100 * ease.outExpo(clamp((dt * sp) / (4 * grid))), r0 = Math.max(80, r1 - len * (0.6 + 0.4 * ease.outCubic(clamp(dt / (2 * grid)))));
          ctx.globalAlpha = Math.exp(-dt * 6.5) * (k % 4 === 0 ? 0.9 : 0.55); ctx.lineWidth = k % 4 === 0 ? 3 : 1.6;
          ctx.strokeStyle = k % 2 ? mix(P.secondary, P.text, 0.45) : mix(P.primary, P.text, 0.4);
          ctx.beginPath(); ctx.moveTo(CX + Math.cos(ang) * r0, CY + Math.sin(ang) * r0); ctx.lineTo(CX + Math.cos(ang) * r1, CY + Math.sin(ang) * r1); ctx.stroke();
        }
        const hw = lerp(60, W * 0.6, ease.outExpo(clamp(dt / (2.4 * grid))));
        const g = ctx.createLinearGradient(CX - hw, 0, CX + hw, 0);
        g.addColorStop(0, rgba(P.primary, 0)); g.addColorStop(0.5, rgba(P.text, Math.exp(-dt * 7))); g.addColorStop(1, rgba(P.secondary, 0));
        ctx.globalAlpha = 1; ctx.fillStyle = g; const th = 10 * Math.exp(-dt * 6) + 2; ctx.fillRect(CX - hw, CY - th / 2, hw * 2, th);
        for (let k = 0; k < 2; k++) {
          const dk = dt - k * 0.56 * grid; if (dk < 0) continue; const uk = clamp(dk / (4.4 * grid));
          ctx.globalAlpha = 0.85 * Math.exp(-dk * 4.5); ctx.lineWidth = lerp(14, 1.5, uk);
          ctx.strokeStyle = api.brand(ctx, CX - 700, 0, CX + 700, 0, P.primary, P.secondary);
          ctx.beginPath(); ctx.arc(CX, CY, lerp(110, 1000, ease.outExpo(uk)), 0, 7); ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ── chain: on `converge` a light runs the whole chain (origin → last node) and the chain LOCKS ──
    function drawChainLock() {
      const R0 = CV - 4 * grid, u = clamp((lt - R0) / (CV - R0)), dt = lt - CV;
      if (u > 0 && u < 1) {
        const k = ease.inOutCubic(u) * N, e = Math.min(N - 1, Math.floor(k)), fr = k - e;
        const hp = at(L.pathEdges[e].pts, fr), hs = Pt(hp[0], hp[1]);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let j = 0; j < 10; j++) {
          const kk = Math.max(0, k - j * 0.035), ee = Math.min(N - 1, Math.floor(kk)), q = at(L.pathEdges[ee].pts, kk - ee), qs = Pt(q[0], q[1]);
          spot(ctx, j ? L.SPR.secondary : L.SPR.white, qs[0], qs[1], (26 - j * 1.8) * F.ns, 1 - j / 10);
        }
        spot(ctx, L.SPR.white, hs[0], hs[1], 60 * F.ns, 0.7);
        ctx.restore();
      }
      if (dt >= 0) {
        const last = L.nodes[N - 1], [x, y] = Pt(last.x, last.y);
        const k = clamp(dt / (4.4 * grid));
        // the check sits ABOVE the pill, clear of the ring's full growth (top edge reaches hh/2 + 0.8*O_MAX)
        const bx = x, by = y - (last.h / 2) * F.ns - 0.8 * LOCK_O_MAX - 46;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.7 * Math.pow(1 - k, 1.6); ctx.lineWidth = lerp(8, 1.5, k);
        ctx.strokeStyle = api.brand(ctx, x - 500, 0, x + 500, 0, P.primary, P.secondary); ctx.shadowColor = P.secondary; ctx.shadowBlur = 24;
        // the lock ring grows OUT from the last pill's edge (never across a label), the check sits above it
        const o = lerp(0, LOCK_O_MAX, ease.outExpo(k)), ww = last.w * F.ns, hh = last.h * F.ns;
        rr(ctx, x - ww / 2 - o, y - hh / 2 - o * 0.8, ww + 2 * o, hh + 1.6 * o, L.RAD + o * 0.45); ctx.stroke();
        ctx.restore();
        api.checkMark(ctx, bx, by, 26, clamp(dt / (3 * grid)), P.mint);
        api.sparks(ctx, dt, bx, by, 48, 90, { a0: 0, a1: 6.2832, sMin: 200, sMax: 1000, pow: 1.4, drag: 4, grav: 260, lifeMin: 0.3, lifeMax: 0.7, alpha: 0.85 }, [P.text, P.secondary, P.primary, P.mint], hash);
      }
    }

    // ── lead phrase: screen-fixed header with a brand rule (fades out as the graph converges) ──
    function drawLead() {
      if (!L.lead) return;
      const q = ease.outExpo(clamp((lt - grid) / (4 * grid))), a = q * (1 - sm(CV0 - 2 * grid, CV0, lt) * (L.chain ? 0 : 1));
      if (a <= 0.003) return;
      api.text(ctx, L.lead, CX, LEAD_Y + 20 * (1 - q), { size: L.leadPx, weight: 700, track: 4, align: 'center', fill: P.text, alpha: a });
      const hw = Math.min(L.leadW / 2 + 40, 260) * q;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
      ctx.fillStyle = api.brand(ctx, CX - hw, 0, CX + hw, 0, P.primary, P.secondary); ctx.shadowColor = P.primary; ctx.shadowBlur = 14;
      ctx.fillRect(CX - hw, LEAD_Y + 26, hw * 2, 3); ctx.restore();
    }

    ctx.save();
    drawArrival();
    drawGraph();
    if (L.chain) drawChainLock(); else drawCore();
    drawLead();
    ctx.restore();
  },
};
