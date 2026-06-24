---
name: gcp-iam-least-privilege
description: Use when drafting or reviewing GCP IAM bindings, custom roles, service accounts, or workload identity federation. Enforces least-privilege scoping and predefined roles over `roles/owner` or `roles/editor`.
---

# GCP IAM — least privilege

Apply this playbook to every IAM change.

## Role choice

1. **Predefined roles first.** Search the [predefined role catalog](https://cloud.google.com/iam/docs/understanding-roles) for the narrowest fit before reaching for a custom role.
2. **Custom roles only when predefined is too broad.** Stay below the 3000-permission cap. Pin the role to a stage (`GA`, `BETA`, `DISABLED`) and version it.
3. **Never bind `roles/owner` or `roles/editor`** in a module. They are blast-radius primitives reserved for break-glass humans, not services.

## Scope

Bind at the **smallest scope that works**:

```
resource  >  project  >  folder  >  organization
```

- Prefer resource-level bindings (e.g. `google_storage_bucket_iam_member`) over project-level.
- Promote to project scope only when the workload genuinely needs it across many resources.
- Folder/org bindings are for platform-team policy, never workload IAM.

## Identity hygiene

- **One service account per workload.** Do not bind workloads to a shared "app" SA. Audit logs and rotation get impossible otherwise.
- **Workload Identity Federation > SA keys.** Federate from GitHub Actions, GKE workloads, and Cloud Run revisions. Never mint static JSON keys for these.
- **Groups for humans, SAs for machines.** Do not put service accounts in Google Groups.

## Conditional bindings

Use IAM Conditions to narrow blast radius further:

- `request.time` — limit access to a maintenance window.
- `resource.name.startsWith('projects/_/buckets/data-')` — limit to a name prefix.
- `resource.type` — pin to a single resource type within a project.

Conditions need uniform bucket-level access on GCS and are not supported on every resource — check the [supported list](https://cloud.google.com/iam/docs/conditions-overview#resources) before relying on them.

## Deny rules

[IAM deny policies](https://cloud.google.com/iam/docs/deny-overview) override allow bindings. Use them sparingly — only for hard guardrails (e.g. "no one outside SRE can delete projects"). Document the reason in the module README. A deny rule with no documented justification is a code-review blocker.

## Review checklist before merging

- [ ] No `roles/owner` or `roles/editor` in the diff.
- [ ] Bindings are at the smallest scope that works.
- [ ] One SA per workload; no key creation.
- [ ] Conditions added where the resource supports them.
- [ ] Deny rules (if any) have a written justification.
