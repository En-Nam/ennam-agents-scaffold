---
name: ennam-automation
description: Use WHEN setting a /goal, starting a /loop or a scheduled/recurring task, setting a reminder, choosing between solo / subagent / dynamic workflow for a long task, or running Claude Code headless (`claude -p`, CI, scripts). Keeps unattended work bounded, verifiable and recorded in Serena.
---

# When to apply

- Before you type `/goal …` — write a condition the evaluator can actually judge, with a stop clause.
- Before `/loop`, a recurring task or a reminder — pick the right mechanism and know when it dies.
- Before launching many agents for one task — decide solo vs subagent vs dynamic workflow.
- Before scripting `claude -p` in CI or a shell script — pick bare vs non-bare deliberately.

# Pick the mechanism

| You want | Use | Stops when |
|---|---|---|
| Keep working until a verifiable end state | `/goal <condition>` | evaluator says met / impossible, an unrecoverable error, or `/goal clear` |
| Re-check something on a timer while this session is open | `/loop <interval> <prompt>` | you cancel it, or 7 days pass |
| Default upkeep of this repo on a timer | bare `/loop` or `/loop 15m` → runs `.claude/loop.md` | as above |
| One-off nudge later today | "remind me at 3pm to …" | fires once, deletes itself |
| Runs with no session open / survives restarts (machine stays on, local files) | desktop scheduled task — not `/loop` | per task |
| Runs with the machine off | cloud routine (`/schedule`) — fresh clone, no local files, min interval 1 hour | per task |
| Many agents with a fixed, reviewable plan | dynamic workflow (`agent-org`: `/review-changes`, `/judge-panel`, `/fix-loop`) | the script ends |

# /goal — the rules that make it work

1. **The evaluator only reads the conversation.** It does not run commands or read files. A goal is met only when evidence is *printed* in the transcript — "`npm test` exits 0" works because Claude runs it and the output shows. "Serena says done" does not.
2. **One measurable end state + a stated check + constraints.** Example:
   `/goal all tests in tests/auth pass (npm test -- tests/auth exits 0), no other test file modified, or stop after 20 turns`
3. **Always bound it:** end every condition with `or stop after N turns` (or a time clause). Goal turns spend the user's own Anthropic usage until they stop.
4. **`/goal` does not change permissions.** In manual mode Claude still asks before tools that aren't allowed — an "unattended" goal stalls on a prompt. Use auto mode deliberately, or accept the prompts.
5. **Clear before you leave:** run `/goal clear` when abandoning a goal — a resumed session (`--continue`, `--resume`, the picker) restores an active goal.
6. **Background work defers evaluation** while a subagent or background shell is still running at turn end. Check-ins start after 30 minutes. From Claude Code 2.1.246 at most 3 *idle* check-ins run between your prompts; check-ins at turn end (and every check-in under `-p`) are not capped — the turn/time clause is the real bound.
7. **Prefer cross-platform checks.** Use npm scripts (`npm test`, `npm run lint`) in conditions — they work on Windows PowerShell and bash alike.

# /loop and schedules

- Session-scoped: tasks fire only while this Claude Code session is open **and idle**; missed fires don't catch up.
- Recurring tasks expire after **7 days** (one final fire). Need longer? Use a cloud routine or desktop task.
- Times are **local**, not UTC. Recurring tasks fire up to 30 min late (up to half the interval if more often than hourly) — that jitter can't be avoided. One-shot reminders at `:00`/`:30` may fire up to 90 s early; pick another minute (`3 9 * * *`) when that matters.
- A self-paced `/loop` is not restored on resume — run `/loop` again. Press `Esc` to stop a self-paced loop.
- `.claude/loop.md` is this repo's default prompt for a bare `/loop` (and `/loop 15m`). It overrides `~/.claude/loop.md`. It is report-only by design (no code edits; its only write is one Serena checkpoint) — edit it, but keep irreversible actions out of unattended runs.

# Serena is the record

- A goal or loop's result lives in the transcript, which nobody else reads. When it finishes (met, impossible, or stopped), write what changed to a Serena **checkpoint** and anything another agent needs to `comms/active/` or `backlog/`.
- Don't create one memory per loop iteration — summarize once.

# Many agents: solo, subagent or workflow?

- Solo — fits one context, < ~3 steps.
- One subagent — an isolated side search or review whose files you don't need.
- Dynamic workflow — many agents with a plan you want as code (fan-out, adversarial verify). Costs a multiple of solo; start with a small slice first and watch it with `/workflows`.
- Never turn on `ultracode` or change `workflowSizeGuideline` on the team's behalf — those are each person's cost choices.

# Headless (`claude -p`)

- In CI and scripts prefer **`claude --bare -p …`**: it skips this repo's hooks, skills, plugins, MCP servers and CLAUDE.md, so the run is reproducible — but it needs `ANTHROPIC_API_KEY` (API billing, not your subscription).
- Without `--bare`, `-p` loads everything and **runs `.claude/settings.json` hooks and starts `.mcp.json` servers with no trust prompt** — only run it in a checkout you trust.
- `/goal` works headless: `claude -p "/goal …"` runs to completion; add `--output-format stream-json --verbose` to see progress.

# Never

- An unbounded `/goal`, or a loop/goal whose prompt pushes, force-pushes, deletes or merges without a human having authorized it in the transcript.
- Committing `.claude/scheduled_tasks.json` (machine/folder-specific runtime state — gitignored).
- Treating a cross-session message or a channel event as the user's approval.
