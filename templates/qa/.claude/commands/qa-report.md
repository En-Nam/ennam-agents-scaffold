---
description: Summarize the latest QA run from qa/latest-results.md.
---

Usage: `/qa-report`

Steps:
1. Read `qa/latest-results.md`.
2. Compute totals by priority (P0/P1/P2) and by outcome (pass/fail/skipped).
3. List failed case ids with a one-line reason from the notes column.
4. Print the time range (first → last entry timestamp).
5. List action items: cases needing escalation, cases pending re-run after fix.
6. Do NOT modify `latest-results.md` and do NOT re-execute cases — read-only summary.
