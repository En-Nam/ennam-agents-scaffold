// Source 4: routes from code — Next.js App Router pages, FastAPI/Flask decorators,
// ASP.NET controllers. Display is the code's own path string (verb-prefixed for APIs).
// Rule 13 / D8: a route is emitted only when the code proves its full path; when a prefix or
// base route cannot be known (non-literal, inherited from code we cannot see, mounted
// elsewhere) the route is omitted, never emitted rootless.
import { lineAt } from '../walk.mjs';

const NEXT_PAGE = /^(?:src\/)?app\/(?:(.*)\/)?page\.(?:tsx|jsx|ts|js)$/;
// Line-anchored: a decorator in a comment never matches; docstrings are masked (maskPython).
const PY_ROUTE = /^[ \t]*@(app|router)\.(get|post|put|delete|patch)\(\s*["']([^"']+)/gm;
const PY_ASSIGN = /^[ \t]*(app|router)[ \t]*(?::[^=\n]*)?=[ \t]*([\w.]+)[ \t]*\(/gm;
// A router mounted elsewhere: FastAPI include_router(...) / Flask register_blueprint(...).
const PY_INCLUDE = /\b(?:include_router|register_blueprint)\s*\(/g;
const CS_CLASS = /\b((?:(?:public|internal|private|protected|sealed|partial|abstract|static)\s+)*)class\s+(\w+)/g;
// [Route("t")] and [Route("t", Name = "X", Order = 1)] (named args do not drop the template).
const CS_ROUTE = /\bRoute\(\s*"([^"]*)"[^)]*\)/;
const CS_ROUTE_G = new RegExp(CS_ROUTE.source, 'g');
// [HttpGet], [HttpGet("t")], [HttpGet("t", Name = "X")], [HttpGet(Name = "X")], and the same
// inside a comma-joined attribute list ([HttpGet, Authorize] / [Authorize, HttpGet("t")]).
const CS_HTTP = /[[,]\s*Http(Get|Post|Put|Delete|Patch)(?:\((?:\s*"([^"]*)")?[^)]*\))?(?=\s*[\],])/g;
const CS_API_ATTR = /[[,]\s*(?:ApiController|Controller)(?:Attribute)?\s*[\](,]/;
const CS_MVC_BASES = new Set(['Controller', 'ControllerBase']);
/** A web project: only then are *Controller classes ASP.NET controllers (not Unity etc.). */
const WEB_CSPROJ = /Microsoft\.NET\.Sdk\.Web\b|Include\s*=\s*"Microsoft\.AspNetCore\./;
/** Python test modules: their throwaway apps' routes are not served by the product. */
const PY_TEST_FILE = /(^|\/)(test_[^/]*|[^/]*_test|conftest)\.py$/;
/** Directories whose code the product does not serve (tests, fixtures, samples, spikes). */
const NON_PRODUCT_DIRS = new Set(['tests', 'test', '__tests__', 'fixtures', 'examples', 'samples', 'spikes']);
const TEST_PROJECT_DIR = /\.(?:Unit|Integration)?Tests$/i;
const NON_PRODUCT_RULE = 'files under tests/, test/, __tests__/, fixtures/, examples/, samples/, spikes/ or a *.Tests / *.UnitTests project dir are skipped';

/** True when a directory segment of file marks non-product code (see NON_PRODUCT_RULE). */
export function nonProductPath(file) {
  return file.split('/').slice(0, -1).some((s) => NON_PRODUCT_DIRS.has(s.toLowerCase()) || TEST_PROJECT_DIR.test(s));
}

function nextRoute(file, m) {
  const segs = m[1] ? m[1].split('/') : [];
  if (segs.some((s) => s.startsWith('_'))) return null; // private folder: not routable
  const kept = segs.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@')); // groups, parallel slots
  const route = '/' + kept.join('/');
  return { kind: 'route', value: route, display: route,
    source: { file, locator: 'path', extractor: 'next-app-routes', rule: 'app/**/page.(tsx|jsx|ts|js) → route path (route groups stripped, [params] kept, _private skipped)' } };
}

/** Same-length copy of Python source with comments and triple-quoted strings blanked. */
function maskPython(text) {
  const out = text.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '#') {
      const e = text.indexOf('\n', i);
      const end = e < 0 ? text.length : e;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      const triple = text.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      let j = i + q.length;
      while (j < text.length && !text.startsWith(q, j)) {
        if (text[j] === '\\') j++;
        else if (!triple && text[j] === '\n') break;
        j++;
      }
      const end = Math.min(text.length, text.startsWith(q, j) ? j + q.length : j);
      if (triple) blank(i, end);
      i = end;
    } else i++;
  }
  return out.join('');
}

/** Text between the '(' at open and its matching ')' (string-aware), or null. */
function callArgs(text, open) {
  let d = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (c === '(') d++;
    else if (c === ')' && --d === 0) return text.slice(open + 1, i);
  }
  return null;
}

// FastAPI APIRouter/include_router `prefix=`; Flask Blueprint/register_blueprint `url_prefix=`.
const hasPrefixKw = (args) => /(?:^|[\s,(])(?:url_)?prefix\s*=/.test(args);

/** `prefix=` / `url_prefix=` of a call's args: '' when absent, the literal when a plain string, else null. */
function literalPrefix(args) {
  if (args === null) return null;
  if (!hasPrefixKw(args)) return '';
  const m = /(?:^|[\s,(])(?:url_)?prefix\s*=\s*(["'])([^"'\\\n]*)\1\s*(?:,|$)/.exec(args);
  return m ? m[2] : null;
}

/** Does any product .py file call include_router(..., prefix=...) / register_blueprint(..., url_prefix=...)? (mount prefix unknowable) */
function repoIncludePrefix(pyFiles, ctx) {
  for (const file of pyFiles) {
    const text = ctx.read(file);
    if (!text.includes('include_router') && !text.includes('register_blueprint')) continue;
    const masked = maskPython(text);
    PY_INCLUDE.lastIndex = 0;
    let m;
    while ((m = PY_INCLUDE.exec(masked))) {
      const args = callArgs(masked, m.index + m[0].length - 1);
      if (args === null || hasPrefixKw(args)) return true;
    }
  }
  return false;
}

const PY_RULE = '@(app|router).(get|post|put|delete|patch)("<path>") at line start (not in comments/docstrings) → "<VERB> <prefix><path>"; '
  + '<prefix> = literal prefix= (FastAPI APIRouter) or url_prefix= (Flask Blueprint) of that name\'s constructor in the same file; routes of a router whose prefix is not a string literal, '
  + 'a "router" not assigned in that file, or any router when the repo has include_router(..., prefix=...) or register_blueprint(..., url_prefix=...) are NOT emitted (real path unknowable); '
  + `test_*.py, *_test.py, conftest.py skipped; ${NON_PRODUCT_RULE}`;

function pythonRoutes(file, text, includePrefix) {
  const out = [];
  const masked = maskPython(text);
  // name → prefix ('' | literal) or null (unknowable); kind router/app.
  const objs = new Map();
  PY_ASSIGN.lastIndex = 0;
  let m;
  while ((m = PY_ASSIGN.exec(masked))) {
    const isRouter = /(^|\.)APIRouter$/.test(m[2]) || (m[1] === 'router' && !/(^|\.)(FastAPI|Flask)$/.test(m[2]));
    const prefix = literalPrefix(callArgs(masked, m.index + m[0].length - 1));
    const prev = objs.get(m[1]);
    const conflict = prev && (prev.prefix !== prefix || prev.isRouter !== isRouter);
    objs.set(m[1], conflict ? { prefix: null, isRouter: true } : { prefix, isRouter });
  }
  PY_ROUTE.lastIndex = 0;
  while ((m = PY_ROUTE.exec(masked))) {
    const obj = objs.get(m[1]) ?? (m[1] === 'router' ? { prefix: null, isRouter: true } : { prefix: '', isRouter: false });
    if (obj.prefix === null) continue;
    if (obj.isRouter && includePrefix) continue;
    const route = `${m[2].toUpperCase()} ${obj.prefix}${m[3]}`;
    out.push({ kind: 'route', value: route, display: route,
      source: { file, locator: `line:${lineAt(text, m.index)}`, extractor: 'python-decorators', rule: PY_RULE } });
  }
  return out;
}

/**
 * Attribute blocks in a class body: a run of `[...]` attributes that starts a line
 * (e.g. `[HttpGet]` + `[Route("featured")]`) — the attributes of one member. Bracket- and
 * string-aware, so `[Route("api/[controller]")]` is one attribute.
 */
function attrBlocks(body) {
  const out = [];
  const close = (i) => { // i at '[' → index just past its matching ']' (or -1)
    let d = 0;
    for (; i < body.length; i++) {
      const ch = body[i];
      if (ch === '"') {
        for (i++; i < body.length && body[i] !== '"'; i++) if (body[i] === '\\') i++;
      } else if (ch === '[') d++;
      else if (ch === ']' && --d === 0) return i + 1;
    }
    return -1;
  };
  const LINE_START = /^[ \t]*\[/gm;
  let m;
  while ((m = LINE_START.exec(body))) {
    const start = m.index + m[0].length - 1;
    let end = close(start);
    if (end < 0) break;
    for (;;) {
      const ws = /^\s*/.exec(body.slice(end))[0].length;
      if (body[end + ws] !== '[') break;
      const next = close(end + ws);
      if (next < 0) break;
      end = next;
    }
    out.push({ index: start, end, text: body.slice(start, end) });
    LINE_START.lastIndex = end;
  }
  return out;
}

/**
 * Same-length copy of C# source with comments blanked (and, with strings=true, string
 * contents too — for structural scans: braces/semicolons/"class" inside strings ignored).
 */
function maskCs(text, strings) {
  const out = text.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  for (let i = 0; i < text.length;) {
    if (text.startsWith('//', i)) {
      let e = text.indexOf('\n', i);
      if (e < 0) e = text.length;
      blank(i, e);
      i = e;
    } else if (text.startsWith('/*', i)) {
      let e = text.indexOf('*/', i + 2);
      e = e < 0 ? text.length : e + 2;
      blank(i, e);
      i = e;
    } else if (text[i] === '"') {
      const verbatim = text[i - 1] === '@' || (text[i - 1] === '$' && text[i - 2] === '@');
      let j = i + 1;
      for (; j < text.length; j++) {
        if (verbatim) {
          if (text[j] === '"') { if (text[j + 1] === '"') { j++; continue; } break; }
        } else if (text[j] === '\\') j++;
        else if (text[j] === '"' || text[j] === '\n') break;
      }
      if (strings) blank(i + 1, j);
      i = j + 1;
    } else if (text[i] === "'") {
      let j = i + 1;
      for (; j < text.length && text[j] !== "'" && text[j] !== '\n'; j++) if (text[j] === '\\') j++;
      i = j + 1;
    } else i++;
  }
  return out.join('');
}

/** First entry of a class base list (the base class, if any), namespace and generics stripped. */
function firstBase(header) {
  let h = header;
  while (/<[^<>]*>/.test(h)) h = h.replace(/<[^<>]*>/g, '');
  h = h.replace(/^\s*\([^()]*\)/, ''); // C# 12 primary constructor
  const m = /^\s*:\s*([\w.]+)/.exec(h);
  return m ? m[1].split('.').pop() : null;
}

/** Every class declaration in one .cs file, with its own class-level attributes. */
function csClasses(file, text) {
  const nc = maskCs(text, false);
  const st = maskCs(text, true);
  const out = [];
  CS_CLASS.lastIndex = 0;
  let m;
  while ((m = CS_CLASS.exec(st))) {
    const open = st.indexOf('{', m.index + m[0].length);
    const semi = st.indexOf(';', m.index + m[0].length);
    if (open < 0 || (semi >= 0 && semi < open)) continue;
    let d = 0;
    let close = st.length;
    for (let i = open; i < st.length; i++) {
      if (st[i] === '{') d++;
      else if (st[i] === '}' && --d === 0) { close = i + 1; break; }
    }
    const before = st.slice(0, m.index);
    const attrStart = Math.max(before.lastIndexOf('}'), before.lastIndexOf(';'), before.lastIndexOf('{')) + 1;
    const attrs = nc.slice(attrStart, m.index);
    out.push({
      file, text, nc, st, index: m.index, bodyEnd: close,
      abstract: /\babstract\b/.test(m[1]), name: m[2],
      base: firstBase(st.slice(m.index + m[0].length, open)),
      route: (CS_ROUTE.exec(attrs) || [])[1],
      area: (/\bArea\(\s*"([^"]*)"/.exec(attrs) || [])[1],
      api: CS_API_ATTR.test(attrs),
    });
  }
  return out;
}

/**
 * Walk the base-class chain through the scanned classes: [Route], [Area] and
 * [ApiController]/[Controller] are inherited. resolved=false when a base is not in the repo
 * (or ambiguous), so an inherited [Route] may exist that we cannot see.
 */
function chain(c, index) {
  let { route, area, api } = c;
  const seen = new Set([c]);
  for (let cur = c; ;) {
    if (!cur.base) return { isController: api, resolved: true, route, area };
    if (CS_MVC_BASES.has(cur.base)) return { isController: true, resolved: true, route, area };
    const decls = index.get(cur.base) ?? [];
    if (decls.length !== 1 || seen.has(decls[0])) return { isController: api, resolved: false, route, area };
    cur = decls[0];
    seen.add(cur);
    route ??= cur.route;
    area ??= cur.area;
    api ||= cur.api;
  }
}

/** Action name for [action]: [ActionName("x")], else the method after the block ("Async" suffix dropped, as ASP.NET Core does by default). */
function actionName(c, blockText, afterBlock) {
  const named = /\bActionName\(\s*"([^"]*)"/.exec(blockText);
  if (named) return named[1];
  const paren = c.st.indexOf('(', afterBlock);
  if (paren < 0) return null;
  const seg = c.st.slice(afterBlock, paren);
  if (/[{};=[\]]/.test(seg)) return null;
  const m = /(\w+)\s*(?:<[^<>]*>)?\s*$/.exec(seg);
  if (!m) return null;
  return m[1].length > 5 && m[1].endsWith('Async') ? m[1].slice(0, -5) : m[1];
}

const CS_RULE = 'ASP.NET controllers only (base chain reaches Controller/ControllerBase, or [ApiController]/[Controller]; a .csproj with Microsoft.NET.Sdk.Web or a Microsoft.AspNetCore.* reference must exist): '
  + '[Route("…")] on the controller or an in-repo base class + [Http<Verb>("…")] (or [Http<Verb>] + [Route("…")]) on the action → "<VERB> /<path>"; '
  + 'an action [Route("…")] without a verb → "/<path>"; [controller] = class name minus "Controller", [action] = method/[ActionName], [area] = [Area("…")]; '
  + 'a route with an unresolvable token, or a relative template under a base class not in the repo, is NOT emitted; '
  + `template-less [Http<Verb>] with no [Route] at all is conventional, not emitted; ${NON_PRODUCT_RULE}`;

function dotnetRoutes(c, index) {
  const out = [];
  if (c.abstract || !c.name.endsWith('Controller') || c.name === 'Controller') return out;
  const ch = chain(c, index);
  if (!ch.isController) return out;
  const name = c.name.slice(0, -'Controller'.length);
  const classRoute = ch.route;
  const baseUnknown = classRoute === undefined && !ch.resolved; // an inherited [Route] we cannot see
  /** Joined template → "/path" with tokens substituted, or null when a token is unresolvable. */
  const finish = (joined, action) => {
    let path = joined.replace(/\[controller\]/gi, name);
    if (/\[action\]/i.test(path)) {
      if (!action) return null;
      path = path.replace(/\[action\]/gi, action);
    }
    if (/\[area\]/i.test(path)) {
      if (ch.area === undefined) return null;
      path = path.replace(/\[area\]/gi, ch.area);
    }
    return `/${path.replace(/^\/+/, '')}`;
  };
  const join = (tmpl) => {
    if (tmpl !== undefined && /^~?\//.test(tmpl)) return tmpl.replace(/^~?\//, '');
    if (baseUnknown) return null; // relative to an inherited base we cannot see
    return [classRoute ?? '', tmpl].filter((s) => s).join('/');
  };
  const emit = (display, at, extractor) => out.push({ kind: 'route', value: display, display,
    source: { file: c.file, locator: `line:${lineAt(c.text, at)}`, extractor, rule: CS_RULE } });

  const body = c.nc.slice(c.index, c.bodyEnd);
  let found = false;
  for (const block of attrBlocks(body)) {
    // An action-level [Route("t")] is the template of a template-less [Http<Verb>] on the
    // same action ([HttpGet] [Route("featured")] → GET <base>/featured), never the bare base.
    const actionRoutes = [...block.text.matchAll(CS_ROUTE_G)].map((r) => r[1]);
    const action = actionName(c, block.text, c.index + block.end);
    CS_HTTP.lastIndex = 0;
    const verbs = [...block.text.matchAll(CS_HTTP)];
    if (verbs.length === 0 && actionRoutes.length > 0) {
      // [Route("t")] without a verb: attribute-routed for any verb — never the conventional fallback.
      found = true;
      for (const tmpl of actionRoutes) {
        const joined = join(tmpl);
        const route = joined === null ? null : finish(joined, action);
        if (route) emit(route, c.index + block.index, 'dotnet-attribute-routes');
      }
      continue;
    }
    for (const h of verbs) {
      let tmpls = h[2] !== undefined ? [h[2]] : actionRoutes;
      if (tmpls.length === 0) {
        // A template-less [Http<Verb>] on a controller without a class [Route] is conventionally
        // routed (/<Name>/<Action>): it is not an attribute route, so emit nothing for it here
        // (never a made-up "GET /") and let the controller fall back to "/<Name>".
        if (classRoute === undefined) continue;
        tmpls = [undefined];
      }
      found = true;
      for (const tmpl of tmpls) {
        const joined = join(tmpl);
        const path = joined === null ? null : finish(joined, action);
        if (path) emit(`${h[1].toUpperCase()} ${path}`, c.index + block.index + h.index, 'dotnet-attribute-routes');
      }
    }
  }
  if (!found && !baseUnknown) {
    const route = classRoute === undefined ? `/${name}` : finish(classRoute, null);
    if (route) emit(route, c.index, 'dotnet-controller-routes');
  }
  return out;
}

export function collect(ctx) {
  const out = [];
  const py = [];
  const cs = [];
  for (const file of ctx.files) {
    const next = NEXT_PAGE.exec(file);
    if (next) {
      const r = nextRoute(file, next);
      if (r) out.push(r);
    } else if (file.endsWith('.py') && !PY_TEST_FILE.test(file) && !nonProductPath(file)) {
      py.push(file);
    } else if (file.endsWith('.cs') && !nonProductPath(file)) {
      cs.push(file);
    }
  }
  if (py.length) {
    const includePrefix = repoIncludePrefix(py, ctx);
    for (const file of py) {
      const text = ctx.read(file);
      if (text.includes('@')) out.push(...pythonRoutes(file, text, includePrefix));
    }
  }
  const web = ctx.files.some((f) => f.endsWith('.csproj') && !nonProductPath(f) && WEB_CSPROJ.test(ctx.read(f)));
  if (cs.length && web) {
    const classes = [];
    for (const file of cs) {
      const text = ctx.read(file);
      if (text.includes('class')) classes.push(...csClasses(file, text));
    }
    const index = new Map();
    for (const c of classes) index.set(c.name, [...(index.get(c.name) ?? []), c]);
    for (const c of classes) out.push(...dotnetRoutes(c, index));
  }
  return out;
}
