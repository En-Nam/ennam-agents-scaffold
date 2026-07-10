### Data Workflow (Question → Query → Validate → Report)

Analytics work follows these phases. The model interprets and explains; it never invents a number (Rule 13), and read-only on the source data is the default (Rule 5).

#### Phase 1 — Question
Write the exact question and define the metric — "active users" means what, precisely, over what time window?

#### Phase 2 — Query
Write the read-only query that pulls the numbers. Never write to the source data.

#### Phase 3 — Validate
Check the numbers reproduce and pass a sanity test — totals tie out, nothing is double-counted, and every figure traces to the query that produced it.

#### Phase 4 — Report
Present the insight with its caveats and assumptions, so someone else could reproduce the same number.

### Definition of Done
An analysis is done when the metric is defined, the query is read-only and reproducible, the numbers reconcile, and the caveats are stated. An unreproducible or unexplained number is not done — say so plainly (Rule 12).
