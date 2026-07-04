---
description: Define a metric so anyone can reproduce it — name, grain, source, filters, as-of date.
---

Usage: `/data-metric <metric>`

Steps:
1. Check `analytics/metrics/` for an existing definition of `<metric>` — do not create a second, conflicting definition (Rule 7 — surface the conflict, don't fork).
2. Define the metric with the required fields (@.claude/skills/metric-definitions/SKILL.md):
   - **Name** — canonical, unambiguous.
   - **Question** — the business question it answers, in one sentence.
   - **Grain** — one row per what.
   - **Source** — tables / models it reads.
   - **Filters** — inclusion/exclusion rules (e.g. exclude internal accounts, test orders).
   - **Calculation** — the exact aggregation, as reviewed SQL.
   - **As-of / refresh** — the time semantics (event time vs processing time; refresh cadence).
3. Include a worked example: run the SQL and paste the current value with the run date (from output, not memory — Rule 13).
4. State known caveats (late-arriving data, timezone, dedup rules).
5. Present the definition and ASK for sign-off. On sign-off, save to `analytics/metrics/<slug>.md` and append to `analytics/metrics/INDEX.md`.
