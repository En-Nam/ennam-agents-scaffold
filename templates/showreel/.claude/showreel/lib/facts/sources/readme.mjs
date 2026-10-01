// Source 2: README.md → app.name (fallback only), app.tagline, feature bullets.
import { mdLines, heading, bullet, itemTitle, stripInline } from '../md.mjs';

const TAGLINE_MAX = 120;
/** "Features"-ish headings whose bullets are NOT shipped features (unbuilt work, config flags). */
const NOT_SHIPPED = /planned|upcoming|roadmap|todo|coming|future|wishlist|non-?goals|flags?/i;

/** A line that can be part of a prose paragraph (not markup-only). */
function isProse(text) {
  if (!text.trim()) return false;
  if (heading(text) || bullet(text)) return false;
  if (/^\s*(!\[|\[!\[|<|>|\||-{3,}|={3,}|\*{3,})/.test(text)) return false;
  return stripInline(text).length > 0;
}

export function collect(ctx) {
  const file = ctx.files.find((f) => /^readme\.md$/i.test(f));
  if (!file) return [];
  const lines = mdLines(ctx.read(file));
  const out = [];
  const hasH1 = lines.some((l) => !l.code && heading(l.text)?.level === 1);

  let seenH1 = false;
  let taglineDone = false;
  let featureLevel = 0; // >0 while inside a "Features" section of that heading level
  let skipLevel = 0; // >0 while inside a NOT_SHIPPED section (e.g. "Planned features") of that level
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.code) continue;
    const h = heading(l.text);
    if (h) {
      if (h.level === 1 && !seenH1) {
        seenH1 = true;
        if (h.text) {
          out.push({ kind: 'app.name', value: h.text, display: h.text,
            source: { file, locator: `line:${l.n}`, extractor: 'readme-h1', rule: 'README first H1 → app.name (fallback when no manifest name)' } });
        }
      }
      if (featureLevel && h.level <= featureLevel) featureLevel = 0;
      if (skipLevel && h.level <= skipLevel) skipLevel = 0;
      if (NOT_SHIPPED.test(h.text)) skipLevel ||= h.level;
      else if (/features?/i.test(h.text)) featureLevel = h.level;
      continue;
    }
    if (featureLevel && !skipLevel) {
      const item = bullet(l.text);
      const title = item === null ? '' : itemTitle(item);
      if (title) {
        out.push({ kind: 'feature', value: title, display: title,
          source: { file, locator: `line:${l.n}`, extractor: 'readme-features', rule: `README bullets under a /features?/i heading → feature (not under a heading matching ${NOT_SHIPPED}: unbuilt work and flags are not shipped features)` } });
      }
    }
    // Tagline: the first prose paragraph after the first H1 (or anywhere, without an H1).
    if (!taglineDone && (seenH1 || !hasH1) && isProse(l.text)) {
      taglineDone = true;
      const para = [];
      let j = i;
      while (j < lines.length && !lines[j].code && isProse(lines[j].text)) para.push(lines[j++].text);
      const text = stripInline(para.join(' '));
      const m = /^(.*?[.!?])(?=\s|$)/u.exec(text);
      const sentence = m ? m[1] : text;
      if (sentence.length <= TAGLINE_MAX) {
        out.push({ kind: 'app.tagline', value: sentence, display: sentence,
          source: { file, locator: `line:${l.n}`, extractor: 'readme-tagline', rule: `README first paragraph, first sentence (≤ ${TAGLINE_MAX} chars) → app.tagline` } });
      }
    }
  }
  return out;
}
