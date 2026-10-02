import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../templates/showreel/.claude/showreel/lib/facts/cmd.mjs';
import { validate } from '../../templates/showreel/.claude/showreel/lib/util/schema.mjs';
import { ShowreelError } from '../../templates/showreel/.claude/showreel/lib/util/out.mjs';
import { readText, walkFiles } from '../../templates/showreel/.claude/showreel/lib/facts/walk.mjs';
import * as routesSource from '../../templates/showreel/.claude/showreel/lib/facts/sources/routes.mjs';

// v1.16 showreel — facts are the ONLY source of on-screen copy (D8 / Rule 13). Every
// string a film can show must be traceable to a line of the host repo, ids must be stable
// for the same repo state (the storyboard references them), facts.json must not churn on
// every commit (B5), and a repo without enough code facts must be refused loudly (D4)
// instead of inviting the LLM to invent content.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures', 'facts');
const SCHEMA = JSON.parse(
  readFileSync(path.resolve(HERE, '..', '..', 'templates', 'showreel', '.claude', 'showreel', 'schema', 'facts.schema.json'), 'utf8'),
);

type Fact = { id: string; kind: string; value: string | number; display: string; unit: string | null; source: { file: string; locator: string; extractor: string; rule: string }; hash: string };
type FactsJson = { version: 1; minimumGate: { passed: boolean; missing: string[] }; brand: { name: string; palette: string; wordmark: string | null }; facts: Fact[] };

const temps: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
});

function tempRepo(fixture?: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'showreel-facts-'));
  temps.push(dir);
  if (fixture) cpSync(path.join(FIXTURES, fixture), dir, { recursive: true });
  return dir;
}

function write(root: string, rel: string, text: string) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

async function runFacts(root: string) {
  let printed = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    printed += String(chunk);
    return true;
  });
  const code = await run([], root);
  vi.restoreAllMocks();
  const lines = printed.split('\n').filter(Boolean);
  expect(lines, 'facts must print exactly one JSON line').toHaveLength(1);
  return { code, out: JSON.parse(lines[0]), line: lines[0] };
}

const factsPath = (root: string) => path.join(root, 'showreel', 'facts.json');
const metaPath = (root: string) => path.join(root, 'showreel', 'build', 'facts.meta.json');
const readFacts = (root: string): FactsJson => JSON.parse(readFileSync(factsPath(root), 'utf8'));
const triples = (f: FactsJson) => f.facts.map((x) => [x.id, x.kind, x.display]);

describe('facts — fixture extraction (exact ids/kinds/displays)', () => {
  it('js-next: Serena → README → package.json → Next routes, deduped, ignored dirs skipped', async () => {
    const root = tempRepo('js-next');
    const { code, out } = await runFacts(root);
    expect(code).toBe(0);
    expect(out.ok).toBe(true);
    expect(out.cmd).toBe('facts');
    const f = readFacts(root);
    expect(triples(f)).toEqual([
      // package.json name wins over the README H1 (H1 is the fallback); scope stripped.
      ['f.app.name.1', 'app.name', 'acme-shop'],
      // README first sentence (badges/images skipped) before package.json description:
      // ids follow Knowledge Source Priority order within a kind.
      ['f.app.tagline.1', 'app.tagline', 'Acme Shop is a storefront for tiny teams.'],
      ['f.app.tagline.2', 'app.tagline', 'Checkout in one tap.'],
      // Serena first: INDEX "## Services" bullets + services/*.md H1s only (decisions are not
      // features), deduped against each other.
      ['f.feature.1', 'feature', 'Cart service'],
      // README bullets under "Features" only: bold title / text before ":" kept, nested
      // bullets and fenced code ignored; "`Stripe payments`" is a README claim, so it stays.
      ['f.feature.2', 'feature', 'One-tap checkout'],
      ['f.feature.3', 'feature', 'Order tracking'],
      ['f.feature.4', 'feature', 'Stripe payments'],
      // README "Getting started" ordered list: a prose step is a feature (ruling f).
      ['f.feature.5', 'feature', 'Open localhost:3000'],
      // Whitelisted deps only (zod is not), dependencies + devDependencies, whitelist order.
      ['f.stack.item.1', 'stack.item', 'Next.js'],
      ['f.stack.item.2', 'stack.item', 'React'],
      ['f.stack.item.3', 'stack.item', 'Tailwind CSS'],
      ['f.stack.item.4', 'stack.item', 'TypeScript'],
      // README code-span steps first (README precedes package.json; "npm run dev"/"npm run test" deduped there),
      // then package.json dev/build/start/test only (lint is not), then bin.
      ['f.command.1', 'command', 'npm install'],
      ['f.command.2', 'command', 'npm run dev'],
      ['f.command.3', 'command', 'npm run test'],
      ['f.command.4', 'command', 'npm run build'],
      ['f.command.5', 'command', 'npm run start'],
      ['f.command.6', 'command', 'npx @acme/acme-shop'],
      // Route groups stripped, [id] kept, _private folders skipped, lexicographic file order.
      ['f.route.1', 'route', '/products/[id]'],
      ['f.route.2', 'route', '/checkout'],
      ['f.route.3', 'route', '/'],
      ['f.count.1', 'count', '3'],
      ['f.count.2', 'count', '4'],
      ['f.count.3', 'count', '6'],
      ['f.count.4', 'count', '5'],
      // build/ and showreel/ test files are NOT counted.
      ['f.count.5', 'count', '2'],
    ]);
    expect(f.facts.filter((x) => x.kind === 'count').map((x) => [x.value, x.unit])).toEqual([
      [3, 'routes'], [4, 'integrations'], [6, 'commands'], [5, 'features'], [2, 'tests'],
    ]);
    expect(f.minimumGate).toEqual({ passed: true, missing: [] });
    expect(f.brand).toEqual({ name: 'acme-shop', palette: 'violet', wordmark: 'f.app.name.1' });
  });

  it('python-fastapi: pyproject [project] + requirements.txt + decorator routes; .venv ignored', async () => {
    const root = tempRepo('python-fastapi');
    const { code } = await runFacts(root);
    expect(code).toBe(0);
    expect(triples(readFacts(root))).toEqual([
      ['f.app.name.1', 'app.name', 'inventory-api'],
      ['f.app.tagline.1', 'app.tagline', 'Track stock across warehouses in real time!'],
      ['f.app.tagline.2', 'app.tagline', 'Stock levels you can trust.'],
      // README "Quick start" ordered list: the prose step is a feature (ruling f).
      ['f.feature.1', 'feature', 'Open /docs in a browser'],
      // [project].dependencies (not optional-deps, not [tool.ruff] name), then requirements.txt names.
      ['f.stack.item.1', 'stack.item', 'FastAPI'],
      ['f.stack.item.2', 'stack.item', 'SQLAlchemy'],
      ['f.stack.item.3', 'stack.item', 'Pydantic'],
      ['f.stack.item.4', 'stack.item', 'pytest'],
      ['f.stack.item.5', 'stack.item', 'Uvicorn'],
      // README steps: a code span and a bare command line are commands; then [project.scripts].
      ['f.command.1', 'command', 'pip install -e .'],
      ['f.command.2', 'command', 'uvicorn inventory.main:app'],
      ['f.command.3', 'command', 'inventory'],
      // inventory/items.py: APIRouter(prefix="/items") + @router.get("/{id}") → the served path.
      ['f.route.1', 'route', 'GET /items/{id}'],
      ['f.route.2', 'route', 'GET /health'],
      ['f.route.3', 'route', 'POST /items'],
      ['f.route.4', 'route', 'GET /items/{item_id}'],
      ['f.count.1', 'count', '4'],
      ['f.count.2', 'count', '5'],
      ['f.count.3', 'count', '3'],
      ['f.count.4', 'count', '1'],
      // tests/test_items.py + tests/unit/test_stock.py; conftest and .venv excluded.
      ['f.count.5', 'count', '2'],
    ]);
    expect(readFacts(root).facts.filter((x) => x.kind === 'count').map((x) => x.unit)).toEqual(['routes', 'integrations', 'commands', 'features', 'tests']);
  });

  it('dotnet-mvc: .sln name, csproj PackageReference/Sdk whitelist, attribute + conventional routes; obj ignored', async () => {
    const root = tempRepo('dotnet-mvc');
    const { code } = await runFacts(root);
    expect(code).toBe(0);
    expect(triples(readFacts(root))).toEqual([
      ['f.app.name.1', 'app.name', 'AcmeCrm'],
      ['f.app.tagline.1', 'app.tagline', 'Customer records without the spreadsheet chaos.'],
      ['f.feature.1', 'feature', 'Contact timeline'],
      ['f.feature.2', 'feature', 'Deal pipeline'],
      ['f.stack.item.1', 'stack.item', 'ASP.NET Core'],
      ['f.stack.item.2', 'stack.item', 'EF Core'],
      ['f.stack.item.3', 'stack.item', 'Swagger'],
      ['f.stack.item.4', 'stack.item', 'xUnit'],
      ['f.route.1', 'route', 'GET /api/Customers'],
      ['f.route.2', 'route', 'GET /api/Customers/{id}'],
      // [HttpGet] + action-level [Route("featured")]: the Route is the action's template.
      ['f.route.3', 'route', 'GET /api/Customers/featured'],
      ['f.route.4', 'route', 'POST /api/Customers'],
      // Named args and comma-joined attribute lists are still attribute routes, not dropped.
      ['f.route.5', 'route', 'PUT /api/Customers/{id}'],
      ['f.route.6', 'route', 'DELETE /api/Customers/{id}'],
      ['f.route.7', 'route', '/Home'],
      // OrdersController: template-less [HttpGet]/[HttpPost] and no class [Route] is
      // conventional routing, so the controller falls back to "/Orders".
      ['f.route.8', 'route', '/Orders'],
      ['f.count.1', 'count', '8'],
      ['f.count.2', 'count', '4'],
      ['f.count.3', 'count', '2'],
    ]);
  });

  it('dotnet-mvc: a conventional controller with template-less [HttpGet]/[HttpPost] never becomes a made-up "GET /" / "POST /"', async () => {
    // Rule 13 / D8: "GET /" does not exist in this app (Orders is served at /Orders/<Action>);
    // emitting it would put an invented route on screen as a code-derived truth.
    const root = tempRepo('dotnet-mvc');
    await runFacts(root);
    const routes = readFacts(root).facts.filter((x) => x.kind === 'route');
    const displays = routes.map((x) => x.display);
    expect(displays).not.toContain('GET /');
    expect(displays).not.toContain('POST /');
    const orders = routes.find((x) => x.display === '/Orders')!;
    expect(orders.source.file).toBe('src/AcmeCrm.Web/Controllers/OrdersController.cs');
    expect(orders.source.extractor).toBe('dotnet-controller-routes');
  });

  // Raw extractor output (before extract.mjs dedupes by display), so a second invented
  // "GET /api/Customers" cannot hide behind the dedupe.
  // A web .csproj is part of every probe repo: dotnet routes are only read in ASP.NET projects.
  const WEB_CSPROJ = '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>';
  const dotnetCollect = (file: string, text: string, more: Record<string, string> = {}) => {
    const files: Record<string, string> = { 'Web/Web.csproj': WEB_CSPROJ, [file]: text, ...more };
    return routesSource.collect({ files: Object.keys(files).sort(), has: (f: string) => f in files, read: (f: string) => files[f] }) as Fact[];
  };

  it('dotnet: an action-level [Route("t")] is the template of a template-less [HttpGet] — never the bare class base', () => {
    // Rule 13 / D8: [HttpGet][Route("featured")] under [Route("api/[controller]")] is served at
    // GET /api/Customers/featured; "GET /api/Customers" for it would be a made-up route.
    const file = 'src/AcmeCrm.Web/Controllers/CustomersController.cs';
    const text = readFileSync(path.join(FIXTURES, 'dotnet-mvc', file), 'utf8');
    const routes = dotnetCollect(file, text);
    const lineOf = (needle: string) => text.split(/\r?\n/).findIndex((l) => l.includes(needle)) + 1;
    expect(routes.filter((r) => r.display === 'GET /api/Customers').map((r) => r.source.locator))
      .toEqual([`line:${lineOf('List()') - 1}`]); // only List()'s [HttpGet]
    const featured = routes.filter((r) => r.display === 'GET /api/Customers/featured');
    expect(featured.map((r) => r.source.locator)).toEqual([`line:${lineOf('[Route("featured")]') - 1}`]);
    expect(routes).toHaveLength(6);

    // Conventional controller (no class [Route]) + [HttpGet][Route("…")]: an attribute route
    // in its own right; an absolute "~/" action template overrides the class base.
    const more = dotnetCollect('W.cs', [
      'public class WidgetsController : Controller {',
      '    [HttpGet]',
      '    [Route("widgets/top")]',
      '    public IActionResult Top() => View();',
      '}',
      '[Route("api/[controller]")]',
      'public class GadgetsController : ControllerBase {',
      '    [HttpPost, Route("~/legacy/gadgets")]',
      '    public IActionResult Legacy() => Ok();',
      '}',
    ].join('\n')).map((r) => r.display);
    expect(more).toEqual(['GET /widgets/top', 'POST /legacy/gadgets']);
  });

  it('dotnet: named args on a class [Route] keep the base (no orphaned "GET /{id}")', () => {
    const routes = dotnetCollect('T.cs', [
      '[ApiController]',
      '[Route("api/[controller]", Name = "Things", Order = 1)]',
      'public class ThingsController : ControllerBase {',
      '    [HttpGet("{id}")]',
      '    public IActionResult Get(int id) => Ok();',
      '}',
    ].join('\n')).map((r) => r.display);
    expect(routes).toEqual(['GET /api/Things/{id}']);
  });

  it('python: routes declared in test modules (conftest.py, test_*.py, *_test.py) are not product routes', async () => {
    const root = tempRepo('python-fastapi');
    write(root, 'inventory/api_test.py', 'from inventory.main import app\n\n@app.post("/test-only")\ndef t(): ...\n');
    write(root, 'tests/test_extra.py', 'from fastapi import FastAPI\napp = FastAPI()\n\n@app.get("/fake")\ndef f(): ...\n');
    await runFacts(root);
    const displays = readFacts(root).facts.filter((x) => x.kind === 'route').map((x) => x.display);
    // The fixture conftest.py also declares "/boom" on a throwaway app.
    expect(displays).toEqual(['GET /items/{id}', 'GET /health', 'POST /items', 'GET /items/{item_id}']);
  });

  // Orchestrator ruling (M1): only Services describe what the product does. Decisions are design
  // choices ("Stripe payments" = why Stripe), Backlog is unbuilt work, Comms is bookkeeping.
  it('serena: only INDEX Services bullets + services/*.md titles are features (decisions/backlog/comms are not shipped features)', async () => {
    const root = tempRepo('js-next');
    await runFacts(root);
    const features = readFacts(root).facts.filter((x) => x.kind === 'feature').map((x) => x.display);
    expect(features).not.toContain('Refund flow rework');
    expect(features).not.toContain('dev-to-qa checkout question');
    // "Stripe payments" is still a feature — but only because the README's Features list claims it,
    // never because a decision memory exists.
    // ("Open localhost:3000" is a README "Getting started" step — a README claim too, ruling f.)
    expect(features).toEqual(['Cart service', 'One-tap checkout', 'Order tracking', 'Stripe payments', 'Open localhost:3000']);
    const sources = readFacts(root).facts.filter((x) => x.kind === 'feature').map((x) => x.source.file);
    expect(sources.filter((f) => f.includes('/decisions/'))).toEqual([]);
    expect(readFacts(root).facts.find((x) => x.display === 'Stripe payments')!.source.file).toBe('README.md');
  });

  // ---- Route truth (Rule 13 / D8): a route on screen must be one the product really serves. ----
  const memCollect = (files: Record<string, string>) =>
    (routesSource.collect({ files: Object.keys(files).sort(), has: (f: string) => f in files, read: (f: string) => files[f] }) as Fact[])
      .map((r) => r.display);

  it('fastapi: APIRouter(prefix="…") is prepended — "GET /items/{id}", never the rootless "GET /{id}"', async () => {
    const root = tempRepo('python-fastapi');
    await runFacts(root);
    const displays = readFacts(root).facts.filter((x) => x.kind === 'route').map((x) => x.display);
    expect(displays).toContain('GET /items/{id}');
    expect(displays).not.toContain('GET /{id}');
  });

  it('fastapi: a router mounted with include_router(prefix=…) or a non-literal prefix is not emitted (real path unknowable)', () => {
    const included = memCollect({
      'app/main.py': 'from fastapi import FastAPI\nfrom app import auth\napp = FastAPI()\napp.include_router(auth.router, prefix="/api")\n\n@app.get("/health")\ndef h(): ...\n',
      'app/auth.py': 'from fastapi import APIRouter\nrouter = APIRouter()\n\n@router.post("/login")\ndef login(): ...\n',
    });
    // The real route is POST /api/login; "POST /login" does not exist. App routes are unaffected.
    expect(included).toEqual(['GET /health']);

    const nonLiteral = memCollect({
      'app/users.py': 'from fastapi import APIRouter\nPREFIX = "/users"\nrouter = APIRouter(prefix=PREFIX)\n\n@router.get("/{id}")\ndef u(): ...\n',
      // A "router" imported from elsewhere: its prefix is not visible in this file.
      'app/orders.py': 'from app.deps import router\n\n@router.get("/{id}")\ndef o(): ...\n',
    });
    expect(nonLiteral).toEqual([]);
  });

  it('flask: Blueprint(url_prefix="…") is prepended; register_blueprint(..., url_prefix=…) makes the mount unknowable (never rootless)', () => {
    // Rule 13 / D8: "GET /x" for a blueprint served at /items/x is a wrong fact on screen.
    const own = memCollect({
      'app/items.py': 'from flask import Blueprint\nrouter = Blueprint("items", __name__, url_prefix="/items")\n\n@router.get("/<id>")\ndef item(id): ...\n',
    });
    expect(own).toEqual(['GET /items/<id>']);

    const mounted = memCollect({
      'app/__init__.py': 'from flask import Flask\nfrom app.items import router\napp = Flask(__name__)\napp.register_blueprint(router, url_prefix="/v1")\n\n@app.get("/health")\ndef h(): ...\n',
      'app/items.py': 'from flask import Blueprint\nrouter = Blueprint("items", __name__, url_prefix="/items")\n\n@router.get("/<id>")\ndef item(id): ...\n',
    });
    // The real route is GET /v1/<id> (register's url_prefix wins); app routes are unaffected.
    expect(mounted).toEqual(['GET /health']);
  });

  it('python: decorators in comments and docstrings are not routes', () => {
    const routes = memCollect({
      'app/main.py': [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        '# @app.get("/legacy")',
        'def helper():',
        '    """Example:',
        '    @app.get("/doc-example")',
        '    """',
        '',
        '@app.get("/live")',
        'def live(): ...',
      ].join('\n'),
    });
    expect(routes).toEqual(['GET /live']);
  });

  it('routes: tests/, fixtures/, samples/ … and *.Tests projects are not product code (no route from them)', async () => {
    const root = tempRepo('js-next');
    const own = ['/', '/products/[id]', '/checkout'];
    // A whole FastAPI and ASP.NET fixture copied under tests/fixtures/ (as in this scaffold repo).
    cpSync(path.join(FIXTURES, 'python-fastapi'), path.join(root, 'tests', 'fixtures', 'py'), { recursive: true });
    cpSync(path.join(FIXTURES, 'dotnet-mvc'), path.join(root, 'tests', 'fixtures', 'dotnet'), { recursive: true });
    write(root, 'tests/fake_app.py', 'from fastapi import FastAPI\napp = FastAPI()\n\n@app.get("/boom")\ndef b(): ...\n');
    write(root, 'samples/demo/server.py', 'from fastapi import FastAPI\napp = FastAPI()\n\n@app.get("/sample")\ndef s(): ...\n');
    write(root, 'src/Api.Tests/FakeController.cs', '[Route("fake")]\npublic class FakeController : ControllerBase { }\n');
    await runFacts(root);
    const routes = readFacts(root).facts.filter((x) => x.kind === 'route');
    expect(routes.map((x) => x.display).sort()).toEqual([...own].sort());
    expect(routes.every((x) => x.source.extractor === 'next-app-routes')).toBe(true);
  });

  it('dotnet: a class [Route] inherited from an in-repo base controller roots the actions; an unseen base drops relative templates', () => {
    const inherited = dotnetCollect('Controllers/OrdersController.cs', [
      'public class OrdersController : ApiBaseController {',
      '    [HttpGet("{id}")]',
      '    public IActionResult Get(int id) => Ok();',
      '}',
    ].join('\n'), {
      'Controllers/ApiBaseController.cs': '[ApiController]\n[Route("api/[controller]")]\npublic abstract class ApiBaseController : ControllerBase {}\n',
    }).map((r) => r.display);
    // RouteAttribute is inherited and [controller] is the DERIVED controller's name.
    expect(inherited).toEqual(['GET /api/Orders/{id}']);

    const unseen = dotnetCollect('Controllers/OrdersController.cs', [
      '[ApiController]',
      'public class OrdersController : Acme.Shared.ApiBaseController {',
      '    [HttpGet("{id}")]',
      '    public IActionResult Get(int id) => Ok();',
      '    [HttpGet("~/status")]',
      '    public IActionResult Status() => Ok();',
      '}',
    ].join('\n')).map((r) => r.display);
    expect(unseen).not.toContain('GET /{id}');
    expect(unseen).toEqual(['GET /status']); // absolute templates do not depend on the base
  });

  it('dotnet: non-MVC "*Controller" classes and projects without ASP.NET are not routes; a verb-less action [Route] is attribute-routed', () => {
    // Unity: a MonoBehaviour named PlayerController is not served at /Player.
    expect(dotnetCollect('Assets/PlayerController.cs', 'public class PlayerController : MonoBehaviour { void Update() {} }')).toEqual([]);
    // No web .csproj in the repo: even a Controller subclass is not an ASP.NET route.
    expect(routesSource.collect({ files: ['Lib/HomeController.cs', 'Lib/Lib.csproj'], has: () => true,
      read: (f: string) => (f.endsWith('.csproj') ? '<Project Sdk="Microsoft.NET.Sdk"></Project>' : 'public class HomeController : Controller { }') })).toEqual([]);
    // [Route("bar/list")] with no Http verb: reachable at /bar/list, NOT at the conventional /Bar.
    const bar = dotnetCollect('BarController.cs', [
      'public class BarController : Controller {',
      '    [Route("bar/list")]',
      '    public IActionResult List() => View();',
      '}',
    ].join('\n')).map((r) => r.display);
    expect(bar).toEqual(['/bar/list']);
  });

  it('dotnet: [action] is the action name, [area] needs [Area("…")], and a class [Route] with {params} keeps its base', () => {
    const routes = dotnetCollect('C.cs', [
      '[Route("api/[controller]/[action]")]',
      'public class FooController : ControllerBase {',
      '    [HttpGet]',
      '    public async Task<IActionResult> BarAsync() => Ok();',
      '    [HttpPost]',
      '    [ActionName("renamed")]',
      '    public IActionResult Baz() => Ok();',
      '}',
      '[Route("[area]/[controller]")]',
      'public class NoAreaController : ControllerBase {',
      '    [HttpGet("x")]',
      '    public IActionResult X() => Ok();',
      '}',
      '[Area("admin")]',
      '[Route("[area]/[controller]")]',
      'public class UsersController : ControllerBase {',
      '    [HttpGet("x")]',
      '    public IActionResult X() => Ok();',
      '}',
      '[Route("api/tenants/{tenantId}/[controller]")]',
      'public class MembersController : ControllerBase {',
      '    [HttpGet("{id}")]',
      '    public IActionResult Get(int id) => Ok();',
      '}',
    ].join('\n')).map((r) => r.display);
    expect(routes).toEqual(['GET /api/Foo/Bar', 'POST /api/Foo/renamed', 'GET /admin/Users/x', 'GET /api/tenants/{tenantId}/Members/{id}']);
    expect(routes.some((r) => /\[(action|area|controller)\]/i.test(r))).toBe(false);
  });

  it('readme: bullets under "Planned features" / "Roadmap / features" / "Feature flags" are not shipped features', async () => {
    const root = tempRepo('doc-only');
    write(root, 'README.md', [
      '# App', '', 'Does things.', '',
      '## Features', '', '- Live sync', '',
      '## Planned features', '', '- Offline sync', '- SSO', '',
      '## Roadmap / features', '', '- Dark mode', '',
      '## Feature flags', '', '- NEW_UI', '',
    ].join('\n'));
    await runFacts(root);
    const features = readFacts(root).facts.filter((x) => x.kind === 'feature' && x.source.file === 'README.md').map((x) => x.display);
    expect(features).toEqual(['Live sync']);
  });

  it('every fixture produces schema-valid facts with a recorded rule and a content hash', async () => {
    for (const fx of ['js-next', 'python-fastapi', 'dotnet-mvc', 'doc-only']) {
      const root = tempRepo(fx);
      await runFacts(root);
      const f = readFacts(root);
      expect(validate(SCHEMA, f), fx).toEqual([]);
      for (const x of f.facts) {
        expect(x.source.rule.length, `${fx} ${x.id} rule`).toBeGreaterThan(0);
        // Every fact must point back to a real file (counts point at the repo root '.').
        expect(existsSync(path.join(root, x.source.file)), `${fx} ${x.id} -> ${x.source.file}`).toBe(true);
        const want = createHash('sha256').update(`${x.kind}|${x.value}|${x.source.file}|${x.source.locator}`).digest('hex').slice(0, 16);
        expect(x.hash, `${fx} ${x.id}`).toBe(`sha256:${want}`);
      }
    }
  });
});

describe('facts — minimum gate (D4)', () => {
  it('doc-only repo is refused with E_THIN_REPO naming the missing kinds, and facts.json still records it', async () => {
    const root = tempRepo('doc-only');
    const { code, out } = await runFacts(root);
    expect(code).toBe(1);
    expect(out).toEqual({
      ok: false,
      cmd: 'facts',
      error: {
        code: 'E_THIN_REPO',
        message: 'Not enough code facts for an honest film: missing stack.item, route, command',
        fix: 'This add-on targets code repos; doc-first repos (hr, accounting, ba) are not supported in v1.',
      },
    });
    const f = readFacts(root);
    expect(f.minimumGate).toEqual({ passed: false, missing: ['stack.item', 'route', 'command'] });
    // It still has a name and a count — the gate failed on code facts, not on parsing.
    expect(f.facts.some((x) => x.kind === 'app.name' && x.display === 'Team Handbook')).toBe(true);
  });

  it('missing app.name and missing counts are named too (empty repo)', async () => {
    const root = tempRepo();
    const { code, out } = await runFacts(root);
    expect(code).toBe(1);
    expect(out.error.message).toBe(
      'Not enough code facts for an honest film: missing app.name, feature, stack.item, route, command, count',
    );
  });

  it('3 of the 4 code kinds is enough — the gate is "at least 3", not "all 4"', async () => {
    const root = tempRepo();
    write(root, 'package.json', JSON.stringify({ name: 'tiny', dependencies: { express: '4' }, scripts: { dev: 'node .' } }));
    write(root, 'app/page.tsx', 'export default 1');
    const { code, out } = await runFacts(root);
    expect(code).toBe(0);
    expect(out.gate).toEqual({ passed: true, missing: [] });
    // drop the route → only 2 code kinds → refused
    rmSync(path.join(root, 'app'), { recursive: true });
    const again = await runFacts(root);
    expect(again.code).toBe(1);
    expect(again.out.error.message).toBe('Not enough code facts for an honest film: missing feature, route');
  });
});

describe('facts — stability (B5)', () => {
  it('facts → commit (+ tag) → facts: facts.json byte-identical; commit data only in build/facts.meta.json', async () => {
    const root = tempRepo('js-next');
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');

    expect((await runFacts(root)).code).toBe(0);
    const first = readFileSync(factsPath(root));
    const meta1 = JSON.parse(readFileSync(metaPath(root), 'utf8'));
    expect(meta1.git.head).toBe(git('rev-parse', 'HEAD'));

    git('add', '-A');
    git('commit', '-q', '-m', 'add facts');
    git('tag', 'v1.0.0');

    expect((await runFacts(root)).code).toBe(0);
    const second = readFileSync(factsPath(root));
    expect(second.equals(first)).toBe(true);
    const meta2 = JSON.parse(readFileSync(metaPath(root), 'utf8'));
    expect(meta2.git.head).toBe(git('rev-parse', 'HEAD'));
    expect(meta2.git.head).not.toBe(meta1.git.head);
    expect(meta2.git.commits).toBe(2);
    expect(meta2.git.tags).toEqual(['v1.0.0']);
    // No commit-dependent value leaks into the committed file.
    expect(second.toString('utf8')).not.toContain(meta2.git.head);
    expect(second.toString('utf8')).not.toContain('v1.0.0');
  });

  it('a hostRoot nested inside another git repo does not borrow the outer repo HEAD', async () => {
    const outer = tempRepo();
    execFileSync('git', ['init', '-q'], { cwd: outer });
    const root = path.join(outer, 'nested');
    cpSync(path.join(FIXTURES, 'js-next'), root, { recursive: true });
    await runFacts(root);
    expect(JSON.parse(readFileSync(metaPath(root), 'utf8')).git).toBeNull();
  });
});

describe('facts — digest budget', () => {
  it('400 routes: digest ≤150 entries and ≤20k chars, every kind kept, truncation reported; facts.json keeps all', async () => {
    const root = tempRepo('js-next');
    for (let i = 1; i <= 400; i++) write(root, `app/r${String(i).padStart(3, '0')}/page.tsx`, 'export default 1');
    const { code, out, line } = await runFacts(root);
    expect(code).toBe(0);
    const f = readFacts(root);
    expect(f.facts.filter((x) => x.kind === 'route')).toHaveLength(403);
    expect(out.count).toBe(f.facts.length);
    expect(out.digest.length).toBeLessThanOrEqual(150);
    expect(JSON.stringify(out.digest).length).toBeLessThanOrEqual(20000);
    expect(out.truncated).toBe(f.facts.length - out.digest.length);
    expect(out.truncated).toBeGreaterThan(0);
    const kinds = (xs: { kind: string }[]) => [...new Set(xs.map((x) => x.kind))].sort();
    expect(kinds(out.digest)).toEqual(kinds(f.facts));
    // Every count survives (they are the film's numbers) and digest entries are verbatim facts.
    const byId = new Map(f.facts.map((x) => [x.id, x]));
    expect(out.digest.filter((d: Fact) => d.kind === 'count')).toHaveLength(5);
    for (const d of out.digest) {
      const src = byId.get(d.id)! as Fact & { collection: string | null; sequence: number | null };
      // collection + sequence ride along ONLY on ordered-step facts (ruling f: what a sequential flow may bind)
      expect(Object.keys(d).sort()).toEqual(src.sequence === null
        ? ['display', 'id', 'kind', 'unit']
        : ['collection', 'display', 'id', 'kind', 'sequence', 'unit']);
      expect([d.kind, d.display, d.unit]).toEqual([src.kind, src.display, src.unit]);
      if (src.sequence !== null) expect([d.collection, d.sequence]).toEqual([src.collection, src.sequence]);
    }
    expect(line.length).toBeLessThan(25000);
  });

  it('small repo: digest is the full fact list, truncated 0', async () => {
    const root = tempRepo('python-fastapi');
    const { out } = await runFacts(root);
    const f = readFacts(root);
    expect(out.truncated).toBe(0);
    type Seq = Fact & { collection: string | null; sequence: number | null };
    expect(out.digest).toEqual((f.facts as Seq[]).map((x) => ({
      id: x.id, kind: x.kind, display: x.display, unit: x.unit,
      ...(x.sequence !== null ? { collection: x.collection, sequence: x.sequence } : {}),
    })));
    expect(out.digest.filter((d: { sequence?: number }) => d.sequence !== undefined)).toHaveLength(3);
  });
});

// Orchestrator ruling (f): a sequential flow-graph (chain/converge) draws arrows = "this, then this". That claim is
// only true for items the README itself lists in order, so ONLY ordered lists under a steps-like H2/H3 get a
// sequence; bullets, other headings and extraction order (package.json script order, file order) never do.
describe('facts — ordered steps (sequence, ruling f)', () => {
  type SeqFact = Fact & { collection: string | null; order: number | null; sequence: number | null };
  const seqOf = (f: FactsJson) => (f.facts as SeqFact[]).filter((x) => x.sequence !== null)
    .map((x) => [x.id, x.display, x.collection, x.sequence]);
  const readmeRepo = (readme: string[]) => {
    const root = tempRepo('js-next');
    write(root, 'README.md', ['# Acme', '', 'Does things.', '', ...readme, ''].join('\n'));
    return root;
  };

  it('js-next: the "Getting started" ordered list → readme.steps.1 with item positions; nothing else is sequenced', async () => {
    const root = tempRepo('js-next');
    await runFacts(root);
    const f = readFacts(root);
    expect(seqOf(f)).toEqual([
      ['f.feature.5', 'Open localhost:3000', 'readme.steps.1', 3],
      ['f.command.1', 'npm install', 'readme.steps.1', 1],
      ['f.command.2', 'npm run dev', 'readme.steps.1', 2],
      ['f.command.3', 'npm run test', 'readme.steps.1', 4],
    ]);
    const all = f.facts as SeqFact[];
    // every fact carries the key; package.json scripts (an extraction order, not a claimed order) stay null
    expect(all.every((x) => 'sequence' in x)).toBe(true);
    expect(all.filter((x) => x.source.file === 'package.json').every((x) => x.sequence === null)).toBe(true);
    // the "## Setup" BULLET list is not a sequence (and not a feature either)
    expect(all.some((x) => x.display.includes('npm install (not'))).toBe(false);
    // order within an ordered collection is its sequence; per-kind collections keep 1..n
    for (const x of all.filter((y) => y.sequence !== null)) expect(x.order, x.id).toBe(x.sequence);
    expect(all.filter((x) => x.collection === 'commands').map((x) => x.order)).toEqual([1, 2, 3]);
    expect(all.find((x) => x.id === 'f.command.1')!.source).toMatchObject({ file: 'README.md', extractor: 'readme-steps' });
  });

  it('python-fastapi: a bare command line is a command step; a prose step is a feature', async () => {
    const root = tempRepo('python-fastapi');
    await runFacts(root);
    expect(seqOf(readFacts(root))).toEqual([
      ['f.feature.1', 'Open /docs in a browser', 'readme.steps.1', 3],
      ['f.command.1', 'pip install -e .', 'readme.steps.1', 1],
      ['f.command.2', 'uvicorn inventory.main:app', 'readme.steps.1', 2],
    ]);
  });

  it('bullet lists, non-steps headings, H4 headings and a "Features" ordered list get NO sequence', async () => {
    const root = readmeRepo([
      '## Installation', '', '- `npm ci`', '- `npm run dev`', '',
      '## Features', '', '1. Live sync', '2. Offline mode', '',
      '## Contributing', '', '1. Fork the repo', '2. Open a PR', '',
      '#### Install', '', '1. `make deploy`', '2. `make clean`', '',
    ]);
    await runFacts(root);
    const f = readFacts(root);
    expect(seqOf(f)).toEqual([]);
    // the ordered Features list stays what it was: features without an order claim
    expect((f.facts as SeqFact[]).filter((x) => x.source.file === 'README.md' && x.kind === 'feature').map((x) => [x.display, x.sequence]))
      .toEqual([['Live sync', null], ['Offline mode', null]]);
  });

  it('several step lists → readme.steps.1, .2 …; "1)" items, an unindented fence splits a list, prose ends it', async () => {
    const root = readmeRepo([
      '## Quick start', '', '1) `npm ci`', '2) npm run build', '', '   indented continuation', '3) Make sure Node 22 is installed', '',
      '```bash', 'npm run dev', '```', '',
      '1. `npm run dev`', '', 'Then enjoy.', '',
      '1. Restart the server', '', // prose ended the previous list; still under Quick start → a new list
      '## Usage', '', '1. **Sign in** — with your team account', '2. Invite a teammate', '',
    ]);
    await runFacts(root);
    expect(seqOf(readFacts(root)).map(([, display, collection, sequence]) => [display, collection, sequence])).toEqual([
      // features first (facts.json is grouped by kind), then commands
      ['Make sure Node 22 is installed', 'readme.steps.1', 3],
      ['Restart the server', 'readme.steps.3', 1],
      ['Sign in', 'readme.steps.4', 1],
      ['Invite a teammate', 'readme.steps.4', 2],
      ['npm ci', 'readme.steps.1', 1],
      ['npm run build', 'readme.steps.1', 2],
      ['npm run dev', 'readme.steps.2', 1],
    ]);
  });

  it('re-run is byte-stable with steps present (ids, sequences and order do not churn)', async () => {
    const root = tempRepo('js-next');
    await runFacts(root);
    const first = readFileSync(factsPath(root));
    await runFacts(root);
    expect(readFileSync(factsPath(root)).equals(first)).toBe(true);
    expect(validate(SCHEMA, readFacts(root))).toEqual([]);
  });

  it('schema: sequence is an integer >= 1 or null on text facts, always null on counts', () => {
    const f = { version: 1, minimumGate: { passed: true, missing: [] }, brand: { name: 'a', palette: 'violet', wordmark: null }, facts: [] as unknown[] };
    const text = { id: 'f.command.1', kind: 'command', value: 'x', display: 'x', unit: null, source: { file: 'README.md', locator: 'line:1', extractor: 't', rule: 't' }, hash: 'sha256:0000000000000000' };
    const count = { ...text, id: 'f.count.1', kind: 'count', value: 1, display: '1', unit: 'routes' };
    expect(validate(SCHEMA, { ...f, facts: [{ ...text, sequence: 2 }, { ...text, sequence: null }, text, { ...count, sequence: null }] })).toEqual([]);
    expect(validate(SCHEMA, { ...f, facts: [{ ...text, sequence: 0 }] })).not.toEqual([]);
    expect(validate(SCHEMA, { ...f, facts: [{ ...count, sequence: 1 }] })).not.toEqual([]);
  });
});

describe('facts — non-ASCII', () => {
  it('README H1 "Ứng dụng Én Nam 🚀" is preserved exactly as the app.name fallback', async () => {
    const root = tempRepo();
    write(root, 'README.md', '# Ứng dụng Én Nam 🚀\n\nQuản lý đơn hàng thật nhanh. Thêm nữa.\n');
    write(root, 'package.json', JSON.stringify({ dependencies: { next: '16', react: '19' }, scripts: { dev: 'next dev' } }));
    write(root, 'app/page.tsx', 'export default 1');
    const { code } = await runFacts(root);
    expect(code).toBe(0);
    const f = readFacts(root);
    const name = f.facts.find((x) => x.kind === 'app.name')!;
    expect(name.display).toBe('Ứng dụng Én Nam 🚀');
    expect(name.source.file).toBe('README.md');
    expect(f.brand.name).toBe('Ứng dụng Én Nam 🚀');
    expect(f.facts.find((x) => x.kind === 'app.tagline')!.display).toBe('Quản lý đơn hàng thật nhanh.');
  });
});

describe('facts — fail loud', () => {
  it('a malformed package.json is an E_JSON error naming the file, not a silently thinner film', async () => {
    const root = tempRepo('js-next');
    write(root, 'package.json', '{ "name": "x", }');
    const { code, out } = await runFacts(root);
    expect(code).toBe(1);
    expect(out.error.code).toBe('E_JSON');
    expect(out.error.message).toContain('package.json');
  });

  it('pyproject TOML escapes: \\UXXXXXXXX and \\e decode; an invalid escape is E_TOML fail JSON, not a crash', async () => {
    const root = tempRepo('python-fastapi');
    // [project.scripts] kept so the repo still passes the minimum gate (command kind).
    write(root, 'pyproject.toml', '[project]\nname = "inv\\U0001F680"\ndescription = "Esc \\e here."\n\n[project.scripts]\ninventory = "inventory.cli:main"\n');
    const good = await runFacts(root);
    expect(good.code).toBe(0);
    const f = readFacts(root);
    expect(f.facts.find((x) => x.kind === 'app.name')!.display).toBe('inv\u{1F680}');
    expect(f.facts.find((x) => x.kind === 'app.tagline' && x.source.file === 'pyproject.toml')!.display).toBe('Esc \x1b here.');

    write(root, 'pyproject.toml', '[project]\nname = "inv"\ndescription = "bad \\q escape"\n');
    const { code, out } = await runFacts(root);
    expect(code).toBe(1);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe('E_TOML');
    expect(out.error.message).toContain('pyproject.toml');
  });

  it('an unreadable host path is E_FACTS_READ naming the path, not a raw fs exception', async () => {
    const root = tempRepo('js-next');
    let err: unknown;
    try {
      readText(root, 'app'); // a directory: readFileSync fails (EISDIR) the same way EACCES would
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ShowreelError);
    expect((err as ShowreelError).code).toBe('E_FACTS_READ');
    expect((err as ShowreelError).message).toContain('"app"');

    const missing = path.join(root, 'no-such-dir');
    let walkErr: unknown;
    try {
      walkFiles(missing);
    } catch (e) {
      walkErr = e;
    }
    expect(walkErr).toBeInstanceOf(ShowreelError);
    expect((walkErr as ShowreelError).code).toBe('E_FACTS_READ');
    expect((walkErr as ShowreelError).message).toContain(missing); // names the path, not "."
  });

  it('a read failure reaches the user as one fail JSON line (E_FACTS_READ, exit 1), not a crash', async () => {
    const missing = path.join(tempRepo(), 'no-such-dir');
    const { code, out } = await runFacts(missing);
    expect(code).toBe(1);
    expect(out).toMatchObject({ ok: false, cmd: 'facts', error: { code: 'E_FACTS_READ' } });
    expect(out.error.message).toContain(missing);
    expect(existsSync(missing)).toBe(false); // nothing written into a path that was not there
  });

  it('pyproject multi-line strings are decoded, never silently dropped; unterminated is E_TOML', async () => {
    const root = tempRepo('python-fastapi');
    write(root, 'pyproject.toml', [
      '[project]',
      "name = '''",
      "inv#lit'''",
      'description = """',
      'Stock counts \\',
      '    without # the "spreadsheet" \\u00e9."""',
      '',
      '[project.scripts]',
      'inventory = "inventory.cli:main"',
      '',
    ].join('\n'));
    const good = await runFacts(root);
    expect(good.code).toBe(0);
    const f = readFacts(root);
    expect(f.facts.find((x) => x.kind === 'app.name')!.display).toBe('inv#lit');
    expect(f.facts.find((x) => x.kind === 'app.tagline' && x.source.file === 'pyproject.toml')!.display)
      .toBe('Stock counts without # the "spreadsheet" é.');
    expect(f.facts.filter((x) => x.kind === 'command').map((x) => x.display)).toContain('inventory');

    write(root, 'pyproject.toml', '[project]\nname = "inv"\ndescription = """never closed\n\n[project.scripts]\ninventory = "x"\n');
    const { code, out } = await runFacts(root);
    expect(code).toBe(1);
    expect(out.error.code).toBe('E_TOML');
    expect(out.error.message).toContain('description');
  });

  it('pyproject multi-line basic string: an escaped \\" right before """ does not end the string early', async () => {
    const root = tempRepo('python-fastapi');
    write(root, 'pyproject.toml', '[project]\nname = "inv"\ndescription = """Say \\""" hi"""\n\n[project.scripts]\ninventory = "x"\n');
    expect((await runFacts(root)).code).toBe(0);
    // TOML: \" is a quote, then "" — the string is `Say """ hi`, not the truncated `Say \`.
    expect(readFacts(root).facts.find((x) => x.kind === 'app.tagline' && x.source.file === 'pyproject.toml')!.display)
      .toBe('Say """ hi');
  });

  it('unknown arguments are rejected', async () => {
    const root = tempRepo('js-next');
    const { code, out } = await runFacts(root);
    expect(code).toBe(0);
    let printed = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((c: string | Uint8Array) => { printed += String(c); return true; });
    const bad = await run(['--bogus'], root);
    vi.restoreAllMocks();
    expect(bad).toBe(1);
    expect(JSON.parse(printed).error.code).toBe('E_USAGE');
    expect(out.ok).toBe(true);
  });
});
