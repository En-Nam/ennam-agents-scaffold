import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import pc from 'picocolors';
import { scanRequiredEnv, KEY_SOURCES } from './env-scan.js';
import { detectLegacySettings, hasStaleChromeDevtools } from './checks.js';
import { extractVersion, compareVersions } from './preflight.js';

// v1.12 (#27) — read-only diagnostic for an installed scaffold. Reads only files in cwd
// and execs ONLY `claude --version`; it never writes, never runs `claude plugin list`, and
// never probes ~/.claude. Exit 1 iff any ERROR-severity finding; warnings/info exit 0.

export type Severity = 'error' | 'warn' | 'info';
export interface Finding {
  id: string;
  severity: Severity;
  message: string;
}

// The Superpowers workflow (enabled in the shared settings.json) needs Claude Code >= 2.1.
const CLAUDE_BASELINE = '2.1';

async function readJson(abs: string): Promise<{ present: boolean; obj?: Record<string, unknown>; parseError?: boolean }> {
  let raw: string;
  try {
    raw = await readFile(abs, 'utf8');
  } catch {
    return { present: false };
  }
  try {
    return { present: true, obj: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return { present: true, parseError: true };
  }
}

function claudeVersionFinding(): Finding | null {
  let raw: string | null;
  try {
    raw = execFileSync('claude', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
  } catch {
    raw = null;
  }
  const installed = extractVersion(raw);
  if (!installed) {
    return { id: 'claude-version', severity: 'warn', message: `Could not detect \`claude\` in PATH (recommended >= ${CLAUDE_BASELINE}). Install from https://code.claude.com/.` };
  }
  if (compareVersions(installed, CLAUDE_BASELINE) < 0) {
    return { id: 'claude-version', severity: 'warn', message: `Claude Code ${installed} is behind the recommended ${CLAUDE_BASELINE} — consider \`claude update\`.` };
  }
  return null;
}

/** Run every read-only check and return the findings (env overridable for testing). */
export async function collectFindings(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<Finding[]> {
  const findings: Finding[] = [];

  // .mcp.json — must exist, parse, and carry an `mcpServers` object.
  const mcpAbs = path.join(cwd, '.mcp.json');
  const mcp = await readJson(mcpAbs);
  if (!mcp.present) {
    findings.push({ id: 'mcp-json-valid', severity: 'error', message: '.mcp.json is missing — run the scaffold install first.' });
  } else if (mcp.parseError) {
    findings.push({ id: 'mcp-json-valid', severity: 'error', message: '.mcp.json is not valid JSON.' });
  } else if (!mcp.obj || typeof mcp.obj.mcpServers !== 'object' || mcp.obj.mcpServers === null) {
    findings.push({ id: 'mcp-json-valid', severity: 'error', message: '.mcp.json has no `mcpServers` object.' });
  } else if (hasStaleChromeDevtools(mcp.obj as { mcpServers?: Record<string, unknown> })) {
    findings.push({ id: 'stale-chrome-devtools', severity: 'warn', message: '.mcp.json still contains a `chrome-devtools` server (removed in v1.2) — remove it manually.' });
  }

  // .claude/settings.json — must parse; warn on the known legacy shapes.
  const settingsAbs = path.join(cwd, '.claude', 'settings.json');
  const settings = await readJson(settingsAbs);
  if (!settings.present) {
    findings.push({ id: 'settings-json-valid', severity: 'error', message: '.claude/settings.json is missing.' });
  } else if (settings.parseError) {
    findings.push({ id: 'settings-json-valid', severity: 'error', message: '.claude/settings.json is not valid JSON.' });
  } else if (settings.obj) {
    for (const w of detectLegacySettings(settings.obj)) {
      findings.push({ id: 'settings-shape-legacy', severity: 'warn', message: w });
    }
  }

  // Required env keys — derived from the config on disk (Rule 13), checked against `env`.
  for (const name of await scanRequiredEnv(cwd)) {
    if (typeof env[name] === 'string' && env[name]!.length > 0) continue;
    if (KEY_SOURCES[name]) {
      findings.push({ id: 'env-vars-present', severity: 'error', message: `${name} is required by your config but not set. Get it: ${KEY_SOURCES[name]!.obtainUrl}` });
    } else {
      findings.push({ id: 'unknown-env-token', severity: 'warn', message: `${name} is referenced by your config but not set and not in the key catalog — set it if your tooling needs it.` });
    }
  }

  // Secret-leak guard — an existing .env/.env.local must be gitignored.
  const envFiles = ['.env.local', '.env'].filter(f => existsSync(path.join(cwd, f)));
  if (envFiles.length > 0) {
    let gi = '';
    try {
      gi = await readFile(path.join(cwd, '.gitignore'), 'utf8');
    } catch {
      // no .gitignore
    }
    const lines = gi.split('\n').map(l => l.trim());
    const leaking = envFiles.filter(f => !lines.includes(f));
    if (leaking.length > 0) {
      findings.push({ id: 'env-local-gitignored', severity: 'warn', message: `${leaking.join(', ')} exist but are not gitignored — your secrets can be committed. Add them to .gitignore.` });
    }
  }

  const versionFinding = claudeVersionFinding();
  if (versionFinding) findings.push(versionFinding);

  return findings;
}

export async function runDoctor(cwd: string, opts: { json?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<number> {
  const findings = await collectFindings(cwd, opts.env ?? process.env);
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warn').length;

  if (opts.json) {
    console.log(JSON.stringify({ ok: errors === 0, errors, warnings, findings }, null, 2));
    return errors > 0 ? 1 : 0;
  }

  console.log(pc.bold(`  Doctor — ${cwd}`));
  console.log();
  if (findings.length === 0) {
    console.log(pc.green('  ✓ All checks passed.'));
    return 0;
  }
  for (const f of findings) {
    const tag = f.severity === 'error' ? pc.red('✖ error') : f.severity === 'warn' ? pc.yellow('⚠ warn ') : pc.dim('· info ');
    console.log(`  ${tag}  ${f.message}  ${pc.dim(`[${f.id}]`)}`);
  }
  console.log();
  console.log(`  ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.`);
  if (errors > 0) console.log(pc.dim('  Fix the errors above, then re-run `npx @ennamjsc/agents-scaffold --doctor`.'));
  return errors > 0 ? 1 : 0;
}
