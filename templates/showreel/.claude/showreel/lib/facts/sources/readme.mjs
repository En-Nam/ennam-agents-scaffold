// Source 2: README.md → app.name (fallback only), app.tagline, feature bullets, ordered steps.
import { mdLines, heading, bullet, orderedItem, itemTitle, stripInline } from '../md.mjs';

const TAGLINE_MAX = 120;
/** "Features"-ish headings whose bullets are NOT shipped features (unbuilt work, config flags). */
const NOT_SHIPPED = /planned|upcoming|roadmap|todo|coming|future|wishlist|non-?goals|flags?/i;
/**
 * H2/H3 headings whose ORDERED lists are an explicit sequence (orchestrator ruling f). Only these items get a
 * `sequence`: extraction order is never an order the README claims, so nothing else may be drawn as steps in order.
 */
const STEPS = /getting started|quick ?start|setup|install(ation)?|usage|how it works|steps/i;
/** A backtick-free command line: a known runner/tool first (lower-case, so prose like "Make sure…" is not one). */
const COMMAND_LINE = /^(?:\$\s+)?(?:npm|npx|pnpm|yarn|bun|bunx|node|deno|python3?|pip3?|pipx|uv|uvx|poetry|pipenv|uvicorn|pytest|dotnet|docker|docker-compose|make|git|cargo|go|mvn|gradle|bundle|rails|php|composer)(?:\s+\S.*)?$/;
const STEP_RULE = `README ordered list items (1. / 1)) under an H2/H3 heading matching ${STEPS} → steps in order: collection readme.steps.<n> (n = n-th sequence in the file), sequence = the item's list number as the README renders it (a list's written start number + item position; code fences, blank lines and prose between items do not split it while the numbers keep increasing — a number that does not increase, or a non-steps heading, starts the next collection); command when the item is a single code span or a bare command line, else feature`;

/** One ordered-list item → a step candidate, or null when it has no title (its number stays a gap). */
function stepFact(raw, file, line, n, pos) {
  const text = raw.trim();
  const span = /^`([^`]+)`$/.exec(text);
  const bare = !text.includes('`') && COMMAND_LINE.test(text) ? text.replace(/^\$\s+/, '') : null;
  const cmd = span ? span[1].trim() : bare;
  const kind = cmd ? 'command' : 'feature';
  // "Install dependencies:" introduces the fenced command below it; the colon is layout, not the step's name
  const display = cmd ?? itemTitle(text).replace(/\s*:$/, '');
  if (!display) return null;
  return { kind, value: display, display, collection: `readme.steps.${n}`, sequence: pos,
    source: { file, locator: `line:${line}`, extractor: 'readme-steps', rule: STEP_RULE } };
}

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
  let stepHeading = false; // the most recent heading is an H2/H3 STEPS heading (outside a NOT_SHIPPED section)
  // steps = the open sequence {n, last}: kept across fences / blank lines / prose while the numbers keep increasing.
  // run = the contiguous Markdown list the last item belonged to {next}: within one list the README renders
  // start + position (so lazy "1. 1. 1." reads 1, 2, 3); a fence or unindented prose ends the list, not the sequence.
  let steps = null;
  let run = null;
  let stepLists = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.code) {
      if (/^\S/.test(l.text)) run = null; // an unindented fence ends the Markdown list (not the sequence)
      continue;
    }
    const h = heading(l.text);
    if (h) {
      run = null;
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
      stepHeading = (h.level === 2 || h.level === 3) && !skipLevel && STEPS.test(h.text);
      if (!stepHeading) steps = null; // a non-steps heading ends the sequence
      continue;
    }
    const ordered = stepHeading ? orderedItem(l.text) : null;
    if (ordered !== null) {
      const num = run ? run.next : ordered.num;
      run = { next: num + 1 };
      if (!steps || num <= steps.last) steps = { n: ++stepLists, last: 0 }; // numbering restarted → next sequence
      steps.last = num;
      const step = stepFact(ordered.text, file, l.n, steps.n, num);
      if (step) out.push(step);
      continue; // a step is never also a feature bullet
    }
    if (run && l.text.trim() && /^\S/.test(l.text)) run = null; // unindented non-item text ends the Markdown list
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
