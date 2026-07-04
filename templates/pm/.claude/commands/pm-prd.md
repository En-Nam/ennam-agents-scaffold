---
description: Draft a PRD / one-pager — problem, outcome metric, scope, risks — then save after stakeholder sign-off.
---

Usage: `/pm-prd <initiative>`

Steps:
1. Read everything under `product/` that touches `<initiative>`; pull linked Jira epics for prior context.
2. Frame the problem first: target user, the pain, and the measurable outcome. Do NOT write a solution before this exists.
3. Draft the PRD using @.claude/skills/prd-authoring/SKILL.md. Required sections: Problem, Target user, Outcome metric (+ baseline), Scope (In / Out), Solution sketch, Risks & dependencies, Open questions.
4. Every success metric names a number and a baseline. If unknown, write `[METRIC TBD]` and list it under Open questions — never invent one.
5. Fill Scope → Out explicitly. What you are not doing is part of the spec.
6. Present the full draft and ASK for explicit stakeholder sign-off. Do NOT save without it.
7. On sign-off: save to `product/<id>.md` (id format: `<area>-<short-slug>`), link the Jira epic, and append a one-line entry to `product/INDEX.md`.
