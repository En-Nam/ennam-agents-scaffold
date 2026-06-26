---
description: Drive Phase 6 Content Gates (Design / Art / Feel / Perf — human sign-off) on the current PR. Prints the gate checkbox block to paste into the PR body; runs the automated portion of the Perf gate.
---

Use `/unity-content-gate [--pr <number>]` after Phase 5 Verify is green.

## What it does

1. Reads `docs/superpowers/specs/<latest-feature>.md` to extract the success criteria.
2. Runs the **Perf gate** automated portion: invokes `perf-budget-check` skill against the changed scenes/prefabs. Prints PASS/WARN/FAIL with metric numbers.
3. Prints the **4-checkbox PR comment template** with the spec section + perf metrics inlined:
   ```markdown
   ## Content Gates (Phase 6)
   - [ ] **Design** — change aligns with GDD.md §<section-name>
   - [ ] **Art** — assets conform to art-bible.md (style, palette, forbidden list)
   - [ ] **Feel** — manual playtest passed (link to recording or notes here)
   - [ ] **Perf** — perf-budget-check PASS (87/100 draws, 92k/100k tris, 215/300 MB tex)
   ```
4. If `--pr <number>` passed: posts the block as a PR comment via `gh pr comment <number> --body-file -`.

## What it does NOT do

- Tick checkboxes for you. **All 4 gates require a human signoff comment** before Phase 7 begins.
- Approve the PR.
- Bypass the Perf gate if it failed.

## Arguments

- `--pr <number>` — post the gate comment to the specified GitHub PR (requires `gh` CLI authenticated).

## Hard constraint

Per CLAUDE.md `<!-- BEGIN:game-unity-agent-rules -->`, an agent claiming "tests pass therefore done" without all 4 gate checkboxes ticked is a Rule 12 (Fail Loud) violation.
