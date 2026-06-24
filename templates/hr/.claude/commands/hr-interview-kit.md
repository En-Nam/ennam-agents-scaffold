---
description: Design a 4-stage structured interview kit for a role, saved to interview-kits/<role>.md.
---

Usage: `/hr-interview-kit <role-title>`

Steps:
1. Load the JD from `jd/<role>.md`. If missing, ask the user to run `/hr-jd <role-title>` first.
2. Extract the competency rubric from the JD — every interview question must map back to one of these competencies.
3. Design a 4-stage loop:
   - **Recruiter screen** — 3-5 questions on motivation, logistics, baseline fit.
   - **Technical screen** — 3-5 questions or a scoped exercise on hard skills.
   - **Behavioral** — 3-5 STAR-format questions on past behavior tied to competencies.
   - **Culture-add** — 3-5 questions on values and what they would add to the team (not "fit").
4. For each question, attach a 1-4 rubric with anchor descriptions per level (1 = clear miss, 2 = below bar, 3 = at bar, 4 = strong signal).
5. Apply the @structured-interviewing checklist: calibrate before the loop, written debrief before group discussion, bias check.
6. Save to `interview-kits/<role>.md`.
7. Flag any question that doesn't cleanly map to a competency or that risks EEOC issues (Rule 12).
