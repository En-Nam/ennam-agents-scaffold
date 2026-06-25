---
name: tailscale-sidecar-pattern
description: Use when adding a service to the Tailscale mesh as a sidecar, configuring MagicDNS hostnames, or setting Tailscale ACL tags — Pattern B (one sidecar per exposed service).
---

# Tailscale sidecar pattern (Pattern B)

Goal: every exposed service joins the tailnet via its own `tailscale/tailscale` sidecar. No host ports, no public internet, no Funnel.

Architecture decision: see https://tailscale.com/kb/1282/docker — Pattern B (sidecar per service) + Tailscale Serve for auto-HTTPS.

## Sidecar shape

```yaml
<svc>-tailscale:
  image: tailscale/tailscale:stable   # pinned, NOT :latest
  environment:
    TS_AUTHKEY: ${TS_AUTHKEY_<SVC>}   # ephemeral reusable, from admin console
    TS_HOSTNAME: <svc>-<env>          # MagicDNS registers this name (compose `hostname:` does NOT)
    TS_STATE_DIR: /var/lib/tailscale
    TS_USERSPACE: "true"              # userspace-networking; no /dev/net/tun
    TS_EXTRA_ARGS: --advertise-tags=tag:app
    TS_SERVE_CONFIG: /config/serve.json
  volumes:
    - <svc>_ts_state:/var/lib/tailscale   # PERSIST node identity
    - ./serve.json:/config/serve.json:ro
  cap_add: [NET_ADMIN, NET_RAW]       # ONLY on the sidecar
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "tailscale", "status", "--self=true"]
    interval: 30s
```

The main service either uses `network_mode: "service:<svc>-tailscale"` (sidecar owns the network namespace) OR shares a compose network and is reached by service name from `serve.json`. Pick one pattern per monorepo and stay consistent.

## MagicDNS naming convention

- `<service>-<env>` — e.g. `grafana-prod`, `komodo-prod`, `gitea-dev`.
- Tailnet domain is auto-appended by MagicDNS — never hardcode the tailnet name in compose.
- Hostnames are lowercase, dash-separated, ≤63 chars.

## ACL tag scheme

| Tag | Used for | Example ACL rule |
|---|---|---|
| `tag:mgmt` | Komodo, Portainer-style admin UIs | Only `group:admins` can reach |
| `tag:app` | User-facing apps (internal) | `group:staff` can reach |
| `tag:obs` | Grafana, Dozzle, Uptime Kuma, Prometheus | `group:oncall` + `group:admins` |
| `tag:infra` | docker-socket-proxy, Periphery agents | No human access; only `tag:mgmt` |

Tag owners + access rules in `tailscale/acl.hujson` — `tagOwners` only controls who can apply a tag; reachability MUST be enforced in `acls`:
```hujson
"tagOwners": {
  "tag:mgmt":  ["group:admins"],
  "tag:app":   ["group:admins"],
  "tag:obs":   ["group:admins"],
  "tag:infra": ["group:admins"],
},
"acls": [
  { "action": "accept", "src": ["group:admins"],                  "dst": ["tag:mgmt:*"] },
  { "action": "accept", "src": ["group:staff"],                   "dst": ["tag:app:*"] },
  { "action": "accept", "src": ["group:oncall", "group:admins"],  "dst": ["tag:obs:*"] },
  { "action": "accept", "src": ["tag:mgmt"],                      "dst": ["tag:infra:*"] },
  // tag:infra has no human src — only tag:mgmt can reach it.
]
```

## Tailscale Serve (auto-HTTPS)

`serve.json` example for an HTTP service on port 3000:
```json
{
  "TCP":  { "443": { "HTTPS": true } },
  "Web":  { "${TS_CERT_DOMAIN}:443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:3000" } } } }
}
```

Serve provisions a LetsEncrypt cert for the MagicDNS name automatically. No certbot, no Caddy/Traefik needed for tailnet-only traffic.

## Anti-patterns

- Using Tailscale **Funnel** for admin/management UIs — Funnel exposes to the public internet. This profile is tailnet-only.
- Omitting the `<svc>_ts_state` volume → sidecar re-registers a new node on every restart, polluting the admin console.
- Putting `cap_add: [NET_ADMIN]` on the main service instead of (or in addition to) the sidecar.
- Reusing one auth key across all sidecars without `--ephemeral` — leaked key = full tailnet join.
- Hardcoding `:latest` for `tailscale/tailscale` — Renovate cannot bump and you ship undeclared kernel/userspace deltas.

## Review checklist

- [ ] One sidecar per exposed service (no shared sidecars).
- [ ] `TS_USERSPACE=true`; no `/dev/net/tun` mount unless explicitly justified.
- [ ] `TS_AUTHKEY` sourced from env (not literal), ephemeral, reusable, tagged.
- [ ] Persistent volume for `/var/lib/tailscale`.
- [ ] ACL tag is set in `TS_EXTRA_ARGS` AND owned in `acl.hujson`.
- [ ] No `tailscale funnel` anywhere; only `tailscale serve`.
- [ ] No host `ports:` published on the main service.
