// Source 3b: pyproject.toml ([project]) + requirements.txt → app.name, app.tagline,
// stack.item (whitelist), command ([project.scripts]). Minimal TOML reader (strings and
// string arrays only) — enough for the keys we read, dependency-free.
import { ShowreelError } from '../../util/out.mjs';

const PYPROJECT = 'pyproject.toml';
const REQUIREMENTS = 'requirements.txt';

/** Whitelist, in emission order: normalized distribution name → display. */
export const PY_STACK = [
  ['fastapi', 'FastAPI'],
  ['django', 'Django'],
  ['flask', 'Flask'],
  ['sqlalchemy', 'SQLAlchemy'],
  ['pydantic', 'Pydantic'],
  ['pytest', 'pytest'],
  ['uvicorn', 'Uvicorn'],
  ['starlette', 'Starlette'],
  ['djangorestframework', 'Django REST framework'],
  ['celery', 'Celery'],
  ['alembic', 'Alembic'],
  ['gunicorn', 'Gunicorn'],
  ['streamlit', 'Streamlit'],
  ['langchain', 'LangChain'],
];

const normName = (s) => s.toLowerCase().replace(/[_.]+/g, '-');
const DIST_NAME = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;

/** Scan a line, honoring quotes: returns the text before an unquoted '#'. */
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '\\' && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}

function bracketDepth(s) {
  let q = null;
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\' && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '[') d++;
    else if (c === ']') d--;
  }
  return d;
}

const SIMPLE_ESCAPES = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', e: '\x1b', '"': '"', '\\': '\\' };

/** Decode a TOML basic-string body (TOML 1.0 escapes + 1.1 \e). Unknown escapes fail loud. */
function decodeBasic(body) {
  return body.replace(/\\(?:u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|([\s\S]))/g, (esc, u4, u8, ch) => {
    const hex = u4 ?? u8;
    if (hex !== undefined) {
      const cp = parseInt(hex, 16);
      if (cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff)) return String.fromCodePoint(cp);
    } else if (Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, ch)) {
      return SIMPLE_ESCAPES[ch];
    }
    throw new ShowreelError(
      'E_TOML',
      `Cannot parse string in ${PYPROJECT}: invalid escape "${esc}" in "${body}"`,
      `Fix the string escape in ${PYPROJECT} (TOML allows \\b \\t \\n \\f \\r \\e \\" \\\\ \\uXXXX \\UXXXXXXXX), or report it.`,
    );
  });
}

function strings(raw) {
  if (typeof raw === 'object') return [raw.str]; // an already-decoded multi-line string
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g;
  let m;
  while ((m = re.exec(raw))) out.push(m[1] !== undefined ? decodeBasic(m[1]) : m[2]);
  return out;
}

/**
 * Index of the closing delimiter in text. In a """basic""" string a backslash escapes the next
 * character, so `\"` never starts the closing """ (an even run of backslashes escapes itself).
 */
function findClose(text, delim) {
  if (delim !== '"""') return text.indexOf(delim);
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text.startsWith(delim, i)) return i;
  }
  return -1;
}

/**
 * Multi-line """basic""" / '''literal''' string starting after the opening delimiter on
 * lines[i]. Stores { str } (decoded) under key; returns the index of the closing line.
 * Unterminated → E_TOML (never a silently empty name/description).
 */
function readMultiline(lines, i, first, delim, rawKey, table) {
  const key = rawKey.replace(/^["']|["']$/g, '');
  let text = first;
  let end = findClose(text, delim);
  while (end < 0) {
    if (i + 1 >= lines.length) {
      throw new ShowreelError(
        'E_TOML',
        `Cannot parse ${PYPROJECT}: unterminated multi-line string for "${key}"`,
        `Close the ${delim} string for "${key}" in ${PYPROJECT}.`,
      );
    }
    text += '\n' + lines[++i];
    end = findClose(text, delim);
  }
  // TOML allows one or two quote characters right before the closing delimiter.
  const firstEnd = end;
  while (end < firstEnd + 2 && text[end + 3] === delim[0]) end++;
  let body = text.slice(0, end).replace(/^\n/, ''); // a newline right after the opener is trimmed
  if (delim === '"""') {
    // Line-ending backslash: drop it plus all following whitespace/newlines (an escaped \\ stays).
    body = body.replace(/(\\+)[ \t]*\n\s*/g, (m, bs) => (bs.length % 2 ? bs.slice(1) : m));
    body = decodeBasic(body);
  }
  table[key] = { str: body };
  return i;
}

/** → { '<table>': { key: rawValue } } for [table] headers and key = value lines. */
export function parseToml(text) {
  const tables = { '': {} };
  let cur = '';
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (!line) continue;
    if (line.startsWith('[[')) { cur = null; continue; } // arrays of tables: not read
    const h = /^\[\s*([^[\]]+?)\s*\]$/.exec(line);
    if (h) { cur = h[1]; tables[cur] ??= {}; continue; }
    const kv = /^("[^"]+"|'[^']+'|[A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv || cur === null) continue;
    const ml = /^("""|''')/.exec(kv[2]);
    if (ml) {
      // Multi-line string: read raw lines (a '#' inside is content) up to the closing delimiter.
      const raw = lines[i];
      const at = raw.indexOf(ml[1], raw.indexOf('='));
      i = readMultiline(lines, i, raw.slice(at + 3), ml[1], kv[1], tables[cur]);
      continue;
    }
    let val = kv[2];
    while (bracketDepth(val) > 0 && i + 1 < lines.length) val += '\n' + stripComment(lines[++i]);
    tables[cur][kv[1].replace(/^["']|["']$/g, '')] = val;
  }
  return tables;
}

export function collect(ctx) {
  const out = [];
  const add = (kind, display, file, locator, extractor, rule) =>
    out.push({ kind, value: display, display, source: { file, locator, extractor, rule } });
  const addStack = (names, file, locator, extractor, rule) => {
    const have = new Set(names.map(normName));
    for (const [name, display] of PY_STACK) if (have.has(name)) add('stack.item', display, file, locator, extractor, rule);
  };

  if (ctx.has(PYPROJECT)) {
    const t = parseToml(ctx.read(PYPROJECT));
    const project = t.project ?? {};
    const name = project.name !== undefined ? strings(project.name)[0] : undefined;
    if (name && name.trim()) add('app.name', name.trim(), PYPROJECT, 'project.name', 'pyproject', 'pyproject.toml [project].name → app.name');
    const desc = project.description !== undefined ? strings(project.description)[0] : undefined;
    if (desc && desc.trim()) add('app.tagline', desc.trim(), PYPROJECT, 'project.description', 'pyproject', 'pyproject.toml [project].description → app.tagline');
    if (project.dependencies !== undefined) {
      const names = strings(project.dependencies).map((d) => (DIST_NAME.exec(d) || [])[1]).filter(Boolean);
      addStack(names, PYPROJECT, 'project.dependencies', 'pyproject', 'pyproject.toml [project].dependencies whitelist → stack.item');
    }
    for (const key of Object.keys(t['project.scripts'] ?? {}).sort()) {
      add('command', key, PYPROJECT, `project.scripts.${key}`, 'pyproject', 'pyproject.toml [project.scripts] name → command');
    }
  }

  if (ctx.has(REQUIREMENTS)) {
    const names = [];
    for (const raw of ctx.read(REQUIREMENTS).split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line || line.startsWith('-')) continue;
      const m = DIST_NAME.exec(line);
      if (m) names.push(m[1]);
    }
    addStack(names, REQUIREMENTS, 'names', 'requirements-txt', 'requirements.txt package names whitelist → stack.item');
  }
  return out;
}
