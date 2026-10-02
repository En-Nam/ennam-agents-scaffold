// Facts extractor (C3). Every fact is code-derived, carries the rule that produced it, and
// has a stable id for the same repo state. Commit-dependent data goes to meta only (B5).
import { createHash } from 'node:crypto';
import { walkFiles, readText, IGNORED_DESCRIPTION } from './walk.mjs';
import { evaluateGate } from './gate.mjs';
import * as serena from './sources/serena.mjs';
import * as readme from './sources/readme.mjs';
import * as node from './sources/node.mjs';
import * as python from './sources/python.mjs';
import * as dotnet from './sources/dotnet.mjs';
import * as routes from './sources/routes.mjs';
import { gitMeta } from './sources/git.mjs';

/** Sources in Knowledge Source Priority order (git → meta only). */
const SOURCES = [serena, readme, node, python, dotnet, routes];

/** facts.json array order: by kind, then extraction order. */
const KIND_ORDER = ['app.name', 'app.tagline', 'feature', 'stack.item', 'command', 'route', 'problem', 'count'];
const COLLECTION = { 'app.tagline': 'taglines', feature: 'features', 'stack.item': 'integrations', command: 'commands', route: 'routes', problem: 'problems' };

/** count facts emitted when the base > 0, in this order. */
const COUNTS = [['route', 'routes'], ['stack.item', 'integrations'], ['command', 'commands'], ['feature', 'features']];
const TEST_FILE = (f) => /\.(test|spec)\.[^/]+$/.test(f) || /(^|\/)tests\/(.*\/)?test_[^/]*\.py$/.test(f);
const TEST_RULE = `files matching **/*.{test,spec}.* or tests/**/test_*.py (ignoring ${IGNORED_DESCRIPTION})`;

const hashOf = (f) =>
  'sha256:' + createHash('sha256').update(`${f.kind}|${f.value}|${f.source.file}|${f.source.locator}`).digest('hex').slice(0, 16);

/**
 * → { facts: <facts.json document (C3)>, meta: <build/facts.meta.json document> }.
 * Throws ShowreelError (e.g. E_JSON for a malformed package.json) — never skips silently.
 */
export async function extractFacts(hostRoot) {
  const files = walkFiles(hostRoot);
  const fileSet = new Set(files);
  const ctx = { root: hostRoot, files, has: (rel) => fileSet.has(rel), read: (rel) => readText(hostRoot, rel) };

  const candidates = SOURCES.flatMap((s) => s.collect(ctx)).filter((c) => c.display.trim() !== '');

  // app.name: a manifest name wins; the README H1 is the fallback. Exactly one.
  const names = candidates.filter((c) => c.kind === 'app.name');
  const name = names.find((c) => c.source.extractor !== 'readme-h1') ?? names[0];
  const seen = new Set();
  const picked = [];
  for (const c of candidates) {
    if (c.kind === 'app.name' && c !== name) continue;
    const key = `${c.kind}\u0000${c.display}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(c);
  }

  const byKind = new Map(KIND_ORDER.map((k) => [k, []]));
  for (const c of picked) byKind.get(c.kind).push(c);
  for (const [kind, unit] of COUNTS) {
    const n = byKind.get(kind).length;
    if (n > 0) {
      byKind.get('count').push({ kind: 'count', value: n, display: String(n), unit,
        source: { file: '.', locator: `facts:${kind}`, extractor: 'count', rule: `number of ${kind} facts extracted above → count (${unit})` } });
    }
  }
  const tests = files.filter(TEST_FILE).length;
  if (tests > 0) {
    byKind.get('count').push({ kind: 'count', value: tests, display: String(tests), unit: 'tests',
      source: { file: '.', locator: 'glob:tests', extractor: 'count', rule: TEST_RULE } });
  }

  // collection: a source-declared one (README ordered steps: readme.steps.<n>) wins over the per-kind default;
  // order = position within the collection (for an ordered list: its sequence). sequence is set ONLY by a source
  // that read an explicitly ordered list (ruling f) — extraction order is never a sequence.
  const facts = [];
  const orderIn = new Map();
  for (const kind of KIND_ORDER) {
    byKind.get(kind).forEach((c, i) => {
      const collection = c.collection ?? (Object.prototype.hasOwnProperty.call(COLLECTION, kind) ? COLLECTION[kind] : null);
      if (collection !== null) orderIn.set(collection, c.sequence ?? (orderIn.get(collection) ?? 0) + 1);
      facts.push({
        id: `f.${kind}.${i + 1}`,
        kind,
        value: c.value,
        display: c.display,
        unit: kind === 'count' ? c.unit : null,
        source: c.source,
        collection,
        order: collection !== null ? orderIn.get(collection) : null,
        sequence: c.sequence ?? null,
        hash: hashOf(c),
      });
    });
  }

  const appName = facts.find((f) => f.kind === 'app.name');
  const doc = {
    version: 1,
    minimumGate: evaluateGate(facts),
    brand: { name: appName ? appName.display : '', palette: 'violet', wordmark: appName ? appName.id : null },
    facts,
  };
  const meta = { version: 1, generatedAt: new Date().toISOString(), git: gitMeta(hostRoot) };
  return { facts: doc, meta };
}
