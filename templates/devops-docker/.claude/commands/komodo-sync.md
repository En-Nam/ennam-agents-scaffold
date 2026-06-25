---
description: Validate a Komodo Resource Sync TOML, dry-run against the Komodo API to surface drift, and optionally apply.
---

Usage: `/komodo-sync <resource-path> [--apply]`

Steps:
1. Resolve `<resource-path>` — accept either a sync name (looked up in `komodo/resources/syncs/*.toml`) or a direct file path. Fail loudly if neither resolves.
2. Validate TOML syntax with a parser (`taplo lint` if available, else `python -c "import tomllib; tomllib.load(open(...,'rb'))"`).
3. Confirm required fields: `[[sync]] name` at the top, and `repo`, `branch`, `managed = true`, `resource_path = [...]` under `[sync.config]`. Reject if any are missing.
4. Require `KOMODO_URL` and `KOMODO_API_KEY` + `KOMODO_API_SECRET` in env; fail with a clear message if not set.
5. Call Komodo read API `GetResourceSync { sync: "<name>" }` — print current `last_sync_ts`, `pending_deploy`, and `pending_error`.
6. Trigger a pending refresh: `RunSync { sync: "<name>", dry_run: true }` via the execute API; capture the returned diff.
7. Print the diff as a table: `Resource | Action (create/update/delete) | Drift source (git / live)`.
8. Flag as **RED** any: deletions of stateful resources (stacks with named volumes), tag downgrades, or changes to resources not owned by this sync.
9. If `--apply` is NOT passed, stop here and print the exact command to apply.
10. If `--apply` is passed AND no RED flags exist, call `RunSync { sync, dry_run: false }` and poll `GetResourceSync` every 5s until `pending_deploy == 0` and `pending_error` is empty (timeout 3 min). Tail Komodo logs on timeout.
11. Never edit Komodo state outside git — if drift is detected, the fix is to commit the desired state, not to mutate live.
