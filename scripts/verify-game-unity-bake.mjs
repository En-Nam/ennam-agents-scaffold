#!/usr/bin/env node
/**
 * verify-game-unity-bake.mjs — maintainer pre-publish gate for v1.8.0 game-unity profile.
 *
 * Run BEFORE `npm publish` to spot-check the CRITICAL UNVERIFIED items
 * surfaced by pre-publish research (see docs/superpowers/specs/2026-06-26-game-unity-profile-design.md §9):
 *
 *   1. CoplayDev/unity-mcp v9.7.3 `uvx` invocation parses
 *   2. Tripo3D balance endpoint URL (the previously-proposed /v2/openapi/user/balance
 *      was flagged as invented — the skill instructs shelling out to the Python SDK
 *      or fetching live OpenAPI schema instead)
 *
 * Plain ESM (.mjs), zero deps beyond Node 20 built-ins — runs as:
 *   node scripts/verify-game-unity-bake.mjs
 *
 * NOT part of the published artifact: packages/cli/package.json `files = ["dist", "templates"]`.
 * scripts/ at repo root is OUTSIDE that list — Check 5 self-verifies this invariant.
 *
 * Requirements:
 *   - TRIPO_API_KEY env (Pro tier preferred; Free works for the handshake but credits charge)
 *   - uv (uvx) on PATH (for Tripo SDK invocation in Check 4)
 *   - Network access to api.tripo3d.ai and pypi.org
 *
 * Exit code 0 = ready to publish; non-zero = address findings before publish.
 */

import { execFileSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

let failures = 0;
const failuresList = [];

function fail(msg) {
  console.error(`[verify-game-unity-bake] FAIL: ${msg}`);
  failures++;
  failuresList.push(msg);
}

function ok(msg) {
  console.log(`[verify-game-unity-bake] OK:   ${msg}`);
}

function fetchUrl(url, method = 'GET') {
  return new Promise((resolve) => {
    const req = httpsRequest(new URL(url), { method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.end();
  });
}

// ============================================================
// Check 1 — uvx on PATH (host-side prereq; cannot verify the
// Unity bridge handshake without a real Unity Editor instance).
// ============================================================
try {
  // execFileSync (NOT execSync) — no shell, no injection surface even with future arg refactors.
  const out = execFileSync('uvx', ['--version'], { encoding: 'utf8' }).trim();
  ok(`uvx present: ${out}`);
} catch {
  fail('uvx not on PATH. Install uv: https://docs.astral.sh/uv/getting-started/installation/');
}

// ============================================================
// Check 2 — CoplayDev's `coplay-mcp-server` resolvable on PyPI.
// `uvx --from coplay-mcp-server ...` would attempt install+run; we
// just resolve the package via PyPI's JSON API to avoid side effects.
// ============================================================
{
  const r = await fetchUrl('https://pypi.org/pypi/coplay-mcp-server/json');
  if (r.status === 200) {
    try {
      const info = JSON.parse(r.body);
      ok(`PyPI knows coplay-mcp-server (latest: ${info?.info?.version ?? 'unknown'})`);
    } catch {
      fail('PyPI returned 200 but body not parseable for coplay-mcp-server');
    }
  } else if (r.status === 404) {
    fail(
      'PyPI 404 for coplay-mcp-server — the .mcp.json snippet in ' +
      'templates/game-unity/.mcp.json.partial.hbs will fail on user install. ' +
      'Update the snippet (CoplayDev install docs may have renamed the bridge package).',
    );
  } else if (r.error) {
    fail(`PyPI fetch error: ${r.error}`);
  } else {
    fail(`PyPI returned ${r.status} for coplay-mcp-server`);
  }
}

// ============================================================
// Check 3 — Tripo3D base URL responds (host alive signal; does NOT
// verify the balance endpoint — Check 4 handles that).
// ============================================================
{
  const r = await fetchUrl('https://api.tripo3d.ai/v2/openapi/');
  if (r.error) {
    fail(`Tripo fetch error: ${r.error}`);
  } else if (r.status > 0 && r.status < 500) {
    // 401/403/404 are all "host alive" signals when called without auth.
    ok(`Tripo base URL alive (status ${r.status} without auth, expected)`);
  } else {
    fail(`Tripo base URL returned 5xx (${r.status}) — service may be down`);
  }
}

// ============================================================
// Check 4 — Tripo balance endpoint via official Python SDK
// (only if TRIPO_API_KEY is set). The skill avoids hard-coding
// the raw REST balance URL because research flagged it invented.
// ============================================================
const TRIPO_KEY = process.env.TRIPO_API_KEY;
if (TRIPO_KEY) {
  try {
    // Real SDK shape (verified against tripo3d==0.4.1, June 2026):
    //   - Class is `TripoClient` (NOT `Tripo3D` — earlier research was wrong)
    //   - ALL methods are async; must wrap in asyncio.run
    //   - `close()` is async too — finally-await it
    //   - Balance is a dataclass with fields {balance, frozen}
    // execFileSync with argv array — no shell, Python -c gets the script as a single argv
    // element. Safer than building a shell command string.
    const py =
      'import os, json, asyncio, dataclasses\n' +
      'from tripo3d import TripoClient, __version__ as v\n' +
      'async def main():\n' +
      '    c = TripoClient(api_key=os.environ["TRIPO_API_KEY"])\n' +
      '    try:\n' +
      '        bal = await c.get_balance()\n' +
      '        print(json.dumps({"sdk_version": v, "balance": dataclasses.asdict(bal)}))\n' +
      '    finally:\n' +
      '        await c.close()\n' +
      'asyncio.run(main())\n';
    const out = execFileSync(
      'uvx',
      ['--from', 'tripo3d', 'python', '-c', py],
      {
        encoding: 'utf8',
        env: { ...process.env, TRIPO_API_KEY: TRIPO_KEY },
      },
    ).trim();
    ok(`Tripo3D Python SDK TripoClient.get_balance() returned: ${out}`);
  } catch (e) {
    fail(
      'Tripo3D Python SDK TripoClient.get_balance() failed — the asset-pipeline-tripo3d skill\'s ' +
      `auth gate will not work. Error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
} else {
  console.warn(
    '[verify-game-unity-bake] SKIP: TRIPO_API_KEY not set — cannot verify balance handshake. ' +
    'Set it and re-run before publish.',
  );
}

// ============================================================
// Check 5 — the published artifact does NOT include this script.
// (packages/cli/package.json `files` must NOT contain "scripts".)
// ============================================================
try {
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'packages', 'cli', 'package.json'), 'utf8'));
  const files = pkg.files ?? [];
  if (files.includes('scripts') || files.includes('scripts/')) {
    fail(
      'packages/cli/package.json `files` includes "scripts" — this maintainer ' +
      'script would leak to the published npm artifact. Remove it.',
    );
  } else if (files.includes('dist') && files.includes('templates')) {
    ok('Published artifact = ["dist", "templates"] — this script stays maintainer-only.');
  } else {
    fail(`Unexpected files[] in packages/cli/package.json: ${JSON.stringify(files)} — expected ["dist", "templates"]`);
  }
} catch (e) {
  fail(`Could not read packages/cli/package.json: ${e instanceof Error ? e.message : String(e)}`);
}

// ============================================================
// Summary
// ============================================================
console.log();
if (failures === 0) {
  console.log('[verify-game-unity-bake] ALL CHECKS PASSED. Ready to publish v1.8.0.');
  process.exit(0);
} else {
  console.error(`[verify-game-unity-bake] ${failures} CHECK(S) FAILED:`);
  failuresList.forEach((m, i) => console.error(`  ${i + 1}. ${m}`));
  console.error(
    '\nDo NOT publish until these are addressed. Update ' +
    'templates/game-unity/.mcp.json.partial.hbs or asset-pipeline-tripo3d/SKILL.md as needed.',
  );
  process.exit(1);
}
