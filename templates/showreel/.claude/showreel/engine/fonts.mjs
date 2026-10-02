// Fonts (D6): OFL variable fonts from the exact-pinned fontsource packages in .tool, re-declared under
// stable family names with EVERY unicode-range subset reproduced from the package's own index.css.
// All subsets are loaded eagerly before any draw (unicode-range faces otherwise load lazily → a frame
// could render with a fallback face → non-deterministic). Glyph coverage is computed from the same
// unicode-ranges, so `glyphGaps` reports exactly the characters that would fall back (no silent tofu).
//
// Family choice is data-driven, never per call site: command/route facts render in mono, everything
// else in display. The glyph check uses the same rule, so what is checked is what is drawn.

export const FAMILIES = Object.freeze({
  display: Object.freeze({ family: 'Showreel Display', pkg: 'archivo', minPx: 28 }),
  mono: Object.freeze({ family: 'Showreel Mono', pkg: 'jetbrains-mono', minPx: 22 }),
});

const MONO_KINDS = ['command', 'route'];

/** fact kind encoded in a resolved item's id ('f.<kind>.<n>' → '<kind>'); null for phrases (C7). */
export function kindOf(item) {
  const m = /^f\.(.+)\.\d+$/.exec(item.id);
  return m ? m[1] : null;
}

/** 'mono' | 'display' for a resolved item (C7) — by fact kind encoded in the id. */
export function familyOf(item) {
  return MONO_KINDS.includes(kindOf(item)) ? 'mono' : 'display';
}

/** Parse fontsource index.css → [{ weight, style, file, ranges:[[lo,hi],…] }] (pure). */
export function parseFontsourceCss(css) {
  const faces = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const get = (prop) => new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(block)?.[1].trim();
    const src = get('src') ?? '';
    const file = /url\(\s*['"]?\.?\/?([^'")]+)['"]?\s*\)/.exec(src)?.[1];
    const range = get('unicode-range');
    if (!file || !range) throw new Error(`fontsource CSS: @font-face without src url or unicode-range: ${block.slice(0, 120)}`);
    faces.push({ weight: get('font-weight') ?? '400', style: get('font-style') ?? 'normal', file, unicodeRange: range, ranges: parseUnicodeRange(range) });
  }
  return faces;
}

/** 'U+0000-00FF,U+0131,U+1EA0-1EF9' → [[0,255],[305,305],[7840,7929]] (pure). Wildcards (U+4??) supported. */
export function parseUnicodeRange(str) {
  return str.split(',').map((part) => {
    const p = part.trim().replace(/^U\+/i, '');
    if (p.includes('?')) return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'F'), 16)];
    const [a, b] = p.split('-');
    const lo = parseInt(a, 16), hi = b === undefined ? lo : parseInt(b, 16);
    if (Number.isNaN(lo) || Number.isNaN(hi)) throw new Error(`bad unicode-range part "${part}"`);
    return [lo, hi];
  });
}

export const covers = (ranges, cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/**
 * glyphGapsFor(resolved, coverage) → [{char, beatId, slot}] (pure). coverage = {display:[[lo,hi]…], mono:[…]}.
 * Checks every item text and unit in every slot against the family it renders in. One entry per
 * (char, beat, slot); beats and slots in sorted order so the report is stable.
 */
export function glyphGapsFor(resolved, coverage) {
  const gaps = [];
  for (const beatId of Object.keys(resolved.beats).sort(beatOrder)) {
    const slots = resolved.beats[beatId].slots;
    for (const slot of Object.keys(slots).sort()) {
      const seen = new Set();
      for (const item of slots[slot].items) {
        const ranges = coverage[familyOf(item)];
        for (const str of [item.text, item.unit ?? '']) {
          for (const ch of str) {
            if (seen.has(ch) || covers(ranges, ch.codePointAt(0))) continue;
            seen.add(ch);
            gaps.push({ char: ch, beatId, slot });
          }
        }
      }
    }
  }
  return gaps;
}

const beatOrder = (a, b) => Number(a.slice(1)) - Number(b.slice(1));

// ───────────────────────────── browser side ─────────────────────────────
const loaded = { display: [], mono: [] };

/** Load every subset of both families from `/fonts/<pkg>/` (C12) and wait for document.fonts.ready. */
export async function loadFonts(base = '/fonts') {
  for (const [key, { family, pkg }] of Object.entries(FAMILIES)) {
    const cssUrl = `${base}/${pkg}/index.css`;
    const res = await fetch(cssUrl);
    if (!res.ok) throw new Error(`font CSS not found: ${cssUrl} (HTTP ${res.status}) — run: node .claude/showreel/cli.mjs preflight`);
    const faces = parseFontsourceCss(await res.text());
    const ranges = [];
    for (const f of faces) {
      if (f.style !== 'normal') continue;
      const url = `${base}/${pkg}/${f.file}`;
      const face = new FontFace(family, `url(${url})`, { weight: f.weight, style: 'normal', unicodeRange: f.unicodeRange });
      document.fonts.add(face);
      try {
        await face.load();
      } catch (err) {
        throw new Error(`font subset failed to load: ${url} (${err && err.message ? err.message : err})`);
      }
      ranges.push(...f.ranges);
    }
    if (!ranges.length) throw new Error(`no font faces declared in ${cssUrl}`);
    loaded[key] = ranges;
  }
  await document.fonts.ready;
}

/** Glyph gaps against the faces actually loaded in this page (C10 glyphGaps). */
export function glyphGaps(resolved) {
  return glyphGapsFor(resolved, loaded);
}
