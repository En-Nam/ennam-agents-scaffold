---
description: Run terraform plan for a GCP stack and summarize risk in a markdown table.
---

Usage: `/gcp-plan <stack>`

Steps:
1. `terraform -chdir=stacks/<stack> init -input=false`.
2. `terraform -chdir=stacks/<stack> fmt -check` — fail loud if formatting drifts.
3. `terraform -chdir=stacks/<stack> validate`.
4. `terraform -chdir=stacks/<stack> plan -out plan.tfplan`, then `terraform -chdir=stacks/<stack> show -no-color plan.tfplan > plan.txt`.
5. Parse `plan.txt` and produce a markdown table with columns: `resource`, `action` (create/update/replace/destroy), `risk`, `notes`.
6. Risk flags (apply per row):
   - **RED** — any binding of `roles/owner` or `roles/editor`.
   - **RED** — any override of an org-policy constraint (e.g. `constraints/iam.disableServiceAccountKeyCreation` set to allow).
   - **REVIEW** — any public bucket (`uniformBucketLevelAccess=false` or `allUsers`/`allAuthenticatedUsers` member), public IP, or public forwarding rule.
   - **REVIEW** — any resource being `destroyed` or `replaced` in a non-dev stack.
7. Print the table and the totals (creates / updates / replaces / destroys). Do **not** run `terraform apply`.
