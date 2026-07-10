import { describe, it, expect } from 'vitest';
import { dir as tmpDir } from 'tmp-promise';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  scanRequiredEnv,
  buildKeyReport,
  formatKeyReportStep,
  KEY_SOURCES,
} from '../../packages/cli/src/env-scan.js';

describe('env-scan (#22)', () => {
  it('detects ${VAR} tokens from .mcp.json and .claude/settings.json', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(
      path.join(cwd, '.mcp.json'),
      JSON.stringify({ mcpServers: { jira: { env: { JIRA_URL: '${JIRA_URL}', JIRA_TOKEN: '${JIRA_TOKEN}' } }, figma: { env: { FIGMA_TOKEN: '${FIGMA_TOKEN}' } } } }),
    );
    await mkdir(path.join(cwd, '.claude'), { recursive: true });
    await writeFile(path.join(cwd, '.claude', 'settings.json'), JSON.stringify({ env: { FOO: '${FOO}' } }));
    expect(await scanRequiredEnv(cwd)).toEqual(['FIGMA_TOKEN', 'FOO', 'JIRA_TOKEN', 'JIRA_URL']);
  });

  it('does NOT freeform-scan .claude/skills/** — skill/example tokens are never reported', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { jira: { env: { JIRA_URL: '${JIRA_URL}' } } } }));
    const skillDir = path.join(cwd, '.claude', 'skills', 'some-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'uses ${MESHY_API_KEY}, ${UNITY}, ${MAESTRO_CLOUD_API_KEY}, $$POSTGRES_USER');
    const found = await scanRequiredEnv(cwd);
    expect(found).toContain('JIRA_URL');
    expect(found).not.toContain('MESHY_API_KEY');
    expect(found).not.toContain('UNITY');
    expect(found).not.toContain('MAESTRO_CLOUD_API_KEY');
    expect(found).not.toContain('POSTGRES_USER');
  });

  it('surfaces the skill-gated TRIPO_API_KEY via its on-disk fingerprint (allowlist, not a name guess)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(path.join(cwd, '.mcp.json'), '{}');
    await mkdir(path.join(cwd, '.claude', 'skills', 'asset-pipeline-tripo3d'), { recursive: true });
    expect(await scanRequiredEnv(cwd)).toContain('TRIPO_API_KEY');
  });

  it('buildKeyReport marks present/missing and surfaces an unknown key with source=null (Rule 13)', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(
      path.join(cwd, '.mcp.json'),
      JSON.stringify({ mcpServers: { jira: { env: { JIRA_URL: '${JIRA_URL}' } }, weird: { env: { MYSTERY_TOKEN: '${MYSTERY_TOKEN}' } } } }),
    );
    const report = await buildKeyReport(cwd, { JIRA_URL: 'https://x.atlassian.net' });
    const jira = report.find(r => r.name === 'JIRA_URL')!;
    const mystery = report.find(r => r.name === 'MYSTERY_TOKEN')!;
    expect(jira.present).toBe(true);
    expect(jira.source).not.toBeNull();
    expect(mystery.present).toBe(false);
    expect(mystery.source).toBeNull(); // never dropped — surfaced as unknown
  });

  it('KEY_SOURCES catalogs exactly the 6 real keys, each with an obtain hint + https guide', () => {
    expect(Object.keys(KEY_SOURCES).sort()).toEqual(
      ['FIGMA_TOKEN', 'GITHUB_TOKEN', 'JIRA_TOKEN', 'JIRA_URL', 'PG_CONN_STR', 'TRIPO_API_KEY'],
    );
    for (const v of Object.values(KEY_SOURCES)) {
      expect(v.obtainUrl.length).toBeGreaterThan(0);
      expect(v.guide).toMatch(/^https?:\/\//);
    }
  });

  it('formatKeyReportStep lists only still-missing keys, and confirms when all are set', async () => {
    const { path: cwd } = await tmpDir({ unsafeCleanup: true });
    await writeFile(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { jira: { env: { JIRA_URL: '${JIRA_URL}', JIRA_TOKEN: '${JIRA_TOKEN}' } } } }));
    const missingStep = formatKeyReportStep(await buildKeyReport(cwd, {}));
    expect(missingStep).toContain('JIRA_URL');
    expect(missingStep).toContain('still missing');
    const allSet = formatKeyReportStep(await buildKeyReport(cwd, { JIRA_URL: 'a', JIRA_TOKEN: 'b' }));
    expect(allSet).toContain('already set');
  });
});
