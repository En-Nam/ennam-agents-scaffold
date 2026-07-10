# Checkpoint: hr-workflow-designer — 2026-07-10

## What was done
- Designed the position-specific HR / People Ops workflow (this round EXTENDS v1.12 plan #22-#30;
  hr profile already SHIPS doc-first + autoPolicy but routes to GENERIC doc-first-signoff today —
  this gives it a REAL people-lifecycle flow).
- Returned a ROLEWF schema object (6-phase `people-lifecycle` preset) via StructuredOutput.

## Design summary
- Preset: `people-lifecycle` — "People Lifecycle (Hire -> Review -> Offboard)".
- One spine across ALL HR events (hiring/onboarding/reviews/policy/exit), not just hiring:
  1. Frame people action & name decision owner (Rule-5 human-decision, decision-rights)
  2. Gather people data need-to-know (PII minimize/POLICY + Rule-13 for comp/headcount/score figures)
  3. Draft against role checklist (Rule-5 drafts-not-decides; comp stays [BAND PLACEHOLDER]; Rule-9 no orphan Qs)
  4. Fairness & compliance check (PII + bias/EEOC + Rule-9) = HR's doc-first Verify — NEVER skipped
  5. Human decision & written record (Rule-5 KEYSTONE; debrief-before-group anti-anchoring; Rule-7 dissent; audit)
  6. Sign-off, controlled release & retention (POLICY approval gate + audit + PII retention/residency)
- ATTACH to EXISTING hr profile (already ships doc-first + autoPolicy). NO new profile (mirrors CEO
  attach, unlike CFO which needed a new profile). autoPolicy stays TRUE (heavy PII). All 5 baked
  guardrails apply.
- Keystone = the fairness/compliance check (phase 4, HR's distinctive never-skipped Verify) + Rule-5
  human-decision (phase 5, when a live hire/rating/exit call exists).

## Merge analysis (Rule 2)
- Recruiting/Talent Acquisition + People Ops generalist + cut cpo/chro all share this
  frame->gather->draft->fairness->decide->release spine -> `people-lifecycle` is the home for the
  whole HR/People family (anti-proliferation win).
- Must NOT collapse into generic doc-first-signoff (drops fairness/EEOC + PII-retention keystone),
  nor into exec-decision (options-first judgment) / finance-plan-review (numbers-first modeling).

## Files changed
- None (design deliverable only). Serena: this checkpoint.
- Proposed (not created — EMIT-CONFIG, for implementers): templates/_shared/workflow/people-lifecycle.md
  + `recommendedWorkflow: 'people-lifecycle'` on the existing hr ProfileDef (autoPolicy already true).

## Next steps
- Team synthesis: reconcile people-lifecycle with a future Recruiter role under the HR/People family.
- Implementers: author the phase-list md + wire hr.recommendedWorkflow (depends on #23 workflow-slot).

## Blockers / Risks
- Depends on #23 {{{workflowSection}}} slot + ProfileDef.recommendedWorkflow landing.
- Comp bands / headcount / aggregated review scores are a Rule-13 surface (phases 2 & 5) — same
  altered-number test-mock discipline the CFO preset flagged applies.
