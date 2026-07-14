---
description: Draft a standard operating procedure for a process, saved to sops/<process>.md.
---

Usage: `/coo-sop <process>`

Steps:
1. If the process trigger, its boundaries, or the systems involved are unclear, ask the user before drafting.
2. Read any existing SOPs in `sops/` to match tone and section order.
3. Structure the SOP: Purpose, Scope, Roles & owner, Prerequisites, Step-by-step procedure (numbered, one actor and one action per step), Exceptions & escalation, Review date.
4. Name a single accountable **owner** for the SOP and a review date — an unowned SOP goes stale.
5. Flag every step that is irreversible or customer-facing — those require named human sign-off before they run (Rule 5).
6. Apply the @sop-authoring checklist before saving.
7. Save to `sops/<process>.md` with a `DRAFT` marker at the top until human sign-off. Surface any assumption you had to make (Rule 12).
