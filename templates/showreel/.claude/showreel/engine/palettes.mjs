// Design tokens. `violet` = spike core.js `pal` verbatim (+ role aliases). The other palettes keep the
// same neutrals and swap the role colours: primary (brand accent), secondary (counter-accent), hot (rare highlight).
// Archetypes should use the roles (primary/secondary/hot), not the named hues, so the palette choice carries.

const BASE = {
  ink: '#05060a', ink2: '#0a0c13', panel: '#10131d', panel2: '#161a27',
  line: 'rgba(255,255,255,0.09)', text: '#eef1f8', dim: '#8a93a8', faint: '#4a5266',
  violet: '#8b6bff', cyan: '#2ee6d6', amber: '#ffb347', magenta: '#ff4fa3', mint: '#5dffa0', red: '#ff5d73',
};

export const PALETTES = Object.freeze({
  violet: Object.freeze({ ...BASE, name: 'violet', primary: BASE.violet, secondary: BASE.cyan, hot: BASE.magenta }),
  cyan: Object.freeze({ ...BASE, name: 'cyan', primary: BASE.cyan, secondary: BASE.violet, hot: BASE.mint }),
  amber: Object.freeze({ ...BASE, name: 'amber', primary: BASE.amber, secondary: BASE.magenta, hot: BASE.red }),
  mint: Object.freeze({ ...BASE, name: 'mint', primary: BASE.mint, secondary: BASE.cyan, hot: BASE.violet }),
});

/** palette(name) → frozen token object. Unknown name throws (the timeline schema enum is the source). */
export function palette(name) {
  const p = PALETTES[name];
  if (!p) throw new Error(`unknown palette "${name}" (expected ${Object.keys(PALETTES).join('|')})`);
  return p;
}

/** '#rrggbb' → [r, g, b] */
export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`hexToRgb: not a #rrggbb colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** rgba('#rrggbb', a) → 'rgba(r,g,b,a)' */
export function rgba(hex, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
