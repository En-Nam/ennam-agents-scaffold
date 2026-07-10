import { describe, it, expect, vi } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { collectFindings, runDoctor } from '../../packages/cli/src/doctor.js';

const GOOD_SETTINGS = { enabledPlugins: {}, hooks: { SessionStart: [] }, permissions: { allow: [] } };

async function seed(cwd: string, mcp: unknown, settings: unknown = GOOD_SETTINGS): Promise<void> {
  await writeFile(path.join(cwd, '.mcp.json'), JSON.stringify(mcp));
  await mkdir(path.join(cwd, '.claude'), { recursive: true });
  await writeFile(path.join(cwd, '.claude', 'settings.json'), JSON.stringify(settings));
}

describe('doctor (#27)', () => {
  it('missing required env key → ERROR', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await seed(cwd, { mcpServers: { jira: { env: { JIRA_URL: '${JIRA_URL}' } } } });
    const findings = await collectFindings(cwd, {}); // JIRA_URL unset
    expect(findings.some(f => f.id === 'env-vars-present' && f.severity === 'error')).toBe(true);
  });

  it('fully-configured install has NO error findings', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await seed(cwd, { mcpServers: { jira: { env: { JIRA_URL: '${JIRA_URL}', JIRA_TOKEN: '${JIRA_TOKEN}' } } } });
    const findings = await collectFindings(cwd, { JIRA_URL: 'https://x.atlassian.net', JIRA_TOKEN: 't' });
    expect(findings.filter(f => f.severity === 'error')).toEqual([]);
  });

  it('malformed .mcp.json → ERROR', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(path.join(cwd, '.mcp.json'), '{ not json');
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    await writeFile(path.join(cwd, '.claude', 'settings.json'), JSON.stringify(GOOD_SETTINGS));
    const findings = await collectFindings(cwd, { JIRA_URL: 'x' });
    expect(findings.some(f => f.id === 'mcp-json-valid' && f.severity === 'error')).toBe(true);
  });

  it('legacy settings shape → WARN (never an error)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await seed(cwd, { mcpServers: {} }, { permissions: { additionalAllowList: ['Bash(npm:*)'] } });
    const findings = await collectFindings(cwd, {});
    expect(findings.find(f => f.id === 'settings-shape-legacy')?.severity).toBe('warn');
  });

  it('runDoctor exits 1 on an error and emits machine-readable --json', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await seed(cwd, { mcpServers: { jira: { env: { JIRA_URL: '${JIRA_URL}' } } } });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const code = await runDoctor(cwd, { json: true, env: {} }); // JIRA_URL unset → error
      expect(code).toBe(1);
      const payload = JSON.parse(spy.mock.calls.map(c => String(c[0])).join('\n'));
      expect(payload.ok).toBe(false);
      expect(payload.errors).toBeGreaterThan(0);
      expect(Array.isArray(payload.findings)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('runDoctor exits 0 when there are no errors', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await seed(cwd, { mcpServers: { jira: { env: { JIRA_URL: '${JIRA_URL}' } } } });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const code = await runDoctor(cwd, { json: true, env: { JIRA_URL: 'set' } });
      expect(code).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});
