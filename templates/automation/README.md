# automation add-on

Ennam Agents Scaffold — Claude Code automation guidance (v1.15.0). Installs into your project as `docs/agents-scaffold/automation.md`.

Scope: teach Claude to use Claude Code's own automation — `/goal`, `/loop`, scheduled tasks, headless runs — the Ennam way: bounded, verifiable, recorded in Serena. **Guidance only.** The scaffold switches nothing on: no settings keys, no hooks, no MCP servers, and no CLAUDE.md section. Per-session cost is near zero: only the skill's one-line description sits in context until the skill is used.

Install it on top of any role:

```bash
npx @ennamjsc/agents-scaffold next automation     # or: hr automation, pm automation, …
```

The guided wizard asks "Add Claude Code automation guidance?" after you pick a role (default: No). Your role installs exactly as it would without the add-on (same CLAUDE.md, AGENTS.md, workflow preset and settings); the add-on only adds the files below.

## What ships

- `.claude/skills/ennam-automation/SKILL.md` — loads when you use `/goal`, `/loop`, a schedule, a reminder, a multi-agent run, or `claude -p`.
- `.claude/loop.md` — this repo's default prompt for a bare `/loop` (and `/loop 15m`): read Serena → check the PR → report → checkpoint. **Report-only**: no code edits (its only write is one Serena checkpoint), no push, delete, merge or release. Installed once and never overwritten — edit it freely.
- `.gitignore` (every profile): `.claude/scheduled_tasks.json` — runtime state Claude Code may write per folder; never commit it.

## Requirements

- **Claude Code >= 2.1.246** recommended (preflight warns, never blocks): from 2.1.246 a `/goal` makes at most 3 idle check-ins between your prompts; earlier versions were uncapped.
- `/goal` is unavailable when hooks are disabled (`disableAllHooks`) or only managed hooks are allowed — the evaluator is part of the hooks system.
- On Amazon Bedrock, Claude Platform on AWS, Google Cloud's Agent Platform, Microsoft Foundry, or with feature-flag fetching off, a self-paced `/loop` and the default loop prompt need Claude Code >= 2.1.248.

## Costs — on your own Anthropic account

- Goal turns, loop iterations and workflow agents all count toward your plan's usage. Always bound a goal: `… or stop after 20 turns`.
- Recurring `/loop` tasks expire after 7 days; they only fire while the session is open and idle.
- Dynamic workflows (in `agent-org`) cost a multiple of a solo run. On Pro they must be turned on in `/config`; admins can disable them.

## Headless runs (`claude -p`) — two traps

- **Trust:** without `--bare`, `claude -p` in this repo runs the `.claude/settings.json` hooks and starts the `.mcp.json` servers **with no trust dialog**. Only run it in a checkout you trust.
- **Billing:** `claude --bare -p …` skips hooks, skills, plugins, MCP servers and CLAUDE.md (reproducible in CI) but never uses your subscription login. Set `ANTHROPIC_API_KEY` (API billing) or an `apiKeyHelper`.

## Deliberately not set by the scaffold

These are personal, cost or org-policy choices. The scaffold leaves them to you:

- `ultracode`, `workflowSizeGuideline` — workflow cost.
- `CLAUDE_CODE_GOAL_CHECKIN_MINUTES`, `CLAUDE_CODE_DISABLE_CRON`, `ANTHROPIC_DEFAULT_HAIKU_MODEL` (the latter also changes background summarization).
- `crossSessionInbound` and Stop/Notification hooks.

## Not supported

- **Channels** (`--channels`, Telegram/Discord/iMessage, CI webhooks pushing into a session). They are a **research preview**, are enabled per session by a CLI flag (no file can turn them on), need Bun, and Team/Enterprise admins must enable them. An allowlisted sender can drive a session that holds your code. Revisit when they leave preview.
- Scheduled CI scripts and GitHub Actions — out of scope for the scaffold.

Facts checked against code.claude.com docs on 2026-10-01 (Claude Code 2.1.283). Re-verify the version numbers above when upgrading.
