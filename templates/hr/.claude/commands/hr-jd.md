---
description: Draft a competency-based job description for a role, saved to jd/<role>.md.
---

Usage: `/hr-jd <role-title>`

Steps:
1. If level, team, or scope are missing from the request, ask the user before drafting.
2. Read any existing files in `jd/` to match tone and section order.
3. Draft the JD with sections: Summary, Responsibilities, Required (must-have), Preferred (nice-to-have), Benefits (use `[BENEFITS PLACEHOLDER]` if not supplied), Compensation (`[BAND PLACEHOLDER]` unless the user provided a range).
4. List 4-6 competencies the role must demonstrate, each with a one-line definition.
5. Run the @jd-authoring checklist: gender-neutral language, must-have discipline, no EEOC-prohibited criteria.
6. Save to `jd/<role>.md` with a `DRAFT` marker at the top until human sign-off.
7. Surface anything legally risky or any guess you had to make (Rule 12).
