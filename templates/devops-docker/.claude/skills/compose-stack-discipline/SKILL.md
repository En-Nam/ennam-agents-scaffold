---
name: compose-stack-discipline
description: Use when authoring or reviewing a docker-compose.yaml — enforces health/restart/volume/network/security defaults for this monorepo.
---

# Compose stack discipline

Goal: every compose file in this repo is safely runnable on any host without tribal knowledge.

Architecture decision: see https://github.com/compose-spec/compose-spec — Compose Spec (no `version:` key), health-gated rollouts assumed by Komodo.

## Mandatory keys per service

| Key | Required value | Why |
|---|---|---|
| `image` | `repo:semver` or `repo@sha256:...` | Renovate cannot bump `:latest`; sha256 is reproducible |
| `restart` | `unless-stopped` | `always` masks crash-loops; `no` defeats Komodo recovery |
| `healthcheck` | `test` + `interval` + `timeout` + `retries` | Komodo gates rollouts on health |
| `cap_drop` | `[ALL]` | Default deny; add back only what's needed |
| `logging.driver` | `json-file` | With `options.max-size: 10m`, `max-file: 3` to cap disk use |
| `read_only` | `true` (where feasible) | Cuts the blast radius of an RCE |

## Mandatory at the top level

- `name: <stack>` — explicit project name; never rely on directory inference.
- A named `networks:` block (`<stack>_net`) — no default bridge.
- A named `volumes:` block for every persisted path — no anonymous volumes.

## Forbidden

- `image: <anything>:latest` — Renovate cannot bump floating tags.
- `privileged: true` — breaks every isolation guarantee.
- `cap_add: [SYS_ADMIN]` (or `ALL`) unless paired with an inline justification comment.
- `network_mode: host` — forbidden for any container in this repo (full host netns join).
- Note: `network_mode: "service:<sidecar>"` (shares a sidecar's netns, not the host's) is the supported pattern for Tailscale sidecars — see @tailscale-sidecar-pattern.
- `pid: host`, `ipc: host`, `uts: host` — full namespace escape; reject unless cited from upstream docs.
- `/var/run/docker.sock` bind mount — route through `tecnativa/docker-socket-proxy` (see @docker-socket-proxy-acl).
- Host bind mounts (`./data:/data`) — use named volumes; bind mounts only with an inline justification.
- Inline secrets in `environment:` — use `env_file:` (gitignored) or `secrets:`.

## User & filesystem

- `user: "<uid>:<gid>"` — must NOT be root unless the upstream image explicitly requires it (Postgres, some Nginx variants). If root, comment why.
- `tmpfs:` for `/tmp` and `/run` when `read_only: true`.
- Pin the working directory; do not rely on image default if the app writes anywhere.

## Healthcheck shapes

| Service kind | Test |
|---|---|
| HTTP API | `["CMD", "wget", "-q", "-O-", "http://localhost:<port>/healthz"]` (if image lacks `wget`/`curl`, fall back to `["CMD", "/healthz"]` with an in-image probe binary or `["CMD", "nc", "-z", "localhost", "<port>"]`) |
| Postgres | `["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]` |
| Redis | `["CMD", "redis-cli", "ping"]` |
| Generic TCP | `["CMD", "nc", "-z", "localhost", "<port>"]` |

Set `start_period:` for slow-booting services (DBs, JVM apps) so Komodo doesn't trip the rollout.

## Anti-patterns

- Copy-pasting a `docker run` example into compose without translating `--cap-add` / `--privileged` / `-v /var/run/docker.sock`.
- Adding `restart: always` to "fix" a crash-looping container — surface the crash instead.
- Using `depends_on:` without `condition: service_healthy` (plain `depends_on` only waits for container start, not readiness).
- Bumping an image manually instead of letting Renovate open the PR.

## Review checklist

- [ ] No `:latest`, no `privileged: true`, no raw socket bind, no `network_mode: host` (except Tailscale sidecar pattern).
- [ ] Every service has `healthcheck`, `restart: unless-stopped`, `cap_drop: [ALL]`, and capped `logging`.
- [ ] Every persisted path uses a named volume listed at the top-level `volumes:`.
- [ ] `depends_on:` uses `condition: service_healthy` where order matters.
- [ ] Secrets are in `env_file:` (gitignored) or `secrets:`, never inline.
- [ ] `# renovate: datasource=docker depName=...` line precedes every `image:`.
