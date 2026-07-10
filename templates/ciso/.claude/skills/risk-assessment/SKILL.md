---
name: risk-assessment
description: Use when scoring security risks or maintaining the risk register. Covers likelihood x impact scoring with anchors, register discipline, and a named owner plus concrete mitigation for every risk.
---

# Risk assessment playbook

A risk register is only useful if every entry is scored the same way, owned by someone, and paired with a mitigation. Use this skill any time you add, score, or review a risk.

## Likelihood x impact scoring

Score each risk on two 1-5 axes and multiply for a 1-25 severity.

| Score | Likelihood | Impact |
|---|---|---|
| 1 | Rare — no known occurrence | Negligible — no material effect |
| 2 | Unlikely — plausible but not seen | Minor — contained, quick recovery |
| 3 | Possible — has happened in the sector | Moderate — degraded service or limited data |
| 4 | Likely — seen here or nearby | Major — significant outage or data exposure |
| 5 | Almost certain — recurring signal | Severe — systemic, regulatory, or existential |

Severity = likelihood x impact. Sort the register by severity, highest first.

## Ground scores in evidence

Set likelihood from incident history, SIEM signals, and known control gaps — not gut feel. Set impact from the actual blast radius of the asset. Where you must estimate, mark it `?` and say why (Rule 13). Do not launder a guess into a precise-looking number.

## Every risk has an owner

No risk is ownerless. The owner is a named role or person accountable for the mitigation — not "the security team" in the abstract. If no one will own it, that is itself a finding to surface.

## Every risk has a mitigation

Attach a concrete action: reduce (a specific control), transfer (insurance/contract), avoid (stop the activity), or accept (with named sign-off). "Monitor" or "be careful" is not a mitigation. If the mitigation implies an irreversible or production-touching change, flag it for human sign-off — this role recommends, it does not execute.

## Register discipline

- One row per risk, with a stable ID. Update in place; never duplicate.
- Re-score when evidence changes, and date the change.
- Keep the top risks visible — the register is a decision tool, not an archive.

## Review checklist (before saving the register)

- Every risk has likelihood, impact, and severity (likelihood x impact).
- Every risk has a named owner and a concrete mitigation.
- Scores trace to evidence; estimates are marked `?`.
- Register is sorted by severity, highest first.
- Any mitigation needing execution is flagged for human sign-off.
