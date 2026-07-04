---
description: Draft a document in the correct Diátaxis quadrant, with every technical claim traced to a source file.
---

Usage: `/doc-draft <topic>`

Steps:
1. Read existing docs under `docs/` that touch `<topic>` and the project glossary. Note the established voice and terms.
2. Decide the Diátaxis quadrant using @.claude/skills/docs-structure/SKILL.md — tutorial (learning), how-to (task), reference (lookup), or explanation (understanding). State the choice at the top of the draft.
3. Draft to that quadrant's shape. State the audience and prerequisites in the opening lines.
4. For every command, path, API name, flag, or version you write: open the source file and copy it exactly. Cite the source inline (e.g. "`--no-prompts` (packages/cli/src/index.ts)"). If you cannot verify it, write `[VERIFY]` — do NOT recall it from memory (Rule 13).
5. Run terminology consistency against the glossary using @.claude/skills/style-guide/SKILL.md.
6. Present the draft as a diff and ASK for sign-off. Do NOT publish user-facing docs without it.
7. On sign-off: save under `docs/<quadrant>/<slug>.md` and append a one-line entry to `docs/INDEX.md`.
