---
description: Estimate monthly cost of a planned GCP stack and flag expensive line items.
---

Usage: `/gcp-billing-guard <stack>`

Steps:
1. Read `stacks/<stack>/plan.tfplan` (run `/gcp-plan <stack>` first if missing).
2. Extract billing-driving resources from the plan:
   - Compute: `google_compute_instance` (n2/c3/e2 machine types), `google_container_node_pool` (machine type * node count), `google_container_cluster` (Autopilot vs Standard).
   - Data: `google_sql_database_instance` (tier + HA), `google_redis_instance`, `google_bigtable_instance`.
   - Network: `google_compute_address` (static external IPs), `google_compute_global_forwarding_rule`, egress-heavy services.
3. For each item, look up the public per-region price (us/eu/asia) and compute `unit_price * quantity * 730 hours` (or per-GB for storage/egress).
4. Produce a markdown table: `resource`, `region`, `qty`, `est_monthly_usd`, `flag`.
5. Flag rules:
   - **REVIEW** — any single line item > **$500/mo USD**.
   - **REVIEW** — any always-on global load balancer (`google_compute_global_forwarding_rule` without scheduled teardown).
   - **REVIEW** — any Cloud SQL HA tier in a non-prod stack.
6. Print totals and the flagged rows separately. Do **not** modify the plan or apply it.
