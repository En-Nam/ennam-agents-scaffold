### Security Incident Workflow (Detect → Contain → Recover → Learn)

Incident response follows the NIST-style phases. Every fact comes from evidence, never memory (Rule 13); irreversible and outward-facing actions stop for human sign-off (Rule 5, POLICY).

#### Phase 1 — Intake & Declare
Log the alert, confirm it is a real event, and decide whether to declare an incident and how severe — like confirming a fire alarm is a real fire, not burnt toast, before pulling the whole team in. Declaration and severity are a human call.

#### Phase 2 — Scope & Analyze from Evidence
Pull the actual logs, alerts, and forensic evidence to establish exactly what was hit, when, how, and how many records — every fact and figure comes from the evidence, never a guess. Unknowns are marked `?`. Never skipped.

#### Phase 3 — Contain, Eradicate & Recover
Stop the bleeding, remove the attacker's foothold, and safely restore service — but get sign-off before any drastic or customer-visible action, because isolating production or disabling accounts cannot be quietly undone.

#### Phase 4 — Brief & Notify
Write the incident brief for leadership and any breach notice to regulators or customers — approval-gated because once it goes outside it cannot be unsent, with every fact re-checked against the evidence. Breach-notification obligations are a consult-a-human/legal matter, not a guarantee.

#### Phase 5 — Post-Incident Review & Control Update
Run the blameless post-mortem, capture the lessons, and update the risk register and controls so the same gap cannot be exploited twice — then archive the whole timeline for the record.

### Definition of Done
Done = the incident is contained and recovered with every claim traced to evidence, both approval gates (production-touching containment, external notification) have recorded human sign-off, and the post-mortem + control updates are archived. Regulatory timelines are flagged to consult legal.
