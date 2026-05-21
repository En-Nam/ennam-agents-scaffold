---
description: Execute a single test case from test-cases/ by id.
---

Usage: `/qa-run <case-id>`

Steps:
1. Read `test-cases/<case-id>.md`.
2. Validate preconditions (warn if not met).
3. Execute each step. For browser-based steps, use Chrome DevTools MCP.
4. Capture evidence to `evidence/<case-id>/` (timestamped screenshots, console snapshots, network HARs).
5. Record outcome in `qa/latest-results.md` (append row: id, status, evidence path, notes).
6. On fail: `/escalate` to the responsible dev agent.
