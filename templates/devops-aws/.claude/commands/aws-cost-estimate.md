---
description: Estimate the monthly AWS cost impact of a terraform plan.
---

Usage: `/aws-cost-estimate <stack>`

Steps:
1. `cd` to `terraform/<stack>`.
2. Run `terraform plan -out plan.tfplan` (skip if a fresh `plan.tfplan` already exists from `/aws-plan`).
3. If `infracost` is on PATH: run `infracost breakdown --path plan.tfplan --format table` and present the output.
4. If `infracost` is NOT available, fall back to a manual estimate:
   - Walk the plan for cost-relevant resources: EC2/Fargate task size, RDS instance class + allocated storage + Multi-AZ, ALB hours, NAT Gateway hours + data processing, CloudFront requests, S3 storage class, data transfer out.
   - For each, compute a rough monthly USD using public on-demand prices for the stack's region.
   - Output a markdown table: `Resource | Driver | Monthly USD (rough)`.
5. Flag any single line item **> $500/mo** as **REVIEW** with a one-line suggestion (smaller instance class, single-AZ for non-prod, VPC endpoints to avoid NAT, etc.).
6. Print the total estimated monthly delta and note explicitly that data-transfer and request-volume costs are best-effort estimates.
