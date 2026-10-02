// `facts` command: writes showreel/facts.json (+ showreel/build/facts.meta.json) and prints
// ok('facts', {count, gate, digest, truncated}) — or E_THIN_REPO when the minimum gate fails
// (facts.json is still written, with minimumGate.passed:false).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ok, fail, ShowreelError } from '../util/out.mjs';
import { readJson, stableStringify } from '../util/json.mjs';
import { validate } from '../util/schema.mjs';
import { paths } from '../util/paths.mjs';
import { extractFacts } from './extract.mjs';
import { makeDigest } from './digest.mjs';

const CMD = 'facts';
const SCHEMA_PATH = new URL('../../schema/facts.schema.json', import.meta.url);

function writeFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export async function run(args, hostRoot) {
  if (args.length > 0) {
    return fail(CMD, 'E_USAGE', `Unknown argument "${args[0]}" for facts.`, 'Use: node .claude/showreel/cli.mjs facts [--root <dir>]');
  }
  try {
    const { facts, meta } = await extractFacts(hostRoot);
    const errors = validate(readJson(SCHEMA_PATH), facts);
    if (errors.length > 0) {
      throw new ShowreelError(
        'E_FACTS_SCHEMA',
        `Extracted facts violate schema/facts.schema.json: ${errors.slice(0, 5).map((e) => `${e.path} ${e.message}`).join('; ')}`,
        'This is a toolkit bug — report it with the command you ran.',
      );
    }
    const p = paths(hostRoot);
    writeFile(join(hostRoot, p.facts), stableStringify(facts));
    writeFile(join(hostRoot, p.factsMeta), stableStringify(meta));

    const gate = facts.minimumGate;
    if (!gate.passed) {
      return fail(
        CMD,
        'E_THIN_REPO',
        `Not enough code facts for an honest film: missing ${gate.missing.join(', ')}`,
        'This add-on targets code repos; doc-first repos (hr, accounting, ba) are not supported in v1.',
      );
    }
    const { digest, truncated } = makeDigest(facts.facts);
    return ok(CMD, { count: facts.facts.length, gate, digest, truncated });
  } catch (err) {
    if (err instanceof ShowreelError) return fail(CMD, err.code, err.message, err.fix);
    throw err;
  }
}
