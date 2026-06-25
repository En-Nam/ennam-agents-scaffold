---
name: docker-socket-proxy-acl
description: Use when configuring Tecnativa docker-socket-proxy, hardening Docker socket access, or auditing what API surface a UI/agent (Komodo, Dozzle, cAdvisor) can reach.
---

# Docker socket proxy ACL

Goal: never expose `/var/run/docker.sock` directly to a container. Front it with `tecnativa/docker-socket-proxy`, with the smallest env allowlist that lets the consumer do its job.

Architecture decision: see https://github.com/Tecnativa/docker-socket-proxy — deny-by-default proxy in front of the Docker Engine API.

## Allowlist envs (default 0 = denied, set 1 to allow)

| Env | Grants | Risk if enabled |
|---|---|---|
| `CONTAINERS` | List/inspect containers | Low (read) |
| `IMAGES` | List/inspect images | Low (read) |
| `VOLUMES` | List/inspect volumes | Low (read) |
| `NETWORKS` | List/inspect networks | Low (read) |
| `EVENTS` | Stream Docker events | Low (read) |
| `SERVICES` / `TASKS` / `NODES` | Swarm read | Low (read) |
| `INFO` / `PING` / `VERSION` | Engine metadata | Low (read) |
| `POST` | **All POST endpoints** (create/start/stop) | **HIGH — equivalent to root** |
| `EXEC` | `docker exec` into containers | **HIGH** |
| `BUILD` / `COMMIT` | Build/commit images | HIGH |
| `AUTH` | Read registry creds | HIGH |
| `SECRETS` / `CONFIGS` | Read Swarm secrets/configs | HIGH |
| `SYSTEM` | `system prune`, etc. | HIGH |

## Configs by role

### Read-only viewer (Dozzle, cAdvisor)
```yaml
environment:
  CONTAINERS: 1
  IMAGES: 1
  VOLUMES: 1
  NETWORKS: 1
  EVENTS: 1
  INFO: 1
  PING: 1
  VERSION: 1
  # POST stays 0 — viewers must not start/stop anything
```

### Lifecycle-only operator (UI that restarts containers but cannot exec/build)
```yaml
environment:
  CONTAINERS: 1
  IMAGES: 1
  NETWORKS: 1
  VOLUMES: 1
  EVENTS: 1
  POST: 1     # start / stop / restart
  # EXEC, BUILD, AUTH, SECRETS, SYSTEM stay 0
```

### Komodo Periphery agent (full lifecycle)
```yaml
environment:
  CONTAINERS: 1
  IMAGES: 1
  NETWORKS: 1
  VOLUMES: 1
  EVENTS: 1
  INFO: 1
  POST: 1
  BUILD: 1   # only if this Periphery builds images locally
  EXEC: 1    # required for Komodo's container-exec features
  # AUTH, SECRETS, SYSTEM stay 0 unless a specific Komodo feature needs them
```

The proxy itself binds the real socket and must run with `read_only: true` filesystem, `cap_drop: [ALL]`, and `restart: unless-stopped`. Expose port `2375` only on the internal compose network — never on a host interface.

## Anti-patterns

- Bind-mounting `/var/run/docker.sock` directly into Dozzle, Komodo, or any UI "for convenience".
- Setting `POST=1` on a read-only viewer because "it might need it later".
- Running the proxy itself as `privileged: true` — the proxy needs no caps beyond default.
- Exposing the proxy on `0.0.0.0:2375` instead of the internal compose network.
- Using one shared proxy for all consumers — each role gets its own proxy instance with its own ACL.

## Review checklist

- [ ] No `/var/run/docker.sock` bind mount on any consumer (only on the proxy).
- [ ] `POST`, `EXEC`, `BUILD`, `AUTH`, `SECRETS`, `SYSTEM` are each justified per consumer.
- [ ] Proxy port `2375` is only reachable via the internal compose network.
- [ ] One proxy instance per consumer role (viewer vs operator vs Komodo).
- [ ] Proxy runs `read_only: true` + `cap_drop: [ALL]`.
