import { describe, it, expect } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { cp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v1.14 — SubagentStop also fires for Claude Code's internal agents and un-typed
// workflow agents (observed: 19 fires for a 6-agent workflow run). The audit log is
// only useful if it records this profile's roles, and the hook must NEVER block a
// subagent — every input, including garbage, exits 0.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOKS = path.resolve(HERE, '..', '..', 'templates', 'agent-org', '.claude', 'hooks');

const PAYLOADS: [string, string | null][] = [
  ['{"hook_event_name":"SubagentStop","agent_type":"reviewer"}', 'reviewer'],
  ['{"agent_type": "implementer"}', 'implementer'],
  ['{"agent_type":"orchestrator"}', 'orchestrator'],
  ['{"agent_type":"general-purpose"}', null],
  ['not json', null],
  ['', null],
];

const RUNNERS: [string, string, string[]][] = [
  ['sh', 'bash', ['.claude/hooks/subagent-log.sh']],
  ...(process.platform === 'win32'
    ? [['ps1', 'powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.claude/hooks/subagent-log.ps1']] as [string, string, string[]]]
    : []),
];

describe.each(RUNNERS)('subagent-log.%s', (_name, cmd, argv) => {
  it('logs only orchestrator/implementer/reviewer to qa/agent-org-log.md, always exits 0', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await cp(HOOKS, path.join(cwd, '.claude', 'hooks'), { recursive: true });
    for (const [payload] of PAYLOADS) {
      const r = spawnSync(cmd, argv, { cwd, input: payload, encoding: 'utf8' });
      expect(r.status).toBe(0);
    }
    const log = await readFile(path.join(cwd, '.serena', 'memories', 'qa', 'agent-org-log.md'), 'utf8');
    const types = log.trim().split(/\r?\n/).map(l => l.trim().split(' ').pop());
    expect(types).toEqual(PAYLOADS.map(([, t]) => t).filter(Boolean));
  });
});
