---
description: Scope a data question (grain + window), write reviewed read-only SQL, and validate the result before reporting.
---

Usage: `/data-query <question>`

Steps:
1. Restate `<question>` precisely: the metric, the **grain** (per user? per day? per order?), and the **time window**. If any is ambiguous, ASK before writing SQL — a wrong grain silently produces a wrong answer.
2. Read `analytics/` for existing models and metric definitions. Reuse a defined metric rather than re-deriving one.
3. Write **read-only** SQL (SELECT only) in the project's warehouse dialect. No DDL/DML in an analysis query.
4. Review the SQL with @.claude/skills/sql-review/SKILL.md (joins fan-out, null handling, timezone, filters before aggregation).
5. Run it, then validate: row count sane? null rate expected? outliers explained? Reconcile against a control total or a spot check and state how.
6. Report the figures **from the query output** (not recalled — Rule 13). Label observational findings as correlational.
7. If the question introduced a reusable metric, run `/data-metric` to define it. Save the analysis under `analytics/queries/<slug>.md` with the SQL and the validation note.
