// flow-graph (C9 / C13) — port of spike s2 PART B, the install flow graph. Lanes of options fan out, one
// chosen path lights node by node on the cue map `step.<i>` (C14), packets ride the edges, then the whole
// graph IMPLODES into a single point on cue `converge` (iris + core flare + rays + shock rings). Cue times come
// only from api.cue (a missing cue fails at boot, never a re-derived schedule).
//   converge — the lit path under a canopy of dim alternative routes (arches between the same steps), imploding at the end
//   chain    — the same path as a clean pipeline (ghost nodes fill in on their cue), no fan; on `converge`
//              a light runs the whole chain and it LOCKS with a check instead of imploding
//   cluster  — NON-sequential (ruling f: facts with no README sequence): the steps sit as a constellation in two
//              rows around a soft hub glow at the frame centre, joined to the hub by plain undirected spokes —
//              no path, no origin, no arrows/heads/packets, nothing that reads "this, then this". Nodes reveal on
//              their step cue; on `converge` the constellation implodes into the hub like converge
// Layout: 3 steps → one row; 4..6 → two rows read as a snake (row 2 runs right → left), so 6 near-maxChars
// labels still fit the safe area at or above the family minimum (fitSlot fails `check` otherwise). cluster: always
// two rows (top ⌈N/2⌉, bottom the rest, centred so a shorter bottom row sits staggered under the top one).
// Hold contrast (PO R5 (b), "no dimmed first node"): the engine vignette (0 inside r = 0.35·H, 0.62 at r = H) caps
// an off-axis label at (1 − vignette(r))·255, so the outer (first) node read grey next to the centre ones. The
// archetype cannot lift that cap, so it keeps label glyphs close to the centre instead: rows symmetric about the
// frame centre, a pill band centred on the frame and only just ≥ 65% of its width, and a minimum pill width
// (PILL_MIN_W) so short labels sit inward of the band edges rather than at them.
// Scale (R5): labels take the LARGEST px the column width allows (up to STEP_MAX_PX, and — PO R5 (b) — no more than
// lets the widest row fit the pill band, floor BAND_PX_MIN) and the columns spread
// over the whole graph band (GX0..GX1), so short labels read big and the graph always spans most of the frame.
// Ornament (R5): the alternative routes are dim arches between two DRAWN steps of the same row (top edge → top
// edge, bottom → bottom), nested over the arch band (BAND_Y0..BAND_Y1) so the graph fills the frame height. Every
// edge on screen connects two drawn nodes (or the origin diamond): no lane panels, no stub rows, no pin circles,
// nothing that imitates a missing label. Chain ghost slots (future nodes) are port dots only, for the same reason.
// Timing: node i lights on step.<i>; a still taken before the last step cue (the contact-sheet hold sits there
// when the cue map's `to` reaches past it) shows that node unlit with its edge in flight — a cue-map matter.
// Accepted vignette floor: within the ≥ 65% width floor the outermost label still sits off-axis, so the vignette
// leaves it ≈ 0.91 of the centre label on the real films' sheet hold, and 28-char labels in
// three columns ≈ 0.80; the module itself draws every lit label at full brightness (PO R5 (b) test, de-vignetted).
// Parity needs an engine-side vignette change, not an archetype one.
// Slots: steps (3–6 facts; route/command render mono) · lead (flow phrase, optional, screen-fixed header).
// Colours come only from params.palette (no literals); the soft-light dots are per-dot radial gradients, not a
// reused sprite (see SPR); draw() is a pure function of localT and the cues (D9/D10).

// text band = api.safeRect (x0 ≈ 139.5, x1 ≈ 1780.5): clear of the 48 px safe margin under the worst camera
const TEXT_MAX_W = 620, STEP_MAX_PX = 48, STEP_W = 700, STEP_TRACK = 0.4;
const PAD_K = 0.7, PAD_MIN = 20;          // pill side padding = PAD_K·px, at least PAD_MIN
const GAP_MIN = 48, GAP_MAX = 400;      // 3 columns of 28 mono chars still fit at 28 px (display minimum)
// pill band, centred on the frame, 1270 px (the R5 scale floor is 65% of 1920 = 1248): every px further out loses
// label brightness to the engine vignette (0 inside r = 0.35·H, 0.62 at r = H). The snake's turn edge bulges
// ~100 px right of GX1, still well inside the safe area
const GX0 = 325, GX1 = 1595;
const PILL_MIN_W = 340;                   // short labels: a wider pill keeps the glyphs inward of the band edges
const BAND_GAP = 80, BAND_PX_MIN = 40;    // px cap so the widest row fits the band (see layout), never below 40
const ROW_Y1 = 600, ROW_Y2 = [400, 680];  // node centre rows: one row / two-row snake (symmetric about y = 540)
const CL_Y = [400, 680];                  // cluster rows, the hub between them at the frame centre
const HUB_R = 16, HALO_R = 430;           // cluster hub ring / soft halo radius
const LEAD_Y = 170, LEAD_MAX_PX = 40;
const VARIANTS = ['converge', 'chain', 'cluster'];
// arch band (converge): the alternative-route arches reach ~65–70% of the frame height like spike A's option
// lists, staying below the lead header's rule (LEAD_Y + 29) and above BAND_Y1. ARCH_K = apex heights as fractions
// of the room between the node row and the band edge (nested: the higher arch lands nearer the node centres)
const BAND_Y0 = [150, LEAD_Y + 60], BAND_Y1 = 970, ARCH_K = [0.42, 0.71, 1];
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
    if (!VARIANTS.includes(variant)) throw new Error(`flow-graph: no variant "${variant}" (variants: ${VARIANTS.join(', ')})`);
    const chain = variant === 'chain', cluster = variant === 'cluster';
    // the compiler emits step.<i> per step + converge (C14): a missing one fails the boot, never a made-up time
    for (const name of [...items.map((_, i) => `step.${i}`), 'converge']) api.cue(name);
    const rows = cluster || N > 3 ? 2 : 1;
    const cols = rows === 1 ? N : Math.ceil(N / 2);
    const TEXT_L = Math.ceil(api.safeRect.x0), TEXT_R = Math.floor(api.safeRect.x1);
    const span = TEXT_R - TEXT_L;
    const twMax = Math.min(TEXT_MAX_W, Math.floor((span - (cols - 1) * (2 * PAD_MIN + GAP_MIN)) / cols));
    const m = api.makeCanvas('cache', 8, 8).ctx;
    // snake placement: row 0 left → right, row 1 right → left (short turn edge on the right); cluster: both rows
    // left → right (no path runs through them)
    const place = (i) => (i < cols ? { row: 0, col: i } : { row: 1, col: cluster ? i - cols : cols - 1 - (i - cols) });
    // PO R5 (b): the largest px at which the widest columns still fit the pill band (GX0..GX1) with BAND_GAP between
    // them — past it the row spills toward the frame edge, where the engine vignette greys the outer label. Never
    // below BAND_PX_MIN (short labels stay big, R5 scale); fitSlot below still enforces the family minimum
    const col48 = Array.from({ length: cols }, () => 0);
    items.forEach((it, i) => { const c = place(i).col; col48[c] = Math.max(col48[c], api.measure(m, it, { size: STEP_MAX_PX, weight: STEP_W, track: STEP_TRACK }).width); });
    const bandPx = (GX1 - GX0 - (cols - 1) * BAND_GAP) / (col48.reduce((s, w) => s + w, 0) / STEP_MAX_PX + 2 * PAD_K * cols);
    const maxPx = Math.max(BAND_PX_MIN, Math.min(STEP_MAX_PX, Math.floor(bandPx)));
    const px = api.fitSlot('steps', { maxW: twMax, maxPx, weight: STEP_W, track: STEP_TRACK });
    const leadPx = lead ? api.fitSlot('lead', { maxW: 1300, maxPx: LEAD_MAX_PX, weight: 700, track: 4 }) : 0;
    const tws = items.map((it) => Math.min(twMax, api.measure(m, it, { size: px, weight: STEP_W, track: STEP_TRACK }).width));
    const colTw = Array.from({ length: cols }, () => 0);
    items.forEach((_, i) => { const c = place(i).col; colTw[c] = Math.max(colTw[c], tws[i]); });
    const twSum = colTw.reduce((s, w) => s + w, 0);
    // pill padding grows with px but never pushes text past TEXT_L/TEXT_R (the tight extent is span + 2·PAD_MIN)
    const padRoom = Math.floor((span + 2 * PAD_MIN - twSum - (cols - 1) * GAP_MIN) / (2 * cols));
    const PADX = Math.max(PAD_MIN, Math.min(Math.round(PAD_K * px), padRoom));
    const PH = Math.round(px * 2), RAD = Math.round(PH * 0.28);
    // pill width: label + padding, at least PILL_MIN_W — unless that would push the columns past the text band at
    // GAP_MIN (then plain label + padding, which padRoom above already fits)
    const fitSum = (mw) => colTw.reduce((s, w) => s + Math.max(mw, w + 2 * PADX), 0);
    const minW = fitSum(PILL_MIN_W) + (cols - 1) * GAP_MIN <= span + 2 * PAD_MIN ? PILL_MIN_W : 0;
    const pillW = (tw) => Math.round(Math.max(minW, tw + 2 * PADX));
    const colPw = colTw.map(pillW);
    const pillSum = colPw.reduce((s, w) => s + w, 0);
    // columns spread over the pill band: the graph spans most of the frame whatever the label lengths (cluster: the
    // full band — its two columns at N = 3 would otherwise stop at GAP_MAX, a narrow constellation)
    const gap = cols > 1 ? Math.max(GAP_MIN, Math.min(cluster ? Infinity : GAP_MAX, (GX1 - GX0 - pillSum) / (cols - 1))) : 0;
    const total = pillSum + (cols - 1) * gap;
    let x = (total > GX1 - GX0 ? 960 : (GX0 + GX1) / 2) - total / 2;
    const colX = colPw.map((w) => { const cx = x + w / 2; x += w + gap; return cx; });
    // cluster bottom row shorter than the top: centred on its own (same gap), so it sits staggered under the top
    const bot = items.map((_, i) => i).filter((i) => cluster && i >= cols);
    const botX = new Map();
    if (bot.length && bot.length < cols) {
      const ws = bot.map((i) => pillW(tws[i]));
      let bx = 960 - (ws.reduce((s, w) => s + w, 0) + (bot.length - 1) * gap) / 2;
      bot.forEach((i, k) => { botX.set(i, bx + ws[k] / 2); bx += ws[k] + gap; });
    }
    const rowY = cluster ? CL_Y : rows === 1 ? [ROW_Y1] : ROW_Y2;
    const nodes = items.map((item, i) => {
      const { row, col } = place(i);
      return { item, i, row, col, x: botX.get(i) ?? colX[col], y: rowY[row], w: pillW(tws[i]), h: PH, tw: tws[i] };
    });

    // origin (a glowing diamond, no text) just left of the first node — sequential variants only
    const origin = cluster ? null : { x: nodes[0].x - nodes[0].w / 2 - 44, y: nodes[0].y, w: 0, h: 0 };
    const kindInto = (i) => (i === 0 ? 'h' : nodes[i].row !== nodes[i - 1].row ? 'turn' : 'h');
    const dirOf = (i) => (nodes[i].row === 0 ? 1 : -1);
    // directed path edges (origin → node 0 → node 1 …): sequential variants only — a cluster has no order to draw
    const pathEdges = cluster ? [] : nodes.map((n, i) => ({ i, pts: edgeBetween(i === 0 ? origin : nodes[i - 1], n, kindInto(i), dirOf(i)) }));
    // cluster: one UNDIRECTED spoke per node, hub ring → the node's border facing the hub (top row: bottom edge,
    // bottom row: top edge). Straight, drawn uniformly along its length (no head, no packet), so it reads "belongs
    // to", never "comes after"
    const hub = cluster ? { x: 960, y: (CL_Y[0] + CL_Y[1]) / 2 } : null;
    const links = !cluster ? [] : nodes.map((n) => {
      const B = [n.x, n.y + (n.row === 0 ? 1 : -1) * (PH / 2)], dx = B[0] - hub.x, dy = B[1] - hub.y, d = Math.hypot(dx, dy) || 1;
      const A = [hub.x + (dx / d) * HUB_R, hub.y + (dy / d) * HUB_R];
      return { b: n.i, pts: curve(A, [A[0] + (B[0] - A[0]) / 3, A[1] + (B[1] - A[1]) / 3], [A[0] + (2 * (B[0] - A[0])) / 3, A[1] + (2 * (B[1] - A[1])) / 3], B) };
    });

    // converge: alternative routes between consecutive steps of the same row — nested arches from node i-1's
    // top (bottom) edge to node i's, outward from the row (one row: both sides; a snake row: away from the other
    // row). Both ends sit on drawn pills, so no line ever ends in empty space; no box, no text (nothing invented).
    const rnd = api.rng(api.seed);
    const fan = [];
    if (variant === 'converge') {
      const top = BAND_Y0[lead ? 1 : 0], bot = BAND_Y1;
      // one row: symmetric arches (the smaller room both ways); snake: row 0 arches up into the top room, row 1
      // arches down into the bottom room
      const room1 = Math.min(rowY[0] - top, bot - rowY[rows - 1]);
      const roomOf = (s) => (rows === 1 ? room1 : s < 0 ? rowY[0] - top : bot - rowY[1]);
      nodes.forEach((b, i) => {
        if (i === 0 || nodes[i - 1].row !== b.row) return;
        const a = nodes[i - 1], dir = dirOf(i);
        const sides = rows === 1 ? [-1, 1] : b.row === 0 ? [-1] : [1];
        sides.forEach((s, si) => ARCH_K.forEach((f, k) => {
          const room = roomOf(s);
          const h = (f * room - PH / 2) / 0.75, q = 0.62 - 0.24 * k; // port offset from the node centre (× w/2)
          const A = [a.x + dir * q * (a.w / 2), a.y + s * (PH / 2)], B = [b.x - dir * q * (b.w / 2), b.y + s * (PH / 2)];
          fan.push({ a: i - 1, b: i, rank: k + si * ARCH_K.length, ph: rnd(), pts: curve(A, [A[0], A[1] + s * h], [B[0], B[1] + s * h], B) });
        }));
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

    const ys = [...nodes.flatMap((d) => [d.y - d.h / 2, d.y + d.h / 2]), ...fan.flatMap((f) => f.pts.map((p) => p[1]))];
    const gc = (Math.min(...ys) + Math.max(...ys)) / 2;
    const leadW = lead ? api.measure(m, lead, { size: leadPx, weight: 700, track: 4 }).width - 4 : 0;
    // cluster hub halo: a soft brand glow, transparent at the rim (no ring edge that could read as a shape)
    if (cluster) SPR.halo = [[0, api.rgba(P.primary, 0.32)], [0.45, api.rgba(P.secondary, 0.12)], [1, api.rgba(P.secondary, 0)]];
    return { chain, cluster, N, rows, px, PH, PADX, RAD, nodes, origin, pathEdges, links, hub, fan, SPR, gc, lead, leadPx, leadW };
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
    const edgeT0 = (i) => STEP[i] - 2 * grid, EDGE_D = 2 * grid;
    const pathColor = (k, a = 1) => mix(P.primary, P.secondary, clamp(k / Math.max(1, N)), a);
    // node tint: by path position on a sequential graph; by x across the band on a cluster (a spatial gradient, so
    // the colours never suggest a progression the facts do not have)
    const nodeColor = (i, a = 1) => (L.cluster ? mix(P.primary, P.secondary, clamp((L.nodes[i].x - GX0) / (GX1 - GX0)), a) : pathColor(i, a));
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
    // an arch leaves node a once node b has popped (b pops as its path edge departs), never toward an absent node
    const fanT0 = (f) => edgeT0(f.b) + f.rank * 0.25 * grid;
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

    // ── edges: dim fan (batched) → packets → lit path with white-hot head ──
    function drawEdges() {
      if (F.vis < 0.01) return;
      const dimMul = 1 - 0.4 * F.dim;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, 2 * F.ns); ctx.strokeStyle = mix(P.dim, P.primary, 0.4, 0.5 * dimMul * F.vis);
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
        ctx.shadowColor = nodeColor(i, 0.9); ctx.shadowBlur = (26 + 40 * flash) * Math.min(1, 1.4 - F.s * 0.2);
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
      if (!L.origin) return;
      const a = ease.outBack(clamp(lt / (2 * grid))) * F.vis; if (a <= 0.01) return;
      const [x, y] = Pt(L.origin.x, L.origin.y);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.scale(a * F.ns, a * F.ns);
      rr(ctx, -10, -10, 20, 20, 4); ctx.fillStyle = api.brand(ctx, -10, -10, 10, 10, P.primary, P.secondary);
      ctx.shadowColor = P.primary; ctx.shadowBlur = 18; ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; spot(ctx, L.SPR.white, x, y, 26 * F.ns, 0.55 * F.vis); ctx.restore();
    }

    // ── cluster: soft hub glow + ring (swells as nodes light), undirected spokes ──
    function drawHub() {
      if (!L.hub || F.vis < 0.01) return;
      const a = ease.outCubic(clamp((lt - edgeT0(0)) / (3 * grid))) * F.vis; if (a <= 0.01) return;
      let lf = 0, kick = 0;
      for (const n of L.nodes) { lf += sm(STEP[n.i], STEP[n.i] + grid, lt) / N; const d = lt - STEP[n.i]; if (d > 0) kick += Math.exp(-d * 6); }
      kick = Math.min(1, kick);
      const [x, y] = Pt(L.hub.x, L.hub.y);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      spot(ctx, L.SPR.halo, x, y, HALO_R * F.ns * (0.85 + 0.15 * lf), a * (0.55 + 0.45 * lf));
      spot(ctx, L.SPR.primary, x, y, (60 + 30 * kick) * F.ns, a * (0.45 + 0.3 * lf));
      spot(ctx, L.SPR.white, x, y, 22 * F.ns, a * (0.55 + 0.45 * kick));
      ctx.restore();
      ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = 2.5 * F.ns;
      ctx.strokeStyle = api.brand(ctx, x - HUB_R, 0, x + HUB_R, 0, P.primary, P.secondary);
      ctx.beginPath(); ctx.arc(x, y, HUB_R * F.ns, 0, 7); ctx.stroke(); ctx.restore();
    }
    // a spoke fades in whole with its node (never drawn on from one end) and brightens as the node lights
    function drawLinks() {
      if (!L.links.length || F.vis < 0.01) return;
      ctx.save(); ctx.lineCap = 'round';
      for (const l of L.links) {
        const on = clamp((lt - edgeT0(l.b)) / grid); if (on <= 0.001) continue;
        const lit = sm(STEP[l.b], STEP[l.b] + grid, lt);
        ctx.globalAlpha = on * F.vis * (1 - 0.4 * F.dim); ctx.lineWidth = (1.5 + lit) * F.ns;
        ctx.strokeStyle = mix(P.dim, P.primary, 0.4 + 0.4 * lit, 0.35 + 0.35 * lit);
        ctx.beginPath(); trace(ctx, l.pts, 1); ctx.stroke();
      }
      ctx.restore();
    }

    function drawGraph() {
      drawHub();
      drawLinks();
      drawEdges();
      // convergence streaks UNDER the nodes: every node drags a bright trail into the point
      if (F.c > 0.02 && F.c < 0.999) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.globalAlpha = 1 - sm(0.85, 1, F.c);
        const streak = (d, path) => {
          const a = Pt(d.x, d.y), b = Pt(d.x, d.y, Math.max(0, F.c - 0.2));
          ctx.lineWidth = (path ? 7 : 4) * F.ns; ctx.strokeStyle = path ? mix(P.secondary, P.text, 0.6, 0.55) : mix(P.primary, P.text, 0.3, 0.4);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        };
        // the arch apexes streak too, so the whole canopy is dragged into the point (not just the pills)
        L.fan.forEach((f) => streak({ x: f.pts[SAMP >> 1][0], y: f.pts[SAMP >> 1][1] }, false));
        L.nodes.forEach((n) => { if (lt >= edgeT0(n.i)) streak(n, true); });
        ctx.restore();
      }
      drawOrigin();
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
