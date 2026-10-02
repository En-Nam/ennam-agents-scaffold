// Deterministic JSON I/O (C2). Every committed JSON goes through stableStringify.
import { readFileSync } from 'node:fs';
import { ShowreelError } from './out.mjs';

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out = {};
    // Code-unit order, never locale order: byte-stable across machines.
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

/** Sorted keys, 2-space indent, trailing '\n'. */
export function stableStringify(obj) {
  return JSON.stringify(sortKeys(obj), null, 2) + '\n';
}

/** Parse a JSON file; failures throw ShowreelError('E_JSON') naming the file (and line/column for syntax errors). */
export function readJson(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new ShowreelError('E_JSON', `Cannot read ${path}: ${err.code || err.message}`, `Check that ${path} exists and is readable.`);
  }
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    const m = /position (\d+)/.exec(err.message);
    let where = '';
    if (m) {
      const pos = Number(m[1]);
      const before = text.slice(0, pos).split('\n');
      where = ` at line ${before.length}, column ${before[before.length - 1].length + 1}`;
    }
    throw new ShowreelError('E_JSON', `Invalid JSON in ${path}${where}: ${err.message}`, `Fix the JSON syntax in ${path}.`);
  }
}
