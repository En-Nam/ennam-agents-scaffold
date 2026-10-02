// kinetic-text (C9) — new in v1.16, in the spike's typographic style (heavy Archivo, white-hot → colour
// landings, brand-gradient accents, additive light). Lines enter one by one on GRID-snapped local times:
// the first on cue `line`, the rest spaced by a whole number of 1/16 notes (api.grid) derived from dur.
//   stack — lines stack up left-aligned; each word rises out of a mask, the newest line is brightest
//   punch — a title moment (spike s5 ÉN NAM / SCAFFOLD language): one line owns the frame at a time, centred,
//           each line fitted on its OWN (as large as the slot allows; split at a word boundary into two
//           balanced rows when that sets it ≥ 10 % larger) in white metal with an inner brand edge,
//           a blurred brand bloom and a chromatic split on the slam; the lead phrase is the spaced accent line
//           above it with a brand rule between; a palette spark field drifts around the title. The slam
//           overshoot is capped per line so the text stays inside the 48 px safe area at every frame.
//   chapter — a section title card (M2): a lattice mark draws on above the title, the `chapter` phrase is the
//             centred title (words rise out of a mask on cue `line`, white-hot → white metal), a brand rule
//             draws out under it and the optional fact line wipes in below as the spaced accent line.
//             archetypes.json variantSlots: lead 1 (tag chapter), lines 0..1.
// "Spaced caps" = wide tracking only: canvas has no text-transform and api.text draws item.text verbatim
// (Rule 13), so the accent lines keep the case of their fact/phrase.
// Slots: lines (1–3 facts: feature / app.tagline / stack.item / problem; chapter 0–1) · lead (phrase; chapter: required).
// Colours: palette tokens only (P.text is the white of the white-hot passes). Pure function of localT; no
// literal absolute seconds (D10).

const STACK_X = 200, STACK_W = 1520;
const STACK_MAX = [0, 150, 120, 100];   // max px by line count
const LEAD_MAX = 34;
const PUNCH_FIT_W = 1440;   // each punch line is fitted to this width (room left for the slam overshoot)
const PUNCH_MAX = 170;
const PUNCH_LEAD_MAX = 60;
const SLAM_PEAK = 0.35;     // slam overshoot amplitude (capped per line by the safe area)
// slam light drawn around the line — shared by drawPunch and the per-line slam cap in punchLayout, so retuning
// the draw cannot silently drift the cap
const ECHOES = [[46, 0.22], [92, 0.1]];        // [px above the baseline at the slam, alpha] of each echo
const ECHO_MAX = Math.max(...ECHOES.map(([dy]) => dy));
const CHROMA = 9;           // chromatic split: ± px of the primary / secondary copies at the slam
const CHROMA_SLACK = 3;     // antialias slack beyond the split in the cap
// safe area after the engine camera: api.cam (core.mjs CAMERA) = the worst push about the frame centre and shake
const SAFE = 48;
const GP = 100;             // pad around the punch glow/face sprites (≥ 3σ of the bloom blur: no visible sprite edge)
const CHAPTER_W = 1500;     // title + line width budget (≥ 162 px clear of each edge after the camera push)
const CHAPTER_MAX = 150;
const CHAPTER_LINE_MAX = 56;
const MARK_R = 52;          // chapter lattice mark radius

/** words of a string as code-point ranges [s, e) (spaces excluded) */
function words(str) {
  const cps = Array.from(str), out = [];
  let s = -1;
  cps.forEach((ch, i) => {
    if (ch === ' ') { if (s >= 0) out.push([s, i]); s = -1; } else if (s < 0) s = i;
  });
  if (s >= 0) out.push([s, cps.length]);
  return out;
}

/** white metal: P.text at the cap line cooling to a faint primary, then secondary tint at the baseline */
function metal(ctx, api, top, base) {
  const { palette: P, mix } = api;
  const g = ctx.createLinearGradient(0, top, 0, base);
  g.addColorStop(0, P.text); g.addColorStop(0.55, mix(P.text, P.primary, 0.08)); g.addColorStop(1, mix(P.text, P.secondary, 0.2));
  return g;
}

/** accent-line gradient (spike SCAFFOLD): light primary → primary/secondary → secondary */
function accent(ctx, api, x0, x1) {
  const { palette: P, mix } = api;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, mix(P.primary, P.text, 0.3)); g.addColorStop(0.5, mix(P.primary, P.secondary, 0.5)); g.addColorStop(1, P.secondary);
  return g;
}

/** build-once CACHE sprites of one punch line (spike s5 TITLE recipe): an outer brand bloom, and a white-metal
 *  face with the brand edge glowing inside the glyphs (blurred inverse, clipped by source-atop) */
function lineSprites(api, item, o, width, asc, desc) {
  const P = api.palette;
  const sw = Math.ceil(width + 2 * GP), baseLocal = Math.ceil(GP + asc + 8), sh = Math.ceil(baseLocal + desc + 8 + GP);
  const edge = (g) => api.brand(g, GP, 0, GP + width, 0, P.primary, P.secondary);
  const glow = api.makeCanvas('cache', sw, sh), h = glow.ctx;
  h.filter = `blur(${Math.round(o.size * 0.15)}px)`; api.text(h, item, GP, baseLocal, { ...o, fill: edge(h) });
  h.filter = `blur(${Math.round(o.size * 0.06)}px)`; h.globalAlpha = 0.35; api.text(h, item, GP, baseLocal, { ...o, fill: edge(h) });
  h.filter = 'none'; h.globalAlpha = 1;
  const face = api.makeCanvas('cache', sw, sh), g = face.ctx;
  api.text(g, item, GP, baseLocal, { ...o, fill: metal(g, api, baseLocal - asc, baseLocal) });
  const inv = api.makeCanvas('cache', sw, sh), iv = inv.ctx;
  iv.fillStyle = edge(iv); iv.fillRect(0, 0, sw, sh);
  iv.globalCompositeOperation = 'destination-out';
  api.text(iv, item, GP, baseLocal, { ...o, fill: P.ink });
  iv.globalCompositeOperation = 'source-over';
  g.globalCompositeOperation = 'source-atop';
  g.filter = `blur(${Math.max(3, Math.round(o.size * 0.05))}px)`; g.drawImage(inv.canvas, 0, 0); g.drawImage(inv.canvas, 0, 0);
  g.filter = 'blur(2px)'; g.drawImage(inv.canvas, 0, 0);
  g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  return { glow, face, baseLocal, sh };
}

function punchLayout(rb, api) {
  const lines = rb.slots.lines.items;
  const lead = rb.slots.lead?.items[0] ?? null;
  const track = -2, weight = 800;
  const m = api.makeCanvas('cache', 8, 8).ctx;
  // the slot fit (`check`) is the floor every line can reach; each line then grows on its own up to PUNCH_MAX
  const slotPx = api.fitSlot('lines', { maxW: PUNCH_FIT_W, maxPx: PUNCH_MAX, weight, track });
  const cpStr = (item, s, e) => Array.from(item.text).slice(s, e).join('');
  const fit = (str) => api.fitText(m, str, PUNCH_FIT_W, PUNCH_MAX, slotPx, { weight, track, family: 'display' }) ?? slotPx;
  const sized = lines.map((item) => {
    // one row, or two balanced rows split at a word boundary when that sets the type ≥ 10 % larger
    // (a compact two-tier block like the spike's ÉN NAM / SCAFFOLD, instead of a thin full-width strip)
    const ww = words(item.text);
    const n = Array.from(item.text).length;
    let split = null, px = fit(item.text);
    for (let k = 1; k < ww.length; k++) {
      const p2 = Math.min(fit(cpStr(item, 0, ww[k - 1][1])), fit(cpStr(item, ww[k][0], n)));
      if (p2 >= px * 1.1 && (!split || p2 > split.px)) split = { k, px: p2 };
    }
    if (split) px = split.px;
    const o = { size: px, weight, track };
    const ranges = split ? [[0, ww[split.k - 1][1], 0, split.k], [ww[split.k][0], n, split.k, ww.length]] : [[0, n, 0, ww.length]];
    const lh = Math.round(px * 1.02);
    const pieces = ranges.map(([s, e, w0, w1], j) => {
      const mm = api.measure(m, item, { ...o, slice: [s, e] });
      return { s, e, w0, w1, width: mm.width - track, asc: mm.ascent, desc: mm.descent, dy: j * lh };
    });
    const ws = ww.map(([s, e], w) => {
      const pc = pieces.find((q) => w >= q.w0 && w < q.w1);
      return { s, e, p: pieces.indexOf(pc), x: api.measure(m, item, { ...o, slice: [pc.s, s] }).width, x1: api.measure(m, item, { ...o, slice: [pc.s, e] }).width - track };
    });
    return { item, px, o, lh, pieces, words: ws, width: Math.max(...pieces.map((q) => q.width)), blockH: (pieces.length - 1) * lh + Math.round(px * 0.74) };
  });
  const maxPx = Math.max(...sized.map((r) => r.px));
  const heroW = Math.max(...sized.map((r) => r.width));
  const heroBlock = Math.max(...sized.map((r) => r.blockH));

  // lead = the spaced accent line: tracking justifies it toward the hero measure, within 0.2–0.5 em
  let leadPx = 0, leadTrack = 0, leadTrack0 = 0;
  if (lead) {
    leadPx = api.fitSlot('lead', { maxW: PUNCH_FIT_W, maxPx: PUNCH_LEAD_MAX, weight: 700, track: Math.round(PUNCH_LEAD_MAX * 0.5) });
    const n = Array.from(lead.text).length;
    const nat = api.measure(m, lead, { size: leadPx, weight: 700, track: 0 }).width;
    const gaps = Math.max(1, n - 1);
    leadTrack = Math.min(0.5 * leadPx, Math.max(0.2 * leadPx, (heroW * 0.8 - nat) / gaps));
    leadTrack0 = Math.min(1.6 * leadTrack, Math.max(leadTrack, (PUNCH_FIT_W - nat) / gaps)); // settles from wider
  }

  // vertical: [lead · rule] above the hero; the hero's visual middle is the slam pivot
  const leadCap = lead ? Math.round(leadPx * 0.74) : 0;
  const gapLH = lead ? Math.max(48, Math.round(maxPx * 0.5)) : 0;
  const top = Math.round((1080 - (leadCap + gapLH + heroBlock)) / 2);
  const leadBase = top + leadCap;
  const heroMid = top + leadCap + gapLH + Math.round(heroBlock / 2);
  const ruleY = lead ? Math.round(leadBase + gapLH * 0.46) : Math.round(heroMid + heroBlock / 2 + Math.max(30, maxPx * 0.3));

  // per-line slam cap: the scaled line (incl. echoes above and the chroma split) stays inside the safe area
  // after the camera push + shake (api.cam, the engine's own worst case)
  const { pushMax: CAM_PUSH, shakeMax: CAM_SHAKE } = api.cam;
  const halfX = (1920 / 2 - SAFE - CAM_SHAKE - 4) / CAM_PUSH;
  const upY = (heroMid - 1080 / 2) + (1080 / 2 - SAFE - CAM_SHAKE - 4) / CAM_PUSH;
  const downY = (1080 / 2 - heroMid) + (1080 / 2 - SAFE - CAM_SHAKE - 4) / CAM_PUSH;
  const rows = sized.map((r) => {
    // the row block is centred on heroMid; each piece is centred horizontally
    const base0 = Math.round(heroMid - r.blockH / 2 + r.px * 0.74);
    const pieces = r.pieces.map((q) => {
      const base = base0 + q.dy;
      return { ...q, base, x0: 1920 / 2 - q.width / 2, ...lineSprites(api, r.item, { ...r.o, slice: [q.s, q.e] }, q.width, q.asc, q.desc) };
    });
    const first = pieces[0], last = pieces[pieces.length - 1];
    const sMax = Math.min(halfX / (r.width / 2 + CHROMA + CHROMA_SLACK), upY / (heroMid - (first.base - first.asc) + ECHO_MAX), downY / (last.base + last.desc - heroMid));
    return { ...r, pieces, sMax };
  });
  return { punch: true, rows, lead, leadPx, leadTrack, leadTrack0, leadBase, heroMid, heroW, ruleY, maxPx };
}

function chapterLayout(rb, api) {
  const title = rb.slots.lead.items[0];
  const line = rb.slots.lines?.items[0] ?? null;
  const track = -2, weight = 800, lineWeight = 600;
  const px = api.fitSlot('lead', { maxW: CHAPTER_W, maxPx: CHAPTER_MAX, weight, track });
  // the line is fitted at modest tracking (a 48-char fact must fit); it is then spaced out to 0.42 em (entry
  // 0.6 em, settling) only as far as the width budget allows — short lines read as the spaced accent line
  const linePx = line ? api.fitSlot('lines', { maxW: CHAPTER_W, maxPx: CHAPTER_LINE_MAX, weight: lineWeight, track: 8 }) : 0;
  const m = api.makeCanvas('cache', 8, 8).ctx;
  let lineTrack = 0, lineTrack0 = 0;
  if (line) {
    const gaps = Math.max(1, Array.from(line.text).length - 1);
    const room = Math.max(8, (CHAPTER_W - api.measure(m, line, { size: linePx, weight: lineWeight, track: 0 }).width) / gaps);
    lineTrack = Math.min(linePx * 0.42, room); lineTrack0 = Math.min(linePx * 0.6, room);
  }
  const o = { size: px, weight, track };
  const width = api.measure(m, title, o).width - track;
  const ws = words(title.text).map(([s, e]) => ({ s, e, x: api.measure(m, title, { ...o, slice: [0, s] }).width, x1: api.measure(m, title, { ...o, slice: [0, e] }).width }));
  // mark · title · rule · line, centred as one block
  const markGap = 44, cap = Math.round(px * 0.75);
  const ruleOff = Math.round(px * 0.3), lineOff = line ? 26 + Math.round(linePx * 0.78) : 0;
  const blockH = 2 * MARK_R + markGap + cap + ruleOff + lineOff;
  const top = Math.round((api.H - blockH) / 2);
  const markY = top + MARK_R;
  const base = top + 2 * MARK_R + markGap + cap;
  const ruleY = base + ruleOff;
  // rows: [] keeps the stack/punch schedule math inert; the chapter draw owns its own schedule
  return { chapter: true, rows: [], title, line, px, linePx, track, weight, lineTrack, lineTrack0, lineWeight, width, words: ws, markY, ruleY, base, lineBase: ruleY + lineOff, lh: Math.round(px * 1.12) };
}

/** spike s5 node-lattice mark: hex frame + spokes draw on from t0, nodes pop, glass faces fill, orbit arcs turn */
function drawMark(ctx, api, lt, t0, x, y, R) {
  const { clamp, ease, rgba, palette: P } = api;
  const la = lt - t0;
  if (la <= 0) return;
  const MV = [0, 1, 2, 3, 4, 5].map((k) => { const a = (-90 + 60 * k) * Math.PI / 180; return [Math.cos(a) * R, Math.sin(a) * R]; });
  const MC = [0, 0];
  const pt = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const segs = [
    [MV[0], MV[1], 0.00, 0.28, 'T'], [MV[0], MV[5], 0.00, 0.28, 'T'], [MV[1], MV[2], 0.10, 0.28, 'T'], [MV[5], MV[4], 0.10, 0.28, 'T'],
    [MV[2], MV[3], 0.20, 0.28, 'T'], [MV[4], MV[3], 0.20, 0.28, 'T'], [MC, MV[1], 0.26, 0.26, 'T'], [MC, MV[3], 0.32, 0.26, 'T'],
    [MC, MV[5], 0.38, 0.26, 'T'], [MV[5], MV[1], 0.46, 0.26, 'b'], [MV[1], MV[3], 0.54, 0.26, 'b'], [MV[3], MV[5], 0.62, 0.26, 'b'],
  ];
  const nodes = [[MV[0], 0.0], [MV[1], 0.2], [MV[5], 0.2], [MV[2], 0.3], [MV[4], 0.3], [MV[3], 0.4], [MC, 0.26]];
  const faces = [[[MV[5], MV[0], MV[1], MC], 0.17], [[MV[1], MV[2], MV[3], MC], 0.10], [[MV[3], MV[4], MV[5], MC], 0.05]];
  const u = R / 70; // spike stroke widths were tuned for R = 70
  ctx.save();
  ctx.translate(x, y);
  const grad = api.brand(ctx, -R, -R, R, R, P.primary, P.secondary);
  // backing glow disc
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const da = clamp(la / 0.6), dg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.4);
  dg.addColorStop(0, rgba(P.primary, 0.30 * da)); dg.addColorStop(0.5, rgba(P.secondary, 0.10 * da)); dg.addColorStop(1, rgba(P.secondary, 0));
  ctx.fillStyle = dg; ctx.fillRect(-R * 2.4, -R * 2.4, R * 4.8, R * 4.8);
  ctx.restore();
  // glass faces once the frame is built
  const fa = ease.outCubic(clamp((la - 0.65) / 0.5));
  if (fa > 0) for (const [f, a] of faces) {
    ctx.beginPath(); f.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.globalAlpha = a * fa; ctx.fillStyle = grad; ctx.fill(); ctx.globalAlpha = 1;
  }
  // beams: glow pass + crisp pass + light core
  const run = (cls) => {
    ctx.beginPath();
    for (const [a, b, o, d, c] of segs) {
      if (c !== cls) continue;
      const k = ease.outCubic(clamp((la - o) / d)); if (k <= 0) continue;
      const e = pt(a, b, k); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]);
    }
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [cls, w] of [['T', 6 * u], ['b', 3 * u]]) {
    run(cls); ctx.strokeStyle = grad; ctx.lineWidth = w;
    ctx.shadowColor = rgba(P.primary, 0.9); ctx.shadowBlur = 20; ctx.stroke();
    ctx.shadowBlur = 0; ctx.stroke();
    run(cls); ctx.strokeStyle = rgba(P.text, 0.75); ctx.lineWidth = w * 0.3; ctx.stroke();
  }
  // draw-on tip sparks
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [a, b, o, d] of segs) {
    const raw = (la - o) / d; if (raw <= 0 || raw >= 1) continue;
    const e = pt(a, b, ease.outCubic(raw));
    api.glowDot(ctx, e[0], e[1], 16 * u + 6, 0.95, api.hexToRgb(P.primary).join(','));
  }
  ctx.restore();
  // nodes at every joint
  for (const [p, o] of nodes) {
    const k = ease.outBack(clamp((la - o) / 0.3)); if (k <= 0) continue;
    const r = 8 * u * k;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7);
    ctx.fillStyle = P.ink2; ctx.shadowColor = P.primary; ctx.shadowBlur = 16;
    ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 2.6 * u + 0.8; ctx.strokeStyle = grad; ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.42, 0, 7); ctx.fillStyle = P.text; ctx.fill();
  }
  // orbit ring: dotted track + three turning brand arcs
  const ra = ease.outExpo(clamp((la - 0.6) / 0.6));
  if (ra > 0) {
    const R2 = R * (1.2 + 0.4 * ra);
    ctx.save(); ctx.globalAlpha = ra * 0.5; ctx.setLineDash([2, 11]); ctx.lineDashOffset = -la * 9;
    ctx.strokeStyle = rgba(P.text, 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R2, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = ra * 0.9; ctx.lineWidth = 2.4; ctx.strokeStyle = grad;
    for (let k = 0; k < 3; k++) { const a0 = la * 0.7 + k * 2.0944; ctx.beginPath(); ctx.arc(0, 0, R2, a0, a0 + 0.42); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}

/** brand rule drawn centre-out (spike s5 rule): faded ends, flashes on impacts */
function drawRule(ctx, api, cx, y, half, flash) {
  const { rgba, palette: P } = api;
  if (half <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  g.addColorStop(0, rgba(P.primary, 0)); g.addColorStop(0.15, P.primary); g.addColorStop(0.85, P.secondary); g.addColorStop(1, rgba(P.secondary, 0));
  ctx.fillStyle = g; ctx.globalAlpha = Math.min(1, 0.4 + 0.8 * flash);
  ctx.shadowColor = P.primary; ctx.shadowBlur = 14 * (0.3 + 2 * flash);
  ctx.fillRect(cx - half, y - 1, half * 2, 2);
  ctx.restore();
}

/** a band of palette motes drifting up around the title (deterministic: hash positions, linear drift in lt) */
function sparkField(ctx, api, lt, cx, cy, rx, ry, k) {
  const { hash, palette: P } = api;
  if (k <= 0) return;
  const cols = [P.text, P.primary, P.secondary];
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let j = 0; j < 60; j++) {
    const h = (n) => hash((api.seed % 997) * 13 + j * 7.31 + n * 1.97);
    const span = 2 * ry, yy = (h(1) * span + lt * (16 + 36 * h(2))) % span;
    const x = cx + (h(0) * 2 - 1) * rx + Math.sin(lt * (0.6 + h(3)) + j) * 12;
    const tw = 0.5 + 0.5 * Math.sin(lt * (2 + 3 * h(4)) + j * 1.7);
    const a = Math.min(1, k * Math.sin(Math.PI * yy / span) * (0.18 + 0.7 * tw * h(5)));
    if (a < 0.01) continue;
    ctx.globalAlpha = a; ctx.fillStyle = cols[j % 3];
    ctx.beginPath(); ctx.arc(x, cy + ry - yy, 1.2 + 2.3 * h(6), 0, 6.2832); ctx.fill();
  }
  ctx.restore();
}

/** chapter card: mark + title words rise out of a mask (first word on `first`), rule draws out, line wipes in */
function drawChapter(ctx, lt, p, first) {
  const { api, layout: L } = p;
  const { W, clamp, lerp, ease, rgba, palette: P, grid } = api;
  const cx = W / 2, x0 = cx - L.width / 2;
  const wordGap = grid * 0.5;

  drawMark(ctx, api, lt, first - 2 * grid, cx, L.markY, MARK_R);

  // title: each word rises out of the baseline mask, lands white-hot, cools to white metal under a brand halo
  // (spike s5 lockup language: white face with a cool tint toward the baseline, violet→cyan glow around it)
  const met = metal(ctx, api, L.base - L.px * 0.75, L.base);
  const halo = api.brand(ctx, x0, 0, x0 + L.width, 0, P.primary, P.secondary);
  // backdrop halo that shifts primary (left) → secondary (right) under the title, up once the first word lands
  const hq = ease.outCubic(clamp((lt - first) / 0.6));
  if (hq > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hy = L.base - L.px * 0.36, hr = Math.max(260, L.width * 0.42);
    api.glowDot(ctx, x0 + L.width * 0.25, hy, hr, 0.10 * hq, api.hexToRgb(P.primary).join(','));
    api.glowDot(ctx, x0 + L.width * 0.75, hy, hr, 0.10 * hq, api.hexToRgb(P.secondary).join(','));
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(x0 - 60, L.base - L.px * 1.1, L.width + 120, L.px * 1.45); ctx.clip();
  for (let w = 0; w < L.words.length; w++) {
    const wd = L.words[w];
    const a = lt - (first + w * wordGap);
    if (a <= 0) continue;
    const q = ease.outExpo(clamp(a / 0.45));
    const heat = Math.exp(-a * 9);
    const dy = (1 - q) * L.lh * 0.9;
    const o = { size: L.px, weight: L.weight, track: L.track, slice: [wd.s, wd.e] };
    ctx.save();
    // coloured halo (additive, blurred by the shadow) under the face
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = P.primary; ctx.shadowBlur = 36 + 30 * heat;
    api.text(ctx, L.title, x0 + wd.x, L.base + dy, { ...o, fill: halo, alpha: 0.45 * q });
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = rgba(P.primary, 0.6 + 0.35 * heat); ctx.shadowBlur = 12 + 40 * heat;
    api.text(ctx, L.title, x0 + wd.x, L.base + dy, { ...o, fill: met });
    if (heat > 0.03) {
      ctx.globalCompositeOperation = 'lighter';
      api.text(ctx, L.title, x0 + wd.x, L.base + dy, { ...o, fill: P.text, alpha: 0.8 * heat });
    }
    ctx.restore();
  }
  ctx.restore();
  // sparse dust kicked up off the baseline as each word lands (spike s5 per-letter spray, thinned to per-word)
  for (let w = 0; w < L.words.length; w++) {
    const wd = L.words[w];
    api.sparks(ctx, lt - (first + w * wordGap), x0 + (wd.x + wd.x1) / 2, L.base + 4, 10, (api.seed % 997) + w, { a0: -2.9, a1: -0.25, sMin: 200, sMax: 800, pow: 1.3, drag: 5, grav: 1400, lifeMin: 0.25, lifeMax: 0.55, alpha: 0.6 }, [P.text, P.primary, P.secondary], api.hash);
  }

  // rule under the title + the fact line (spike SCAFFOLD snap: wipe left→right, tracking settles, tiny lift)
  const snapT = first + Math.max(1, L.words.length) * wordGap + 2 * grid;
  const rq = ease.outExpo(clamp((lt - (snapT - 2 * grid)) / 0.45));
  drawRule(ctx, api, cx, L.ruleY, (L.width / 2) * rq, rq > 0 ? Math.exp(-(lt - (snapT - 2 * grid)) * 6) : 0);
  if (L.line) {
    const la = lt - snapT;
    const q = clamp(la / 0.65);
    if (q > 0) {
      const tr = lerp(L.lineTrack0, L.lineTrack, ease.outExpo(q));
      const o = { size: L.linePx, weight: L.lineWeight, track: tr };
      const w = api.measure(ctx, L.line, o).width - tr;
      const lx = cx - w / 2;
      const wipe = ease.outExpo(clamp(la / 0.5));
      const xa = cx - CHAPTER_W / 2 - 40, xf = lerp(xa, cx + CHAPTER_W / 2 + 40, wipe);
      ctx.save();
      ctx.beginPath(); ctx.rect(xa, L.lineBase - L.linePx * 1.2, xf - xa, L.linePx * 1.8); ctx.clip();
      ctx.shadowColor = rgba(P.primary, 0.55); ctx.shadowBlur = 22;
      const bounce = 1 - ease.outBack(clamp(la / 0.35));
      api.text(ctx, L.line, lx, L.lineBase + bounce * 12, { ...o, alpha: clamp(q * 4), fill: accent(ctx, api, lx, lx + w) });
      ctx.restore();
      if (wipe < 0.995) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp((1 - wipe) * 1.2);
        const g = ctx.createLinearGradient(0, L.lineBase - L.linePx * 1.2, 0, L.lineBase + L.linePx * 0.6);
        g.addColorStop(0, rgba(P.text, 0)); g.addColorStop(0.5, P.text); g.addColorStop(1, rgba(P.text, 0));
        ctx.fillStyle = g; ctx.fillRect(xf - 2, L.lineBase - L.linePx * 1.2, 4, L.linePx * 1.8);
        ctx.restore();
      }
    }
  }
}

/** punch title moment: halo + spark field, lead accent line + rule, then one slamming line at a time */
function drawPunch(ctx, lt, p, first, enterAt, streakAt) {
  const { api, layout: L, dur } = p;
  const { W, clamp, lerp, ease, hash, rgba, palette: P, grid } = api;
  const N = L.rows.length;
  const cx = W / 2, cy = L.heroMid;
  const wordGap = grid * 0.25;
  // impact pulse: the most recent slam, decaying
  let pulse = 0;
  for (let i = 0; i < N; i++) { const a = lt - enterAt(i); if (a >= 0) pulse = Math.exp(-a * 5); }

  // backdrop: primary (left) / secondary (right) halo under the hero + drifting palette motes
  const hq = ease.outCubic(clamp((lt - first) / 0.5));
  if (hq > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hr = Math.max(340, L.heroW * 0.45), al = (0.13 + 0.10 * pulse) * hq;
    api.glowDot(ctx, cx - L.heroW * 0.25, cy, hr, al, api.hexToRgb(P.primary).join(','));
    api.glowDot(ctx, cx + L.heroW * 0.25, cy, hr, al, api.hexToRgb(P.secondary).join(','));
    ctx.restore();
    sparkField(ctx, api, lt, cx, cy, Math.min(860, L.heroW / 2 + 240), 300, hq);
  }

  // lead: the spaced accent line, wiping in left→right as its tracking settles (spike SCAFFOLD)
  if (L.lead) {
    const la = lt - Math.max(0, first - 2 * grid);
    const q = clamp(la / 0.65);
    if (q > 0) {
      const tr = lerp(L.leadTrack0, L.leadTrack, ease.outExpo(q));
      const o = { size: L.leadPx, weight: 700, track: tr };
      const w = api.measure(ctx, L.lead, o).width - tr;
      const lx = cx - w / 2;
      const wipe = ease.outExpo(clamp(la / 0.5));
      const xa = cx - PUNCH_FIT_W / 2 - 40, xf = lerp(xa, cx + PUNCH_FIT_W / 2 + 40, wipe);
      ctx.save();
      ctx.beginPath(); ctx.rect(xa, L.leadBase - L.leadPx * 1.2, xf - xa, L.leadPx * 1.7); ctx.clip();
      ctx.shadowColor = rgba(P.primary, 0.55); ctx.shadowBlur = 24;
      const bounce = 1 - ease.outBack(clamp(la / 0.35));
      api.text(ctx, L.lead, lx, L.leadBase + bounce * 12, { ...o, alpha: clamp(q * 4), fill: accent(ctx, api, lx, lx + w) });
      ctx.restore();
      if (wipe < 0.995) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp((1 - wipe) * 1.2);
        const g = ctx.createLinearGradient(0, L.leadBase - L.leadPx * 1.2, 0, L.leadBase + L.leadPx * 0.5);
        g.addColorStop(0, rgba(P.text, 0)); g.addColorStop(0.5, P.text); g.addColorStop(1, rgba(P.text, 0));
        ctx.fillStyle = g; ctx.fillRect(xf - 2, L.leadBase - L.leadPx * 1.2, 4, L.leadPx * 1.7);
        ctx.restore();
      }
    }
  }
  // rule: draws out with the first slam, flashes on every slam
  const rq = ease.outExpo(clamp((lt - first + grid) / 0.45));
  drawRule(ctx, api, cx, L.ruleY, (L.heroW / 2) * rq, pulse);

  L.rows.forEach((row, i) => {
    const a0 = enterAt(i), a = lt - a0;
    if (a <= -grid) return;
    const next = i < N - 1 ? enterAt(i + 1) : Infinity;
    const out = clamp((lt - next) / 0.22);
    if (out >= 1) return;
    // anticipation: a thin charging line just before the slam
    if (a < 0) {
      const k = clamp(1 + a / grid);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
      ctx.fillStyle = api.brand(ctx, cx - 600, 0, cx + 600, 0, rgba(P.primary, 0), P.text);
      ctx.fillRect(cx - 600 * k, cy - 1.5, 1200 * k, 3); ctx.restore();
      return;
    }
    const slam = 1 + SLAM_PEAK * Math.exp(-a * 14) * Math.cos(a * 18) - SLAM_PEAK * (1 - clamp(a / 0.02));
    const push = 1 + 0.04 * clamp(a / Math.max(0.5, dur - a0)) + 0.25 * ease.inQuad(out);
    const s = Math.min(row.sMax, Math.max(0.6, slam) * push);
    const fade = 1 - out, o = row.o;
    let k = 0; // words revealed so far (in reading order, across the row's pieces)
    while (k < row.words.length && a - k * wordGap > 0) k++;
    const heat0 = Math.exp(-a * 6);
    const landing = a - (row.words.length - 1) * wordGap < 0.3;
    const fq = clamp((a - 0.04) / 0.3) * fade, fl = 0.5 * Math.exp(-a * 22);
    const ch = Math.exp(-a * 7);
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    row.pieces.forEach((pc, j) => {
      if (k <= pc.w0) return;
      const x0 = pc.x0, base = pc.base, po = { ...o, slice: [pc.s, pc.e] };
      const xr = x0 + row.words[Math.min(k, pc.w1) - 1].x1; // right edge of the revealed words of this piece
      const spY = base - pc.baseLocal;
      // light under/around the revealed words: bloom sprite, slam echoes, chromatic split (all additive)
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 - GP, spY - (ECHO_MAX + 8), xr - x0 + 2 * GP, pc.sh + ECHO_MAX + 8); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp((0.4 + 0.06 * Math.sin(lt * 2.2 + i + j) + 0.5 * heat0 + 0.2 * pulse) * fade, 0, 1);
      ctx.drawImage(pc.glow.canvas, x0 - GP, spY); // bloom, not text: no manifest box (C16 does not judge glow)
      ctx.globalAlpha = 1;
      if (a < 0.18) {
        for (const [dyE, al] of ECHOES) {
          api.text(ctx, row.item, x0, base - dyE * (1 - a / 0.18), { ...po, fill: P.primary, alpha: al * (1 - a / 0.18) });
        }
      }
      if (ch > 0.04) {
        api.text(ctx, row.item, x0 - CHROMA * ch, base, { ...po, fill: P.primary, alpha: 0.55 * ch * fade });
        api.text(ctx, row.item, x0 + CHROMA * ch, base, { ...po, fill: P.secondary, alpha: 0.55 * ch * fade });
      }
      ctx.restore();
      // face: per word while landing (white-hot → metal), the whole piece once landed
      if (landing) {
        for (let w = pc.w0; w < Math.min(k, pc.w1); w++) {
          const wd = row.words[w], aw = a - w * wordGap, heat = Math.exp(-aw * 9);
          ctx.save();
          ctx.shadowColor = rgba(P.primary, 0.55 + 0.4 * heat); ctx.shadowBlur = 8 + 40 * heat;
          api.text(ctx, row.item, x0 + wd.x, base, { ...o, slice: [wd.s, wd.e], fill: metal(ctx, api, base - pc.asc, base), alpha: fade * clamp(aw / 0.08) });
          if (heat > 0.03) {
            ctx.globalCompositeOperation = 'lighter';
            api.text(ctx, row.item, x0 + wd.x, base, { ...o, slice: [wd.s, wd.e], fill: P.text, alpha: 0.8 * heat * fade });
          }
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.shadowColor = rgba(P.primary, 0.5); ctx.shadowBlur = 10;
        api.text(ctx, row.item, x0, base, { ...po, fill: metal(ctx, api, base - pc.asc, base), alpha: fade });
        ctx.restore();
      }
      // inner brand edge (face sprite) fades in over the landed words, with a landing flash
      if (fq > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 - GP, spY, xr - x0 + 2 * GP, pc.sh); ctx.clip();
        ctx.globalAlpha = fq; api.blit(ctx, pc.face.canvas, x0 - GP, spY);
        if (fl > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl * fade; api.blit(ctx, pc.face.canvas, x0 - GP, spY); }
        ctx.restore();
      }
    });
    ctx.restore();
    const lastPc = row.pieces[row.pieces.length - 1];
    // ring + sparks on the slam, dust off the baseline per word
    if (a < 0.8) {
      const kk = ease.outExpo(clamp(a / 0.7));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.pow(1 - clamp(a / 0.7), 1.4) * 0.9;
      ctx.strokeStyle = api.brand(ctx, cx - 900, 0, cx + 900, 0, P.primary, P.secondary); ctx.lineWidth = 6 * (1 - kk) + 1.2;
      ctx.shadowColor = P.primary; ctx.shadowBlur = 30;
      const ew = row.width / 2 + 40 + 520 * kk, eh = row.blockH / 2 + row.px * 0.25 + 260 * kk;
      api.rr(ctx, cx - ew, cy - eh, ew * 2, eh * 2, eh); ctx.stroke();
      ctx.restore();
      api.sparks(ctx, a, cx, cy, 70, 3 + i, { a0: 0, a1: 6.2832, sMin: 300, sMax: 1800, pow: 1.5, drag: 3.6, grav: 420, lifeMin: 0.3, lifeMax: 0.8, alpha: 0.8 }, [P.text, P.primary, P.secondary], hash);
      for (let w = 0; w < row.words.length; w++) {
        const wd = row.words[w], pc = row.pieces[wd.p];
        api.sparks(ctx, a - w * wordGap, pc.x0 + (wd.x + wd.x1) / 2, pc.base + 4, 8, (api.seed % 997) + 17 * i + w, { a0: -2.9, a1: -0.25, sMin: 200, sMax: 800, pow: 1.3, drag: 5, grav: 1400, lifeMin: 0.25, lifeMax: 0.55, alpha: 0.6 }, [P.text, P.primary, P.secondary], hash);
      }
    }
    streakAt(lastPc.x0, lastPc.x0 + lastPc.width, lastPc.base + lastPc.desc + 18, a);
  });
}

export default {
  id: 'kinetic-text',

  layout(rb, variant, api) {
    api.cue('line'); // the compiler always emits it (default cue): a missing one fails the boot
    if (variant === 'chapter') return chapterLayout(rb, api);
    if (variant === 'punch') return punchLayout(rb, api);
    const lines = rb.slots.lines.items;
    const lead = rb.slots.lead?.items[0] ?? null;
    const N = lines.length;
    const track = -2, weight = 800;
    const px = api.fitSlot('lines', { maxW: STACK_W, maxPx: STACK_MAX[Math.min(N, 3)], weight, track });
    const leadPx = lead ? api.fitSlot('lead', { maxW: STACK_W, maxPx: LEAD_MAX, weight: 600, track: 4 }) : 0;
    const m = api.makeCanvas('cache', 8, 8).ctx;
    const o = { size: px, weight, track };
    const rows = lines.map((item) => {
      const width = api.measure(m, item, o).width - track;
      const ws = words(item.text).map(([s, e]) => ({ s, e, x: api.measure(m, item, { ...o, slice: [0, s] }).width }));
      return { item, width, words: ws };
    });
    const lh = Math.round(px * 1.12);
    const leadGap = lead ? leadPx + 46 : 0;
    const blockH = N * lh + leadGap;
    const top = Math.round((1080 - blockH) / 2);
    return { rows, lead, px, leadPx, lh, top, leadY: top + leadPx, firstBase: top + leadGap + Math.round(px * 0.9), track, weight };
  },

  draw(ctx, lt, p, rb, cues) {
    const { api, layout: L, dur } = p;
    const { W, H, clamp, lerp, ease, rgba, mix, palette: P, grid } = api;
    const N = L.rows.length;
    const snap = (x) => Math.max(grid, Math.round(x / grid) * grid);
    // schedule: first line on cue `line` (compiled default cue, always emitted — api.cue throws if it is not),
    // then whole grid steps; lead precedes the lines
    const first = api.cue('line');
    const step = N > 1 ? Math.max(2 * grid, snap((dur * (L.punch ? 0.62 : 0.45)) / N)) : 0;
    const enterAt = (i) => first + i * step;
    const wordGap = grid * 0.5;
    const e = api.cueEnergy(lt, 6);

    // ── ambience: diagonal light band + brand haze, gently tied to the cue energy ──
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hz = ctx.createRadialGradient(W * 0.5, H * 0.52, 0, W * 0.5, H * 0.52, 900);
    hz.addColorStop(0, rgba(P.primary, 0.10 + 0.08 * Math.min(e, 1))); hz.addColorStop(1, rgba(P.primary, 0));
    ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
    const sp = clamp(lt / dur);
    ctx.save(); ctx.translate(lerp(-400, W + 400, ease.inOutCubic(sp)), H / 2); ctx.rotate(0.35);
    const bg = ctx.createLinearGradient(-220, 0, 220, 0);
    bg.addColorStop(0, rgba(P.secondary, 0)); bg.addColorStop(0.5, rgba(P.secondary, 0.05)); bg.addColorStop(1, rgba(P.secondary, 0));
    ctx.fillStyle = bg; ctx.fillRect(-220, -1100, 440, 2200); ctx.restore();
    ctx.restore();

    if (L.chapter) return drawChapter(ctx, lt, p, first);

    function streakAt(x0, x1, y, a) {
      if (a <= 0 || a > 0.6) return;
      const k = ease.outExpo(clamp(a / 0.5)), al = 1 - clamp(a / 0.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const x = lerp(x0 - 200, x1 + 200, k);
      const g = ctx.createLinearGradient(x - 600, 0, x, 0);
      g.addColorStop(0, rgba(P.secondary, 0)); g.addColorStop(1, rgba(P.text, 0.9 * al));
      ctx.fillStyle = g; ctx.fillRect(x - 600, y - 1.5, 600, 3);
      api.glowDot(ctx, x, y, 60, 0.6 * al, api.hexToRgb(P.secondary).join(','));
      ctx.restore();
    }

    if (L.punch) return drawPunch(ctx, lt, p, first, enterAt, streakAt);

    // ── stack ──
    // lead phrase: tracked, dim, with a brand tick that draws on
    if (L.lead) {
      const la = lt - Math.max(0, first - 2 * grid);
      const q = ease.outExpo(clamp(la / 0.5));
      if (q > 0) {
        const x = STACK_X;
        ctx.save();
        ctx.fillStyle = api.brand(ctx, x, 0, x + 64, 0, P.primary, P.secondary);
        ctx.shadowColor = P.primary; ctx.shadowBlur = 14;
        ctx.fillRect(x, L.leadY - L.leadPx - 18, 64 * q, 4);
        ctx.restore();
        api.text(ctx, L.lead, x + (1 - q) * -24, L.leadY, { size: L.leadPx, weight: 600, track: 4, fill: mix(P.dim, P.text, 0.35), alpha: q });
      }
    }

    const fillFor = (i, x0, x1) => (i === N - 1 && N > 1 ? api.brand(ctx, x0, 0, x1, 0, mix(P.primary, P.text, 0.25), P.secondary) : P.text);

    // a line's words: white-hot landing (additive pass) that cools to the line fill
    function drawWords(row, i, x0, base, a0, alpha) {
      for (let w = 0; w < row.words.length; w++) {
        const wd = row.words[w];
        const a = lt - (a0 + w * wordGap);
        if (a <= 0) continue;
        const q = ease.outExpo(clamp(a / 0.45));
        const heat = Math.exp(-a * 9);
        const dy = (1 - q) * L.lh * 0.9;
        ctx.save();
        ctx.shadowColor = rgba(P.primary, 0.55 + 0.4 * heat); ctx.shadowBlur = 8 + 40 * heat;
        api.text(ctx, row.item, x0 + wd.x, base + dy, { size: L.px, weight: L.weight, track: L.track, slice: [wd.s, wd.e], fill: fillFor(i, x0, x0 + row.width), alpha });
        if (heat > 0.03) { // additive white-hot pass over the fresh word
          ctx.globalCompositeOperation = 'lighter';
          api.text(ctx, row.item, x0 + wd.x, base + dy, { size: L.px, weight: L.weight, track: L.track, slice: [wd.s, wd.e], fill: P.text, alpha: 0.8 * heat * alpha });
        }
        ctx.restore();
      }
    }

    L.rows.forEach((row, i) => {
      const a0 = enterAt(i), a = lt - a0;
      if (a <= 0) return;
      const base = L.firstBase + i * L.lh;
      const newest = i === N - 1 || lt < enterAt(i + 1);
      const dim = newest ? 1 : lerp(1, 0.55, ease.outCubic(clamp((lt - enterAt(i + 1)) / 0.4)));
      // accent bar
      const bq = ease.outExpo(clamp(a / 0.35));
      ctx.save(); ctx.fillStyle = api.brand(ctx, 0, base - L.px * 0.72, 0, base, P.primary, P.secondary);
      ctx.shadowColor = P.primary; ctx.shadowBlur = 18 * dim; ctx.globalAlpha = dim;
      ctx.fillRect(STACK_X - 44, base - L.px * 0.72 * bq, 8, L.px * 0.72 * bq); ctx.restore();
      // mask: words rise out of the baseline
      ctx.save();
      ctx.beginPath(); ctx.rect(STACK_X - 20, base - L.px * 1.05, STACK_W + 120, L.px * 1.3); ctx.clip();
      drawWords(row, i, STACK_X, base, a0, dim);
      ctx.restore();
      streakAt(STACK_X, STACK_X + row.width, base + L.px * 0.16, a - (row.words.length - 1) * wordGap * 0.5);
    });
  },
};
