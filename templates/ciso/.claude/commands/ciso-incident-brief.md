---
description: Assemble an evidence-based incident brief for an incident ID, saved to incidents/<id>.md.
---

Usage: `/ciso-incident-brief <id>`

Steps:
1. If the incident ID, affected systems, or evidence sources are unclear, ask the user before drafting.
2. Build the timeline and every figure (counts, durations, blast radius) strictly from evidence — logs, SIEM, alerts, tickets. Do not reconstruct events or numbers from memory (Rule 13).
3. Mark every gap in the evidence with `?` — an unknown timestamp, an unconfirmed impact, a missing root cause stays `?` until evidence fills it.
4. Structure the brief: Summary, Timeline, Impact, Root Cause (or `?`), Containment & Recovery actions taken, Follow-ups & Owners.
5. Apply the @incident-response playbook; note which containment or notification steps required — or still require — human sign-off.
6. Flag any regulator/customer notification consideration as a consult-legal matter, not a settled obligation.
7. Save to `incidents/<id>.md`. Surface every `?` and every judgment call in the handoff (Rule 12).
