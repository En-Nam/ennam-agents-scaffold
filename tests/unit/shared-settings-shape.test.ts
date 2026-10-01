import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderString } from '../../packages/cli/src/render.js';
import type { RenderContext } from '../../packages/cli/src/types.js';

// v1.14 — the scaffold writes hook scripts with fs.writeFile, which never sets the
// executable bit. A bare `.claude/hooks/session-start.sh` command therefore fails with
// "permission denied" on macOS/Linux. Hook commands MUST name their interpreter so the
// exec bit is irrelevant.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.resolve(HERE, '..', '..', 'templates', '_shared', '.claude', 'settings.json.hbs');

const ctx = (isWindows: boolean): RenderContext => ({
  scaffoldVersion: '0.0.0', profile: 'next', cwd: '/tmp/x', projectName: 'x',
  year: 2026, date: '2026-10-01', isWindows,
});

async function sessionStartCommand(isWindows: boolean): Promise<string> {
  const json = JSON.parse(renderString(await readFile(SETTINGS, 'utf8'), ctx(isWindows)));
  return json.hooks.SessionStart[0].hooks[0].command;
}

describe('_shared settings.json.hbs SessionStart hook', () => {
  it('POSIX: invokes the .sh via bash (exec bit not required)', async () => {
    expect(await sessionStartCommand(false)).toBe('bash .claude/hooks/session-start.sh');
  });

  it('Windows: invokes the .ps1 via powershell -File (bare .ps1 does not execute)', async () => {
    expect(await sessionStartCommand(true)).toMatch(/^powershell -NoProfile -ExecutionPolicy Bypass -File \.claude\/hooks\/session-start\.ps1$/);
  });
});

// v1.14 — same contract for agent-org's SubagentStop hook: render the partial per platform
// and pin the exact command, so an inverted {{#if isWindows}} branch cannot pass.
const AGENT_ORG_SETTINGS = path.resolve(HERE, '..', '..', 'templates', 'agent-org', '.claude', 'settings.json.partial.hbs');

async function subagentStopCommand(isWindows: boolean): Promise<string> {
  const json = JSON.parse(renderString(await readFile(AGENT_ORG_SETTINGS, 'utf8'), ctx(isWindows)));
  return json.hooks.SubagentStop[0].hooks[0].command;
}

describe('agent-org settings.json.partial.hbs SubagentStop hook', () => {
  it('POSIX: bash .claude/hooks/subagent-log.sh', async () => {
    expect(await subagentStopCommand(false)).toBe('bash .claude/hooks/subagent-log.sh');
  });

  it('Windows: powershell -File .claude/hooks/subagent-log.ps1', async () => {
    expect(await subagentStopCommand(true)).toBe('powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/subagent-log.ps1');
  });
});

