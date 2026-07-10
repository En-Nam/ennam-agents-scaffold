# Checkpoint: ciso-workflow-designer — 2026-07-10

## What was done
- Designed the position-specific CISO / Security workflow (this round EXTENDS v1.12 plan #22-#30;
  ciso profile already PLANNED in #29 but routes to GENERIC doc-first-signoff today — this gives it a
  REAL one). Grounded in NIST SP 800-61 incident-response lifecycle.
- Returned a ROLEWF schema object (5-phase `security-incident` preset) via StructuredOutput.

## Design summary
- Preset: `security-incident` — "Security Incident Response & Breach Notification" (matches the
  schema's own example presetId list; intended home for the security-response audience).
- 5 phases (NIST 800-61 lifecycle, Preparation is standing/not per-incident):
  1. Intake & Declare (Rule-5 human-decision — severity/declare is a human call, not LLM auto-route)
  2. Scope & Analyze from evidence (Rule-13 KEYSTONE — affected systems/record counts/timeline/IOCs
     trace to logs/SIEM, never LLM-recalled; + PII; never skipped)
  3. Contain, Eradicate & Recover (POLICY approval gate — isolating prod / disabling accounts is
     irreversible; Rule-5 on strategy; skippable only for a non-active/historical finding)
  4. Brief & Notify (POLICY approval gate on outward/irreversible regulator+customer notice + Rule-13
     re-verify scope + PII + audit; external-notify sub-step skippable below legal threshold)
  5. Post-Incident Review & Control Update (audit-to-Serena + retention; Rule-13 on control-IDs/
     risk-register; Rule-5 on residual-risk acceptance; formal review skippable only for SEV-4)
- ATTACH to planned `ciso` profile (doc-first, extraMcp github). NO new profile needed (unlike cfo).
- autoPolicy: TRUE — incident briefs carry victim PII + breach scope and drive outward-facing/
  irreversible notifications needing the POLICY approval gate.
- All FIVE baked guardrails apply.

## Merge analysis (Rule 2)
- SRE / DevOps incident-commander / IT on-call lead run the SAME NIST detect->contain->recover->
  post-mortem loop -> `security-incident` can serve them too (avoid a separate `sre-incident`).
- Must NOT collapse into generic doc-first-signoff (drops containment approval gate + evidence-derived-
  scope keystone + notification gate) nor into exec-decision (options-first judgment vs time-pressured
  evidence-first response).
- CISO's OTHER cadence — risk register / control mapping / policy — is DISTINCT (periodic governance,
  not event-driven). Recommend it reuse exec-decision's decision keystone for quarterly risk-acceptance
  sign-off rather than spawn a preset; sibling `risk-governance` preset only if team wants. Flagged for
  synthesis.

## Files changed
- None (design deliverable only). Serena: this checkpoint.
- Proposed (not created — EMIT-CONFIG, for implementers): templates/_shared/workflow/security-incident.md
  + `recommendedWorkflow: 'security-incident'` + `autoPolicy: true` on the planned ciso ProfileDef.

## Next steps
- Team synthesis: reconcile ciso(security-incident) with any SRE/incident-commander role under the one
  shared preset; keep distinct from exec-*/finance-*/people-lifecycle.
- Implementers: author the phase-list md + wire ciso profile (depends on #23 slot + #29 proof wave).

## Blockers / Risks
- Depends on #23 {{{workflowSection}}} slot + ProfileDef.recommendedWorkflow field landing.
- Breach-notification scope/counts are a Rule-13 surface — same altered-number test-mock discipline the
  CFO/CEO presets flagged applies to phases 2 & 4 (regulators/customers act on those figures).
