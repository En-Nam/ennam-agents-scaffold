// v1.12 (#27) — shared, pure detectors for config-shape problems. Used both by the
// post-install warnings in index.ts (console output unchanged) and by `--doctor`
// (doctor.ts), so the exact wording lives in ONE place.

/**
 * Detect the two legacy `.claude/settings.json` shapes current Claude Code no longer
 * accepts. Returns human-readable warning strings (empty = clean).
 * - `permissions.additionalAllowList` — silently ignored; the correct key is `permissions.allow`.
 * - `hooks.SessionStart[*]` bare `{command}` — must be `{hooks: [{type,command}]}`.
 */
export function detectLegacySettings(obj: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  const perms = obj.permissions as Record<string, unknown> | undefined;
  if (perms && typeof perms === 'object' && 'additionalAllowList' in perms) {
    warnings.push(
      'permissions.additionalAllowList is a legacy key Claude Code silently ignores. ' +
        'Move its entries into `permissions.allow` (or delete it if `allow` already mirrors them).',
    );
  }

  const hooks = obj.hooks as Record<string, unknown> | undefined;
  const sessionStart = hooks?.SessionStart;
  if (Array.isArray(sessionStart)) {
    const hasBareCommand = sessionStart.some((entry) =>
      entry && typeof entry === 'object' && !Array.isArray(entry) &&
      'command' in (entry as Record<string, unknown>) &&
      !('hooks' in (entry as Record<string, unknown>)),
    );
    if (hasBareCommand) {
      warnings.push(
        'hooks.SessionStart uses the legacy bare `{command}` shape. ' +
          'Wrap each entry as `{hooks: [{type: "command", command: "..."}]}` ' +
          '— current Claude Code rejects the old shape with "Expected array, but received undefined".',
      );
    }
  }

  return warnings;
}

/** True if a stale `chrome-devtools` MCP server (removed in v1.2) lingers in .mcp.json. */
export function hasStaleChromeDevtools(obj: { mcpServers?: Record<string, unknown> }): boolean {
  return !!obj.mcpServers && Object.prototype.hasOwnProperty.call(obj.mcpServers, 'chrome-devtools');
}
