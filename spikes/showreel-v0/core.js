// CORE — deterministic 1920x1080 canvas renderer. renderAt(t) is a PURE function of t (no accumulated state),
// so frames can be rendered in any order. Scenes register themselves with ENN.scene({...}).
(function () {
  const W = 1920, H = 1080;
  const TL = window.TIMELINE;

  // ───────────────────────────── math & easing ─────────────────────────────
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const c1 = 1.70158, c3 = c1 + 1;
  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inQuart: (t) => t * t * t * t,
    inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inQuint: (t) => t * t * t * t * t,
    inOutQuint: (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    outBack: (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
    inBack: (t) => c3 * t * t * t - c1 * t * t,
    outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    outBounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
    // critically-tunable spring settle: overshoot then rest. k = stiffness feel (6..14)
    spring: (t, k = 9) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-k * t) * Math.cos(k * 0.9 * t)),
  };
  // prog(t, start, dur, easeFn) -> eased 0..1 progress of a window
  const prog = (t, start, dur, fn = ease.outCubic) => fn(clamp((t - start) / dur));
  const map = (v, a, b, c, d, fn) => lerp(c, d, fn ? fn(clamp((v - a) / (b - a))) : clamp((v - a) / (b - a)));
  // 0→1→0 envelope over local time: in/out durations
  const edge = (lt, total, inD = 0.3, outD = 0.3) => Math.min(clamp(lt / inD), clamp((total - lt) / outD));

  // seeded RNG (mulberry32) + stateless hash
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  // smooth 1D value noise, -1..1
  const noise = (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(hash(i), hash(i + 1), u) * 2 - 1;
  };

  // ───────────────────────────── design tokens ─────────────────────────────
  const pal = {
    ink: '#05060a', ink2: '#0a0c13', panel: '#10131d', panel2: '#161a27',
    line: 'rgba(255,255,255,0.09)', text: '#eef1f8', dim: '#8a93a8', faint: '#4a5266',
    violet: '#8b6bff', cyan: '#2ee6d6', amber: '#ffb347', magenta: '#ff4fa3', mint: '#5dffa0', red: '#ff5d73',
  };
  const fonts = {
    display: "'Bahnschrift','Segoe UI Variable Display','Segoe UI',sans-serif",
    mono: "'Cascadia Code','Cascadia Mono',Consolas,monospace",
    ui: "'Segoe UI Variable Text','Segoe UI',sans-serif",
  };
  const font = (size, weight = 600, fam = 'display') => `${weight} ${size}px ${fonts[fam] || fam}`;

  // ───────────────────────────── drawing helpers ─────────────────────────────
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const brand = (ctx, x0, y0, x1, y1, a = pal.violet, b = pal.cyan) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g;
  };
  // run fn with a glow (shadowBlur) in `color`
  function glow(ctx, color, blur, fn) {
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; fn(); ctx.restore();
  }
  // glass panel: translucent fill + hairline border + top highlight
  function glass(ctx, x, y, w, h, r = 20, o = {}) {
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
  // text with optional letterSpacing (px); returns measured width
  function text(ctx, str, x, y, o = {}) {
    const { f = font(48), fill = pal.text, align = 'left', base = 'alphabetic', track = 0, alpha = 1 } = o;
    ctx.save(); ctx.font = f; ctx.fillStyle = fill; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.letterSpacing = track + 'px'; ctx.globalAlpha *= alpha;
    ctx.fillText(str, x, y); const w = ctx.measureText(str).width; ctx.restore(); return w;
  }
  const measure = (ctx, str, f, track = 0) => { ctx.save(); ctx.font = f; ctx.letterSpacing = track + 'px'; const w = ctx.measureText(str).width; ctx.restore(); return w; };

  // ───────────────────────────── hits / camera ─────────────────────────────
  // energy of impacts at time t: sum of decaying pulses. decay = rate of falloff (higher = snappier)
  function hitEnergy(t, decay = 9) {
    let e = 0;
    for (const h of TL.hits) { const dt = t - h.t; if (dt >= 0 && dt < 1.2) e += h.amp * Math.exp(-dt * decay); }
    return e;
  }
  // energy of ONE specific hit index (for scene-local pulses)
  function hitAt(i, t, decay = 9) { const h = TL.hits[i]; const dt = t - h.t; return dt >= 0 ? h.amp * Math.exp(-dt * decay) : 0; }
  // continuous "anticipation" before a hit: 0→1 over `lead` seconds ending at hit time
  const anticipate = (t, hitTime, lead = 0.4) => ease.inQuad(clamp((t - (hitTime - lead)) / lead));

  // ───────────────────────────── scene registry ─────────────────────────────
  const scenes = [];
  function scene(def) { scenes.push(def); scenes.sort((a, b) => TL.scenes[a.id].start - TL.scenes[b.id].start); }

  // ───────────────────────────── shared background ─────────────────────────────
  // continuous across the whole film; hue wanders violet→cyan→amber→violet by global time
  function background(ctx, t) {
    ctx.fillStyle = pal.ink; ctx.fillRect(0, 0, W, H);
    const k = t / TL.duration;
    const blobs = [
      { x: 0.2 + 0.1 * Math.sin(t * 0.4), y: 0.3 + 0.1 * Math.cos(t * 0.3), r: 0.55, c: [139, 107, 255], a: 0.11 + 0.06 * Math.sin(k * 6.28) },
      { x: 0.8 + 0.08 * Math.cos(t * 0.35), y: 0.7 + 0.1 * Math.sin(t * 0.45), r: 0.5, c: [46, 230, 214], a: 0.065 + 0.045 * Math.cos(k * 6.28 + 1) },
      { x: 0.5 + 0.2 * Math.sin(t * 0.2), y: 1.0, r: 0.45, c: [255, 79, 163], a: 0.035 + 0.04 * Math.max(0, Math.sin(k * 9.4 + 2)) },
    ];
    for (const b of blobs) {
      const g = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * W);
      g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${Math.max(0, b.a)})`);
      g.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // faint dot grid with slow parallax drift
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.07)';
    const step = 48, ox = (t * 6) % step, oy = (t * 3) % step;
    for (let y = -step + oy; y < H + step; y += step) for (let x = -step + ox; x < W + step; x += step) ctx.fillRect(x, y, 2, 2);
    ctx.restore();
    // drifting motes (deterministic)
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const r = hash(i * 7.3), s = hash(i * 3.1), z = 0.3 + hash(i * 1.7) * 0.9;
      const x = ((r * W * 1.3 + t * 14 * z) % (W * 1.3)) - W * 0.15;
      const y = ((s * H * 1.3 - t * 10 * z) % (H * 1.3) + H * 1.3) % (H * 1.3) - H * 0.15;
      ctx.globalAlpha = 0.10 + 0.25 * z * (0.5 + 0.5 * Math.sin(t * 1.3 + i));
      ctx.fillStyle = i % 3 === 0 ? pal.cyan : i % 3 === 1 ? pal.violet : '#fff';
      ctx.beginPath(); ctx.arc(x, y, 1 + z * 1.6, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ───────────────────────────── canvases ─────────────────────────────
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const out = document.getElementById('stage') || mk(W, H);
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const sceneC = mk(W, H), sctx = sceneC.getContext('2d');
  const tintC = mk(W, H), tctx = tintC.getContext('2d');
  const bloomA = mk(480, 270), bactx = bloomA.getContext('2d');
  const bloomB = mk(960, 540), bbctx = bloomB.getContext('2d');
  const grainC = mk(256, 256);
  { // film grain tile
    const g = grainC.getContext('2d'); const id = g.createImageData(256, 256); const r = rng(1234);
    for (let i = 0; i < id.data.length; i += 4) { const v = (r() * 255) | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);
  }
  const vignette = (() => {
    const c = mk(W, H), g = c.getContext('2d');
    const rg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.0);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H); return c;
  })();

  // ───────────────────────────── frame render ─────────────────────────────
  function renderFrame(t, only) {
    t = clamp(t, 0, TL.duration);
    const e = hitEnergy(t);
    // 1) scene layer with global camera (slow push-in + impact shake/punch)
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, W, H);
    sctx.save();
    const push = 1 + 0.035 * (t / TL.duration) + 0.028 * Math.min(e, 1.4);
    const sx = (noise(t * 55) * 14 + Math.sin(t * 90) * 8) * Math.min(e, 1.2);
    const sy = (noise(t * 55 + 100) * 14 + Math.cos(t * 83) * 8) * Math.min(e, 1.2);
    const rot = noise(t * 40 + 7) * 0.006 * Math.min(e, 1.2);
    sctx.translate(W / 2 + sx, H / 2 + sy); sctx.rotate(rot); sctx.scale(push, push); sctx.translate(-W / 2, -H / 2);
    background(sctx, t);
    for (const s of scenes) {
      const w = TL.scenes[s.id];
      if (only && only !== s.id) continue;
      if (t < w.start || t > w.end) continue;
      sctx.save(); sctx.globalAlpha = 1;
      s.draw(sctx, t - w.start, t, { W, H, w, dur: w.end - w.start });
      sctx.restore();
    }
    sctx.restore();

    // 2) composite with chromatic aberration (scales with impact energy)
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';
    const ab = Math.min(e, 1.4) * 9 + 0.0;
    if (ab > 0.6) {
      octx.fillStyle = '#000'; octx.fillRect(0, 0, W, H);
      octx.globalCompositeOperation = 'lighter';
      const ch = [['#ff0000', ab, 0], ['#00ff00', 0, 0], ['#0000ff', -ab, 0]];
      for (const [col, dx, dy] of ch) {
        tctx.globalCompositeOperation = 'source-over'; tctx.drawImage(sceneC, 0, 0);
        tctx.globalCompositeOperation = 'multiply'; tctx.fillStyle = col; tctx.fillRect(0, 0, W, H);
        octx.drawImage(tintC, dx, dy);
      }
      octx.globalCompositeOperation = 'source-over';
    } else octx.drawImage(sceneC, 0, 0);

    // 3) bloom (two blur radii, additive)
    bactx.clearRect(0, 0, 480, 270); bactx.filter = 'blur(5px)'; bactx.drawImage(sceneC, 0, 0, 480, 270); bactx.filter = 'none';
    bbctx.clearRect(0, 0, 960, 540); bbctx.filter = 'blur(3px)'; bbctx.drawImage(sceneC, 0, 0, 960, 540); bbctx.filter = 'none';
    octx.globalCompositeOperation = 'lighter';
    octx.globalAlpha = 0.55 + 0.25 * Math.min(e, 1); octx.drawImage(bloomA, 0, 0, W, H);
    octx.globalAlpha = 0.28; octx.drawImage(bloomB, 0, 0, W, H);
    octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';

    // 4) vignette, scanline whisper, grain, fade-in from black
    octx.drawImage(vignette, 0, 0);
    octx.globalAlpha = 0.035; octx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) octx.fillRect(0, y, W, 1);
    octx.globalAlpha = 0.06; octx.globalCompositeOperation = 'overlay';
    const fi = Math.floor(t * TL.fps), gx = (hash(fi) * 256) | 0, gy = (hash(fi + 99) * 256) | 0;
    for (let y = -256 + gy; y < H; y += 256) for (let x = -256 + gx; x < W; x += 256) octx.drawImage(grainC, x, y);
    octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';
    const fade = 1 - clamp(t / 0.3);
    if (fade > 0) { octx.fillStyle = `rgba(0,0,0,${fade})`; octx.fillRect(0, 0, W, H); }
  }

  // temporal supersampling = real motion blur (shutter ~216deg). samples=1 is a fast preview.
  const accC = mk(W, H), actx = accC.getContext('2d');
  function renderAt(t, only, samples = 1) {
    if (samples <= 1) return renderFrame(t, only);
    const exposure = 0.6 / TL.fps;
    actx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < samples; i++) {
      renderFrame(t + ((i + 0.5) / samples - 0.5) * exposure, only);
      actx.globalAlpha = 1 / (i + 1); actx.drawImage(out, 0, 0);
    }
    actx.globalAlpha = 1;
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';
    octx.drawImage(accC, 0, 0);
  }

  window.ENN = { W, H, TL, clamp, lerp, ease, prog, map, edge, rng, hash, noise, pal, fonts, font, rr, brand, glow, glass, text, measure, hitEnergy, hitAt, anticipate, scene, background, renderAt, stage: out };
  window.renderAt = renderAt;
})();
