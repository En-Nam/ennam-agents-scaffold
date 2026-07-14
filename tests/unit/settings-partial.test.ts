import { describe, it, expect } from 'vitest';
import { enumerateFiles, enumerateProfiles } from '../../packages/cli/src/enumerate.js';
import { renderJsonContent, buildContext } from '../../packages/cli/src/render.js';
import { getProfile } from '../../packages/cli/src/profiles.js';
import type { FileEntry } from '../../packages/cli/src/types.js';

const ctx = buildContext({ profile: 'x', cwd: '/tmp/x', version: '0.0.0-test' });

async function settingsObj(entries: FileEntry[]): Promise<Record<string, any>> {
  const e = entries.find(x => x.relPath === '.claude/settings.json')!;
  return renderJsonContent(e, ctx) as Promise<Record<string, any>>;
}

// #25 — `.claude/settings.json.partial.hbs` per-profile merge infra, proven with agent-org's
// SubagentStop hook (previously a manual paste in printNextSteps).
describe('settings.json per-profile partial merge (#25)', () => {
  it('a profile with NO settings partial renders settings.json from the shared base only (byte-identical)', async () => {
    const s = await settingsObj(await enumerateFiles(getProfile('next')));
    expect(s.hooks.SessionStart).toBeDefined();
    expect(s.hooks.SubagentStop).toBeUndefined(); // no partial → nothing added
    expect(s.enabledPlugins['superpowers@claude-plugins-official']).toBe(true);
  });

  it('agent-org deep-merges its SubagentStop hook onto the shared base (SessionStart preserved)', async () => {
    const s = await settingsObj(await enumerateFiles(getProfile('agent-org')));
    expect(Array.isArray(s.hooks.SubagentStop)).toBe(true);
    expect(Array.isArray(s.hooks.SessionStart)).toBe(true);       // shared base kept (deep merge, not replace)
    expect(s.hooks.SubagentStop[0].hooks[0].command).toMatch(/subagent-log/);
    expect(s.enabledPlugins['superpowers@claude-plugins-official']).toBe(true); // other shared keys intact
    expect(s.permissions.allow).toBeDefined();
  });

  it('compose unions the settings partial (agent-org + next → SubagentStop present, SessionStart kept)', async () => {
    const s = await settingsObj(await enumerateProfiles([getProfile('agent-org'), getProfile('next')]));
    expect(Array.isArray(s.hooks.SubagentStop)).toBe(true);
    expect(Array.isArray(s.hooks.SessionStart)).toBe(true);
  });
});
