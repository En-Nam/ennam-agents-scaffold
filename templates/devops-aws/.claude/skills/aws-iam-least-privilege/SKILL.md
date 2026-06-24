---
name: aws-iam-least-privilege
description: Use when drafting or reviewing an AWS IAM role, policy document, or trust relationship — enforces least-privilege, ABAC, and cross-account safety rules.
---

# AWS IAM least privilege

Apply these rules to every role, policy, and trust statement you author or review.

## Default posture

- **Deny by default.** Start from an empty policy and add only the actions the workload demonstrably needs.
- **One role per workload, not per team.** A team owns many roles; a role serves exactly one service or job.
- **No inline policies on shared identities.** Inline policies hide drift. Use customer-managed policies and version them in Terraform.

## Actions

- `Action` wildcards are limited to `Service:*` only when the workload genuinely needs the full service surface (e.g. `s3:*` on a workload-owned bucket). Never `*`.
- Prefer the smallest verb set: `s3:GetObject`, `s3:PutObject` over `s3:*`.
- Group statements by `Effect` + `Action` family; do not interleave unrelated actions.

## Resources

- `Resource` wildcards are always justified by an inline comment above the statement explaining why a narrower ARN pattern is not possible.
- Pin to ARNs with account id and region where the service supports it. Use `data "aws_caller_identity"` / `data "aws_region"`, never a hardcoded `123456789012`.

## Conditions

- Add `Condition` keys whenever the service supports them:
  - `aws:SourceVpc` / `aws:SourceVpce` for VPC-only access.
  - `aws:SourceArn` + `aws:SourceAccount` on any cross-service trust (S3 -> Lambda, EventBridge -> *, SNS -> SQS).
  - `aws:MultiFactorAuthPresent` on human-assumable roles.
- Use tag-based **ABAC** (`aws:ResourceTag/Env`, `aws:PrincipalTag/Team`) instead of maintaining static ARN lists.

## Cross-account

- Cross-account trust requires an **explicit** principal account id AND an `ExternalId` condition. No wildcard principals.
- Document the calling account and the externalId source (Secrets Manager, vendor portal) in a comment next to the trust block.

## Review checklist

- [ ] No `Action = "*"` anywhere.
- [ ] No `Resource = "*"` without a justification comment.
- [ ] No hardcoded account ids.
- [ ] Conditions present on cross-service and human trust.
- [ ] Customer-managed policy, not inline (for shared identities).
- [ ] Tags applied so ABAC keys can be used downstream.
