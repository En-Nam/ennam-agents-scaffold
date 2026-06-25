---
name: superpowers-plugin-strategy
description: Why v1.6.0 wires the scaffold to obra's Superpowers plugin via `claude-plugins-official` passthrough (single JSON key), and not via a fork or overlay.
metadata:
  type: decision
---

# Superpowers plugin strategy — v1.6.0

## Decision

The scaffold enables the Superpowers plugin by emitting a single key in the generated `.claude/settings.json`:

```json
"enabledPlugins": { "superpowers@claude-plugins-official": true }
```

No `extraKnownMarketplaces` (Anthropic auto-registers `claude-plugins-official` at startup), no fork, no overlay marketplace, no profile-level opt-out.

## Why this option

Three constraints tied to existing memories:

1. **`mem:project_ennam_scaffold_mission`** — scaffold = "npx CLI wizard". Owning a marketplace repo (fork or extras overlay) is scope inflation; risky behavior moves to its own version cycle.
2. **`mem:security-dev-trade-offs`** — we already accept unpinned `npx -y` MCP servers + Serena git-HEAD for dev convenience. `claude-plugins-official` (Anthropic-curated, commit-SHA-pinned per release) is **strictly less risky** than what we already accept. Premature pinning via a fork contradicts the established posture.
3. **AGENTS.md Rule 2 (Simplicity First)** — Option A = 3 JSON lines + 2 hook lines + 1 next-step line. Options B/C add 1–2 new repos + CI drift workflows to solve a hypothetical (zero skill-name drift in Superpowers v6.0.3; every of the 14 names referenced in `CLAUDE.md.partial.hbs` exists verbatim upstream).

## Why `claude-plugins-official`, not `obra/superpowers-marketplace`

- Auto-registered at Claude Code startup → no `extraKnownMarketplaces` plumbing needed.
- Trust delegated to Anthropic (curator), not a single maintainer (Jesse Vincent / obra).
- Anthropic pins SHA per release; the alt marketplace tracks HEAD with no `ref` field exposed in `extraKnownMarketplaces.source` today.
- Superpowers was accepted into the official marketplace Jan 2026 — both routes ship the same skills.

Evidence: code.claude.com/docs/en/discover-plugins; GitHub issues #23737, #32606, #45323 (`enabledPlugins` does NOT auto-install in headless mode — confirmed limitation).

## Rejected options

- **Option B — Pinned fork (`@ennamjsc/superpowers`)**: 1–2 repos to maintain, ~8–16 hrs/year steady-state fork tax, bus-factor-1 risk, premature insurance against a rename that hasn't happened. Revisit only if upstream renames a skill we reference.
- **Option C — Layered passthrough + `@ennamjsc/superpowers-extras` overlay**: technically interesting but solving tomorrow's problem with today's complexity. Three protocol blocks the overlay would lift (Session Boot / Checkpoint / Serena Memory) are READ at session start by every agent — they don't need to be invokable skills, they need to be unmissable instructions. Revisit when we accumulate genuinely-callable EnNam skills with imperative entry points or profile-specific skills warranting a marketplace.

## Known limitation (we ship anyway, fail loud)

`enabledPlugins` in project `.claude/settings.json` only triggers a trust-dialog prompt in **interactive** mode (first folder-trust). It does **NOT** auto-install in headless `claude -p` mode, CI runners, devcontainer cold-starts, or cloud workstations (Anthropic issues #32606, #45323 closed as not-planned — there is no `autoInstall` flag today). We surface this loudly in three places (Rule 12 — Fail Loud):

1. `printNextSteps` (always, even `--no-prompts`/CI): explicit manual `/plugin install` command.
2. `.claude/hooks/session-start.{ps1,sh}`: every session prints the install fallback line.
3. CLAUDE.md.partial.hbs (existing): the 14 `superpowers:*` references in the workflow phases — unchanged because the names match upstream verbatim.

## What revisits this decision

- First upstream rename of any of the 14 skill names referenced in `CLAUDE.md.partial.hbs` / agent prompts → re-evaluate Option B (pinned fork).
- Profile-specific skills emerge (e.g. `ennam-next-server-components`) that justify a marketplace → re-evaluate Option C (overlay).
- Persistent downstream complaints about headless/CI friction → consider adding a `--with-plugin-install-script` flag that emits a CI-friendly shell snippet.

## Files touched in v1.6.0

- `templates/_shared/.claude/settings.json.hbs` — added `enabledPlugins` key.
- `templates/_shared/.claude/hooks/session-start.{ps1,sh}` — added install-fallback line.
- `packages/cli/src/ux.ts` — `printNextSteps` extended with the trust-prompt + headless workaround line.
- `tests/integration/install-superpowers-settings.test.ts` — fresh-install / user-merge / opt-out coverage.

Workflow runtime: `wf_844e5f4c-1b9` (research + audit + 3-way debate + synthesis, 6 agents, ~287k tokens).
