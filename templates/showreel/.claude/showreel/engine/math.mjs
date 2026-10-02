// Math, easing, seeded RNG, stateless hash and value noise — ported verbatim from spike core.js.
// Pure functions only: seeded RNG, no wall-clock or unseeded randomness (D9).

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

const c1 = 1.70158, c3 = c1 + 1;
export const ease = Object.freeze({
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inQuart: (x) => x * x * x * x,
  inOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  inQuint: (x) => x * x * x * x * x,
  inOutQuint: (x) => (x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  outBack: (x) => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2),
  inBack: (x) => c3 * x * x * x - c1 * x * x,
  outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (x) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
  // critically-tunable spring settle: overshoot then rest. k = stiffness feel (6..14)
  spring: (x, k = 9) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-k * x) * Math.cos(k * 0.9 * x)),
});

// prog(t, start, dur, easeFn) -> eased 0..1 progress of a window
export const prog = (t, start, dur, fn = ease.outCubic) => fn(clamp((t - start) / dur));
export const map = (v, a, b, c, d, fn) => lerp(c, d, fn ? fn(clamp((v - a) / (b - a))) : clamp((v - a) / (b - a)));
// 0→1→0 envelope over local time: in/out durations
export const edge = (lt, total, inD = 0.3, outD = 0.3) => Math.min(clamp(lt / inD), clamp((total - lt) / outD));
// continuous "anticipation" before a moment: 0→1 over `lead` seconds ending at `at`
export const anticipate = (t, at, lead = 0.4) => ease.inQuad(clamp((t - (at - lead)) / lead));

// seeded RNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// stateless hash 0..1
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// smooth 1D value noise, -1..1
export const noise = (x) => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u) * 2 - 1;
};

/** FNV-1a 32-bit of a string — derives stable per-beat seeds from ids. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
