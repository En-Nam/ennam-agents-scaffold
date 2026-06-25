---
description: Add a Tailscale sidecar to a stack so the service joins the tailnet with MagicDNS + ACL tag + Serve (auto-HTTPS), without exposing any host port.
---

Usage: `/tailscale-route <service-name>`

Steps:
1. Locate `compose/<service-name>/compose.yaml`. Fail loudly if missing.
2. Confirm the service does NOT publish `ports:` to the host (other than `127.0.0.1` loopback). If it does, prompt to remove them — Tailscale sidecar replaces host port exposure.
3. Append a sidecar service `<service-name>-tailscale` with `image: tailscale/tailscale:stable` (pinned, NOT `:latest`).
4. Set env: `TS_AUTHKEY=${TS_AUTHKEY_<SERVICE>}` (from `.env`, ephemeral reusable auth key from Tailscale admin console), `TS_HOSTNAME=<service-name>-<env>` (MagicDNS naming convention), `TS_STATE_DIR=/var/lib/tailscale`, `TS_USERSPACE=true`, `TS_EXTRA_ARGS=--advertise-tags=tag:app` (use `tag:mgmt` for admin UIs, `tag:obs` for observability).
5. Add `TS_SERVE_CONFIG=/config/serve.json`, add a volume mount `- ./serve.json:/config/serve.json:ro` on the sidecar, and create `serve.json` next to `compose.yaml` with the HTTPS → `http://<service-name>:<internal-port>` handler (Tailscale Serve handles certs automatically).
6. Add a named volume `<service-name>_ts_state` mounted at `/var/lib/tailscale` (persists node identity across restarts; without this you'll re-register on every up).
7. Set `network_mode: "service:<service-name>-tailscale"` on the main service (sidecar owns the netns), OR put both on the same compose network and reach the main service by name from `serve.json`. Pick ONE pattern and match siblings in this monorepo.
8. Add `cap_add: [NET_ADMIN, NET_RAW]` to the sidecar ONLY (never to the main service).
9. Update Tailscale ACL (`tailscale/acl.hujson` in the repo if present, else surface a TODO with the exact diff for the admin) — add tag ownership and the access rule for the target group.
10. Validate: `docker compose -f compose/<service-name>/compose.yaml config`, then `up -d`, then `docker exec <service-name>-tailscale tailscale status` and confirm the node appears with the expected tag.
11. Forbidden: do NOT enable `tailscale funnel` — that exposes to the public internet. Tailscale Serve over the tailnet only.
