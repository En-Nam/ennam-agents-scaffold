import { listProfiles } from './profiles.js';
import type { ProfileDef } from './types.js';

// The wizard role each profile is reached through. Kept here (not imported from
// the interactive wizard module) so `--list` has zero prompt/side-effect deps.
// A profile with no entry falls back to 'Other' — the list test asserts this
// map stays complete so a new profile can't silently drop off the catalog.
const PROFILE_ROLE: Record<string, string> = {
  next: 'Developer',
  react: 'Developer',
  'react-native': 'Developer',
  flutter: 'Developer',
  python: 'Developer',
  go: 'Developer',
  'dotnet-mvc': 'Developer',
  express: 'Developer',
  'local-root': 'Developer',
  qa: 'QA-QC',
  'qa-automation': 'QA-QC',
  ba: 'BA',
  pm: 'PM',
  'tech-writer': 'Tech-Writer',
  'data-analytics': 'Data',
  hr: 'HR',
  'devops-aws': 'DevOps',
  'devops-azure': 'DevOps',
  'devops-gcp': 'DevOps',
  'devops-docker': 'DevOps',
  'game-unity': 'Game-Dev',
  'agent-org': 'Agent-Org',
};

export interface CatalogEntry {
  name: string;
  role: string;
  description: string;
  extraMcp: string[];
  /** minClaudeCodeVersion, or null when the profile has no floor. */
  requires: string | null;
}

/** Machine-readable profile catalog, sorted by role then name. */
export function buildCatalog(): CatalogEntry[] {
  return listProfiles()
    .map((p: ProfileDef) => ({
      name: p.name,
      role: PROFILE_ROLE[p.name] ?? 'Other',
      description: p.description,
      extraMcp: p.extraMcp,
      requires: p.minClaudeCodeVersion ?? null,
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}

/** `--list --json`: stable JSON for portals / scripts. */
export function renderCatalogJson(): string {
  return JSON.stringify(buildCatalog(), null, 2);
}

/** `--list`: human-readable, grouped by role. */
export function renderCatalogHuman(): string {
  const byRole = new Map<string, CatalogEntry[]>();
  for (const entry of buildCatalog()) {
    const arr = byRole.get(entry.role) ?? [];
    arr.push(entry);
    byRole.set(entry.role, arr);
  }
  const lines: string[] = [];
  for (const [role, entries] of byRole) {
    lines.push(role);
    for (const e of entries) {
      const mcp = e.extraMcp.length ? `  [+mcp: ${e.extraMcp.join(', ')}]` : '';
      const req = e.requires ? `  (requires Claude Code >= ${e.requires})` : '';
      lines.push(`  ${e.name.padEnd(16)} ${e.description}${mcp}${req}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
