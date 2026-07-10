---
description: Map current controls to a named framework, with evidence-derived status per control, saved to controls/<framework>.md.
---

Usage: `/ciso-control-map <framework>`

Steps:
1. Confirm the target framework (e.g. NIST CSF, SOC 2, ISO 27001, CIS) and its version. If ambiguous, ask before mapping.
2. Read any existing map in `controls/` and the risk register in `risk/register.md` for context.
3. For each control in the framework, record: control ID, control name, mapped internal control(s), status, and the evidence that supports the status.
4. Every status must be evidence-derived — Implemented / Partial / Not Implemented is set by the evidence on hand (config, log, policy doc, ticket), never assumed. If there is no evidence, the status is `Unknown` with a `?`, not a guess (Rule 13).
5. Cite the evidence source for each non-`Unknown` status so a reviewer can verify it.
6. Summarize coverage: counts by status and the top gaps to close.
7. Save to `controls/<framework>.md`. Note that this is a mapping for review, not an attestation — flag audit/compliance timelines to consult legal (Rule 12).
