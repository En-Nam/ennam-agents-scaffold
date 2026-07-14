---
name: reconciliation-discipline
description: Use when reconciling an account or closing a period. Enforces tracing every balance to an independent source, itemising every difference with a cause, and never plugging an unexplained gap. Figures must be reproducible.
---

# Reconciliation discipline playbook

A reconciliation proves the books are right by tying them to something outside the books. Its whole value is that a figure can be traced back to an independent document — not that it "looks balanced". Use this skill any time you reconcile an account or run a close.

## Trace every balance to an independent source

- The books are proven against an **independent source** — a bank statement, a sub-ledger, a third-party confirmation. Never reconcile the books against themselves.
- Transcribe both the book balance and the source balance from their documents, and cite each. A balance you recall from memory is not sourced (Rule 13).
- Every figure must be **reproducible**: anyone should be able to start from the same documents and arrive at the same numbers. If a step can't be re-walked from source, it isn't done.

## Itemise every difference with a cause

Take the gap between the two balances and break it into named items. Each reconciling item has:

| Item | Amount | Cause | Source document |
|---|---|---|---|
| Deposit in transit | ... | Timing — recorded in books, not yet on statement | Bank slip |
| Bank fee | ... | Unrecorded charge | Statement line |
| Posting error | ... | Wrong amount keyed | Original invoice |

The items must **fully explain** the difference. "Sum of explained items = total difference" is the test.

## Never plug

- An unexplained residual is a **red flag, not a rounding nuisance**. It means something is wrong — a missing entry, a wrong classification, a real discrepancy.
- **Never** force the residual to zero with a balancing "plug", a suspense entry you don't intend to resolve, or a rounded fudge. Plugging hides the very error the reconciliation exists to catch.
- An unexplained **difference blocks the close.** Mark the account `BLOCKED`, list the open amount, and escalate it. A difference that gets plugged instead of explained is surfaced loudly (Rule 12), never buried.

## Judgment stays with a human

When a reconciling item needs a classification or accrual decision to clear, draft the options and hand the call to a person (Rule 5). The model extracts and itemises; a human decides.

## Review checklist (before marking an account reconciled)

- Book balance and source balance are each transcribed from, and cite, a document.
- The source is genuinely independent of the books.
- Every reconciling item has an amount, a cause, and a supporting document.
- The itemised items sum exactly to the difference — nothing left over.
- No plug, suspense fudge, or rounding was used to force a tie.
- Status is `RECONCILED` only when fully explained; otherwise `BLOCKED` with open items listed.
- Every figure is reproducible from the cited sources.
