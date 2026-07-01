# agent-org profile

Ennam Agents Scaffold — multi-agent orchestration profile (v1.9.0).

Scope: emit the 3-role dispatch pattern (orchestrator + implementer + reviewer) + a `SubagentStop` hook, ready to use with Claude Code's built-in subagent dispatch.

## What ships

- `CLAUDE.md.partial.hbs` — workflow guidance for the target project: when to dispatch vs solo, cost disclosure, boundaries.
- `.claude/agents/orchestrator.md.hbs` — plans + dispatches, does NOT edit code.
- `.claude/agents/implementer.md.hbs` — executes ONE subtask, runs build + test green before reporting done.
- `.claude/agents/reviewer.md.hbs` — reads the diff, reports issues by severity, does NOT modify code.
- `.claude/hooks/subagent-log.ps1` / `subagent-log.sh` — SubagentStop hook. Log-only, appends timestamp trail to Serena.

## What does NOT auto-ship (yet)

The `SubagentStop` hook must be registered in `.claude/settings.json` **manually** after install — the scaffold's shared `settings.json.hbs` does not merge profile-specific hook entries in v1.9.0 (tracked as follow-up).

`printNextSteps` will show you the exact JSON block to paste. See also `mem:decisions/v1.9-scope`.

## Requirements

- **Claude Code >= 2.1.178.** The scaffold's wizard preflight will warn if your local install is older. The `TeamCreate` / `TeamDelete` tools were removed in 2.1.178, and `team_name` in hook payloads was deprecated — earlier versions may misbehave with the hook shape this profile emits.

## Not in scope

- Auto-merge on subagent completion. Human gates stay.
- Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) — this profile targets the shipping subagent + hook APIs, not the experimental Teams API. If Teams stabilizes, a follow-up profile `agent-org-teams` can be added.

## Origin

This pattern was validated by the v1.9.0 meta-spike: the profile's agent defs + hook were used in-place in this repo to build the `qa-automation` profile end-to-end. See `mem:decisions/v1.9-scope`, "MUST item 4" for the spike design.
