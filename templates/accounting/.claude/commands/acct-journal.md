---
description: Draft a balanced double-entry journal entry where every line cites its source document, saved to journals/<id>.md.
---

Usage: `/acct-journal <description>`

Steps:
1. If the amount, date, accounts, or supporting document are missing from the request, ask the user before drafting — do not guess a figure.
2. Read existing entries in `journals/` to match the numbering scheme, tone, and section order.
3. Identify the source document for the transaction (invoice, receipt, bank statement, contract) and the amount stated on it. Transcribe the amount; never recompute or estimate it (Rule 13).
4. Draft the entry as debit and credit lines. Each line names its account and cites the source document the amount came from. Total debits must equal total credits.
5. Where the account, tax code, or period is a judgment call, present the options and rationale and mark them for a human to confirm (Rule 5) — do not silently decide.
6. Save to `journals/<id>.md` with a `DRAFT` marker at the top until a human signs off.
7. If the entry does not balance, or any amount lacks a source document, stop and surface it — never plug a figure to force a balance (Rule 12).
