---
description: Define a KPI sheet for an area — metric, source, target, and cadence — saved to kpi/<area>.md.
---

Usage: `/coo-kpi <area>`

Steps:
1. If the area's goal, the current baseline, or the system of record are missing, ask the user before drafting.
2. Read any existing sheets in `kpi/` to keep definitions consistent and avoid duplicating a metric.
3. For each KPI capture: **metric** (a precise definition of what is counted), **source** (the named dashboard or system it is pulled from), **target** (with its baseline), and **cadence** (how often it is reviewed).
4. Prefer outcome metrics (throughput, cycle time, error rate, cost per unit) over vanity metrics (raw activity counts, hours logged).
5. Mark any missing baseline, target, or source as `[SOURCE TBD]` and surface it — never invent a number (Rule 13).
6. Name the owner accountable for each metric and its review cadence.
7. Save to `kpi/<area>.md`. Flag any KPI that isn't objectively measurable or that lacks a source (Rule 12).
