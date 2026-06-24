---
name: gcp-org-policy-discipline
description: Use when configuring GCP org policies, security constraints, or bootstrapping a new project/folder. Enforces deny-by-default baseline constraints and documents every override.
---

# GCP org-policy discipline

Org policies are the cheapest, highest-leverage guardrail in GCP. Set them once, inherit everywhere.

## Baseline (deny by default)

Apply these at the **organization** level on day one of every GCP org. Each project inherits unless explicitly overridden.

| Constraint | Setting | Why |
|---|---|---|
| `iam.disableServiceAccountKeyCreation` | enforced | Forces workload identity; no static JSON keys. |
| `iam.disableServiceAccountKeyUpload` | enforced | Prevents importing externally generated keys. |
| `storage.uniformBucketLevelAccess` | enforced | Disables legacy ACLs; IAM is the only access path. |
| `storage.publicAccessPrevention` | enforced | Blocks accidental `allUsers` / `allAuthenticatedUsers` grants. |
| `compute.vmExternalIpAccess` | deny-all (allowlist exceptions) | No public IPs by default. |
| `compute.restrictSharedVpcSubnetworks` | restrict to approved host project | Prevents rogue Shared-VPC attachments. |
| `gcp.resourceLocations` | allowlist of approved regions (`us-central1`, `europe-west1`, ...) | Data-residency + cost control. |
| `compute.requireOsLogin` | enforced | SSH via IAM, not metadata SSH keys. |
| `sql.restrictPublicIp` | enforced | Cloud SQL gets private IP only. |

## Hierarchy — set at the highest reasonable level

```
organization  >  folder  >  project  >  resource
```

- **Org-wide guardrails** (key creation, public IPs, locations) live at the org node.
- **Per-business-unit overrides** (e.g. a partner integrations folder that needs an extra region) live at the folder.
- **Project-level overrides** are an escape hatch — never the first choice.

## Bootstrapping a new project

1. Project lands inside the right folder (inherits all org/folder policies automatically).
2. Run `gcloud org-policies list --project=<new-project>` and confirm the baseline is inherited and `enforced=true`.
3. If a baseline constraint must be overridden, see "Documenting an override" below before doing it.

## Documenting an override

Every override (e.g. allowing a public bucket for a static site, allowing a key for a legacy partner) must be recorded in the module's `README.md`:

```md
## Org-policy overrides

| Constraint | Override | Reason | Owner | TTL |
|---|---|---|---|---|
| storage.publicAccessPrevention | disabled on `bucket-marketing-assets` | Public static-site hosting for marketing.example.com | platform-team | 2026-12-31 |
```

Rules:

- **Reason** must reference a ticket or design doc — "we needed it" is not a reason.
- **Owner** is a team, not a person.
- **TTL** is a real date. The next quarterly review re-justifies or removes it.

An override without all four columns is a code-review blocker.

## Anti-patterns

- Setting baseline constraints at the project level instead of the org/folder — drift is guaranteed.
- Overriding a constraint inline in the resource module without a README entry.
- Using `inherit_from_parent = false` to silently drop an inherited policy.
- Treating `gcp.resourceLocations` as a soft preference — it is a hard data-residency control.
