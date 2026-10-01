// layered-stack (C9, M2) — port of spike s3 "the repo grows": an isometric stack of glass slabs lands on a
// wireframe platform, one slab per layer, each THUD on its cue-map hit `layer.<i>` (C14). A comet dives into the
// platform and lights it, every slab falls under gravity inside a light column, squashes, rebounds and sprouts
// energy posts to the layer below; a shock ring + ballistic sparks fan out under it, a sheen sweeps its top face.
// Each layer's fact is typed into a glass tag at the end of a leader line from the slab's right corner.
//   slabs — the only variant
// Slots: layers (2–5 stack.item / feature facts, bottom → top) · label (phrase tagged `stack`, optional).
// Not ported from s3: the file tree and the "0" counter (no fact feeds them; metrics-counter-lock owns counters),
// and the suction exit (the beat's transition owns the exit).
// Every colour comes from params.palette (static test bans hex literals here); no literal absolute seconds (D10).

const C30 = Math.cos(Math.PI / 6);
const HP = 190, PT = 20;                      // platform half-size / thickness (world units)
const SLAB_T = 48, GAP0 = 36, PITCH = 88;     // slab thickness, first hover height, bottom-to-bottom pitch
const FALL_H = 720, FALL_D = 0.32;            // drop height (px) and fall duration (s, gravity: inQuad)
const H0 = 166;                               // half-size of the bottom slab; upper slabs shrink
const TAG_GAP = 400, TAG_W = 640, TAG_H = 76, TAG_PITCH = 96;
const TAG_TEXT_X = 30, TAG_TEXT_W = 540;      // a 24-char all-caps layer (C13 maxChars) fits above the 28 px display floor
const LAYER_MAX = 34, LABEL_MAX = 60;
const MID_Y = 600;                            // vertical centre of the stack + platform group
const KINDS = ['circuit', 'memory', 'agents', 'ports'];
// tag column geometry, exported for the layout guard test (tag panels of adjacent layers must not overlap)
export const GEOM = Object.freeze({ TAG_H, TAG_PITCH });

const zBottom = (k) => GAP0 + k * PITCH;
const FLOOR_R = 1050;                         // radius of the floor grid's radial fade at full reveal

// iso floor grid (46 lines) stroked with a radial fade in colour c, radius R, centred on the platform
function strokeFloorGrid(x, api, SX, SY, c, R) {
  const { mix, rgba, palette: P } = api;
  const g = x.createRadialGradient(SX, SY, 0, SX, SY, R);
  g.addColorStop(0, mix(c, P.text, 0.2, 0.34)); g.addColorStop(0.55, rgba(c, 0.10)); g.addColorStop(1, rgba(c, 0));
  x.save(); x.beginPath();
  x.transform(C30, 0.5, -C30, 0.5, SX, SY);
  for (let i = -900; i <= 900; i += 80) { x.moveTo(i, -900); x.lineTo(i, 900); x.moveTo(-900, i); x.lineTo(900, i); }
  x.restore();
  x.strokeStyle = g; x.lineWidth = 1.4; x.stroke();
}

export default {
  id: 'layered-stack',

  layout(rb, variant, api) {
    const items = rb.slots.layers.items;
    const label = rb.slots.label?.items[0] ?? null;
    const N = items.length;
    const P = api.palette;
    const m = api.makeCanvas('cache', 8, 8).ctx;

    const px = api.fitSlot('layers', { maxW: TAG_TEXT_W, maxPx: LAYER_MAX, weight: 700, track: 1 });
    // the label heads the tag column (right of the stack, clear of the falling slabs and their light columns)
    const labelPx = label ? api.fitSlot('label', { maxW: TAG_W, maxPx: LABEL_MAX, weight: 800, track: -1 }) : 0;

    // slab half-sizes shrink upwards; the group (stack + platform + tags) is centred in the frame
    const step = Math.min(22, 80 / Math.max(1, N - 1));
    const halves = items.map((_, k) => H0 - k * step);
    const SX = Math.round(960 - (TAG_GAP + TAG_W - 2 * HP * C30) / 2);
    const top = zBottom(N - 1) + SLAB_T + halves[N - 1];
    const SY = Math.round(MID_Y + (top - (HP + PT)) / 2);
    const restCy = (k) => SY - zBottom(k) - SLAB_T / 2;
    const midCy = items.reduce((a, _, k) => a + restCy(k), 0) / N;

    // palette accents per layer, bottom → top (unique, so 5 layers get 5 hues on every palette)
    const cols = [...new Set([P.primary, P.secondary, P.hot, P.amber, P.mint, P.violet, P.cyan])];
    const layers = items.map((item, k) => {
      const cl = api.clusters(item.text);
      const xs = cl.map((c) => api.measure(m, item, { size: px, weight: 700, track: 1, slice: [0, c.s] }).width)
        .concat([api.measure(m, item, { size: px, weight: 700, track: 1 }).width]);
      return {
        item, k, h: halves[k], c: cols[k % cols.length], kind: KINDS[k % KINDS.length], cl, xs,
        tagY: Math.round(midCy - (k - (N - 1) / 2) * TAG_PITCH),
      };
    });
    // build-once floor grid sprite per distinct layer colour (the grid is static once revealed; only its tint
    // follows the latest landed layer). layers[0].c is P.primary, so the pre-landing colour is covered too.
    const floor = {};
    for (const l of layers) {
      if (floor[l.c]) continue;
      const fc = api.makeCanvas('cache', api.W, api.H);
      strokeFloorGrid(fc.ctx, api, SX, SY, l.c, FLOOR_R * api.ease.outExpo(1));
      floor[l.c] = fc.canvas;
    }
    return {
      N, layers, label, px, labelPx, SX, SY, TAG_X: SX + TAG_GAP, floor,
      labelY: Math.round(layers[N - 1].tagY - TAG_H / 2 - 44),
    };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L, dur } = p;
    const { W, H, clamp, lerp, ease, hash, rgba, mix, rr, palette: P, grid } = api;
    const { SX, SY, N } = L;
    const snap = (x) => Math.max(grid, Math.round(x / grid) * grid);
    const HI = P.text;   // the palette's near-white: highlights, sparks, specular lines
    // picture contact leads the audio hit slightly so the thud reads ON the beat (spike T_LAND)
    // `layer.<i>` is always emitted by the C14 cueMap expansion; the fallback (M1 idiom, cf. lockup-cta `slam`)
    // mirrors archetypes.json cueMaps[layer] from 0.15 → to 0.65 — keep the two in sync.
    const LAND = L.layers.map((_, k) => (cues[`layer.${k}`] ?? snap(dur * (0.15 + (0.5 * k) / Math.max(1, N - 1)))) - 0.02);
    const T_PLAT = Math.max(grid, LAND[0] - FALL_D);  // comet lands, platform ignites
    const DIVE = Math.min(0.2, T_PLAT);

    const hitPulse = (decay = 7) => { let e = 0; for (const t of LAND) { const d = lt - t; if (d >= 0) e += Math.exp(-d * decay); } return e; };
    const latest = () => { let c = P.primary; for (let k = 0; k < N; k++) if (lt >= LAND[k]) c = L.layers[k].c; return c; };

    function poly(pts) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }
    function basis(a, b, c, d, e, f, fn) { ctx.save(); ctx.transform(a, b, c, d, e, f); fn(); ctx.restore(); }
    function isoCircle(cx, cy, z, r) {
      ctx.save(); ctx.transform(C30, 0.5, -C30, 0.5, cx, cy - z); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.restore();
    }

    // ───────── 1. floor, platform, intro comet ─────────
    function drawFloor() {
      const rv = ease.outExpo(clamp((lt - T_PLAT) / 0.9)); if (rv <= 0) return;
      const c = latest();
      ctx.save(); ctx.translate(SX, SY + 8); ctx.scale(1, 0.5);
      const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, 520);
      gl.addColorStop(0, rgba(c, 0.16 + 0.08 * hitPulse(6))); gl.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = gl; ctx.fillRect(-540, -540, 1080, 1080); ctx.restore();
      if (rv >= 1) ctx.drawImage(L.floor[c], 0, 0);          // revealed: the cached sprite (same geometry, R = FLOOR_R)
      else strokeFloorGrid(ctx, api, SX, SY, c, FLOOR_R * rv); // growing in: live, the fade radius animates
    }

    function drawPlatform() {
      const rev = ease.outExpo(clamp((lt - T_PLAT) / 0.42)); if (rev <= 0.002) return;
      const h = HP * rev;
      const iso = (x, y, z) => [SX + (x - y) * C30, SY + (x + y) * 0.5 - z];
      const pulse = Math.min(1, hitPulse(6)), c = latest();
      const right = [iso(h, -h, 0), iso(h, h, 0), iso(h, h, -PT), iso(h, -h, -PT)];
      const left = [iso(h, h, 0), iso(-h, h, 0), iso(-h, h, -PT), iso(h, h, -PT)];
      poly(left); ctx.fillStyle = mix(P.ink2, P.panel, 0.5); ctx.fill();
      poly(right); ctx.fillStyle = P.ink2; ctx.fill();
      const top = [iso(-h, -h, 0), iso(h, -h, 0), iso(h, h, 0), iso(-h, h, 0)];
      poly(top);
      const tg = ctx.createLinearGradient(SX, SY - h * 0.5, SX, SY + h * 0.5);
      tg.addColorStop(0, mix(P.panel2, P.primary, 0.1, 0.96)); tg.addColorStop(1, mix(P.ink2, P.panel, 0.4, 0.96));
      ctx.fillStyle = tg; ctx.fill();
      ctx.save(); poly(top); ctx.clip();
      basis(C30, 0.5, -C30, 0.5, SX, SY, () => {
        const n = 8, st = (2 * HP) / n;
        ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = -n / 2; i <= n / 2; i++) { ctx.moveTo(i * st, -HP); ctx.lineTo(i * st, HP); ctx.moveTo(-HP, i * st); ctx.lineTo(HP, i * st); }
        ctx.strokeStyle = mix(P.primary, c, 0.5, 0.20 + 0.45 * pulse); ctx.stroke();
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, HP);
        rg.addColorStop(0, rgba(c, 0.28 + 0.3 * pulse)); rg.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = rg; ctx.fillRect(-HP, -HP, 2 * HP, 2 * HP);
      });
      ctx.restore();
      const lg = api.brand(ctx, top[3][0], top[3][1], top[1][0], top[1][1], P.primary, P.secondary);
      ctx.save(); ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = 22 + 20 * pulse;
      ctx.lineWidth = 3; ctx.strokeStyle = lg; ctx.lineJoin = 'round'; poly(top); ctx.stroke(); ctx.restore();
      ctx.lineWidth = 1.6; ctx.strokeStyle = mix(c, HI, 0.3, 0.55);
      ctx.beginPath(); ctx.moveTo(left[3][0], left[3][1]); ctx.lineTo(left[2][0], left[2][1]); ctx.lineTo(right[3][0], right[3][1]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]); ctx.lineTo(left[3][0], left[3][1]); ctx.moveTo(right[1][0], right[1][1]); ctx.lineTo(right[2][0], right[2][1]); ctx.stroke();
      ctx.save(); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(HI, 0.9);
      const bl = 38;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const a = iso(sx * (h - bl), sy * h, 0), b = iso(sx * h, sy * h, 0), d = iso(sx * h, sy * (h - bl), 0);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
      }
      ctx.restore();
    }

    // a bright point at the frame centre dives into the platform centre and lights it
    function drawIntro() {
      if (lt > T_PLAT + 0.7) return;
      const CX = W / 2, CY = H / 2;
      const hold = T_PLAT - DIVE, dive = ease.inCubic(clamp((lt - hold) / DIVE));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const pt = (u) => [lerp(CX, SX, u), lerp(CY, SY, u)];
      if (lt < T_PLAT) {
        const breath = 0.9 + 0.1 * Math.sin(lt * 9);
        for (let i = 10; i >= 1; i--) {
          const u = ease.inCubic(clamp((lt - hold - i * 0.011) / DIVE)); if (u <= 0) continue;
          const [x, y] = pt(u), r = 34 * (1 - i / 12) * breath;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(HI, 0.30 * (1 - i / 11))); g.addColorStop(1, rgba(P.primary, 0));
          ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        const [px, py] = pt(dive), R = 80 * breath, g = ctx.createRadialGradient(px, py, 0, px, py, R);
        g.addColorStop(0, rgba(HI, 1)); g.addColorStop(0.18, mix(P.primary, HI, 0.6, 0.9)); g.addColorStop(0.5, rgba(P.primary, 0.28)); g.addColorStop(1, rgba(P.primary, 0));
        ctx.fillStyle = g; ctx.fillRect(px - R, py - R, 2 * R, 2 * R);
        if (dive <= 0) { // anamorphic flare while it rests in the centre
          const Lf = 520 * (1 - 0.35 * clamp(lt / Math.max(grid, hold))), fg = ctx.createLinearGradient(px - Lf, py, px + Lf, py);
          fg.addColorStop(0, rgba(P.secondary, 0)); fg.addColorStop(0.5, rgba(HI, 0.8)); fg.addColorStop(1, rgba(P.secondary, 0));
          ctx.fillStyle = fg; ctx.fillRect(px - Lf, py - 1.5, 2 * Lf, 3);
        }
      }
      const dt = lt - T_PLAT;
      if (dt >= 0) {
        const f = Math.exp(-dt * 15), R = 220 * f + 40;
        const g = ctx.createRadialGradient(SX, SY, 0, SX, SY, R); g.addColorStop(0, mix(P.primary, HI, 0.55, 0.8 * f)); g.addColorStop(1, rgba(P.primary, 0));
        ctx.fillStyle = g; ctx.fillRect(SX - R, SY - R, 2 * R, 2 * R);
        const q = clamp(dt / 0.6);
        isoCircle(SX, SY, 0, lerp(30, 520, ease.outExpo(q)));
        ctx.strokeStyle = mix(P.primary, P.secondary, 0.4, 0.9 * (1 - q)); ctx.lineWidth = lerp(6, 1, q); ctx.stroke();
      }
      ctx.restore();
    }

    // ───────── 2. slabs ─────────
    function slabGeom(k) {
      const hit = LAND[k], fs = hit - FALL_D, dt = lt - hit;
      let fall = 0, q = 0;
      const vis = lt >= fs;
      if (vis && lt < hit) { const u = (lt - fs) / FALL_D; fall = FALL_H * (1 - u * u); q = -0.14 * u * u; } // stretch while falling
      else if (vis) q = 0.36 * Math.exp(-9 * dt) * Math.cos(34 * dt);                                       // squash then rebound
      let nudge = 0; // slabs landing on top push this one down
      for (let m = k + 1; m < N; m++) { const d = lt - LAND[m]; if (d >= 0) nudge += (10 + 3 * (m - k)) * Math.exp(-7 * d) * Math.cos(20 * d); }
      const bob = clamp((lt - hit - 0.45) / 0.4) * 2.4 * Math.sin(lt * 2.4 + k * 1.7);
      const thick = SLAB_T * (1 - q), z0 = zBottom(k) - nudge + bob;
      return {
        k, vis, thick, xy: 1 + 0.07 * q, z0, cy: SY - (z0 + fall) - thick / 2,
        boot: api.prog(lt, hit + 0.05, 0.6, ease.outCubic), flash: lt >= hit ? Math.exp(-16 * (lt - hit)) : 0,
      };
    }

    // top-face patterns in flat (u, v) plane coordinates in [-h, h]
    function patCircuit(h, b, c) {
      const cs = h * 0.26, dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const paths = [];
      for (let d = 0; d < 4; d++) for (let l = -1; l <= 1; l++) {
        const [dx, dy] = dirs[d], px = -dy, py = dx, off = l * cs * 0.5;
        const jog = (hash(d * 7 + l * 3 + 1) - 0.5) * h * 0.46, L1 = h * (0.46 + hash(d * 5 + l + 9) * 0.14), end = h * (0.88 + hash(d + l * 2 + 4) * 0.08);
        const f = (fw, lat) => [dx * fw + px * lat, dy * fw + py * lat];
        paths.push([f(cs, off), f(L1, off), f(L1 + Math.abs(jog), off + jog), f(end, off + jog)]);
      }
      paths.forEach((pp, i) => {
        let len = 0; for (let j = 1; j < pp.length; j++) len += Math.hypot(pp[j][0] - pp[j - 1][0], pp[j][1] - pp[j - 1][1]);
        const dr = clamp(b * 1.5 - i * 0.03);
        ctx.beginPath(); ctx.moveTo(pp[0][0], pp[0][1]); for (let j = 1; j < pp.length; j++) ctx.lineTo(pp[j][0], pp[j][1]);
        ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - dr);
        ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(c, 0.55); ctx.stroke();
        const e = pp[pp.length - 1]; ctx.setLineDash([]); ctx.fillStyle = rgba(c, 0.95 * dr); ctx.fillRect(e[0] - 4, e[1] - 4, 8, 8);
        if (b > 0.7) { // data pulse
          ctx.setLineDash([26, len + 40]); ctx.lineDashOffset = -((lt * 150 + i * 53) % (len + 66)) + 26;
          ctx.lineWidth = 3.2; ctx.strokeStyle = rgba(HI, 0.95); ctx.beginPath(); ctx.moveTo(pp[0][0], pp[0][1]); for (let j = 1; j < pp.length; j++) ctx.lineTo(pp[j][0], pp[j][1]); ctx.stroke();
        }
      });
      ctx.setLineDash([]);
      rr(ctx, -cs, -cs, 2 * cs, 2 * cs, 6); ctx.fillStyle = rgba(c, 0.22 * b); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(c, b); ctx.stroke();
      rr(ctx, -cs * 0.45, -cs * 0.45, cs * 0.9, cs * 0.9, 3); ctx.fillStyle = rgba(HI, 0.55 * b); ctx.fill();
    }
    function patMemory(h, b, c) {
      const n = 7, pad = h * 0.12, cell = (2 * h - 2 * pad) / n, gp = cell * 0.13, tick = Math.floor(lt * 7);
      const sweep = ((lt * 0.8) % 1.5) - 0.25;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = -h + pad + i * cell, y = -h + pad + j * cell, d = (i + j) / (2 * (n - 1));
        const on = clamp((b * 1.5 - d) * 3); if (on <= 0) continue;
        const lit = hash(i * 17.3 + j * 31.1 + tick * 5.7) > 0.55 || Math.abs(d - sweep) < 0.07;
        rr(ctx, x + gp, y + gp, cell - 2 * gp, cell - 2 * gp, cell * 0.2);
        ctx.fillStyle = lit ? mix(c, HI, 0.25, 0.9 * on) : rgba(c, 0.12 * on); ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(c, 0.5 * on); ctx.stroke();
      }
    }
    function patAgents(h, b, c) {
      const R = h * 0.68, nr = h * 0.14;
      ctx.lineWidth = 1.8; ctx.setLineDash([8, 9]); ctx.strokeStyle = rgba(c, 0.25 * b); ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + lt * 0.4, x = Math.cos(a) * R, y = Math.sin(a) * R, on = clamp(b * 1.6 - i * 0.12);
        ctx.strokeStyle = rgba(c, 0.5 * on); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x * on, y * on); ctx.stroke();
        const ph = (lt * 1.3 + i * 0.37) % 1; ctx.fillStyle = rgba(HI, 0.9 * on); ctx.beginPath(); ctx.arc(x * ph, y * ph, 3.6, 0, 7); ctx.fill();
        const pr = (lt * 1.1 + i / 6) % 1; ctx.strokeStyle = rgba(c, 0.6 * (1 - pr) * on); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, nr * (1 + pr * 1.1), 0, 7); ctx.stroke();
        ctx.fillStyle = rgba(c, 0.95 * on); ctx.beginPath(); ctx.arc(x, y, Math.max(0, nr * ease.outBack(on)), 0, 7); ctx.fill();
        ctx.fillStyle = rgba(HI, 0.8 * on); ctx.beginPath(); ctx.arc(x, y, nr * 0.38, 0, 7); ctx.fill();
      }
      ctx.lineWidth = 3; ctx.strokeStyle = rgba(c, b); ctx.beginPath(); ctx.arc(0, 0, h * 0.2, 0, 7); ctx.stroke();
      ctx.fillStyle = rgba(c, 0.35 * b); ctx.fill();
    }
    function patPorts(h, b, c) {
      const sz = h * 0.36;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], i) => {
        const x = sx * h * 0.44, y = sy * h * 0.44, on = clamp(b * 1.5 - i * 0.14), plug = ease.outBack(clamp(b * 1.7 - 0.25 - i * 0.14));
        rr(ctx, x - sz, y - sz * 0.62, sz * 2, sz * 1.24, 8); ctx.fillStyle = rgba(P.ink, 0.9); ctx.fill();
        ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(c, 0.9 * on); ctx.stroke();
        ctx.fillStyle = rgba(c, 0.85 * on); for (let q = -1; q <= 1; q += 2) ctx.fillRect(x + q * sz * 0.38 - 3, y - sz * 0.22, 6, sz * 0.44);
        const py = y + (1 - plug) * -sz * 1.3; // plug glides in from above
        rr(ctx, x - sz * 0.56, py - sz * 0.46, sz * 1.12, sz * 0.92, 5); ctx.fillStyle = mix(c, HI, 0.15, 0.85 * clamp(plug * 3)); ctx.fill();
        const led = hash(i * 9 + Math.floor(lt * 4)) > 0.35;
        ctx.fillStyle = rgba(P.mint, led ? on : 0.18 * on); ctx.beginPath(); ctx.arc(x + sz * 0.78, y - sz * 0.38, 3.8, 0, 7); ctx.fill();
      });
    }
    const TOP = { circuit: patCircuit, memory: patMemory, agents: patAgents, ports: patPorts };

    // side-face motifs: u along the face (0..Lf), v down the face (0..T)
    function patSide(kind, Lf, T, t, b, c) {
      ctx.lineCap = 'round';
      if (kind === 'circuit') {
        const y = T * 0.5, pts = [[0, y], [Lf * 0.2, y], [Lf * 0.28, y - T * 0.28], [Lf * 0.52, y - T * 0.28], [Lf * 0.6, y + T * 0.2], [Lf * 0.82, y + T * 0.2], [Lf * 0.88, y], [Lf, y]];
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]);
        ctx.setLineDash([Lf * 1.4, Lf * 1.4]); ctx.lineDashOffset = Lf * 1.4 * (1 - clamp(b * 1.3));
        ctx.lineWidth = 2; ctx.strokeStyle = rgba(c, 0.8); ctx.stroke();
        ctx.setLineDash([28, Lf * 0.5]); ctx.lineDashOffset = -(t * 180) % (Lf * 0.5 + 28); ctx.lineWidth = 3; ctx.strokeStyle = rgba(HI, 0.9 * b); ctx.stroke(); ctx.setLineDash([]);
        for (const q of pts) { ctx.fillStyle = rgba(c, b); ctx.fillRect(q[0] - 3, q[1] - 3, 6, 6); }
      } else if (kind === 'memory') {
        const n = Math.round(Lf / 20), cw = Lf / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
          const on = clamp(b * 1.5 - (i / n) * 0.6), lit = hash(i * 3.3 + j * 11.7 + Math.floor(t * 6)) > 0.5;
          ctx.fillStyle = rgba(c, (lit ? 0.85 : 0.14) * on); ctx.fillRect(i * cw + 2.5, T * (0.18 + 0.38 * j), cw - 5, T * 0.28);
        }
      } else if (kind === 'agents') {
        for (let i = 0; i < 7; i++) {
          const x = ((i + 0.5) / 7) * Lf, on = clamp(b * 1.6 - i * 0.1), ph = (((t * 1.4 - i * 0.18) % 1) + 1) % 1;
          ctx.fillStyle = rgba(c, 0.25 * on); ctx.beginPath(); ctx.arc(x, T / 2, T * 0.3 * (1 + ph * 0.4), 0, 7); ctx.fill();
          ctx.fillStyle = rgba(c, on); ctx.beginPath(); ctx.arc(x, T / 2, T * 0.17, 0, 7); ctx.fill();
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const x = ((i + 0.5) / 5) * Lf, on = clamp(b * 1.5 - i * 0.12);
          rr(ctx, x - Lf * 0.07, T * 0.26, Lf * 0.14, T * 0.48, 4); ctx.fillStyle = rgba(P.ink, 0.85); ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = rgba(c, 0.85 * on); ctx.stroke();
          ctx.fillStyle = rgba(hash(i * 5 + Math.floor(t * 3)) > 0.3 ? P.mint : c, 0.9 * on); ctx.beginPath(); ctx.arc(x, T * 0.5, 2.8, 0, 7); ctx.fill();
        }
      }
    }

    // energy standoffs that sprout under a landed slab and connect it to the layer below
    function drawPosts(g, below) {
      const sp = L.layers[g.k], h = sp.h * g.xy - 14;
      const grow = ease.outBack(clamp((lt - LAND[g.k] - 0.02) / 0.3)); if (grow <= 0) return;
      const lowerTop = below ? below.z0 + below.thick : 0, len = Math.max(2, (g.z0 - lowerTop) * grow);
      const oy = g.cy + g.thick / 2;
      const iso = (x, y, z) => [SX + (x - y) * C30, oy + (x + y) * 0.5 - z];
      ctx.save(); ctx.lineCap = 'round';
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], i) => {
        const a = iso(sx * h, sy * h, 0), b = iso(sx * h, sy * h, -len), back = i === 0;
        const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, rgba(sp.c, back ? 0.5 : 0.95)); gr.addColorStop(1, rgba(sp.c, back ? 0.1 : 0.35));
        ctx.strokeStyle = gr; ctx.lineWidth = back ? 2.4 : 4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        if (!back) { ctx.fillStyle = rgba(HI, 0.8); ctx.beginPath(); ctx.arc(b[0], b[1], 3.2, 0, 7); ctx.fill(); }
      });
      ctx.restore();
    }

    function drawSlab(g) {
      if (!g.vis) return;
      const sp = L.layers[g.k], c = sp.c, h = sp.h * g.xy, T = g.thick;
      const oy = g.cy + T / 2; // origin = bottom-centre of the slab
      const iso = (x, y, z) => [SX + (x - y) * C30, oy + (x + y) * 0.5 - z];
      const top = [iso(-h, -h, T), iso(h, -h, T), iso(h, h, T), iso(-h, h, T)];
      const right = [iso(h, -h, T), iso(h, h, T), iso(h, h, 0), iso(h, -h, 0)];
      const left = [iso(h, h, T), iso(-h, h, T), iso(-h, h, 0), iso(h, h, 0)];
      ctx.save();
      // side faces: dark glass + accent wash + motif
      poly(right); ctx.fillStyle = P.ink2; ctx.fill();
      let gr = ctx.createLinearGradient(0, right[0][1], 0, right[3][1]); gr.addColorStop(0, rgba(c, 0.22)); gr.addColorStop(1, rgba(c, 0.05));
      ctx.fillStyle = gr; ctx.fill();
      ctx.save(); poly(right); ctx.clip();
      basis(-C30, 0.5, 0, 1, right[0][0], right[0][1], () => patSide(sp.kind, 2 * h, T, lt, g.boot, c)); ctx.restore();
      poly(left); ctx.fillStyle = mix(P.ink2, P.panel, 0.4); ctx.fill();
      gr = ctx.createLinearGradient(left[0][0], 0, left[1][0], 0); gr.addColorStop(0, rgba(c, 0.38)); gr.addColorStop(1, rgba(c, 0.12));
      ctx.fillStyle = gr; ctx.fill();
      ctx.save(); poly(left); ctx.clip();
      basis(-C30, -0.5, 0, 1, left[0][0], left[0][1], () => patSide(sp.kind, 2 * h, T, lt + 0.3, g.boot, c)); ctx.restore();
      // top face
      poly(top); ctx.fillStyle = mix(P.ink2, P.panel2, 0.5); ctx.fill();
      gr = ctx.createLinearGradient(top[0][0], top[0][1], top[2][0], top[2][1]); gr.addColorStop(0, rgba(c, 0.42)); gr.addColorStop(0.55, rgba(c, 0.14)); gr.addColorStop(1, rgba(c, 0.06));
      ctx.fillStyle = gr; ctx.fill();
      ctx.save(); poly(top); ctx.clip();
      basis(C30, 0.5, -C30, 0.5, SX, oy - T, () => TOP[sp.kind](h, g.boot, c));
      const sw = clamp((lt - LAND[g.k]) / 0.55); // glossy sheen that sweeps once after landing
      if (sw > 0 && sw < 1) {
        const sx = lerp(top[3][0] - 40, top[1][0] + 40, ease.outCubic(sw)), sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
        sg.addColorStop(0, rgba(HI, 0)); sg.addColorStop(0.5, rgba(HI, 0.35 * (1 - sw))); sg.addColorStop(1, rgba(HI, 0));
        ctx.fillStyle = sg; ctx.fillRect(sx - 60, top[0][1] - 4, 120, top[2][1] - top[0][1] + 8);
      }
      ctx.restore();
      if (g.flash > 0.01) { // landing flash
        ctx.fillStyle = mix(c, HI, 0.22, 0.38 * g.flash); poly(top); ctx.fill(); poly(left); ctx.fill();
        ctx.fillStyle = mix(c, HI, 0.22, 0.27 * g.flash); poly(right); ctx.fill();
      }
      // neon edges
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(c, 0.55);
      ctx.beginPath(); ctx.moveTo(top[1][0], top[1][1]); ctx.lineTo(right[3][0], right[3][1]); ctx.moveTo(top[2][0], top[2][1]); ctx.lineTo(left[3][0], left[3][1]); ctx.moveTo(top[3][0], top[3][1]); ctx.lineTo(left[2][0], left[2][1]); ctx.stroke();
      ctx.save(); ctx.shadowColor = rgba(c, 0.95); ctx.shadowBlur = 20 + 30 * g.flash;
      ctx.lineWidth = 2.8; ctx.strokeStyle = mix(c, HI, 0.25 + 0.5 * g.flash); poly(top); ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(c, 0.9);
      ctx.beginPath(); ctx.moveTo(left[3][0], left[3][1]); ctx.lineTo(right[3][0], right[3][1]); ctx.moveTo(left[2][0], left[2][1]); ctx.lineTo(left[3][0], left[3][1]); ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(HI, 0.55); // specular hairline on the two front top edges
      ctx.beginPath(); ctx.moveTo(top[3][0], top[3][1] + 1.5); ctx.lineTo(top[2][0], top[2][1] + 1.5); ctx.lineTo(top[1][0], top[1][1] + 1.5); ctx.stroke();
      ctx.restore();
    }

    // holographic target + falling light column before each landing, light pillar after it
    function drawFall(k) {
      const hit = LAND[k], fs = hit - FALL_D; if (lt < fs - 0.28 || lt > hit + 0.5) return;
      const sp = L.layers[k], c = sp.c, z = zBottom(k);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const ant = clamp((lt - (fs - 0.28)) / 0.28) * (lt < hit ? 1 : Math.exp(-(lt - hit) * 18));
      if (ant > 0.01) {
        const h = sp.h, iso = (x, y, zz) => [SX + (x - y) * C30, SY + (x + y) * 0.5 - zz];
        const d = [iso(-h, -h, z), iso(h, -h, z), iso(h, h, z), iso(-h, h, z)];
        ctx.setLineDash([14, 10]); ctx.lineDashOffset = -lt * 60; ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(c, 0.7 * ant); poly(d); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = rgba(c, 0.10 * ant); poly(d); ctx.fill();
      }
      const wdt = sp.h * C30 * 0.9;
      if (lt >= fs && lt <= hit + 0.12) {
        const u = clamp((lt - fs) / FALL_D), yBot = SY - z - SLAB_T * 0.5 - FALL_H * (1 - u * u), a = lt <= hit ? 1 : 1 - (lt - hit) / 0.12;
        const g = ctx.createLinearGradient(0, yBot - 700, 0, yBot);
        g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, rgba(c, 0.14 * a));
        ctx.fillStyle = g; for (const m of [1, 0.66, 0.34]) ctx.fillRect(SX - wdt * m, yBot - 700, wdt * 2 * m, 700);
        ctx.strokeStyle = rgba(HI, 0.35 * a); ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(SX + i * wdt * 0.42, yBot - 260 - Math.abs(i) * 60); ctx.lineTo(SX + i * wdt * 0.42, yBot - 10); ctx.stroke(); }
      }
      const dt = lt - hit;
      if (dt >= 0 && dt < 0.5) {
        const a = Math.exp(-dt * 7), yy = SY - z - SLAB_T, g = ctx.createLinearGradient(0, yy - 520, 0, yy);
        g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, mix(c, HI, 0.12, 0.20 * a));
        ctx.fillStyle = g; for (const m of [1, 0.66, 0.34]) ctx.fillRect(SX - wdt * m, yy - 520, wdt * 2 * m, 520);
      }
      ctx.restore();
    }

    function drawRingAndSparks(k) {
      const dt = lt - LAND[k]; if (dt < 0 || dt > 0.85) return;
      const sp = L.layers[k], c = sp.c, h = sp.h, z = zBottom(k) - 2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      if (dt < 0.6) { // shock ring in the plane under the slab + dust crescent
        const q = dt / 0.6, r = lerp(h * 1.45, h * 1.45 + 250, ease.outExpo(q));
        isoCircle(SX, SY, z, r); ctx.lineWidth = lerp(7, 1, q); ctx.strokeStyle = rgba(c, 0.8 * Math.pow(1 - q, 1.5)); ctx.stroke();
        isoCircle(SX, SY, z, r * 0.86); ctx.lineWidth = lerp(3, 0.5, q); ctx.strokeStyle = rgba(HI, 0.6 * Math.pow(1 - q, 1.6)); ctx.stroke();
        const dg = ctx.createRadialGradient(SX, SY - z, r * 0.6, SX, SY - z, r * 1.05); dg.addColorStop(0, rgba(c, 0)); dg.addColorStop(0.7, rgba(c, 0.10 * (1 - q))); dg.addColorStop(1, rgba(c, 0));
        ctx.save(); ctx.translate(SX, SY - z); ctx.scale(1, 0.577); ctx.translate(-SX, -(SY - z)); ctx.fillStyle = dg; ctx.fillRect(SX - r * 1.1, SY - z - r * 1.1, r * 2.2, r * 2.2); ctx.restore();
      }
      const a = 1 - dt / 0.8; // ballistic sparks, analytic in dt
      const proj = (x, y, zz) => [SX + (x - y) * C30, SY + (x + y) * 0.5 - zz];
      ctx.lineWidth = 3; ctx.strokeStyle = mix(c, HI, 0.4, 0.95 * clamp(a)); ctx.beginPath();
      for (let i = 0; i < 30; i++) {
        const an = hash(i * 7.7 + k * 131.3) * Math.PI * 2, v = 110 + hash(i * 3.3 + k * 17.1) * 300, vz = 120 + hash(i * 5.1 + k * 3.7) * 380;
        const at = (d) => { const rad = h * 1.2 + v * d; return proj(Math.cos(an) * rad, Math.sin(an) * rad, z + vz * d - 560 * d * d); };
        const p0 = at(dt), p1 = at(Math.max(0, dt - 0.03));
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p0[0], p0[1]);
      }
      ctx.stroke(); ctx.restore();
    }

    // ───────── 3. layer tags on leader lines (the facts) ─────────
    function drawTag(g) {
      const sp = L.layers[g.k], c = sp.c, t0 = LAND[g.k] + 0.04, dt = lt - t0; if (dt < 0) return;
      const vx = SX + 2 * sp.h * g.xy * C30 + 6, vy = g.cy, ty = sp.tagY, dy = ty - vy, X = L.TAG_X;
      const dgl = Math.abs(dy), diagEnd = [vx + 10 + dgl, vy + dy], len = dgl * Math.SQRT2 + (X - diagEnd[0]) + 10;
      const lp = ease.outExpo(clamp(dt / 0.22));
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.save(); ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = 10; ctx.strokeStyle = rgba(c, 0.95); ctx.lineWidth = 2;
      ctx.setLineDash([len * lp, len * 2]); ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + 10, vy); ctx.lineTo(diagEnd[0], diagEnd[1]); ctx.lineTo(X, ty); ctx.stroke(); ctx.restore();
      const pop = ease.outBack(clamp(dt / 0.2)), ph = (lt * 1.2 + g.k * 0.3) % 1;
      ctx.fillStyle = rgba(HI, 1); ctx.beginPath(); ctx.arc(vx, vy, Math.max(0, 5 * pop), 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(c, 0.8 * (1 - ph)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(vx, vy, 5 + 14 * ph, 0, 7); ctx.stroke();
      const rv = ease.outQuint(clamp((dt - 0.08) / 0.3));
      if (rv > 0.01) {
        const y = ty - TAG_H / 2, w = TAG_W * rv;
        ctx.save(); ctx.beginPath(); ctx.rect(X - 4, y - 30, w + 8, TAG_H + 60); ctx.clip();
        ctx.save(); rr(ctx, X, y, TAG_W, TAG_H, 14); ctx.clip();
        api.glass(ctx, X, y, TAG_W, TAG_H, 14, { fill: rgba(P.panel, 0.82), border: rgba(c, 0.7), glowColor: rgba(c, 0.55), glowBlur: 28 });
        ctx.fillStyle = c; ctx.fillRect(X, y, 5, TAG_H);
        const wg = ctx.createLinearGradient(X, 0, X + 160, 0); wg.addColorStop(0, rgba(c, 0.22)); wg.addColorStop(1, rgba(c, 0)); ctx.fillStyle = wg; ctx.fillRect(X, y, 160, TAG_H);
        ctx.restore();
        // layer index as pips (no digits: every glyph on screen must come from facts/phrases — D8)
        for (let i = 0; i <= g.k; i++) {
          const on = clamp((dt - 0.2 - i * 0.04) / 0.15);
          ctx.fillStyle = rgba(i === g.k ? c : HI, (i === g.k ? 0.95 : 0.35) * on);
          ctx.fillRect(X + TAG_W - 30, ty + TAG_H / 2 - 18 - i * 9, 14, 5);
        }
        // the fact, typed in (spike: 150 chars/s) with a block cursor
        const n = clamp(Math.floor((dt - 0.08) * 150), 0, sp.cl.length); // types from panel reveal: no empty fact box
        const bx = X + TAG_TEXT_X, by = ty + L.px * 0.36;
        if (n > 0) api.text(ctx, sp.item, bx, by, { size: L.px, weight: 700, track: 1, fill: P.text, slice: [0, sp.cl[n - 1].e] });
        if (n < sp.cl.length && dt > 0.08) { ctx.fillStyle = c; ctx.fillRect(bx + sp.xs[n] + 3, ty - L.px * 0.5, 3, L.px); }
        ctx.restore();
      }
      ctx.restore();
    }

    // ───────── 4. label (optional phrase) ─────────
    function drawLabel() {
      if (!L.label) return;
      const q = ease.outExpo(clamp((lt - grid) / 0.5)); if (q <= 0) return;
      const X = L.TAG_X;
      api.text(ctx, L.label, X + 30 * (1 - q), L.labelY, { size: L.labelPx, weight: 800, track: -1, fill: P.text, alpha: q });
      const w = 220 * q;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = api.brand(ctx, X, 0, X + w, 0, P.primary, P.secondary); ctx.shadowColor = P.primary; ctx.shadowBlur = 14;
      ctx.fillRect(X, L.labelY + 18, w, 3); ctx.restore();
    }

    const geoms = L.layers.map((_, k) => slabGeom(k));
    drawFloor();
    drawIntro();
    drawPlatform();
    for (let k = 0; k < N; k++) drawFall(k);
    for (let k = 0; k < N; k++) { drawPosts(geoms[k], k ? geoms[k - 1] : null); drawSlab(geoms[k]); }
    for (let k = 0; k < N; k++) drawRingAndSparks(k);
    for (let k = 0; k < N; k++) drawTag(geoms[k]);
    drawLabel();
  },
};
