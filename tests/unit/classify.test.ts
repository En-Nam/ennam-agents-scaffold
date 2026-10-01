import { describe, it, expect } from 'vitest';
import { classifyFile } from '../../packages/cli/src/classify.js';

describe('classifyFile', () => {
  it.each([
    ['AGENTS.md',                       'write-or-ask'],
    ['ORG.md',                          'skip-if-exists'],
    ['POLICY.md',                       'skip-if-exists'],
    ['CLAUDE.md',                       'append-marker'],
    ['.gitignore',                      'append-lines'],
    // v1.14 — .gitattributes must APPEND, never prompt-overwrite a user's existing rules.
    ['.gitattributes',                  'append-lines'],
    ['.mcp.json',                       'json-merge'],
    ['.claude/settings.json',           'json-merge'],
    ['.claude/hooks/session-start.ps1', 'write-or-ask'],
    ['.claude/hooks/session-start.sh',  'write-or-ask'],
    ['.claude/commands/boot.md',        'skip-if-exists'],
    ['.claude/agents/web-dev.md',       'skip-if-exists'],
    // v1.14 — dynamic workflows are user-editable commands, same contract as agents/commands.
    ['.claude/workflows/review-changes.js', 'skip-if-exists'],
    ['.claude/skills/aws-iam-least-priv/SKILL.md', 'skip-if-exists'],
    // v1.16 (showreel) — the toolkit upgrades as one unit (B4): write-or-ask, never skip-if-exists.
    // NOTE: the default fallback is also write-or-ask, so this row alone would pass without the explicit
    // rule — it documents B4 and guards a future default change. The behaviour is proven end to end by
    // tests/integration/profiles/showreel.test.ts (modified toolkit file restored by --merge-strategy=overwrite).
    ['.claude/showreel/engine/core.mjs', 'write-or-ask'],
    ['.serena/memories/INDEX.md',       'skip-if-exists'],
    ['.serena/checkpoint/.gitkeep',     'skip-if-exists'],
    ['docs/superpowers/specs/.gitkeep', 'skip-if-exists'],
  ])('classifies %s as %s', (file, expected) => {
    expect(classifyFile(file)).toBe(expected);
  });

  it('defaults unknown files to write-or-ask', () => {
    expect(classifyFile('random/new/file.txt')).toBe('write-or-ask');
  });
});
