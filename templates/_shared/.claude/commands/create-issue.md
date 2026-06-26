---
description: Open a new issue on the En-Nam/ennam-agents-scaffold repo to report a bug, request a feature, or surface feedback discovered while using the scaffold.
---

Open a new GitHub issue on `En-Nam/ennam-agents-scaffold` (the scaffold's own repo) so maintainers can track feedback discovered while using the scaffold in this project.

## Steps

1. **Type** — if the user did not state it, ask which one:
   - `bug` — broken behavior, regression, error
   - `feature` — new capability or enhancement
   - `question` — clarification or how-to
   - `docs` — documentation gap or fix

2. **Title + description** — extract from the user's words verbatim, or ask. Do not paraphrase the user's intent (Rule 13: trust user input over LLM reproduction).

3. **Label** — classify ONE label from the type:
   | Type | Label |
   |---|---|
   | bug | `bug` |
   | feature | `enhancement` |
   | question | `question` |
   | docs | `documentation` |

4. **Compose the body** using this template:

   ```markdown
   ## Context
   - Profile: <profile name from scaffold install, or "unknown">
   - Scaffold version: <version from package.json or "unknown">
   - OS: <platform>

   ## Description
   <user's exact words>

   ## Repro / Steps
   <user's exact steps, or "(not provided)">

   ## Suggested fix
   <user's exact suggestion, or "(not provided)">
   ```

5. **Confirm** — print the rendered title + body + label to the user and ask: "Open this issue? (y/n)". Do NOT skip this step.

6. **Create** — on confirmation only, run:

   ```bash
   gh issue create \
     --repo En-Nam/ennam-agents-scaffold \
     --title "<title>" \
     --body "<body>" \
     --label "<label>" \
     --assignee danny-exnodes
   ```

7. **Return** the issue URL printed by `gh`.

## Rules

- NEVER post without the user's explicit "y" in step 5.
- NEVER add labels beyond the one classified in step 3 — project owner triages further (e.g., `help wanted`, `good first issue`).
- If `gh auth status` reports unauthenticated, ask the user to run `gh auth login` first.
- Do NOT invent versions, profiles, file paths, or repro steps. If unknown, write `(not provided)`.
- The assignee is hard-coded to `danny-exnodes` by design — do not parameterize.
