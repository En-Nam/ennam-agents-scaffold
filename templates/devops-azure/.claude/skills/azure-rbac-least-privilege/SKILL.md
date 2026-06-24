---
name: azure-rbac-least-privilege
description: Use when assigning Azure RBAC roles, designing a role assignment plan, or reviewing IAM in Azure — picks the smallest scope, prefers built-in roles, and flags over-privileged assignments.
---

# Azure RBAC — Least Privilege Playbook

Use this whenever a task involves `Microsoft.Authorization/roleAssignments`, `azurerm_role_assignment`, PIM eligibility, or any change to who can do what in Azure.

## Scope rules (in order — pick the smallest that works)

1. **Resource** — e.g. a single Storage account, a single Key Vault, a single AKS cluster. Default choice.
2. **Resource group** — only when the identity legitimately needs access to multiple resources in the same RG.
3. **Subscription** — requires explicit justification in the PR description.
4. **Management group** — admin platform identities only; never workload identities.

If you're unsure which level, start at resource and widen only if a real call fails.

## Role choice

- **Built-in roles before custom.** Search `az role definition list --query "[?roleType=='BuiltInRole']"` first.
- **Data-plane roles over control-plane** when the identity only reads/writes data (e.g. `Storage Blob Data Reader`, not `Storage Account Contributor`).
- **Custom roles only when no built-in fits** — keep `actions`/`dataActions` minimal, document the diff against the closest built-in.

## Identity choice

- **One role assignment per workload identity**, not per team or environment. Teams get access through PIM and group membership, not direct assignments.
- **Managed Identity over Service Principal** whenever the resource supports it.
- **User-assigned MI** when the same identity is shared across resources; **system-assigned MI** when the identity's lifecycle matches the resource.

## Admin access

- **PIM eligibility over permanent assignments** for any role at RG scope or higher, and for any role containing `*/write` or `*/delete`.
- **Conditional access + MFA** required for eligible activation.
- **Approval workflow** for Owner / User Access Administrator activations.

## Conditions and deny assignments

- **ABAC conditions** for required tags, allowed resource types, or principal attributes — prefer over creating a custom role.
- **Deny assignments** only with written justification; they cannot be overridden by Owner and frequently cause incident-response headaches.

## Review checklist (run before approving any IAM change)

- [ ] Scope is the smallest that works.
- [ ] Role is built-in (or custom diff is documented).
- [ ] Assignment targets a workload identity, not a user.
- [ ] No `Owner` / `User Access Administrator` at subscription scope without sign-off.
- [ ] PIM eligibility used for any admin-tier role.
- [ ] Diagnostic settings on the target resource still capture `Administrative` logs.
