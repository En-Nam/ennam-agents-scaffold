---
name: terraform-state-discipline
description: Use when working with Terraform state, configuring a backend, importing resources, or planning a state migration (mv/rm/import) — enforces remote-state, locking, and safe-surgery rules.
---

# Terraform state discipline

State is the source of truth. Treat it like a production database.

## Backend rules

- **Remote state with locking, always.** S3 backend + DynamoDB lock table. No local `terraform.tfstate` in the repo or on a developer laptop.
- **One state file per environment per stack.** Path convention: `s3://<bucket>/<project>/<env>/<stack>.tfstate`.
- Backend bucket has versioning ON, server-side encryption ON, and `BlockPublicAccess` ON.
- Workspaces are **only** for cheap per-PR previews (ephemeral). Never use workspaces to separate `dev` / `staging` / `prod` — use separate backends/keys.

## Never edit state by hand

- No `terraform state pull | jq ... | terraform state push`. Ever.
- Use `terraform state mv` to rename or move resources between modules.
- Use `terraform state rm` only to drop a resource Terraform should stop managing (it does NOT delete the AWS resource).
- Use `terraform import` to adopt an existing AWS resource — never recreate-and-replace as a shortcut for adoption.

## Before any state surgery

1. **Backup the state file first.** `terraform state pull > backup-<timestamp>.tfstate` and copy it somewhere safe outside the repo.
2. Confirm no other run is in flight (the DynamoDB lock should be free).
3. Write down the planned `state mv` / `state rm` / `import` commands in a checkpoint file.
4. Run a `terraform plan` afterwards — the expected diff is **no changes**. If the plan is non-empty, stop and investigate.

## Drift and adoption

- If AWS console click-ops created a resource, import it; do not codify a duplicate and then delete the original.
- Treat any unexpected `plan` diff as drift to investigate, not noise to suppress.

## Review checklist

- [ ] Backend block present, S3 + DynamoDB lock.
- [ ] No `terraform.tfstate*` files staged for commit.
- [ ] State backup taken before mv/rm/import.
- [ ] Post-surgery `plan` is empty.
- [ ] Workspaces (if used) are clearly labeled as PR-preview only.
