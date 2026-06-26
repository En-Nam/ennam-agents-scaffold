import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Per Judge objection #1: the --dry-run default for asset-pipeline-tripo3d
// MUST be enforced inside the skill body, not merely documented in a header.
// These tests grep the literal enforcement language so a future edit that
// silently drops the dry-run gate triggers a failure.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GU_ROOT = path.resolve(HERE, '..', '..', 'templates', 'game-unity');
const SKILLS = path.join(GU_ROOT, '.claude', 'skills');

const TRIPO_SKILL = path.join(SKILLS, 'asset-pipeline-tripo3d', 'SKILL.md');
const TRIPO_FIXTURE = path.join(SKILLS, 'asset-pipeline-tripo3d', 'fixtures', 'tripo-image-to-model-success.json');

describe('asset-pipeline-tripo3d skill enforces --dry-run default', () => {
  it('SKILL.md opens with explicit dry-run default declaration', async () => {
    const md = await readFile(TRIPO_SKILL, 'utf8');
    expect(md).toMatch(/defaults to.*--dry-run/i);
    // Also assert the live mode requires explicit opt-in + license confirmation.
    expect(md).toMatch(/--live/);
    expect(md).toMatch(/Pro tier/i);
    expect(md).toMatch(/CC BY 4\.0/);
    expect(md).toMatch(/NON-COMMERCIAL/i);
  });

  it('SKILL.md mandates per-invocation MODE: line', async () => {
    const md = await readFile(TRIPO_SKILL, 'utf8');
    expect(md).toMatch(/MODE: dry-run/);
    expect(md).toMatch(/MODE: LIVE/);
  });

  it('SKILL.md forbids hard-coded balance endpoint URL', async () => {
    const md = await readFile(TRIPO_SKILL, 'utf8');
    // The previously-proposed /v2/openapi/user/balance was flagged invented.
    // The skill must NOT recommend baking that exact path; it should instruct
    // shelling out to the Python SDK or fetching live OpenAPI schema.
    expect(md).toMatch(/get_balance\(\)/);
    expect(md).toMatch(/(do NOT hard-code|do not hard-code)/i);
  });

  it('SKILL.md says Meshy fallback is opt-in and NEVER auto-fallback', async () => {
    const md = await readFile(TRIPO_SKILL, 'utf8');
    expect(md).toMatch(/--provider meshy/);
    expect(md).toMatch(/NEVER auto-fallback/i);
  });

  it('fixture file exists and parses as JSON', async () => {
    expect((await stat(TRIPO_FIXTURE)).isFile()).toBe(true);
    const fx = JSON.parse(await readFile(TRIPO_FIXTURE, 'utf8'));
    expect(fx.data.status).toBe('Success');
    expect(fx.data.task_id).toMatch(/fixture/);
    // Output URLs must be example.invalid so a misconfigured live invocation
    // crashes loud rather than silently fetching a real file.
    expect(fx.data.output.model).toMatch(/example\.invalid/);
  });
});

describe('unity-mcp-setup skill surfaces prereq failures loud', () => {
  const SETUP_SKILL = path.join(SKILLS, 'unity-mcp-setup', 'SKILL.md');

  it('mentions uvx, Python 3.11, Domain Reload, EnnamPreflight.cs', async () => {
    const md = await readFile(SETUP_SKILL, 'utf8');
    expect(md).toMatch(/uvx/);
    expect(md).toMatch(/3\.11/);
    expect(md).toMatch(/Domain Reload/);
    expect(md).toMatch(/EnnamPreflight\.cs/);
  });
});

describe('unity-2.5d-conventions skill lists 10 rules', () => {
  const CONV_SKILL = path.join(SKILLS, 'unity-2.5d-conventions', 'SKILL.md');

  it('contains numbered rule headings 1..10', async () => {
    const md = await readFile(CONV_SKILL, 'utf8');
    for (let i = 1; i <= 10; i++) {
      expect(md).toMatch(new RegExp(`##\\s*${i}\\.`));
    }
  });
});
