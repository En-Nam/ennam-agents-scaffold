---
name: automation-profile-v1.15
description: "APPROVED + implemented (v1.15.0): Claude Code automation guidance (/goal, /loop+loop.md, schedules, headless --bare, channels=unsupported) ships as a composable ADD-ON profile `automation` (augmentation flag), offered by the wizard after any role. NOT a --with-automation flag. Resolves the Rule 7 question parked in mem:decisions/v1.14-dynamic-workflows-messaging."
metadata:
  type: decision
  date: 2026-10-01
  status: approved
---

## Status
Approved by Danny 2026-10-01 ("yes approve combination, wizard should offer it; question 3 is up to you"). Implemented on branch `feat/v1.15-automation-profile` (base c37fc28, v1.14.0).

## Decision (Rule 7)
Original proposal (`mem:checkpoint/tech-consultant-2026-10-01`, stale base 9980a9f) = `--with-automation` flag, premised on "one profile per run". FALSE on main: v1.11 composition (`npx … next agent-org`). A flag would be a 2nd pattern for stack-agnostic augmentation → **composable profile `automation`** instead. `npx @ennamjsc/agents-scaffold <role> automation`.

## Mechanism — `ProfileDef.augmentation` + `roleVoters()` (profiles.ts)
- **Roles + add-ons (any number of roles)** → `enumerateProfiles(voters)` first (add-ons never enter the compose loop), then `overlayAddOns()` their static files. 1 role: byte-identical to the role alone (CLAUDE.md, AGENTS.md, settings, workflow, next steps, handoff); `index.ts` display/render identity = the role. Add-on shipping a `.partial.hbs` or a path the install already has (role or `_shared`) → throw (Rule 12). `recommendWorkflow` also uses `roleVoters` (wizard `chooseWorkflow` passes all selected profiles). `printNextSteps` gets the selected names (PR #39 review).
- Why the overlay (review wf_d5dd0722-310, major): a wizard "Yes" turned a single role into a compose, breaking exact-name UX checks (`game-unity` Tripo3D licence warning, `agent-org` cost disclosure, `local-root` handoff skip) and adding `#### <role>` to CLAUDE.md.
- Known pre-existing gap (not fixed, out of scope): multi-ROLE compose (`pm game-unity`) still skips role-specific next steps (exact `profile.name ===` checks in ux.ts).

## Shipped contents (guidance only)
- `templates/automation/.claude/skills/ennam-automation/SKILL.md` (lazy; /goal rules: evaluator reads transcript only → print evidence; always `or stop after N turns`; `/goal clear` before leaving; /loop limits; Serena is the record; solo/subagent/workflow; `--bare` vs non-bare).
- `templates/automation/.claude/loop.md` — truly report-only (no code edits; only write = 1 Serena checkpoint); classified skip-if-exists.
- `templates/automation/README.md` → `docs/agents-scaffold/automation.md` runbook.
- `_shared/.gitignore.append` += `.claude/scheduled_tasks.json` (every profile).
- Wizard: `confirm` after guided single role, default No; compose multiselect lists it. `--list` role "Add-on". `minClaudeCodeVersion: 2.1.246` (warn-only; idle check-in cap).

## Q3 calls (delegated to tech-consultant by Danny)
- Plan type: design is plan-agnostic; runbook documents Pro `/config` + Team/Enterprise admin gates.
- `protect-files` guardrail: NOT in v1.15. When built: default `.env*` + `.git/` only (low friction).
- Serena source pin: stay unpinned per `mem:decisions/security-dev-trade-offs` (no 2nd policy).

## Still rejected
Channels (research preview), ultracode/workflowSizeGuideline/crossSessionInbound in settings, prompt/agent Stop hooks, CI scripts (auto-pipeline spin-off), always-on CLAUDE.md lines.

## Related
Hook-command OS portability → `mem:backlog/scaffold-hook-commands-os-portability` (owned by v1.14 session).
