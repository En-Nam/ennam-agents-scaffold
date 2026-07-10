import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// v1.12 (#22) — code-derived env-var scanner + key-source registry.
//
// Rule 13: printNextSteps must NOT hand-maintain a list of env vars — it drifts from the
// templates and can't see a token added to a partial. Instead we scan the STRUCTURED
// config actually written to disk (.mcp.json + .claude/settings.json) for `${VAR}` tokens.
// We deliberately do NOT freeform-scan .claude/skills/**: those carry example/other-tool
// tokens ($UNITY, $MESHY_API_KEY, $MAESTRO_CLOUD_API_KEY, $$POSTGRES_USER) that are NOT
// keys the user must set — reporting them would erode trust (Rule 12). Feature-gated keys
// that genuinely live in a skill (today only TRIPO_API_KEY) are surfaced via an explicit
// allowlist keyed off that profile's on-disk fingerprint.

export interface KeySource {
  /** Where to obtain the value (a URL or a short human instruction). */
  obtainUrl: string;
  /** A setup/docs link. */
  guide: string;
}

/** The 6 real keys the current template set can require. Extended as new MCP/skills land. */
export const KEY_SOURCES: Record<string, KeySource> = {
  JIRA_URL: {
    obtainUrl: 'Your Atlassian site URL, e.g. https://<your-org>.atlassian.net',
    guide: 'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
  },
  JIRA_TOKEN: {
    obtainUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens (Create API token)',
    guide: 'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
  },
  FIGMA_TOKEN: {
    obtainUrl: 'https://www.figma.com/developers/api#access-tokens (Settings → Security → Personal access tokens)',
    guide: 'https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens',
  },
  GITHUB_TOKEN: {
    obtainUrl: 'https://github.com/settings/tokens (fine-grained or classic PAT with repo scope)',
    guide: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
  },
  PG_CONN_STR: {
    obtainUrl: 'From your DB provider/DBA — postgresql://user:password@host:5432/dbname',
    guide: 'https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING',
  },
  TRIPO_API_KEY: {
    obtainUrl: 'https://platform.tripo3d.ai/api-keys (--live needs Pro tier)',
    guide: 'https://platform.tripo3d.ai/docs',
  },
};

// Feature-gated keys that live in a skill, not in .mcp.json. Surfaced only when that
// profile's on-disk footprint is present (derive from disk, not a profile-name guess).
const SKILL_KEYS: { envVar: string; fingerprint: string }[] = [
  { envVar: 'TRIPO_API_KEY', fingerprint: path.join('.claude', 'skills', 'asset-pipeline-tripo3d') },
];

// Match `${VAR}` — the interpolation form MCP/settings config actually use. Requiring the
// braces avoids matching a bare `$` in a path or shell command.
const TOKEN_RE = /\$\{([A-Z0-9_]+)\}/g;

function extractTokens(text: string, into: Set<string>): void {
  for (const m of text.matchAll(TOKEN_RE)) into.add(m[1]!);
}

function walkStrings(value: unknown, fn: (s: string) => void): void {
  if (typeof value === 'string') fn(value);
  else if (Array.isArray(value)) for (const v of value) walkStrings(v, fn);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) walkStrings(v, fn);
}

async function scanJsonFile(absPath: string, into: Set<string>): Promise<void> {
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch {
    return; // file absent — nothing to scan
  }
  try {
    walkStrings(JSON.parse(text), s => extractTokens(s, into));
  } catch {
    // Malformed JSON still shouldn't hide a ${VAR} the user must set — scan the raw text.
    extractTokens(text, into);
  }
}

/**
 * Return the sorted, de-duplicated set of env-var names the installed config requires,
 * derived from disk: `${VAR}` tokens in .mcp.json + .claude/settings.json, plus any
 * skill-gated key whose on-disk fingerprint is present.
 */
export async function scanRequiredEnv(cwd: string): Promise<string[]> {
  const found = new Set<string>();
  await scanJsonFile(path.join(cwd, '.mcp.json'), found);
  await scanJsonFile(path.join(cwd, '.claude', 'settings.json'), found);
  for (const { envVar, fingerprint } of SKILL_KEYS) {
    if (existsSync(path.join(cwd, fingerprint))) found.add(envVar);
  }
  return [...found].sort();
}

export interface KeyReportEntry {
  name: string;
  present: boolean;
  /** null = a scanned token with no KEY_SOURCES entry — surfaced, never dropped (Rule 13). */
  source: KeySource | null;
  targetFile: string;
}

/**
 * Build a per-key report: for each required env var, whether it is set in `env`, where to
 * obtain it, and the file to put it in. An unknown token (not in KEY_SOURCES) still appears
 * with source=null so it is never silently dropped.
 */
export async function buildKeyReport(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<KeyReportEntry[]> {
  const names = await scanRequiredEnv(cwd);
  return names.map(name => ({
    name,
    present: typeof env[name] === 'string' && env[name]!.length > 0,
    source: KEY_SOURCES[name] ?? null,
    targetFile: '.env.local',
  }));
}

/**
 * Render the key report as a single (multi-line) next-step string. Lists only the
 * still-missing keys with where to get each; a re-run with everything set prints a
 * one-line confirmation instead.
 */
export function formatKeyReportStep(report: KeyReportEntry[]): string {
  if (report.length === 0) return 'No MCP/tooling keys are required by this install.';
  const missing = report.filter(r => !r.present);
  if (missing.length === 0) {
    return `All ${report.length} required keys are already set (${report.map(r => r.name).join(', ')}).`;
  }
  const lines = [`Set these keys in .env.local (${missing.length} of ${report.length} still missing):`];
  for (const r of missing) {
    if (r.source) {
      lines.push(`         - ${r.name}  →  ${r.source.obtainUrl}`);
      lines.push(`             guide: ${r.source.guide}`);
    } else {
      lines.push(`         - ${r.name}  →  (unknown key — not in the scaffold catalog; set it if your tooling requires it)`);
    }
  }
  return lines.join('\n');
}
