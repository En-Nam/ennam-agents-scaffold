# Checkpoint: cfo-workflow-designer — 2026-07-10

## What was done
- Designed the position-specific CFO workflow (this round EXTENDS v1.12 plan #22-#30; finance
  profiles were deferred, CTO reopened them because a mandatory number-tracing Validate phase
  IS the Rule-13 guardrail → lowers risk).
- Returned a ROLEWF schema object (6-phase `finance-plan-review` preset) via StructuredOutput.

## Design summary
- Preset: `finance-plan-review` — "Financial Planning & Board Review".
- 6 phases: Frame mandate (Rule-5) → Assemble sourced inputs (Rule-13+POLICY) → Model & scenarios
  (Rule-5) → Validate & reconcile (Rule-13 keystone, NEVER skipped) → Narrative & CFO sign-off
  (Rule-5+audit+POLICY) → Distribute & archive (POLICY+audit+retention).
- NEW profile `cfo` (doc-first, autoPolicy:true). All five baked guardrails apply.
- Merge analysis: CRO/VP-Finance can reuse this exact preset; Accounting/Controller needs its own
  close-oriented `finance-close`; must NOT collapse into generic doc-first-signoff (would drop the
  mandatory reconcile phase).

## Files changed
- None (design deliverable only). Serena: this checkpoint.
- Proposed (not created — EMIT-CONFIG, for implementers): templates/_shared/workflow/finance-plan-review.md
  + `recommendedWorkflow: 'finance-plan-review'` on a new cfo ProfileDef.

## Current state
- Design complete and returned. No code/template touched.

## Next steps
- Team synthesis to reconcile CFO/Accounting/CRO presets under a finance-* family (Rule 2).
- Implementers: author the phase-list md + wire cfo profile (depends on #23 workflow-slot mechanism).

## Blockers / Risks
- Finance profiles still gated on #23 landing + altered-number test mocks (Rule 13). This design
  assumes the #23 {{{workflowSection}}} slot + recommendedWorkflow field exist.
