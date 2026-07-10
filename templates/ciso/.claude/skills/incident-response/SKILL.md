---
name: incident-response
description: Use when handling or documenting a security incident. Covers the NIST-style detect -> contain -> recover -> post-mortem lifecycle, evidence-based timelines, and the two human sign-off gates before production containment and before any external notification.
---

# Incident response playbook

Incidents are handled in a disciplined lifecycle so nothing is improvised under pressure. This role advises and documents each phase — it never executes the changes itself. Use this skill any time you work an incident.

## Lifecycle: detect -> contain -> recover -> post-mortem

1. **Detect** — confirm the incident is real from evidence (alerts, SIEM, logs). Classify severity and scope. Distinguish confirmed facts from `?` unknowns from the first minute.
2. **Contain** — limit the blast radius. Short-term (isolate, block) then long-term (patch, rotate). Containment that touches production is gated — see below.
3. **Recover** — restore validated-clean systems, monitor for recurrence, and confirm the threat is gone before closing.
4. **Post-mortem** — blameless timeline, root cause, and follow-up actions with owners. Feed findings back into the risk register.

## Evidence-based timeline

Every timestamp, count, and impact figure in the brief comes from evidence — logs, SIEM, tickets. Do not reconstruct the timeline from memory (Rule 13). Any gap stays `?` until evidence fills it; an unknown root cause is `?`, never a plausible guess dressed as fact.

## Two sign-off gates

Two actions require a **named human sign-off** before they proceed — document who approved and when:

1. **Before production-touching containment.** Isolating, blocking, or shutting down a production system can cause its own outage. Recommend the action, then get an accountable human to approve executing it. This role never applies the change.
2. **Before any regulator or customer notification.** No external communication goes out without explicit sign-off. Draft the message; a named human approves sending it.

## Breach notification is a consult-legal matter

Whether an incident is a notifiable breach, and the timeline to notify, is a legal determination — not a guarantee this playbook can make. Flag the question to legal early; document the flag. Do not assert a notification deadline as settled fact.

## Review checklist (before closing the brief)

- Lifecycle phase is explicit: detect / contain / recover / post-mortem.
- Timeline and figures are evidence-derived; every gap is marked `?`.
- Production containment carries a named sign-off (or is flagged as pending one).
- Any external notification carries a named sign-off and a consult-legal flag.
- Post-mortem follow-ups have owners and feed the risk register.
