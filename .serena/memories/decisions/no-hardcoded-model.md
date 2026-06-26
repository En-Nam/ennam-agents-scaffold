---
name: no-hardcoded-model
description: Why the scaffold's settings.json.hbs MUST NOT pin a `model` field — let Claude Code's global > project resolution decide. Fixes issue #3.
metadata:
  type: decision
---

# Decision: scaffold must not hardcode `model` in `templates/_shared/.claude/settings.json.hbs`

**Date:** 2026-06-26
**Triggered by:** GitHub issue #3 (ian-exnodes). Ship target: v1.6.1 patch.

## The decision

The shared settings template MUST NOT emit a `model` field on fresh install. Claude Code's own resolution chain (global `~/.claude/settings.json` > project `.claude/settings.json`) decides which model to use.

## Why

Hard-coding `"model": "claude-opus-4-7"` in the template polluted every project's `settings.json`:

- **User without an explicit model**: scaffold introduced `model: claude-opus-4-7` → project-level pin → user stuck on opus-4-7 even after they upgraded their global default to opus-4-8. This is the failure ian-exnodes reported.
- **User with explicit model**: `mergeJson` is user-wins on scalars ([packages/cli/src/merge/json.ts:30](packages/cli/src/merge/json.ts#L30)), so their value survived re-runs. This only protected users who had ALREADY manually set the field — silently failing the larger population on global defaults.

Letting Claude Code's resolution chain decide means:
- Global-default users get the model they actually want, with no project-level override.
- Users with an explicit project-level model can still set it themselves; their value is preserved on re-run via `mergeJson`.
- Scaffold does NOT opinionate about model choice — that's a billing/policy concern owned by the developer or org, not a tooling concern.

## How to apply

- Do NOT add `model` back to `templates/_shared/.claude/settings.json.hbs`.
- The regression test in [tests/integration/install-superpowers-settings.test.ts](tests/integration/install-superpowers-settings.test.ts) ("fresh install does NOT introduce a hardcoded `model` field (regression: issue #3)") locks this contract.
- If a future profile has a strong reason to PIN a model (e.g., a cost-constrained profile that requires haiku), do it as a per-profile template override — NOT in `_shared/`. That needs its own decision memo.

## What revisits this decision

- Claude Code changes its resolution semantics (e.g., adds a tier-default that scaffold should set).
- A specific profile has a strong cost/policy reason to pin a model.

## Related
- `mem:checkpoint/project-owner-2026-06-26` — triage session that surfaced & fixed this.
- Code: `templates/_shared/.claude/settings.json.hbs`, `tests/integration/install-superpowers-settings.test.ts`, `packages/cli/src/merge/json.ts`.
