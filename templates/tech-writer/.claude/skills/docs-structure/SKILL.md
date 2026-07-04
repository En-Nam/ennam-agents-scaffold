---
name: docs-structure
description: Use when deciding where a document belongs or why a doc feels wrong. Applies the Diátaxis model — tutorial, how-to, reference, explanation — and the rule that mixing quadrants is the most common documentation failure.
---

# Docs Structure (Diátaxis)

Most bad documentation is not badly written — it is the wrong *kind* of document for the reader's need. Diátaxis sorts docs by two axes: **learning vs working**, and **practical vs theoretical**. Pick one quadrant per document.

## The four quadrants

| Quadrant | Reader's need | Shape | Voice |
|---|---|---|---|
| **Tutorial** | "Teach me, I'm new" (learning + practical) | A guided lesson with a guaranteed-to-work path | "We will…", encouraging, no detours |
| **How-to** | "Help me do X" (working + practical) | Numbered steps for one real task | Imperative, assumes competence |
| **Reference** | "Tell me the facts" (working + theoretical) | Exhaustive, structured, dry | Neutral, complete, no opinions |
| **Explanation** | "Help me understand" (learning + theoretical) | Discussion of why, trade-offs, context | Reflective, connects ideas |

## The one rule that matters most

**One quadrant per document.** The dominant failure mode is a tutorial that swells into a reference dump, or a how-to that stops to explain theory. When a doc feels bloated or confusing, it is usually two quadrants fighting — split it.

- A tutorial that lists every config option → move the options to a **reference**.
- A how-to that explains the architecture → move the why to an **explanation**, link it.
- A reference page with a "getting started" walkthrough → lift the walkthrough into a **tutorial**.

## Deciding fast

Ask: is the reader **studying** or **working**? Do they want **practical steps** or **theoretical knowledge**?
- studying + practical → tutorial
- working + practical → how-to
- working + theoretical → reference
- studying + theoretical → explanation

## Review checklist

- [ ] The document is exactly one quadrant.
- [ ] It states its audience and prerequisites up front.
- [ ] A how-to is numbered steps for ONE task, not many.
- [ ] A reference is complete and opinion-free.
- [ ] Cross-links point to the other quadrants instead of inlining them.
