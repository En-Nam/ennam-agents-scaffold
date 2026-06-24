---
description: Produce a reviewable plan for an Azure IaC stack (Bicep what-if or terraform plan) with risk flags.
---

Usage: `/azure-plan <stack>`

Steps:
1. Resolve `<stack>` to a directory. Detect IaC flavour: `*.bicep` → Bicep, `*.tf` → Terraform. If both, stop and surface the conflict.
2. For Bicep: run `az deployment group what-if -g <rg> -f <stack>/main.bicep -p <stack>/main.bicepparam`. For Terraform: run `terraform -chdir=<stack> plan -out plan.tfplan` then `terraform -chdir=<stack> show plan.tfplan`.
3. Parse the output and summarize as a markdown table with columns: `Resource | Action (create/modify/delete/no-op) | Risk`.
4. Flag any `Microsoft.Authorization/roleAssignments` (Bicep) or `azurerm_role_assignment` (Terraform) granting `Contributor`, `Owner`, or `User Access Administrator` at subscription or management-group scope as **RED**.
5. Flag any resource exposing a public IP, public endpoint, or `publicNetworkAccess = Enabled` as **REVIEW** and include the resource id.
6. Flag any `delete` action on stateful resources (Cosmos DB, Storage, Key Vault, SQL) as **RED**.
7. Print the table, the count by risk level, and the path to the saved plan artifact. Do NOT apply.
