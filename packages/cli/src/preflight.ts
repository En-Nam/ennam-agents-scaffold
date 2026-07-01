import { execFileSync } from 'node:child_process';
import type { ProfileDef } from './types.js';

// Preflight check for `minClaudeCodeVersion` on a profile. Policy is WARN, not
// BLOCK — the wizard continues regardless of `meetsMinimum`. See
// `mem:decisions/v1.9-scope` for why.

export interface PreflightResult {
  installedVersion: string | null;
  meetsMinimum: boolean;
  warnings: string[];
}

export type VersionFetcher = () => string | null;

const defaultVersionFetcher: VersionFetcher = () => {
  try {
    return execFileSync('claude', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
  } catch {
    return null;
  }
};

export function extractVersion(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m[0] : null;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10));
  const pb = b.split('.').map((n) => Number.parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function checkPreflight(
  profile: Pick<ProfileDef, 'name' | 'minClaudeCodeVersion'>,
  fetch: VersionFetcher = defaultVersionFetcher,
): PreflightResult {
  const warnings: string[] = [];
  const min = profile.minClaudeCodeVersion;

  if (!min) {
    return { installedVersion: null, meetsMinimum: true, warnings };
  }

  const installed = extractVersion(fetch());

  if (!installed) {
    warnings.push(
      `Profile "${profile.name}" recommends Claude Code >= ${min}. ` +
        `Could not detect \`claude\` in PATH — install from https://code.claude.com/ before using this profile.`,
    );
    return { installedVersion: null, meetsMinimum: false, warnings };
  }

  if (compareVersions(installed, min) < 0) {
    warnings.push(
      `Profile "${profile.name}" recommends Claude Code >= ${min}, ` +
        `but detected ${installed}. Some features may not work — consider \`claude update\`.`,
    );
    return { installedVersion: installed, meetsMinimum: false, warnings };
  }

  return { installedVersion: installed, meetsMinimum: true, warnings };
}
