import type { FileKind } from './types.js';

interface Rule {
  match: (rel: string) => boolean;
  kind: FileKind;
}

// Order matters: first match wins.
// Plan 1 note: .mcp.json and .claude/settings.json are intentionally classified
// write-or-ask (not json-merge). Plan 2 will reintroduce json-merge once the merge
// implementation lands. Until then, conflicts on those files follow --merge-strategy.
const RULES: Rule[] = [
  { match: r => r === 'AGENTS.md',                              kind: 'write-or-ask' },
  { match: r => r === 'CLAUDE.md',                              kind: 'append-marker' },
  { match: r => r === '.gitignore',                             kind: 'append-lines' },
  { match: r => r === '.mcp.json',                              kind: 'write-or-ask' },
  { match: r => r === '.claude/settings.json',                  kind: 'write-or-ask' },
  { match: r => r.startsWith('.claude/hooks/'),                 kind: 'write-or-ask' },
  { match: r => r.startsWith('.claude/commands/'),              kind: 'skip-if-exists' },
  { match: r => r.startsWith('.claude/agents/'),                kind: 'skip-if-exists' },
  { match: r => r.startsWith('.serena/'),                       kind: 'skip-if-exists' },
  { match: r => r.startsWith('docs/superpowers/'),              kind: 'skip-if-exists' },
];

export function classifyFile(relPath: string): FileKind {
  const norm = relPath.replace(/\\/g, '/');
  for (const r of RULES) if (r.match(norm)) return r.kind;
  return 'write-or-ask';
}
