---
description: Score and rank a backlog area with a stated framework (RICE / MoSCoW), showing the math.
---

Usage: `/pm-prioritize <backlog-area>`

Steps:
1. Read the items under `product/` (and linked Jira) for `<backlog-area>`. List them before scoring.
2. Pick ONE framework and state it explicitly. Use @.claude/skills/prioritization-frameworks/SKILL.md to choose (RICE for continuous value, MoSCoW for release-must-haves, value-vs-effort 2x2 for a quick cut).
3. Score every item in a table with the framework's columns visible (e.g. RICE: Reach, Impact, Confidence, Effort → Score). No hidden math.
4. Confidence and effort inputs that are guesses must be labelled as such and surfaced (Rule 12) — do not present a guess as a measured value.
5. Rank by score. Where a human overrides the score for a strategic reason, record the override AND the reason next to the row (Rule 7 — surface, don't silently re-sort).
6. Present the ranked table and ASK for sign-off before writing it back.
7. On sign-off: save the ranked table to `product/priorities-<area>.md` and note the date + framework used.
