// Minimal Markdown helpers for facts (README + Serena memories). Dependency-free.

/** Split into lines, marking fenced-code lines so callers can skip them. */
export function mdLines(text) {
  const out = [];
  let fence = null;
  let i = 0;
  const lines = text.split(/\r?\n/);
  // YAML front matter (Serena memories) is not content.
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      for (; i <= end; i++) out.push({ n: i + 1, text: lines[i], code: true });
    }
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (fence === null) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      out.push({ n: i + 1, text: line, code: true });
      continue;
    }
    out.push({ n: i + 1, text: line, code: fence !== null });
  }
  return out;
}

/** ATX heading → {level, text} (text with inline markup stripped), else null. */
export function heading(line) {
  const m = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
  return m ? { level: m[1].length, text: stripInline(m[2]) } : null;
}

/** Top-level (unindented) list item → raw item text, else null. */
export function bullet(line) {
  const m = /^(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/.exec(line);
  return m ? m[1] : null;
}

/** Top-level (unindented) ORDERED list item ("1. x" / "1) x") → raw item text, else null. */
export function orderedItem(line) {
  const m = /^\d+[.)]\s+(.*\S)\s*$/.exec(line);
  return m ? m[1] : null;
}

/** Remove images, unwrap links, drop emphasis/code markers, collapse whitespace. */
export function stripInline(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Title of a list item: a leading **bold** or [link] is the title; otherwise the text
 * before the first " — ", " – ", " - " or ": " separator.
 */
export function itemTitle(raw) {
  const lead = /^(?:\*\*(.+?)\*\*|__(.+?)__|\[([^\]]+)\]\([^)]*\))/.exec(raw);
  if (lead) return stripInline(lead[1] ?? lead[2] ?? lead[3]);
  return stripInline(raw).split(/ [—–-] |: /)[0].trim();
}
