---
description: Run the month/period-end close checklist for a period, saved to close/<period>.md.
---

Usage: `/acct-close <period>`

Steps:
1. Read prior closes in `close/` and any open items from last period's checklist to carry forward.
2. Work the checklist in order, marking each step done / open / blocked:
   - **Cut-off** — confirm transactions land in the correct period; nothing pulled forward or pushed out to flatter the numbers.
   - **Record** — all journal entries for the period posted and balanced, each line citing its source document (Rule 13).
   - **Reconcile** — run `/acct-reconcile` for every material account; each must be `RECONCILED` against an independent source.
   - **Review** — a second read of entries and reconciliations; classification and accrual calls confirmed by a human (Rule 5).
   - **Approve & lock** — controller/CFO sign-off recorded, then the period is locked against further edits.
   - **Report** — hand off to `/acct-statements <period>` once the close is approved.
3. Any account left `BLOCKED` — an unexplained reconciling difference — blocks the close. List it and stop; never force the close by plugging the gap (Rule 12).
4. Save the checklist to `close/<period>.md` with each step's status and the named approver. Mark the file `DRAFT` until sign-off.
