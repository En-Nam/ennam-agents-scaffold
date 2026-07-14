---
name: architecture-decision-record
description: Use when writing or reviewing an Architecture Decision Record. Enforces context → options → decision → consequences structure, an explicit trade-off and the reasoning behind the choice, and the discipline that an accepted ADR is immutable — superseded, never edited.
---

# Architecture Decision Record playbook

An ADR captures one architecturally significant decision, the forces behind it, and the trade-off accepted by making it. Its value is the reasoning it preserves for whoever inherits the system. Use this skill any time you write a new ADR or review one before it's accepted.

## Structure (in this order)

1. **Status** — `Proposed`, `Accepted`, `Superseded by <ADR>`, or `Deprecated`. A record starts `Proposed` and only a human moves it to `Accepted` (Rule 5).
2. **Context** — the forces at play: constraints, requirements, and why a decision is needed now. Enough that a future reader understands the pressure without asking anyone.
3. **Options considered** — 2-4 genuine options, each with its trade-off. One option is not a decision; it's a foregone conclusion dressed up.
4. **Decision** — the option chosen, stated in a single clear sentence, plus **why** it was chosen over the others.
5. **Consequences** — what becomes easier, what becomes harder, and the trade-off you are knowingly accepting. Good and bad both; an ADR with only upside is incomplete.

## Record the trade-off and the why

The decision line alone is nearly worthless a year later. What a future engineer needs is *why this and not that*, and *what we gave up*. Make both explicit:

- Name the trade-off in plain terms — "we accept higher operational cost to get stronger consistency".
- Record the reasoning, not just the outcome — the constraint or evidence that tipped the call.
- Cite a source for any figure that drove the decision (benchmark, cost, SLA); never invent one (Rule 13).

## Immutable once accepted

This is the core discipline. An accepted ADR is a historical record of what was decided and why, at a point in time.

- Never edit an accepted ADR to reflect a new decision — the old reasoning was still true when it was made.
- To change course, write a **new** ADR that supersedes the old one. Mark the old record `Superseded by <new title>` and link both ways.
- Correcting a typo is fine; rewriting the decision or its rationale is not.

## The human decides

The ADR frames and records; an engineer or the CTO accepts it (Rule 5). Leave a record `Proposed` until a human moves it to `Accepted`. Never mark your own draft accepted.

## Review checklist (before an ADR is accepted)

- Status is present and honest (`Proposed` until a human accepts).
- Context explains the forces and why a decision is needed now.
- There are 2-4 real options, each with its trade-off.
- The decision is one clear sentence, with an explicit **why**.
- Consequences name what gets harder and the trade-off accepted — not only the upside.
- Every figure carries a source; every gap is a visible `[SOURCE TBD]`, not a guess (Rule 13).
- If it reverses a prior decision, the old ADR is marked `Superseded` and linked — not edited.
