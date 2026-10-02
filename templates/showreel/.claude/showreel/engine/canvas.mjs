// The ONLY place in engine/ + archetypes/ that creates canvases or contexts (D9 amended, M0 ruling).
// M0 root cause of GPU hash instability: build-once sprite caches (spike s5 blur-filtered TITLE)
// got a per-run GPU-or-CPU backing. Pinning caches to the CPU with willReadFrequently fixed it.
// A static test bans createElement('canvas') / new OffscreenCanvas / getContext outside this file.
//
// Roles:
//   stage — the output canvas (appended to <body> as #stage); GPU, redrawn every frame
//   frame — per-frame offscreen layers (scene, tint, bloom, accumulation, transition scratch); GPU
//   cache — build-once sprites / tiles (grain, vignette, text sprites); CPU-pinned
// Every role passes willReadFrequently EXPLICITLY: true pins `cache` to the CPU; false pins stage/frame
// to the GPU. Left undefined, Chrome de-accelerates a canvas after ~100 getImageData readbacks and the
// frame bytes change mid-render (measured M1: hash differs vs a fresh page; 8 → 240 ms/frame).

const ROLES = new Set(['stage', 'frame', 'cache']);
const roles = new WeakMap();

/** roleOf(canvas) → 'stage' | 'frame' | 'cache' | undefined (canvas not made by the factory) */
export function roleOf(canvas) {
  return roles.get(canvas);
}

/** makeCanvas(role, w, h) → { canvas, ctx }. Unknown role or bad size throws (fail loud). */
export function makeCanvas(role, w, h) {
  if (!ROLES.has(role)) throw new Error(`makeCanvas: unknown role "${role}" (expected stage|frame|cache)`);
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0)) {
    throw new Error(`makeCanvas: ${role} size must be positive integers, got ${w}x${h}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: role === 'cache' });
  roles.set(canvas, role);
  if (role === 'stage') {
    canvas.id = 'stage';
    document.body.appendChild(canvas);
  }
  return { canvas, ctx };
}

/** WebGL UNMASKED_RENDERER string (C10 `renderer`). Contains "SwiftShader" on GPU-less hosts. */
export function gpuRenderer() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
  if (!gl) return 'none';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  return r;
}
