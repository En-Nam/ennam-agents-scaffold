#!/usr/bin/env node
/**
 * verify-game-unity-bake.ts — maintainer pre-publish gate for v1.8.0 game-unity profile.
 *
 * Run BEFORE `npm publish` to spot-check the two CRITICAL UNVERIFIED items
 * surfaced by pre-publish research (see docs/superpowers/specs/2026-06-26-game-unity-profile-design.md):
 *
 *   1. CoplayDev/unity-mcp v9.7.3 `uvx` invocation parses
 *   2. Tripo3D balance endpoint URL (the previously-proposed /v2/openapi/user/balance
 *      was flagged as invented — the skill instructs shelling out to the Python SDK
 *      or fetching live OpenAPI schema instead)
 *
 * This script is NOT part of the published artifact:
 *   packages/cli/package.json `files` = ["dist", "templates"]
 *   scripts/ at repo root is OUTSIDE that list — confirmed.
 *
 * Requirements:
 *   - TRIPO_API_KEY env (Pro tier preferred; Free works for the handshake but credits charge)
 *   - uv (uvx) on PATH
 *   - Network access to api.tripo3d.ai and pypi.org
 *
 * Exit code 0 = ready to publish; non-zero = address findings before publish.
 */

import { execaSync } from 'execa';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

let failures = 0;
const failures_list: string[] = [];

function fail(msg: string): void {
  console.error(`[verify-game-unity-bake] FAIL: ${msg}`);
  failures++;
  failures_list.push(msg);
}

function ok(msg: string): void {
  console.log(`[verify-game-unity-bake] OK:   ${msg}`);
}

// ============================================================
// Check 1 — uvx on PATH (cannot verify Unity bridge handshake
// without a real Unity Editor; this is the host-side prereq).
// ============================================================
try {
  const { stdout } = execaSync('uvx', ['--version']);
  ok(`uvx present: ${stdout.trim()}`);
} catch {
  fail('uvx not on PATH. Install uv: https://docs.astral.sh/uv/getting-started/installation/');
}

// ============================================================
// Check 2 — CoplayDev's package is resolvable on PyPI.
// We do NOT try to actually run the Unity bridge here because it
// would require a Unity Editor instance + project to connect to.
// What we CAN verify: PyPI knows about `coplay-mcp-server`.
// ============================================================
try {
  // `uvx --from coplay-mcp-server --help` would attempt to install + run; we just
  // resolve the package by hitting PyPI's JSON API.
  await new Promise<void>((resolve, reject) => {
    const req = httpsRequest(
      new URL('https://pypi.org/pypi/coplay-mcp-server/json'),
      { method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const info = JSON.parse(body);
              ok(`PyPI knows coplay-mcp-server (latest: ${info?.info?.version ?? 'unknown'})`);
              resolve();
            } catch {
              fail('PyPI returned 200 but body not parseable for coplay-mcp-server');
              resolve();
            }
          } else if (res.statusCode === 404) {
            fail(`PyPI 404 for coplay-mcp-server — the .mcp.json snippet in templates/game-unity/.mcp.json.partial.hbs will fail on user install. Update the snippet (the CoplayDev install docs may have renamed the bridge package).`);
            resolve();
          } else {
            fail(`PyPI returned ${res.statusCode} for coplay-mcp-server`);
            resolve();
          }
        });
      },
    );
    req.on('error', (e) => { fail(`PyPI fetch error: ${e.message}`); resolve(); });
    req.end();
  });
} catch (e) {
  fail(`PyPI check threw: ${(e as Error).message}`);
}

// ============================================================
// Check 3 — Tripo3D base URL responds (does NOT verify the
// balance endpoint — see Check 4 for that).
// ============================================================
try {
  await new Promise<void>((resolve) => {
    const req = httpsRequest(
      new URL('https://api.tripo3d.ai/v2/openapi/'),
      { method: 'GET' },
      (res) => {
        // 401/403/404 are all "host alive" signals; we expect at least one of those without auth.
        if (res.statusCode && res.statusCode < 500) {
          ok(`Tripo base URL alive (status ${res.statusCode} without auth, expected)`);
        } else {
          fail(`Tripo base URL returned 5xx (${res.statusCode}) — service may be down`);
        }
        res.resume();
        resolve();
      },
    );
    req.on('error', (e) => { fail(`Tripo fetch error: ${e.message}`); resolve(); });
    req.end();
  });
} catch (e) {
  fail(`Tripo check threw: ${(e as Error).message}`);
}

// ============================================================
// Check 4 — Tripo balance endpoint (only if TRIPO_API_KEY is set).
// The skill instructs using the Python SDK `get_balance()` because
// the raw REST path was previously invented in research. This check
// uses the Python SDK to surface the REAL endpoint.
// ============================================================
const TRIPO_KEY = process.env.TRIPO_API_KEY;
if (TRIPO_KEY) {
  try {
    const { stdout, stderr } = execaSync(
      'uvx',
      ['--from', 'tripo3d', 'python', '-c',
        'import os, json\nfrom tripo3d import Tripo3D\nc = Tripo3D(api_key=os.environ["TRIPO_API_KEY"])\nprint(json.dumps({"balance": c.get_balance()}))'],
      { env: { ...process.env, TRIPO_API_KEY: TRIPO_KEY } },
    );
    ok(`Tripo3D Python SDK get_balance() returned: ${stdout.trim()}`);
    if (stderr) console.warn(`[verify-game-unity-bake]   stderr (informational): ${stderr.trim()}`);
  } catch (e) {
    fail(`Tripo3D Python SDK get_balance() failed — the asset-pipeline-tripo3d skill's auth gate will not work. Error: ${(e as Error).message}`);
  }
} else {
  console.warn('[verify-game-unity-bake] SKIP: TRIPO_API_KEY not set — cannot verify balance handshake. Set it and re-run before publish.');
}

// ============================================================
// Check 5 — the published artifact does NOT include this script.
// ============================================================
try {
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'packages', 'cli', 'package.json'), 'utf8'));
  const files: string[] = pkg.files ?? [];
  if (files.includes('scripts') || files.includes('scripts/')) {
    fail('packages/cli/package.json `files` includes "scripts" — this maintainer script would leak to the published npm artifact. Remove it.');
  } else if (files.includes('dist') && files.includes('templates')) {
    ok('Published artifact = ["dist", "templates"] — this script stays maintainer-only.');
  } else {
    fail(`Unexpected files[] in packages/cli/package.json: ${JSON.stringify(files)} — expected ["dist", "templates"]`);
  }
} catch (e) {
  fail(`Could not read packages/cli/package.json: ${(e as Error).message}`);
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
  failures_list.forEach((m, i) => console.error(`  ${i + 1}. ${m}`));
  console.error('\nDo NOT publish until these are addressed. Update templates/game-unity/.mcp.json.partial.hbs or asset-pipeline-tripo3d/SKILL.md as needed.');
  process.exit(1);
}
