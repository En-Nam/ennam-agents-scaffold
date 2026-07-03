---
name: sql-review
description: Use before running or shipping an analytical SQL query. Catches the silent-wrong-number classes — join fan-out, null-eating filters, timezone drift, filter-after-aggregate — and enforces read-only discipline.
---

# SQL Review

The dangerous SQL bug is not the one that errors — it is the one that returns a plausible wrong number. This skill is the checklist that catches those before the number reaches a decision.

## The silent-wrong-number classes

| Class | Symptom | Fix |
|---|---|---|
| **Join fan-out** | Row count inflates after a join; sums double-count | Confirm the join is many-to-one on the grain you expect; aggregate before joining if not |
| **Null-eating filter** | `WHERE col != 'x'` silently drops NULL rows | Use `col IS DISTINCT FROM 'x'` or handle NULL explicitly |
| **Filter after aggregate** | Totals include rows you meant to exclude | Filter in `WHERE` (pre-aggregate) vs `HAVING` (post) deliberately |
| **Timezone drift** | Daily counts split across the wrong day boundary | Convert to the reporting timezone before `DATE_TRUNC`; state event-time vs processing-time |
| **Distinct-counting a fanned-out key** | `COUNT(DISTINCT id)` masks the join bug but skews other columns | Fix the grain, don't paper over it with DISTINCT |
| **Implicit dedup assumption** | Source has duplicate rows you didn't expect | Verify uniqueness of the key before trusting sums |

## Read-only discipline

- Analytical queries are **SELECT only**. No `INSERT / UPDATE / DELETE / CREATE / DROP / TRUNCATE` inside an analysis.
- Any data change is a **separate, explicitly human-approved** step — never bundled into a query that "also" reports a number.
- Never `SELECT *` into an output that could contain PII. Name the columns; exclude personal data unless the task explicitly requires and authorizes it.

## Before you trust the result

- [ ] Row count is in the expected order of magnitude.
- [ ] Grain matches the question (one row per what?).
- [ ] Joins don't fan out (count before == count after, or aggregation handles it).
- [ ] NULLs are handled, not silently filtered.
- [ ] Timezone / date-boundary is correct for the reporting need.
- [ ] The total reconciles against a known control number or a spot check.
- [ ] Query is read-only; no PII in the output unless authorized.
