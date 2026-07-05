---
name: org-layer-v1.11
description: "Tech-lead decision for issue #8 org-context base layer (v1.11.0). Emit location = standalone ORG.md; user-owned via skip-if-exists. Self-directed round (Danny had not answered triage questions)."
metadata:
  type: decision
  date: 2026-07-04
---

## Context
Issue #8 (P0 keystone). Round 3 of the consultant-assessment work. Danny had NOT
answered any triage question on #8/#9/#10/#14 (verified: the only comments on those
issues are my own, posted via the danny-exnodes token). User directed: "develop next
round, same process." → Tech-lead self-decided the low-risk keystone and implemented it.

## Decision — emit location
Standalone **`ORG.md`** at repo root (rejected: CLAUDE.md-above-marker, `.serena/memories/org/`).
Rationale: the org layer is **org-wide and reused across repos**; a standalone, user-owned
file is the clearest home and the most portable. CLAUDE.md-above-marker mixes org-wide with
per-repo project context; `.serena/` hides it from non-dev/portal users.

## Decision — write semantics
`ORG.md` classified **`skip-if-exists`** (new first-match rule in `classify.ts`, before CLAUDE.md).
Seed once, never overwrite — verified untouched even under `--merge-strategy=overwrite`
(same semantics as `.claude/commands`, `.serena/`). This protects the user's filled-in org
context on re-run. Idempotency preserved (second run: Written: 0).

## Scope shipped (v1.11.0)
- `templates/_shared/ORG.md` (placeholder: Company / Products / Glossary / Stakeholders /
  Comms / Data & tool policy; `?` = unknown → surface not guess).
- `_shared/CLAUDE.md.partial.hbs`: new "Org Context" subsection in Session Boot Protocol.
- `classify.ts` rule + `classify.test.ts` case + `tests/integration/org-layer.test.ts` (3 tests).
- Emitted by EVERY profile (it's in `_shared`) — intended (role-agnostic keystone).

## Deliberately deferred (still need Danny)
- #9 role-adaptive AGENTS.md — mechanism choice (2-file vs core+overlay+`ruleFamily`) creates
  migration debt if wrong; re-surfaced with sharpened rec (option 2, diff=0 engineering).
- #10 composition engine + #7 multi-role wizard — bigger pipeline change; propose one dedicated
  round after #9.
- #14 governance pack — legal disclaimer wording needs product/legal sign-off.
- #15 DoD half — depends on #9.

## Cross-refs
- `mem:decisions/v1.9-scope` — scaffold = emit config, stable/additive. This aligns (additive file).
- Issues #8 (this), #9/#10/#14/#7/#15.
