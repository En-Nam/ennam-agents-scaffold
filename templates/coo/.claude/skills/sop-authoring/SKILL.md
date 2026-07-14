---
name: sop-authoring
description: Use when drafting or reviewing a standard operating procedure or runbook. Enforces purpose/scope framing, one-actor-per-step procedures, a single named owner, and a review date so the document stays executable and current.
---

# SOP authoring playbook

A standard operating procedure exists so the work runs the same way whoever is on shift — and so a bad day has a script instead of improvisation. Use this skill any time you draft an SOP or a runbook, or review one before it goes live.

## Structure (in this order)

1. **Purpose** — 1-2 sentences: what outcome this procedure guarantees and why it matters. If you can't state the outcome, the SOP isn't ready.
2. **Scope** — when this procedure applies and, just as important, when it does not. Name the trigger that starts it.
3. **Roles & owner** — who performs the steps, and the single accountable owner of the document.
4. **Prerequisites** — the access, tools, and approvals needed before step 1.
5. **Procedure** — numbered steps, one actor and one action per step. A reader should never have to guess who does what.
6. **Exceptions & escalation** — what to do when a step fails or reality doesn't match the script, and who to escalate to.
7. **Review date** — when the SOP is next revisited. An unreviewed SOP is a liability.

## One actor, one action per step

Each step names the actor and a single verb — "the on-call engineer restarts the queue worker", not "restart things and check everything is fine". Steps that bundle actions hide failure points and can't be handed off cleanly.

## A single named owner

Every SOP has exactly one accountable owner — a named role or person, not "the ops team". The owner keeps it current and answers questions about it. An unowned SOP goes stale and nobody notices until it's wrong.

## Irreversible steps are gated

Flag any step that is irreversible or customer-facing — a failover, a data deletion, a vendor cutover, a customer notification. These require named human sign-off before they run. This role drafts and coordinates the procedure; a human executes and owns the irreversible action (Rule 5).

## Review date discipline

Date every SOP and set the next review. Processes drift; a procedure that describes last quarter's system is worse than none, because it's still trusted. Re-read after any incident that touched the process.

## Review checklist (before the SOP goes live)

- Purpose states a concrete outcome; scope names the trigger and the boundaries.
- Every step names one actor and one action.
- Exactly one named owner, plus a review date.
- Irreversible or customer-facing steps are flagged for human sign-off.
- Prerequisites and the escalation path are explicit.
- File starts with `DRAFT` until human sign-off.
