---
description: Reconcile an account to an independent source, itemising every difference with a cause, saved to reconciliations/<account>.md.
---

Usage: `/acct-reconcile <account>`

Steps:
1. Identify the account's book balance and the independent source it should tie to — a bank statement, sub-ledger, or third-party confirmation. The books are proven against the source, never against themselves.
2. Read any prior reconciliation in `reconciliations/<account>.md` for carried-forward items and the expected format.
3. Transcribe both balances from their documents and cite each source. Never recompute a balance from memory (Rule 13).
4. Compute the difference, then itemise it: list each reconciling item (timing, unrecorded transaction, error, fee) with its own amount, cause, and supporting document. The itemised items must fully explain the difference.
5. Any residual that cannot be explained by a sourced item BLOCKS the close — flag it, escalate it, and never plug it to zero with a balancing figure (Rule 12).
6. Where a fix requires a classification or accrual decision, present it for a human to confirm (Rule 5).
7. Save to `reconciliations/<account>.md` with a clear status: `RECONCILED` only when the difference is fully explained by sourced items, otherwise `BLOCKED` with the open items listed.
