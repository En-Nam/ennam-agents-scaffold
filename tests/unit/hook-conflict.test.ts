import { describe, it, expect } from 'vitest';
import { findBlockedHooks } from '../../packages/cli/src/hook-conflict.js';

// v1.14 — mergeJson is user-wins on arrays, so when a user already defines
// hooks.<Event>, the scaffold's entry for that event is silently dropped. For
// agent-org that means the SubagentStop audit hook never runs and nobody knows.
// findBlockedHooks names exactly those dropped commands so the CLI can warn (Rule 12),
// and tells "add" apart from "replace an outdated scaffold entry" so an upgrade
// never tells the user to run the same hook twice.

const hook = (command: string) => [{ hooks: [{ type: 'command', command }] }];
const SUBAGENT = 'bash .claude/hooks/subagent-log.sh';
const SESSION = 'bash .claude/hooks/session-start.sh';
const scaffold = { hooks: { SessionStart: hook(SESSION), SubagentStop: hook(SUBAGENT) } };

describe('findBlockedHooks', () => {
  it('nothing blocked when the user has no hooks (merge adds ours)', () => {
    expect(findBlockedHooks({}, scaffold)).toEqual([]);
  });

  it('nothing blocked when the user already has our exact command (v1.9 manual paste)', () => {
    const user = { hooks: { SessionStart: hook(SESSION), SubagentStop: hook(SUBAGENT) } };
    expect(findBlockedHooks(user, scaffold)).toEqual([]);
  });

  it('reports the event + our command (to ADD) when the user owns that event with an unrelated command', () => {
    const user = { hooks: { SubagentStop: hook('node my-own-hook.js') } };
    expect(findBlockedHooks(user, scaffold)).toEqual([{ event: 'SubagentStop', commands: [SUBAGENT], replaces: [] }]);
  });

  it('a v1.9.0 SessionStart with the bare (non-executable) .sh path is an outdated scaffold entry to REPLACE', () => {
    const user = { hooks: { SessionStart: hook('.claude/hooks/session-start.sh') } };
    expect(findBlockedHooks(user, scaffold))
      .toEqual([{ event: 'SessionStart', commands: [SESSION], replaces: ['.claude/hooks/session-start.sh'] }]);
  });

  it('a v1.9.0 powershell SubagentStop paste on a POSIX re-run is also a REPLACE, not an add', () => {
    const user = { hooks: { SubagentStop: hook('powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/subagent-log.ps1') } };
    const [b] = findBlockedHooks(user, scaffold);
    expect(b!.replaces).toEqual(['powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/subagent-log.ps1']);
  });

  it('tolerates the legacy bare {command} shape and non-array event values without throwing', () => {
    const user = { hooks: { SessionStart: [{ command: SESSION }], SubagentStop: 'oops' } };
    expect(findBlockedHooks(user as Record<string, unknown>, scaffold))
      .toEqual([{ event: 'SubagentStop', commands: [SUBAGENT], replaces: [] }]);
  });

  it('a non-object user `hooks` value blocks EVERY scaffold hook (user-wins keeps it wholesale)', () => {
    for (const hooks of [null, [], 'x']) {
      expect(findBlockedHooks({ hooks } as Record<string, unknown>, scaffold).map(b => b.event))
        .toEqual(['SessionStart', 'SubagentStop']);
    }
  });
});
