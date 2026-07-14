---
description: Assemble an operations review for a period, with a named owner and a due date on every action item, saved to ops-reviews/<period>.md.
---

Usage: `/coo-ops-review <period>`

Steps:
1. If the period's scope, the functions in review, or the metric sources are unclear, ask the user before drafting.
2. Pull every metric from its source — dashboards, systems of record, ticket queues. Do not guess a number or recall one from memory (Rule 13); mark any gap `[SOURCE TBD]`.
3. Structure the review: Summary, KPIs vs target (with source), What moved and why, Risks & blockers, Action items.
4. Give every action item a named **owner** and a **due date**. An action item with neither an owner nor a due date is surfaced as unassigned — never saved silently.
5. Diagnose before you prescribe — tie each action to the metric or blocker it addresses, not to activity for its own sake.
6. Apply the @ops-review playbook; carry forward last period's open action items and note their status.
7. Save to `ops-reviews/<period>.md`. Surface every unassigned action and every `[SOURCE TBD]` in the handoff (Rule 12).
