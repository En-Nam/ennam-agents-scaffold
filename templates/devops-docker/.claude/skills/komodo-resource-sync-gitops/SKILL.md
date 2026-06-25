---
name: komodo-resource-sync-gitops
description: Use when defining or editing Komodo Resource Sync TOML, structuring the GitOps monorepo, or wiring Renovate to bump image versions that Komodo will reconcile.
---

# Komodo Resource Sync (GitOps)

Goal: git is the only source of truth. Komodo reconciles `main`; nothing is created or mutated via the Komodo UI.

Architecture decision: see https://komo.do/docs/sync-resources — Resource Sync watches a repo, diffs against live state, applies on demand or on schedule.

## Monorepo layout

```
.
├── compose/
│   └── <stack>/
│       ├── compose.yaml          # Compose Spec, no version: key
│       └── .env.example          # documented env vars, no values
├── komodo/
│   └── resources/
│       ├── stacks/<stack>.toml   # [[stack]] resource per app
│       ├── builders/*.toml       # [[builder]] for self-built images (optional)
│       ├── repos/*.toml          # [[repo]] for git mirrors Komodo clones
│       └── syncs/<sync>.toml     # [[sync]] resources that aggregate the above
├── tailscale/
│   └── acl.hujson                # tailnet ACL, reviewed in PRs
└── .github/
    └── renovate.json             # datasource=docker bumps
```

## `[[sync]]` TOML — minimum viable

```toml
[[sync]]
name = "prod-stacks"
[sync.config]
repo            = "<owner>/<repo>"
branch          = "main"
managed         = true
resource_path   = ["komodo/resources/stacks", "komodo/resources/builders"]
match_tags      = ["prod"]
```

- `managed = true` — Komodo will DELETE resources removed from git on next sync. Use intentionally.
- `match_tags` scopes which resources this sync owns (so dev/prod can live in one repo).

## `[[stack]]` TOML — minimum viable

```toml
[[stack]]
name = "grafana"
tags = ["prod", "obs"]
[stack.config]
server          = "host-A"                         # Periphery target
file_paths      = ["compose/grafana/compose.yaml"]
poll_for_updates = false                           # Renovate-driven, not poll-driven
auto_update     = false                            # never auto-pull; PR merges drive updates
```

## Sync mode

| Mode | When |
|---|---|
| **Manual** (`/komodo-sync <name> --apply`) | Risky/cross-cutting changes; review the diff first |
| **Scheduled** (Komodo cron) | Steady-state reconcile; catches manual UI drift |
| **Webhook on push** | Reacts to merged Renovate PRs within seconds |

Pick scheduled + webhook for prod; manual only for sync-of-syncs.

## Renovate ↔ Komodo handshake

1. Compose file has `# renovate: datasource=docker depName=grafana/grafana` above `image: grafana/grafana:11.2.0`.
2. Renovate opens PR bumping `11.2.0 → 11.2.1`.
3. Reviewer merges PR → GitHub webhook → Komodo `RunSync`.
4. Komodo diffs: same `[[stack]]` resource, new file content → triggers deploy on the targeted Periphery host.
5. Periphery pulls the new image, recreates with health-gated rollout.

## Conflict resolution

- **UI drift vs git** — git wins. Run `/komodo-sync <name> --apply` to overwrite the live edit; surface a postmortem on why the UI was touched.
- **Two PRs bumping the same image** — Renovate's branch strategy handles this; if you see both, rebase the second.
- **Sync deletes a resource you wanted to keep** — that resource was in git and got removed. Restore in git, don't recreate in the UI.

## Anti-patterns

- Creating stacks via the Komodo UI "to try them out" — they vanish on next sync if `managed = true`.
- Setting `auto_update = true` to "save a step" — bypasses PR review; defeats the Renovate flow.
- One mega `[[sync]]` over the whole repo — use `match_tags` to scope; smaller blast radius.
- Editing live compose on a Periphery host via SSH — Komodo will revert on next sync and you'll be confused.

## Review checklist

- [ ] Every `[[stack]]` lives under `komodo/resources/stacks/` and points to a real `compose/<stack>/compose.yaml`.
- [ ] `managed = true` is intentional and tags are scoped (`prod` vs `dev`).
- [ ] `auto_update = false` and `poll_for_updates = false` — image bumps come from Renovate, not from Komodo polling.
- [ ] Every `image:` has a `# renovate: datasource=docker depName=...` line above it.
- [ ] Komodo webhook is wired to the repo so merges reconcile within seconds.
