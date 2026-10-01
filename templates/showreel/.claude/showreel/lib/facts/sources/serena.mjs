// Source 1 (Knowledge Source Priority): Serena memories → `feature` (≤ 8).
import { mdLines, heading, bullet, itemTitle } from '../md.mjs';

const BASE = '.serena/memories';
const MAX = 8;
/** The only INDEX.md H2 section whose bullets describe the product. Decisions are design choices,
 * Backlog is unbuilt work, Comms is bookkeeping — none is a shipped feature (orchestrator ruling, M1). */
const FEATURE_SECTION = /^services$/i;

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
  // Only bullets under "## Services" are taken: Decisions/Backlog/Comms are not shipped features.
  const index = `${BASE}/INDEX.md`;
  if (ctx.has(index)) {
    let skip = false;
    for (const l of mdLines(ctx.read(index))) {
      if (l.code) continue;
      const h = heading(l.text);
      if (h && h.level <= 2) skip = !(h.level === 2 && FEATURE_SECTION.test(h.text.trim()));
      if (skip) continue;
      const item = bullet(l.text);
      if (item !== null) push(itemTitle(item), index, l.n, 'serena-index', `${index} "## Services" list-item title → feature (other sections skipped)`);
    }
  }

  // services/*.md: the memory's H1 title (decisions/*.md are design choices, not features).
  for (const dir of ['services']) {
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
