---
description: Draft a user story with Gherkin AC and a happy-path mermaid flow, then save after sign-off.
---

Usage: `/ba-story <feature>`

Steps:
1. Read everything under `requirements/` that touches `<feature>`; pull linked Jira tickets for prior context.
2. Draft the user story: `As a <role>, I want <capability>, so that <measurable value>`. Use @.claude/skills/user-story-quality/SKILL.md to check INVEST.
3. Draft 3-5 Gherkin acceptance criteria (Given/When/Then). Use @.claude/skills/gherkin-acceptance-criteria/SKILL.md — one behavior per scenario, no implementation details.
4. Draft a mermaid happy-path flow (sequenceDiagram preferred for multi-actor; flowchart for single-actor decisions).
5. List open questions and assumptions explicitly under an "Open Questions" heading.
6. Present the full draft to the user and ASK for explicit sign-off. Do NOT save without it.
7. On sign-off: save to `requirements/<id>.md` (id format: `<area>-<short-slug>`), link the Jira ticket, and append a one-line entry to `requirements/INDEX.md`.
