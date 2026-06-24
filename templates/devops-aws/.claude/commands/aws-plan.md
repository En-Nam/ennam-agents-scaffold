---
description: Run terraform plan for a stack, summarize the diff, and flag risky changes.
---

Usage: `/aws-plan <stack>`

Steps:
1. `cd` to `terraform/<stack>` (fail loudly if the directory does not exist).
2. Run `terraform init -upgrade` to refresh providers and modules.
3. Run `terraform fmt -check -recursive` — if formatting drift exists, surface the files and stop.
4. Run `terraform validate` — stop on any error.
5. Run `terraform plan -out plan.tfplan` and capture the human-readable plan.
6. Summarize the plan as a markdown table with columns: `Resource | Action (create/update/replace/destroy) | Risk (LOW/MED/HIGH)`.
7. Flag any of the following as **RED** with a one-line reason:
   - IAM statements with `Action: "*"` or `Action: "iam:*"`.
   - S3 buckets with public ACLs, public policy, or `block_public_*` set to `false`.
   - Security group rules with `cidr_blocks = ["0.0.0.0/0"]` (call out the port).
   - Replace actions on stateful resources (RDS, EBS, S3 with content).
8. Print the location of `plan.tfplan` and ask the user to confirm before any later `terraform apply`. Do NOT apply in this command.
