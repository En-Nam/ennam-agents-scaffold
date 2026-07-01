import { describe, it, expect } from 'vitest';
import {
  checkPreflight,
  compareVersions,
  extractVersion,
  type PreflightResult,
} from '../../packages/cli/src/preflight.js';

// v1.9.0 — preflight infra for profiles that require a minimum Claude Code
// version (e.g., agent-org needs post-2.1.178 for the current Teams shape).
// Policy is WARN, not BLOCK — the user chose to run the wizard, they can
// decide whether to proceed. The wizard continues regardless of meetsMinimum.

describe('extractVersion', () => {
  it('extracts semver from Claude Code output "2.1.178 (Claude Code)"', () => {
    expect(extractVersion('2.1.178 (Claude Code)')).toBe('2.1.178');
  });

  it('extracts from a claude-code v-prefixed line', () => {
    expect(extractVersion('claude-code v2.1.178')).toBe('2.1.178');
  });

  it('extracts the first match when multiple appear', () => {
    expect(extractVersion('2.1.178 built on 2026-06-30 (node 20.11.0)')).toBe('2.1.178');
  });

  it('returns null on null input', () => {
    expect(extractVersion(null)).toBeNull();
  });

  it('returns null when no semver pattern present', () => {
    expect(extractVersion('command not found')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('equal versions → 0', () => {
    expect(compareVersions('2.1.178', '2.1.178')).toBe(0);
  });

  it('a < b when patch lower', () => {
    expect(compareVersions('2.1.150', '2.1.178')).toBe(-1);
  });

  it('a > b when minor higher', () => {
    expect(compareVersions('2.2.0', '2.1.999')).toBe(1);
  });

  it('handles missing trailing components (2.1 vs 2.1.0)', () => {
    expect(compareVersions('2.1', '2.1.0')).toBe(0);
  });

  it('handles major bumps', () => {
    expect(compareVersions('3.0.0', '2.9.999')).toBe(1);
  });
});

describe('checkPreflight', () => {
  it('no minClaudeCodeVersion → passes silently (no warnings)', () => {
    const r: PreflightResult = checkPreflight({ name: 'next', minClaudeCodeVersion: undefined });
    expect(r.meetsMinimum).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('claude not detected (fetcher returns null) → warns with install hint', () => {
    const r = checkPreflight(
      { name: 'agent-org', minClaudeCodeVersion: '2.1.178' },
      () => null,
    );
    expect(r.meetsMinimum).toBe(false);
    expect(r.installedVersion).toBeNull();
    expect(r.warnings).toHaveLength(1);
    // The warning must be actionable — mention BOTH the required version and where to install.
    expect(r.warnings[0]).toMatch(/2\.1\.178/);
    expect(r.warnings[0]).toMatch(/claude/i);
  });

  it('installed version older than required → warns with detected + required version', () => {
    const r = checkPreflight(
      { name: 'agent-org', minClaudeCodeVersion: '2.1.178' },
      () => '2.1.150 (Claude Code)',
    );
    expect(r.meetsMinimum).toBe(false);
    expect(r.installedVersion).toBe('2.1.150');
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/2\.1\.178/);
    expect(r.warnings[0]).toMatch(/2\.1\.150/);
  });

  it('installed version equal to required → passes silently', () => {
    const r = checkPreflight(
      { name: 'agent-org', minClaudeCodeVersion: '2.1.178' },
      () => '2.1.178 (Claude Code)',
    );
    expect(r.meetsMinimum).toBe(true);
    expect(r.installedVersion).toBe('2.1.178');
    expect(r.warnings).toEqual([]);
  });

  it('installed version newer than required → passes silently', () => {
    const r = checkPreflight(
      { name: 'agent-org', minClaudeCodeVersion: '2.1.178' },
      () => '2.2.0 (Claude Code)',
    );
    expect(r.meetsMinimum).toBe(true);
    expect(r.installedVersion).toBe('2.2.0');
    expect(r.warnings).toEqual([]);
  });

  it('fetcher returns garbage without semver → treated as not-detected', () => {
    const r = checkPreflight(
      { name: 'agent-org', minClaudeCodeVersion: '2.1.178' },
      () => 'something unparseable',
    );
    expect(r.meetsMinimum).toBe(false);
    expect(r.installedVersion).toBeNull();
    expect(r.warnings).toHaveLength(1);
  });
});
