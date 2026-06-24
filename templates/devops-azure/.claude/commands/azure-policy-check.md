---
description: Simulate planned IaC changes against Azure Policy assignments at the target scope.
---

Usage: `/azure-policy-check <stack>`

Steps:
1. Resolve `<stack>` to a directory and read the target subscription / resource group from its parameters or backend config.
2. List policy assignments in scope: `az policy assignment list --scope <scope> -o json`. Capture assignment name, policy definition id, and effect.
3. Capture current compliance: `az policy state list --resource-group <rg> -o json` (or `--subscription` if stack scope is sub-level). Note any existing non-compliant resources.
4. Validate the planned deployment against policy: for Bicep `az deployment group validate -g <rg> -f <stack>/main.bicep -p <stack>/main.bicepparam`; for Terraform run `terraform plan` then validate the rendered ARM via `az deployment group what-if --no-pretty-print`.
5. Cross-reference each planned resource with assigned policies. Predict any `deny`, `denyAction`, or `auditIfNotExists` hit and the assignment that would trigger it.
6. Output a pass/fail markdown table: `Resource | Policy | Effect | Predicted Outcome (pass/fail) | Remediation`.
7. Exit non-zero (surface loudly per Rule 12) if any predicted `deny` or `denyAction` would block the deployment.
