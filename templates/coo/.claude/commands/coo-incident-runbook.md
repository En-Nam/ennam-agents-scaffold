---
description: Draft an operational incident runbook for a scenario, saved to runbooks/<scenario>.md.
---

Usage: `/coo-incident-runbook <scenario>`

Steps:
1. If the scenario's trigger, the affected systems, or the escalation contacts are unclear, ask the user before drafting.
2. Read any existing runbooks in `runbooks/` to match tone and structure.
3. Structure the runbook: Trigger & detection, Severity levels, Roles (incident owner, comms, responders), Step-by-step response, Escalation path & contacts, Recovery & all-clear, Post-incident review.
4. Name a single **owner** for the runbook and a review date; keep every step executable under pressure — one actor and one action per step.
5. Gate every irreversible or customer-facing step (failover, vendor cutover, customer notification, shutdown) on named human sign-off — this role coordinates, it does not execute (Rule 5).
6. Apply the @sop-authoring checklist — a runbook is an SOP for a bad day.
7. Save to `runbooks/<scenario>.md` with a `DRAFT` marker until human sign-off. Surface any gap or assumption (Rule 12).
