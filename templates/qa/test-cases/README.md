# Test Cases

This directory holds the QA test suite. One file per case, named `<id>.md` (e.g. `LOGIN-001.md`).

## Priority levels

- **P0** — Smoke / blocker. Run every release. Failure blocks release.
- **P1** — High-value flows. Run weekly. Failure raises a Jira blocker.
- **P2** — Edge cases. Run on demand.

Copy `TEMPLATE.md` to start a new case.
