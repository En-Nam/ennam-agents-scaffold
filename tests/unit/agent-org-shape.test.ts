import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProfile } from '../../packages/cli/src/profiles.js';

// v1.9.0 — lock the agent-org profile shape. This profile packages the
// meta-spike pattern (mem:decisions/v1.9-scope, MUST item 4). It is the
// first profile to use minClaudeCodeVersion, and the first profile whose
// hook must be registered manually in settings.json (no partial merge yet).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.resolve(HERE, '..', '..', 'templates', 'agent-org');

const read = (rel: string) => readFile(path.join(PROFILE_DIR, rel), 'utf8');

describe('agent-org profile shape', () => {
  it('exposes the 3-role trio + SubagentStop hook (files present)', async () => {
    // If any of these throws, the file is missing.
    await read('CLAUDE.md.partial.hbs');
    await read('README.md');
    await read('.claude/agents/orchestrator.md.hbs');
    await read('.claude/agents/implementer.md.hbs');
    await read('.claude/agents/reviewer.md.hbs');
    await read('.claude/hooks/subagent-log.ps1');
    await read('.claude/hooks/subagent-log.sh');
  });

  it('CLAUDE.md.partial.hbs names the 3 roles + cost disclosure + Claude Code version gate', async () => {
    const t = await read('CLAUDE.md.partial.hbs');
    expect(t).toMatch(/orchestrator/);
    expect(t).toMatch(/implementer/);
    expect(t).toMatch(/reviewer/);
    // Cost disclosure is REQUIRED — CTO answer #2 (end-user's account).
    expect(t).toMatch(/Cost disclosure/i);
    expect(t).toMatch(/Opus/);
    expect(t).toMatch(/Sonnet/);
    // Version gate documented alongside preflight WARN — must match the registry.
    expect(t).toMatch(/2\.1\.248/);
    expect(t).not.toMatch(/2\.1\.178/);
  });

  it('orchestrator has Task tool + does-not-edit-code rule', async () => {
    const t = await read('.claude/agents/orchestrator.md.hbs');
    expect(t).toMatch(/^---[\s\S]*name: orchestrator[\s\S]*tools: [^\n]*Task/m);
    expect(t).toMatch(/do NOT edit code/i);
  });

  it('implementer has Write+Edit+Bash + must-run-build-test-green rule', async () => {
    const t = await read('.claude/agents/implementer.md.hbs');
    expect(t).toMatch(/^---[\s\S]*name: implementer[\s\S]*tools:[^\n]*Write[^\n]*Edit[^\n]*Bash/m);
    expect(t).toMatch(/build \+ test/);
  });

  it('reviewer has Read+Grep (no Write) + do-not-modify-code rule', async () => {
    const t = await read('.claude/agents/reviewer.md.hbs');
    expect(t).toMatch(/^---[\s\S]*name: reviewer[\s\S]*tools:[^\n]*Read[^\n]*Grep/m);
    expect(t).not.toMatch(/tools:[^\n]*\bWrite\b/m);
    expect(t).toMatch(/do NOT modify code/i);
  });

  it('subagent-log.ps1 is ASCII-only (PowerShell 5.1 default codepage safety)', async () => {
    const t = await read('.claude/hooks/subagent-log.ps1');
    for (let i = 0; i < t.length; i++) {
      const code = t.charCodeAt(i);
      // Allow ASCII + tab/CR/LF only.
      if (code > 127) {
        throw new Error(`Non-ASCII char at position ${i}: U+${code.toString(16)}. PowerShell 5.1 will fail to parse.`);
      }
    }
  });

  it('subagent-log.ps1 exits 0 (log-only, never blocks)', async () => {
    const t = await read('.claude/hooks/subagent-log.ps1');
    expect(t).toMatch(/exit 0/);
  });

  it('subagent-log.sh has a bash shebang', async () => {
    const t = await read('.claude/hooks/subagent-log.sh');
    expect(t.startsWith('#!/usr/bin/env bash') || t.startsWith('#!/bin/bash')).toBe(true);
  });

  it('profile registry entry: minClaudeCodeVersion = 2.1.248, extraMcp empty', () => {
    const p = getProfile('agent-org');
    expect(p.minClaudeCodeVersion).toBe('2.1.248');
    expect(p.extraMcp).toEqual([]);
  });

  // v1.14 — the partial is the only place an agent learns the workflows exist and
  // where the audit log lives; a stale name or path sends it to the wrong place.
  it('CLAUDE partial names all 3 workflow commands and the real hook log path', async () => {
    const t = await read('CLAUDE.md.partial.hbs');
    for (const cmd of ['/review-changes', '/judge-panel', '/fix-loop']) expect(t).toContain(cmd);
    expect(t).toContain('.serena/memories/qa/agent-org-log.md');
    expect(await read('.claude/hooks/subagent-log.ps1')).toContain('\\.serena\\memories\\qa\\agent-org-log.md');
    const sh = await read('.claude/hooks/subagent-log.sh');
    expect(sh).toContain('/.serena/memories/qa"');
    expect(sh).toContain('/agent-org-log.md');
  });

  it('settings partial registers SubagentStop via an interpreter and sets isolatePeerMachines', async () => {
    const t = await read('.claude/settings.json.partial.hbs');
    expect(t).toMatch(/"isolatePeerMachines": true/);
    expect(t).toMatch(/powershell -NoProfile -ExecutionPolicy Bypass -File \.claude\/hooks\/subagent-log\.ps1/);
    expect(t).toMatch(/bash \.claude\/hooks\/subagent-log\.sh/);
    // Cost/policy settings are the user's call (mem:decisions/no-hardcoded-model precedent).
    expect(t).not.toMatch(/ultracode|workflowSizeGuideline|crossSessionInbound|"model"/);
  });
});

