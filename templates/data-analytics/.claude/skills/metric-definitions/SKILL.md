---
name: metric-definitions
description: Use when defining or reviewing a business metric for a dashboard or report. Enforces a reproducible definition — name, grain, source, filters, calculation, as-of semantics — so the same number means the same thing to everyone.
---

# Metric Definitions

A metric without a written definition is a rumor: two people compute "active users" three ways and the meeting argues about numbers instead of decisions. A definition makes the number reproducible and the argument about the business, not the SQL.

## Required fields

| Field | Why it matters | Failure smell |
|---|---|---|
| **Name** | Canonical label everyone uses | "Users" (which users?) |
| **Question** | The business question in one sentence | Metric exists with no stated purpose |
| **Grain** | One row per _what_ | Sums that double-count |
| **Source** | Tables / models it reads | "From the database" |
| **Filters** | Inclusion / exclusion rules | Internal/test accounts silently included |
| **Calculation** | Exact aggregation as reviewed SQL | Prose like "roughly the sum of…" |
| **As-of / refresh** | Event vs processing time, refresh cadence | Numbers that change when you re-run yesterday |

## The consistency rules

- **One definition per metric.** If a second definition appears, reconcile them — do not let "active users (marketing)" and "active users (product)" both float unlabelled (Rule 7 — surface the conflict).
- **Filters are explicit.** Excluding internal accounts, test orders, or bots must be written down, or the number drifts the day someone forgets.
- **Time semantics are stated.** "Signups today" means nothing without a timezone and event-vs-processing-time choice.
- **The worked example uses real output.** Paste the current value with its run date from the query, not from memory (Rule 13).

## Caveats to record

- Late-arriving data (today's number will move).
- Timezone and date-boundary handling.
- Dedup rules and known duplicate sources.
- Any sampling or approximation.

## Review checklist

- [ ] All seven required fields are present.
- [ ] Grain is one row per a clearly named thing.
- [ ] Filters (internal/test/bot exclusions) are explicit.
- [ ] Calculation is reviewed SQL, not prose.
- [ ] Time semantics (event/processing, timezone, refresh) are stated.
- [ ] Worked example shows a real value + run date.
- [ ] No conflicting second definition exists unreconciled.
