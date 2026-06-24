---
name: bicep-vs-terraform-decision
description: Use when starting a new Azure IaC stack, or considering a migration between Bicep and Terraform — picks the right tool for the team and constraints, and rules out anti-patterns like mixing both.
---

# Bicep vs Terraform — Decision Playbook

Use this before scaffolding a new Azure IaC stack, or when someone proposes switching tools.

## Pick Bicep when

- The stack is **100% Azure** with no cross-cloud aspirations within the planning horizon.
- The team prefers **first-party Microsoft tooling** (VS Code extension, `az` CLI, AzureRM provider parity).
- You want **`what-if`** as the primary review mechanism — it is more accurate against Azure than `terraform plan` for some resource types.
- You need **deployment stacks** (resource-level deletion protection, RG/sub-scope grouping).
- Onboarding is dominated by Azure-only engineers who don't already know HCL.

## Pick Terraform when

- The stack is, or will be, **multi-cloud** (Azure + AWS, Azure + GCP, Azure + Cloudflare / Datadog / GitHub).
- The team **already runs HCL** elsewhere — consistency beats first-party-ness.
- You need **state migration tools** (`terraform state mv`, `import` blocks) for an existing resource estate.
- You need **a richer module ecosystem** (registry modules for compliance landing zones, etc.).
- You depend on providers Bicep does not cover (Datadog, Cloudflare, GitHub, Snowflake).

## Hard rules (apply to both)

- **Never mix Bicep and Terraform in the same stack.** Pick one per logical unit of deployment. Mixing produces state drift no human can reconcile.
- **Module structure mirrors resource composition.** One module per concern (network, identity, data, compute), not one mega-module per environment.
- **State backend is non-negotiable.**
  - Terraform → `azurerm` backend, blob lease lock, separate state file per environment.
  - Bicep → deployment stacks with `denySettings` for protected resources.
- **Parameters / variables never carry secrets.** Key Vault references only.
- **Environment promotion = same code, different params.** No `dev/main.bicep` vs `prod/main.bicep` divergence.

## Migration

- Migrating Bicep → Terraform: use `terraform import` (or `import` blocks in 1.5+) per resource. Plan for a freeze window — every resource needs verification.
- Migrating Terraform → Bicep: rare. Usually only worth it if multi-cloud was abandoned. Decompile via `az bicep decompile` is a starting point, not a finished translation.
- In both directions, keep the old stack read-only during migration; do not run plans against both tools.
