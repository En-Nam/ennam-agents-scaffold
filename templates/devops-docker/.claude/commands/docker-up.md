---
description: Validate and bring a compose stack (or all stacks) up locally, tail healthchecks until green, and report reachable endpoints.
---

Usage: `/docker-up [stack-name|all]`

Steps:
1. Resolve target: if arg is `all`, list every `compose/*/compose.yaml`; else use `compose/<stack-name>/compose.yaml`. Fail loudly if missing.
2. For each target, run `docker compose -f <file> config -q` — abort on any validation error.
3. Grep each compose file for `:latest` and `privileged:\s*true` — abort with the offending line if either is found.
4. Grep for `/var/run/docker.sock` bind mounts — if present and the target is NOT `socket-proxy` itself, abort and recommend routing via `tecnativa/docker-socket-proxy`.
5. Scan the compose file for `${...}` interpolations (e.g. `${TS_AUTHKEY_<SVC>}`); verify each referenced var is set in the environment or `.env`. Surface the missing names and abort before pulling.
6. `docker compose -f <file> pull` to fetch pinned images (no surprise rebuilds).
7. `docker compose -f <file> up -d --remove-orphans`.
8. Poll `docker compose -f <file> ps --format json` every 5s for up to 3 minutes; consider stack ready when every service reports `Health: healthy` (or `running` if no healthcheck — warn the user).
9. On timeout, dump `docker compose -f <file> logs --tail=100` for any non-healthy service and exit non-zero.
10. Print endpoints: for each service, print exposed `ports:` AND any Tailscale MagicDNS name parsed from the `tailscale` sidecar's `TS_HOSTNAME` env var.
11. Remind the user: local `up` is for validation only — production rollout happens via Komodo sync on PR merge.
