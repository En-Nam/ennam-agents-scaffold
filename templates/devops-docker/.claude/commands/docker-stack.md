---
description: Scaffold a new docker compose stack in the GitOps monorepo with the project's hardening defaults (healthcheck, named volume/network, restart policy, Renovate + Komodo labels).
---

Usage: `/docker-stack <name>`

Steps:
1. Fail loudly if `compose/<name>/` already exists.
2. Create `compose/<name>/compose.yaml` with: top-level `name: <name>`; one service `<name>`; `image:` placeholder with a `# renovate: datasource=docker depName=<repo>` line above it (NO `:latest`); `restart: unless-stopped`; `healthcheck:` block with `test`, `interval: 30s`, `timeout: 5s`, `retries: 3`; `cap_drop: [ALL]`; `read_only: true` where feasible; `logging.driver: json-file` with `max-size: 10m`, `max-file: 3`.
3. Define a named volume `<name>_data` and a named network `<name>_net` at the top level — no anonymous volumes, no host bind mounts.
4. Add labels: `komodo.managed=true`, `komodo.stack=<name>`, `owner=<team>`.
5. Create `compose/<name>/.env.example` listing every required env var with a comment but NO values.
6. Add `compose/<name>/.env` to `.gitignore` if not already covered.
7. Create `komodo/resources/stacks/<name>.toml` with `[[stack]] name = "<name>"`, `file_paths = ["compose/<name>/compose.yaml"]`, `poll_for_updates = false` (Renovate-driven, not poll-driven), and `tags = ["<env>"]`.
8. Run `docker compose -f compose/<name>/compose.yaml config` — abort and surface errors if it fails.
9. Verify `git status --porcelain` is empty; if not, abort with the dirty paths and ask the user to stash or commit first. Then `git checkout -b feat/stack-<name>`, stage only `compose/<name>/` and `komodo/resources/stacks/<name>.toml`, commit with `feat(stack): scaffold <name>`.
10. Print: the stack path, the Komodo sync that will pick it up, and the next command (`/docker-up <name>` for local validation OR open a PR).
