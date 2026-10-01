// Shape helpers ported from spike core.js (rr, brand, glow, glass). No text here — text goes through text.mjs.

/** rounded-rect path */
export function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** two-stop linear gradient a→b (defaults: palette primary→secondary are passed by the caller) */
export function brand(ctx, x0, y0, x1, y1, a, b) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g;
}

/** run fn with a glow (shadowBlur) in `color` */
export function glow(ctx, color, blur, fn) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; fn(); ctx.restore();
}

/** glass panel: translucent fill + hairline border + top highlight */
export function glass(ctx, x, y, w, h, r = 20, o = {}) {
  const { alpha = 1, fill = 'rgba(18,22,34,0.72)', border = 'rgba(255,255,255,0.14)', glowColor = null, glowBlur = 40 } = o;
  ctx.save(); ctx.globalAlpha *= alpha;
  if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = glowBlur; }
  rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.shadowBlur = 0;
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.lineWidth = 1.5; ctx.strokeStyle = border; ctx.stroke();
  const g = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  rr(ctx, x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
}

// ─────────── FX helpers shared by archetypes (spike s1/s3/s5), all pure functions of their inputs ───────────

const hex3 = (h) => (h[0] === 'r' ? h.match(/[\d.]+/g).slice(0, 3).map(Number) : [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

/** mix(a, b, t, alpha?) → 'rgba(r,g,b,alpha)'; a/b are '#rrggbb' or 'rgb(r,g,b)' (so mixes nest) */
export function mix(a, b, t, alpha = 1) {
  const A = hex3(a), B = hex3(b);
  return `rgba(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0},${alpha})`;
}

/** soft white-cored radial dot; inner = 'r,g,b' */
export function glowDot(ctx, x, y, r, a, inner) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.18, `rgba(${inner},${a * 0.7})`); g.addColorStop(1, `rgba(${inner},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * sparks(ctx, dt, ox, oy, n, seed, o, cols, hash) — spike s5 omnidirectional streaks; analytic position(dt)
 * with drag + gravity, so any dt renders without history. o: {a0, a1, sMin, sMax, pow, drag, grav, lifeMin, lifeMax, alpha}
 */
export function sparks(ctx, dt, ox, oy, n, seed, o, cols, hash) {
  if (dt < 0 || dt > o.lifeMax) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let j = 0; j < n; j++) {
    const hh = (k) => hash(seed * 97 + j * 7.13 + k * 3.31);
    const life = o.lifeMin + (o.lifeMax - o.lifeMin) * hh(2); if (dt > life) continue;
    const ang = o.a0 + (o.a1 - o.a0) * hh(0), sp = o.sMin + (o.sMax - o.sMin) * Math.pow(hh(1), o.pow || 1);
    const pos = (d) => [ox + Math.cos(ang) * sp * (1 - Math.exp(-o.drag * d)) / o.drag, oy + Math.sin(ang) * sp * (1 - Math.exp(-o.drag * d)) / o.drag + o.grav * d * d * 0.5];
    const p1 = pos(dt), p0 = pos(Math.max(0, dt - 0.035));
    const k = 1 - dt / life;
    ctx.globalAlpha = Math.min(1, Math.max(0, k * 1.3)) * (o.alpha || 1);
    ctx.strokeStyle = cols[Math.floor(hh(3) * cols.length)];
    ctx.lineWidth = (1.2 + 2.2 * hh(4)) * (0.5 + 0.5 * k);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
  }
  ctx.restore();
}

/** check mark in a circle: circle pops, tick strokes itself on (p 0..1) — spike s3 */
export function checkMark(ctx, x, y, r, p, color) {
  if (p <= 0) return;
  const c1 = 1.70158, c3 = c1 + 1, q = Math.min(1, p * 1.6);
  const pop = 1 + c3 * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2);
  const [R, G, B] = hex3(color);
  ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
  ctx.fillStyle = `rgba(${R},${G},${B},0.18)`; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = `rgba(${R},${G},${B},0.9)`; ctx.stroke();
  const tp = Math.min(1, Math.max(0, (p - 0.25) / 0.6));
  if (tp > 0) {
    const pts = [[-r * 0.42, 0], [-r * 0.1, r * 0.34], [r * 0.46, -r * 0.34]];
    const l = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) + Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, r * 0.12); ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.setLineDash([l * (1 - Math.pow(1 - tp, 3)), 1000]); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke();
  }
  ctx.restore();
}

/** prompt chevron ❯ drawn as a path (a literal "$" would be unsourced text) — h = cap height */
export function chevron(ctx, x, y, h, color, blur = 14) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, h * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.55, y - h / 2); ctx.lineTo(x, y); ctx.stroke();
  ctx.restore();
}
