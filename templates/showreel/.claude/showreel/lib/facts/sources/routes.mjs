// Source 4: routes from code — Next.js App Router pages, FastAPI/Flask decorators,
// ASP.NET controllers. Display is the code's own path string (verb-prefixed for APIs).
import { lineAt } from '../walk.mjs';

const NEXT_PAGE = /^(?:src\/)?app\/(?:(.*)\/)?page\.(?:tsx|jsx|ts|js)$/;
const PY_ROUTE = /@(app|router)\.(get|post|put|delete|patch)\(\s*["']([^"']+)/g;
const CS_CLASS = /\b(abstract\s+)?(?:(?:public|internal|sealed|partial)\s+)*class\s+(\w+?)Controller\b/g;
// [Route("t")] and [Route("t", Name = "X", Order = 1)] (named args do not drop the template).
const CS_ROUTE = /\bRoute\(\s*"([^"]*)"[^)]*\)/;
const CS_ROUTE_G = new RegExp(CS_ROUTE.source, 'g');
// [HttpGet], [HttpGet("t")], [HttpGet("t", Name = "X")], [HttpGet(Name = "X")], and the same
// inside a comma-joined attribute list ([HttpGet, Authorize] / [Authorize, HttpGet("t")]).
const CS_HTTP = /[[,]\s*Http(Get|Post|Put|Delete|Patch)(?:\((?:\s*"([^"]*)")?[^)]*\))?(?=\s*[\],])/g;
/** Python test modules: their throwaway apps' routes are not served by the product. */
const PY_TEST_FILE = /(^|\/)(test_[^/]*|[^/]*_test|conftest)\.py$/;

function nextRoute(file, m) {
  const segs = m[1] ? m[1].split('/') : [];
  if (segs.some((s) => s.startsWith('_'))) return null; // private folder: not routable
  const kept = segs.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@')); // groups, parallel slots
  const route = '/' + kept.join('/');
  return { kind: 'route', value: route, display: route,
    source: { file, locator: 'path', extractor: 'next-app-routes', rule: 'app/**/page.(tsx|jsx|ts|js) → route path (route groups stripped, [params] kept, _private skipped)' } };
}

function pythonRoutes(file, text) {
  const out = [];
  PY_ROUTE.lastIndex = 0;
  let m;
  while ((m = PY_ROUTE.exec(text))) {
    const route = `${m[2].toUpperCase()} ${m[3]}`;
    out.push({ kind: 'route', value: route, display: route,
      source: { file, locator: `line:${lineAt(text, m.index)}`, extractor: 'python-decorators', rule: '@(app|router).(get|post|put|delete|patch)("<path>") → "<VERB> <path>" (test_*.py, *_test.py, conftest.py skipped)' } });
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
    out.push({ index: start, text: body.slice(start, end) });
    LINE_START.lastIndex = end;
  }
  return out;
}

function dotnetRoutes(file, text) {
  const out = [];
  const classes = [];
  CS_CLASS.lastIndex = 0;
  let m;
  while ((m = CS_CLASS.exec(text))) classes.push({ index: m.index, abstract: !!m[1], name: m[2] });
  classes.forEach((c, i) => {
    if (c.abstract) return;
    const pre = text.slice(i === 0 ? 0 : classes[i - 1].index, c.index);
    const body = text.slice(c.index, i + 1 < classes.length ? classes[i + 1].index : text.length);
    const classRoute = (CS_ROUTE.exec(pre.slice(pre.lastIndexOf('}') + 1)) || [])[1];
    const base = classRoute === undefined ? '' : classRoute.replace(/\[controller\]/gi, c.name);
    let found = false;
    for (const block of attrBlocks(body)) {
      // An action-level [Route("t")] is the template of a template-less [Http<Verb>] on the
      // same action ([HttpGet] [Route("featured")] → GET <base>/featured), never the bare base.
      const actionRoutes = [...block.text.matchAll(CS_ROUTE_G)].map((r) => r[1]);
      CS_HTTP.lastIndex = 0;
      let h;
      while ((h = CS_HTTP.exec(block.text))) {
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
          const joined = tmpl !== undefined && /^~?\//.test(tmpl)
            ? tmpl.replace(/^~?\//, '')
            : [base, tmpl].filter((s) => s).join('/');
          const route = `${h[1].toUpperCase()} /${joined.replace(/^\/+/, '')}`;
          out.push({ kind: 'route', value: route, display: route,
            source: { file, locator: `line:${lineAt(text, c.index + block.index + h.index)}`, extractor: 'dotnet-attribute-routes', rule: '[Route("…")] on controller + [Http<Verb>("…")] (or [Http<Verb>] + [Route("…")]) on action → "<VERB> /<path>" ([controller] = class name minus "Controller"; template-less [Http<Verb>] with no [Route] at all is conventional, not emitted)' } });
        }
      }
    }
    if (!found) {
      const route = classRoute === undefined ? `/${c.name}` : `/${base.replace(/^\/+/, '')}`;
      out.push({ kind: 'route', value: route, display: route,
        source: { file, locator: `line:${lineAt(text, c.index)}`, extractor: 'dotnet-controller-routes', rule: '<Name>Controller without attribute-routed actions → "/<Name>" (conventional {controller} route)' } });
    }
  });
  return out;
}

export function collect(ctx) {
  const out = [];
  for (const file of ctx.files) {
    const next = NEXT_PAGE.exec(file);
    if (next) {
      const r = nextRoute(file, next);
      if (r) out.push(r);
    } else if (file.endsWith('.py') && !PY_TEST_FILE.test(file)) {
      const text = ctx.read(file);
      if (text.includes('@')) out.push(...pythonRoutes(file, text));
    } else if (file.endsWith('.cs')) {
      const text = ctx.read(file);
      if (text.includes('Controller')) out.push(...dotnetRoutes(file, text));
    }
  }
  return out;
}
