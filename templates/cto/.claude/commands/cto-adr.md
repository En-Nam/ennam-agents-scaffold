---
description: Draft an Architecture Decision Record (context, decision, trade-offs, consequences), saved to adr/<title>.md.
---

Usage: `/cto-adr <title>`

Steps:
1. If the decision, its drivers, or the options considered are missing from the request, ask the user before drafting — an ADR records a real decision, not a placeholder.
2. Read existing records in `adr/` to match numbering, tone, and to check whether this decision supersedes a prior one.
3. Draft the ADR with sections: **Status** (`Proposed` until a human accepts), **Context** (the forces at play, constraints, and why a decision is needed now), **Options considered** (2-4, each with its trade-off), **Decision** (the option chosen and the single sentence stating it), **Consequences** (what becomes easier, what becomes harder, and the trade-off accepted by choosing this).
4. Make the **decision** and the **trade-off** explicit and record **why** — the reasoning is the point of the ADR, not just the outcome.
5. Cite a source for every figure — benchmark, cost, SLA; mark anything you don't have as `[SOURCE TBD]` — never invent a number (Rule 13).
6. An accepted ADR is immutable — never rewrite one. If this decision reverses an earlier record, mark the old one `Superseded by <this title>` and link both ways.
7. Save to `adr/<title>.md` with status `Proposed` until an engineer or the CTO accepts it (Rule 5) — the human owns the technical decision.
8. Surface any option you had to guess at and any unsourced figure in your handoff (Rule 12).
