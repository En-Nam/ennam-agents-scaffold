import type { FileKind } from './types.js';

interface Rule {
  match: (rel: string) => boolean;
  kind: FileKind;
}

// Order matters: first match wins.
// T11: .mcp.json and .claude/settings.json use json-merge (wired in T11 via execute.ts).
// User wins on key conflicts; profile partial (.mcp.json.partial.hbs) is merged into shared
// .mcp.json.hbs before the final write.
const RULES: Rule[] = [
  { match: r => r === 'AGENTS.md',                              kind: 'write-or-ask' },
  { match: r => r === 'CLAUDE.md',                              kind: 'append-marker' },
  { match: r => r === '.gitignore',                             kind: 'append-lines' },
  { match: r => r === '.mcp.json',                              kind: 'json-merge' },
  { match: r => r === '.claude/settings.json',                  kind: 'json-merge' },
  { match: r => r.startsWith('.claude/hooks/'),                 kind: 'write-or-ask' },
  { match: r => r.startsWith('.claude/commands/'),              kind: 'skip-if-exists' },
  { match: r => r.startsWith('.claude/agents/'),                kind: 'skip-if-exists' },
  { match: r => r.startsWith('.claude/skills/'),                kind: 'skip-if-exists' },
  { match: r => r.startsWith('.serena/'),                       kind: 'skip-if-exists' },
  { match: r => r.startsWith('docs/superpowers/'),              kind: 'skip-if-exists' },
];

export function classifyFile(relPath: string): FileKind {
  const norm = relPath.replace(/\\/g, '/');
  for (const r of RULES) if (r.match(norm)) return r.kind;
  return 'write-or-ask';
}
