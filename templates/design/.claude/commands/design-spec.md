---
description: Write a design spec for a feature — problem, users, flows, states, acceptance — saved to design/<feature>.md.
---

Usage: `/design-spec <feature>`

Steps:
1. If the users, the problem, or the target platform are unclear, ask before drafting.
2. Read design context from Figma via the figma MCP and any existing files in `design/` to match the established design system (Rule 11).
3. Draft the spec with sections:
   - **Problem** — what's broken or missing today, and why it matters now.
   - **Users** — who this serves, their context, and the goal they're trying to reach.
   - **Flows** — the primary path plus key branches, step by step.
   - **States** — empty, loading, error, success, and edge cases for each screen.
   - **Acceptance criteria** — testable conditions that define "done".
4. Save to `design/<feature>.md`.
5. Surface every assumption and open question at the top; treat the spec as a proposal until human sign-off (Rule 12).
