---
description: Review an existing doc for style, terminology drift, quadrant purity, and broken references.
---

Usage: `/doc-review <path>`

Steps:
1. Read the doc at `<path>` and the project glossary.
2. **Quadrant check** — is it one Diátaxis quadrant, or has a tutorial drifted into a reference dump? Recommend a split if mixed (@.claude/skills/docs-structure/SKILL.md).
3. **Terminology check** — list every term that has a glossary entry and flag any inconsistent usage (one concept must map to one term). Use @.claude/skills/style-guide/SKILL.md.
4. **Claim check** — for each command / path / API name / flag / version, verify it against the current source. Flag anything you cannot trace as `[VERIFY]` (Rule 13). Report stale identifiers explicitly (Rule 12 — do not silently "fix" by guessing).
5. **Reference check** — flag broken internal links and dead relative paths.
6. **Style check** — audience stated? prerequisites stated? how-tos show copy-pasteable commands?
7. Output a findings list (most-severe first) with line citations. Apply fixes only for unambiguous style/terminology issues; for anything requiring a judgement call, surface it and ask.
