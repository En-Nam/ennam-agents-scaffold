---
name: handoff
description: Use ONLY when the user has explicitly granted full autonomy to complete a complex task with a phrase like "trao toàn quyền để hoàn thành", "tự quyết và làm đến cùng", "đi thẳng vào implement", "full autonomy", or "you decide and do it". Triggers an internal judge-panel decision round and proceeds straight to implementation without further user confirmation. Do NOT invoke on ambiguous or implicit grants — ask first.
---

# Handoff: full-autonomy task execution

## When to invoke

The user has explicitly granted full autonomy with one of these phrases (or a close paraphrase):

- "trao toàn quyền để hoàn thành"
- "tự quyết và làm đến cùng"
- "đi thẳng vào implement"
- "full autonomy"
- "you decide and do it"
- "không cần hỏi lại, làm luôn"

If the grant is ambiguous, partial ("làm thử xem"), or scoped to a different task than the current one — DO NOT invoke this skill. Ask the user to confirm autonomy and scope first (per AGENTS.md Rule 1).

## What this skill does

Switch from "ask → confirm → act" mode into "decide → execute" mode for the granted scope:

1. **Restate scope** in one sentence and write it to your todos. This is the boundary you must not cross.

2. **Internal judge panel** (capped at 3 advocates + 1 judge):
   - Spawn 3 parallel agents via `superpowers:dispatching-parallel-agents`, each proposing a distinct solution approach with rationale and trade-offs.
   - Spawn 1 judge agent that reads all 3 proposals and picks the winner, with a written verdict (criteria: simplicity, fit-to-codebase, reversibility, test surface).

3. **Plan the winner** via `superpowers:writing-plans` — convert the verdict into success criteria + step list.

4. **Implement** via `superpowers:executing-plans` or `superpowers:subagent-driven-development`. No intermediate "should I proceed?" prompts to the user.

5. **Verify** via `superpowers:verification-before-completion`. Mandatory. Skip ≠ done.

6. **Report**: surface (a) what was decided and why (judge verdict verbatim), (b) what was implemented, (c) verification evidence, (d) anything left for human review.

## Hard stop conditions (do NOT continue silently past these)

Per AGENTS.md Rule 12 (Fail loud), STOP and re-engage the user when:

- A destructive action is required (push, force-push, delete branch/file, drop table, `--no-verify`, secret exposure).
- The task scope expands beyond what was granted (new files outside the implied surface, new packages, new external services).
- The judge panel returns a tie (≥2 advocates tied) or no clear winner — surface the options.
- A verification step fails and the fix would require changes the user did not authorize.
- You hit unfamiliar state (unexpected file, branch, lock) — investigate, do not delete.

## Rules

- "Autonomy" applies only to the explicitly granted scope. Phrase "fix bug X with full autonomy" ≠ permission to refactor module Y.
- Run the judge panel BEFORE implementing. Skipping it defeats the purpose; the user paid for diversity-of-thought.
- Cap: 3 advocates + 1 judge. Bigger panels waste tokens without improving outcome.
- Document the judge's verdict in the final report so the user can audit the call later.
- Write a checkpoint via Serena MCP at session end (CLAUDE.md mandate applies).
