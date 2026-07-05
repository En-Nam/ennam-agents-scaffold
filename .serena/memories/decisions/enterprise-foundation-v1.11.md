---
name: enterprise-foundation-v1.11
description: "CTO⇄tech-lead debate decisions for the v1.11 enterprise-foundation batch: #8 org-layer, #9 role-adaptive AGENTS, #15 DoD, #14 governance, #10+#7 composition/multi-role. All shipped."
metadata:
  type: decision
  date: 2026-07-04
---

## Context
Danny (CTO) granted full autonomy: role-play CTO to answer/rebut the open triage questions,
loop to the optimal solution, implement ALL remaining foundational issues, open PR, report.
Ran a CTO⇄tech-lead debate round; locked decisions below; implemented all in one branch (v1.11.0).

## Locked decisions
- **#9 role-adaptive AGENTS.md → 2-file + `ruleFamily`** (NOT overlay-merge). Engineering keeps
  `_shared/AGENTS.md` byte-identical (diff=0); doc-first gets a complete `AGENTS.doc-first.md`.
  Parity test asserts both keep all 13 rule headings (anti-drift). doc-first = ba/hr/pm/tech-writer/data-analytics.
- **#15 DoD → folded into `AGENTS.doc-first.md`** (a "Definition of Done" section: Verify = sign-off/
  checklist/citation, not build/test). No per-profile DoD files (Rule 2).
- **#14 governance → standalone `POLICY.baseline.md` → POLICY.md**, `skip-if-exists`. `--policy` flag +
  `autoPolicy` auto-attach for hr/data-analytics. One `baseline` pack (no GDPR-specific). CTO-approved
  disclaimer "KHÔNG phải tuân thủ pháp lý…" (test-enforced).
- **#10+#7 composition → merged epic.** `resolveProfiles()` + `enumerateProfiles()`. Conflict semantics:
  same path + different content → FAIL LOUD (Rule 7). Same content → dedup. CLAUDE.md concatenates
  per-profile sections under `#### <profile>`; .mcp.json unions; AGENTS.md = engineering if ANY profile
  engineering else doc-first; POLICY if any autoPolicy. CLI variadic `[...profiles]`; wizard single-vs-compose
  + multiselect. **Single-profile path kept byte-identical** (new code only in the multi branch).

## Implementation surface
types.ts, profiles.ts, classify.ts, enumerate.ts, render.ts, execute.ts, index.ts, wizard.ts;
templates/_shared/{AGENTS.doc-first.md, POLICY.baseline.md} + CLAUDE partial Org Context/POLICY refs.

## State
Build OK; tests **286 pass** (+26); tsc clean except 2 PRE-EXISTING analyze-claude errors (untouched, Rule 3).
Verified E2E: pm+qa (engineering AGENTS, both sections, no POLICY), hr+data-analytics (doc-first AGENTS, auto POLICY+disclaimer).
Shipped in v1.11.0 branch → PR #20 (expanded from just #8). Closes #7/#8/#9/#10/#14/#15 on publish.

## Cross-refs
`mem:decisions/org-layer-v1.11` (expanded by this), `mem:decisions/v1.9-scope`.
