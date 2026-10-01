// Source 1 (Knowledge Source Priority): Serena memories → `feature` (≤ 8).
import { mdLines, heading, bullet, itemTitle } from '../md.mjs';

const BASE = '.serena/memories';
const MAX = 8;
/** INDEX.md H2 sections whose bullets are not features ("Backlog", "Active Comms", "Comms", …). */
const SKIP_SECTION = /\b(backlog|comms)\b/i;

export function collect(ctx) {
  const out = [];
  const seen = new Set();
  const push = (display, file, n, extractor, rule) => {
    if (!display || seen.has(display) || out.length >= MAX) return;
    seen.add(display);
    out.push({ kind: 'feature', value: display, display, source: { file, locator: `line:${n}`, extractor, rule } });
  };

  // INDEX.md: list-item titles. Its H1/H2 are the fixed scaffold sections ("Memory Index",
  // "Services", …) — structure, not features — so they are not taken.
  // Bullets under the Backlog / Comms H2s are pending work and memory bookkeeping, not
  // shipped product features, so those sections are skipped.
  const index = `${BASE}/INDEX.md`;
  if (ctx.has(index)) {
    let skip = false;
    for (const l of mdLines(ctx.read(index))) {
      if (l.code) continue;
      const h = heading(l.text);
      if (h && h.level <= 2) skip = h.level === 2 && SKIP_SECTION.test(h.text);
      if (skip) continue;
      const item = bullet(l.text);
      if (item !== null) push(itemTitle(item), index, l.n, 'serena-index', `${index} list-item title → feature (Backlog / Comms sections skipped)`);
    }
  }

  // services/*.md then decisions/*.md: the memory's H1 title.
  for (const dir of ['services', 'decisions']) {
    const prefix = `${BASE}/${dir}/`;
    for (const file of ctx.files) {
      if (!file.startsWith(prefix) || !file.endsWith('.md') || file.slice(prefix.length).includes('/')) continue;
      for (const l of mdLines(ctx.read(file))) {
        if (l.code) continue;
        const h = heading(l.text);
        if (h && h.level === 1) {
          push(h.text, file, l.n, 'serena-memory', `${BASE}/${dir}/*.md H1 title → feature`);
          break;
        }
      }
    }
  }
  return out;
}
