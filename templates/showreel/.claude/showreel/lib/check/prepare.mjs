// `check` core (Task 8), shared by check and render:
//   prepare()   facts + storyboard → validate → resolve → compile → write build/{resolved,timeline}.json
//               (pure Node; fails BEFORE any browser starts)
//   fitInPage() in-browser text fit + glyph coverage → fitSizePx into resolved.json, or E_TEXT_FIT / E_GLYPH
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ShowreelError } from '../util/out.mjs';
import { readJson, stableStringify } from '../util/json.mjs';
import { paths } from '../util/paths.mjs';
import { resolve } from '../truth/resolve.mjs';
import { compileTimeline } from '../compile/timeline.mjs';

const ARCHETYPES = new URL('../../archetypes/archetypes.json', import.meta.url);
const PHRASES = new URL('../../phrases.json', import.meta.url);

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableStringify(value));
}

/** Facts (gate passed) + storyboard + toolkit tables. Missing inputs fail with the command that makes them. */
export function loadInputs(hostRoot) {
  const p = paths(hostRoot);
  const factsPath = join(hostRoot, p.facts);
  if (!existsSync(factsPath)) {
    throw new ShowreelError('E_NO_FACTS', `No ${p.facts} in ${hostRoot}.`, 'run: node .claude/showreel/cli.mjs facts');
  }
  const facts = readJson(factsPath);
  if (!facts.minimumGate || facts.minimumGate.passed !== true) {
    const missing = (facts.minimumGate && facts.minimumGate.missing) || [];
    throw new ShowreelError(
      'E_THIN_REPO',
      `Not enough code facts for an honest film: missing ${missing.join(', ') || 'unknown'}`,
      'This add-on targets code repos; doc-first repos (hr, accounting, ba) are not supported in v1.',
    );
  }
  const sbPath = join(hostRoot, p.storyboard);
  if (!existsSync(sbPath)) {
    throw new ShowreelError(
      'E_NO_STORYBOARD',
      `No ${p.storyboard} in ${hostRoot}.`,
      `Write ${p.storyboard} from the facts digest (fact/phrase ids only), then re-run: node .claude/showreel/cli.mjs check`,
    );
  }
  return { facts, storyboard: readJson(sbPath), archetypes: readJson(ARCHETYPES), phrases: readJson(PHRASES) };
}

/** → {facts, storyboard, resolved, timeline}; writes build/resolved.json + build/timeline.json. */
export function prepare(hostRoot, { fps }) {
  const p = paths(hostRoot);
  const { facts, storyboard, archetypes, phrases } = loadInputs(hostRoot);
  const resolved = resolve(storyboard, { archetypes, facts, phrases });
  const timeline = compileTimeline(storyboard, resolved, archetypes, { fps });
  writeJson(join(hostRoot, p.resolved), resolved);
  writeJson(join(hostRoot, p.timeline), timeline);
  return { facts, storyboard, resolved, timeline };
}

const hex = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

/**
 * Text fit + glyph coverage in a ready engine page. Writes fitSizePx into resolved.json.
 * A null fit (text below the family minimum) → E_TEXT_FIT; any uncovered glyph → E_GLYPH. Every
 * offending beat/slot is listed, never just the first.
 */
export async function fitInPage(hostRoot, page, resolved) {
  const [fit, gaps] = await page.evaluate(() => [window.SHOWREEL.fit(), window.SHOWREEL.glyphGaps()]);
  const tooLong = [];
  for (const [beatId, beat] of Object.entries(resolved.beats)) {
    for (const [slot, s] of Object.entries(beat.slots)) {
      if (!s.items.length) continue;
      const px = fit[beatId] ? fit[beatId][slot] : undefined;
      if (px === undefined) throw new Error(`engine reported no fit for ${beatId}.${slot}`); // engine contract bug
      if (px === null) {
        const worst = s.items.reduce((a, it) => ([...it.text].length > [...a.text].length ? it : a));
        tooLong.push(`${beatId}.${slot} (${worst.id}, ${[...worst.text].length} chars: "${worst.text}")`);
      }
      s.fitSizePx = px;
    }
  }
  if (tooLong.length) {
    throw new ShowreelError(
      'E_TEXT_FIT',
      `Text does not fit at the minimum size (it would be clipped): ${tooLong.join('; ')}`,
      'Bind a shorter fact to that slot, fewer items, or another archetype/variant, then re-run check.',
    );
  }
  if (gaps.length) {
    throw new ShowreelError(
      'E_GLYPH',
      `The shipped fonts cannot draw: ${gaps.map((g) => `"${g.char}" ${hex(g.char)} in ${g.beatId}.${g.slot}`).join('; ')}`,
      'Bind a different fact/phrase to that slot (no tofu is ever rendered).',
    );
  }
  writeJson(join(hostRoot, paths(hostRoot).resolved), resolved);
  return { fit };
}
