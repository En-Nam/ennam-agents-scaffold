import { describe, it, expect } from 'vitest';
import { buildCatalog, renderCatalogJson, renderCatalogHuman } from '../../packages/cli/src/list.js';
import { listProfiles } from '../../packages/cli/src/profiles.js';

describe('profile catalog (--list)', () => {
  it('has exactly one entry per registered profile', () => {
    expect(buildCatalog().length).toBe(listProfiles().length);
  });

  it('maps every profile to a real wizard role (no profile drops to "Other")', () => {
    // Guards against a new profile being registered without a role mapping —
    // otherwise it would silently list under "Other".
    const orphans = buildCatalog().filter(e => e.role === 'Other');
    expect(orphans).toEqual([]);
  });

  it('classifies the new enterprise-role profiles', () => {
    const byName = new Map(buildCatalog().map(e => [e.name, e]));
    expect(byName.get('pm')?.role).toBe('PM');
    expect(byName.get('tech-writer')?.role).toBe('Tech-Writer');
    expect(byName.get('data-analytics')?.role).toBe('Data');
  });

  it('surfaces minClaudeCodeVersion as `requires` (agent-org gated, others null)', () => {
    const byName = new Map(buildCatalog().map(e => [e.name, e]));
    expect(byName.get('agent-org')?.requires).toBe('2.1.178');
    expect(byName.get('pm')?.requires).toBeNull();
  });

  it('is sorted by role then name', () => {
    const rows = buildCatalog();
    const sorted = [...rows].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
    expect(rows).toEqual(sorted);
  });

  it('--list --json emits valid JSON with the documented fields', () => {
    const parsed = JSON.parse(renderCatalogJson());
    expect(Array.isArray(parsed)).toBe(true);
    for (const e of parsed) {
      expect(e).toHaveProperty('name');
      expect(e).toHaveProperty('role');
      expect(e).toHaveProperty('description');
      expect(e).toHaveProperty('extraMcp');
      expect(e).toHaveProperty('requires');
    }
  });

  it('--list human output groups by role and lists the new profiles', () => {
    const out = renderCatalogHuman();
    expect(out).toContain('PM');
    expect(out).toContain('pm ');
    expect(out).toContain('Tech-Writer');
    expect(out).toContain('tech-writer');
    expect(out).toContain('Data');
    expect(out).toContain('data-analytics');
  });
});
