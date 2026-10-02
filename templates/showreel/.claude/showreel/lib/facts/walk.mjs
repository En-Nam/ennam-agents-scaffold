// Deterministic host-repo file walk for the facts extractor (Task 2).
// POSIX separators, code-unit (never locale) sort, symlinks not followed.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShowreelError } from '../util/out.mjs';

/** fs failure (EACCES, EBUSY, …) → E_FACTS_READ naming the path, so the user gets fail JSON. */
function readFail(rel, err, root) {
  return new ShowreelError(
    'E_FACTS_READ',
    `Cannot read "${rel || root}" in the host repo: ${err.code ?? err.message}`,
    'Fix the permissions on that path (or move it out of the repo) and re-run facts.',
  );
}

/** Directory names skipped at any depth. */
const IGNORE_ANY = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', 'bin', 'obj']);
/** Paths (relative to hostRoot) skipped: the toolkit's dep dir and the showreel work dir. */
const IGNORE_ROOT = new Set(['.claude/showreel/.tool', 'showreel']);

export const IGNORED_DESCRIPTION = 'node_modules, .git, dist, build, .next, .venv, bin, obj, .claude/showreel/.tool, showreel/';

/** Every regular file under root (relative POSIX paths), sorted lexicographically. */
export function walkFiles(root) {
  const out = [];
  const visit = (rel) => {
    let entries;
    try {
      entries = readdirSync(rel ? join(root, rel) : root, { withFileTypes: true });
    } catch (err) {
      throw readFail(rel, err, root);
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (IGNORE_ANY.has(e.name) || IGNORE_ROOT.has(r)) continue;
        visit(r);
      } else if (e.isFile()) {
        out.push(r);
      }
    }
  };
  visit('');
  return out.sort();
}

/** Read a host file as UTF-8 text (BOM stripped). */
export function readText(root, rel) {
  let text;
  try {
    text = readFileSync(join(root, rel), 'utf8');
  } catch (err) {
    throw readFail(rel, err, root);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 1-based line number of a character offset. */
export function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
