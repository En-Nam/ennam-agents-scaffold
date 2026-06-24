import { describe, it, expect } from 'vitest';
import { classifyFile } from '../../packages/cli/src/classify.js';

describe('classifyFile', () => {
  it.each([
    ['AGENTS.md',                       'write-or-ask'],
    ['CLAUDE.md',                       'append-marker'],
    ['.gitignore',                      'append-lines'],
    ['.mcp.json',                       'json-merge'],
    ['.claude/settings.json',           'json-merge'],
    ['.claude/hooks/session-start.ps1', 'write-or-ask'],
    ['.claude/hooks/session-start.sh',  'write-or-ask'],
    ['.claude/commands/boot.md',        'skip-if-exists'],
    ['.claude/agents/web-dev.md',       'skip-if-exists'],
    ['.claude/skills/aws-iam-least-priv/SKILL.md', 'skip-if-exists'],
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
