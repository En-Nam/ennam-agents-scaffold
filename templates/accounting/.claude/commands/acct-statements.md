---
description: Draft financial statements for a period where every figure traces to a signed-off reconciliation, saved to statements/<period>.md.
---

Usage: `/acct-statements <period>`

Steps:
1. Confirm the period's close is approved (`close/<period>.md`). If the close is still open or `BLOCKED`, stop and say so — statements do not go out on an unclosed period.
2. Read the reconciliations in `reconciliations/` for the period. Every statement figure must trace back to a `RECONCILED` account; a figure with no reconciliation behind it does not appear.
3. Draft the statements — balance sheet, income statement, and cash flow — carrying each figure from its reconciliation. Never recompute or estimate a total from memory (Rule 13).
4. For each line, note the reconciliation (or journal) it traces to, so any figure can be walked back to its source document.
5. Where presentation, classification, or an estimate is a judgment call, flag it for a human to decide (Rule 5) — do not settle it silently.
6. Save to `statements/<period>.md` marked `DRAFT`. Controller/CFO sign-off is required before any statutory or tax filing (Rule 12).
