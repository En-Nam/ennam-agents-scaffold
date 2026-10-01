# agent-org profile

Ennam Agents Scaffold — multi-agent orchestration profile (v1.14.0). Installs into your project as `docs/agents-scaffold/agent-org.md`.

Scope: emit the 3-role dispatch pattern (orchestrator + implementer + reviewer), dynamic workflows that drive those roles, and a `SubagentStop` audit hook — config that Claude Code runs. The scaffold ships no runtime of its own.

## What ships

- `CLAUDE.md` block — when to go solo / run a workflow / use the orchestrator / message a peer session; cost disclosure; boundaries.
- `.claude/agents/orchestrator.md` — plans + dispatches, does NOT edit code.
- `.claude/agents/implementer.md` — executes ONE subtask, runs build + test green before reporting done.
- `.claude/agents/reviewer.md` — reads the diff, reports issues by severity, does NOT modify code.
- `.claude/workflows/review-changes.js` · `judge-panel.js` · `fix-loop.js` — dynamic workflows, run as `/review-changes`, `/judge-panel`, `/fix-loop`. Plain JavaScript; installed once and never overwritten, so edit them freely.
- `.claude/hooks/subagent-log.ps1` / `subagent-log.sh` — `SubagentStop` hook. Logs only this profile's three roles to `.serena/memories/qa/agent-org-log.md`. Never blocks.
- `.claude/settings.json` additions (merged, your existing values win):
  - `hooks.SubagentStop` → the hook above.
  - `isolatePeerMachines: true` → approval before any cross-session message leaves this machine.

If your `.claude/settings.json` already has a `SubagentStop` hook, the scaffold keeps yours and prints the exact entry to add by hand.

## Requirements

- **Claude Code >= 2.1.248.** The wizard preflight warns if your install is older. 2.1.248 is the first version that documents the workflow-script reference (`agentType` roles). Dynamic workflows themselves exist since 2.1.154; cross-session messaging needs 2.1.224 (2.1.234 on native Windows).

## Not in scope

- Auto-merge on subagent completion. Human gates stay.
- `ultracode`, `workflowSizeGuideline`, `crossSessionInbound` — cost/policy settings left to you.
- Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) — this profile targets the shipping subagent, workflow and hook APIs.

## Origin

v1.9.0 meta-spike (3-role trio + hook, dogfooded on this scaffold repo) → v1.14.0 dynamic workflows (settings merge itself landed in v1.13, #25). Design: `docs/superpowers/specs/2026-10-01-v1.10-workflows-messaging-design.md` in the scaffold repository.
