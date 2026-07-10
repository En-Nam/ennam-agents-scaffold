# Checkpoint: ceo-workflow-designer — 2026-07-10

## What was done
- Designed the position-specific CEO workflow (this round EXTENDS v1.12 plan #22-#30; ceo profile
  is already PLANNED in #29 but routes to GENERIC doc-first-signoff today — this gives it a REAL one).
- Returned a ROLEWF schema object (6-phase `exec-decision` preset) via StructuredOutput.

## Design summary
- Preset: `exec-decision` — "Executive Decision & Board Communication" (id matches the schema's own
  example list, intended home for C-level decision-owners).
- 6 phases: Frame decision & decision-rights (Rule-5) -> Gather sourced evidence & align stakeholders
  (Rule-13 + POLICY) -> Develop options & scenarios, NO recommendation (Rule-5 + Rule-7) -> Decide &
  record rationale (Rule-5 KEYSTONE, never skipped when a decision is live; audit) -> Craft board
  deck/OKRs/org narrative (Rule-13 + POLICY PII) -> CEO sign-off & controlled distribution (POLICY
  approval gate + audit + retention).
- Keystone = Rule-5 human-decision (CTO's explicit emphasis "decisions are human"), mirrors how the
  sibling CFO preset made Rule-13 Validate its never-skipped keystone.
- ATTACH to planned `ceo` profile (doc-first, autoPolicy:true) — NO new profile needed (cfo needed a
  new profile; ceo does not). All five baked guardrails apply.
- Merge analysis: COO (planned #30) can reuse `exec-decision`. Must NOT collapse into generic
  doc-first-signoff (drops Rule-5 decision keystone + options-not-recommendation discipline) nor into
  finance-plan-review (numbers-first modeling vs options-first judgment).

## Files changed
- None (design deliverable only). Serena: this checkpoint.
- Proposed (not created — EMIT-CONFIG, for implementers): templates/_shared/workflow/exec-decision.md
  + `recommendedWorkflow: 'exec-decision'` + `autoPolicy: true` on the planned ceo ProfileDef.

## Current state
- Design complete and returned. No code/template touched.

## Next steps
- Team synthesis: reconcile ceo(exec-decision)/coo under a shared exec-* preset (Rule 2, avoid
  proliferation); keep distinct from finance-* and security-incident/people-lifecycle.
- Implementers: author the phase-list md + wire ceo profile (depends on #23 workflow-slot mechanism
  + #29 proof wave).

## Blockers / Risks
- Depends on #23 {{{workflowSection}}} slot + ProfileDef.recommendedWorkflow field landing.
- Board-deck/OKR figures are a Rule-13 surface — the same altered-number test-mock discipline the CFO
  preset flagged applies to phases 2 & 5 here.
