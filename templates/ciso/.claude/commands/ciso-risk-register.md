---
description: Build or update the security risk register with scored, owned, mitigated risks, saved to risk/register.md.
---

Usage: `/ciso-risk-register`

Steps:
1. Read the existing `risk/register.md` if present — update entries in place rather than duplicating them.
2. For each risk, capture: an ID, a one-line description, likelihood (1-5), impact (1-5), and the resulting score (likelihood x impact).
3. Assign every risk a named owner — a role or person accountable for it. No risk is ownerless.
4. Attach a concrete mitigation (or accept/transfer decision) to every risk. "Monitor" alone is not a mitigation.
5. Base likelihood and impact on evidence (incident history, SIEM signals, control gaps) where available; mark assumptions with `?`.
6. Sort the register by score, highest first, so the top risks are visible at a glance.
7. Apply the @risk-assessment discipline before saving.
8. Save to `risk/register.md`. Flag any risk whose mitigation implies an irreversible or production-touching action — those need human sign-off to execute (Rule 12).
