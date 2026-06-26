---
name: game-unity-v1.8.0-bigbang-safety-harness
description: Why v1.8.0 ships the full game-unity profile in one release with --dry-run default for Tripo3D + content-assertion tests + maintainer pre-publish gate, rejecting verified-first staging and bare big-bang.
metadata:
  type: decision
---

# game-unity v1.8.0 — big-bang + safety harness

## Decision

Ship the full `game-unity` profile (3 agents + 3 commands + 4 skills + GDD/art-bible/perf-budget templates + Editor-templates + LFS rules + CLI integration + 3 new tests) in one v1.8.0 release. Wrap the unverified surface (Tripo3D balance endpoint URL, CoplayDev `uvx` invocation, ProfilerRecorder editor harness) in: (a) **`--dry-run` default for `asset-pipeline-tripo3d` skill** enforced inside the skill body (not just documented), (b) **content-assertion tests** in `tests/unit/game-unity-skill-discipline.test.ts` that grep the literal enforcement language so a future edit dropping the dry-run gate fails CI, (c) **maintainer pre-publish script** `scripts/verify-game-unity-bake.ts` (excluded from npm artifact via `packages/cli/package.json` `files = ["dist", "templates"]`).

## Why this option

3-advocate panel + judge:

- **A — Verified-first** (ship only 2/4 skills in v1.8.0, defer asset-pipeline-tripo3d + perf-budget-check to v1.8.1): minimal risk but overrides user's stated big-bang preference without strong safety counter-signal; loses on user-intent criterion.
- **B — Big-bang as designed** (ship everything; mark Tripo unverified in inline `[UNVERIFIED]` text only): matches user intent but `[UNVERIFIED]` text in a SKILL.md does not prevent a user's first run from making live Tripo API calls — soft safety only. Loses on reversibility + test surface.
- **C — Big-bang + Safety Harness (WINNER)**: ships full scope per user intent AND closes the Tripo-billing-risk hole at the code level (skill enforces dry-run by default) AND at the CI level (content-assertion tests). Cost: ~6-8 extra agent-hours, ~3 extra unit tests. Acceptable trade per Rule 9 (Tests verify intent) + Rule 12 (Fail Loud).

Salvages from losers: A's `[UNVERIFIED]` documentation discipline (kept in CHANGELOG.md + this decision memory + SKILL.md headers); B's maintainer pre-publish gate (combined into `scripts/verify-game-unity-bake.ts`).

## Critical context (binding on implementer)

5 Judge objections — all addressed in this implementation:

1. ✅ `--dry-run` default enforced in `asset-pipeline-tripo3d/SKILL.md` body (opens with bold declaration; every procedure step branches on `live_mode`; every invocation prints `MODE: dry-run` or `MODE: LIVE`)
2. ✅ Test fixtures in `tests/unit/` + `tests/integration/profiles/game-unity.test.ts`; no msw or runtime HTTP stub in published template (the skill ships as markdown, not executable JS — content-assertion is the right altitude)
3. ✅ `scripts/verify-game-unity-bake.ts` lives at REPO ROOT, NOT inside `packages/cli/` — confirmed excluded by `packages/cli/package.json` `files = ["dist", "templates"]`. Script's Check 5 self-verifies this invariant.
4. ✅ Wizard `printNextSteps` mentions Tripo dry-run default explicitly (step #7 of game-unity steps)
5. ✅ `templates/_shared/AGENTS.md` + Session Boot Protocol UNCHANGED (only `.gitignore.append` + new `.gitattributes.append` in `_shared/`)

## Mission tie-in

Per `mem:project_ennam_scaffold_mission`, this repo = npx CLI wizard. The game-unity profile emits dotfiles + docs into an EXISTING Unity project root (does NOT bootstrap Unity). Profile is the 17th in the registry, the first one requiring a Python runtime (uvx) on the host — surfaced loudly in `printNextSteps` and `unity-mcp-setup/SKILL.md` per Rule 12.

## Tech stack chosen (after research workflow `wf_75e1331e-263` + verifier corrections)

| Component | Choice | Why over alternatives |
|---|---|---|
| Unity Editor MCP | CoplayDev/unity-mcp v9.7.3 (MIT, ~11.1k stars) | Coplay acquired justinpbarnett 2025-08; covers all required ops (scene, GameObject, script, console, test, playmode, asset); explicit Unity 6.5 + 2021.3 compat patches. Rejected: AnkleBreaker (bespoke non-OSI license), Unity-official com.unity.ai.assistant (pre-release + subscription-gated). Fallback prepared: IvanMurzak/Unity-MCP via `--unity-mcp-flavor ivanmurzak` flag (Apache-2.0, ~3.3k stars, broader extension packs). TODO block for `official` flavor when com.unity.ai.assistant exits `-pre`. |
| 3D asset gen | Tripo3D REST default; Meshy `--provider meshy` opt-in | Tripo wins on speed (~10s Turbo vs ~60s Meshy), native `face_limit` for mobile, official Python SDK, lower per-gen cost at Pro. Meshy keeps rigged-character lead (500+ animation library + Unity plugin). **HARD BLOCKER**: Tripo Free = CC BY 4.0 NON-COMMERCIAL — Pro $13.93/mo annual minimum to ship. Skill gates with interactive license confirm on first `--live`. |
| Sprite AI MCP | OMITTED in v1.8.0 — CLAUDE.md pointer to `pixelforge-mcp` (MIT) + `spritecook-mcp` (paid SaaS) | No stable MCP meets bake-in bar today. Backlog `mem:backlog/sprite-mcp-revisit-v1.8.x` for re-eval. |
| Workflow | 8-phase (extends shared 7-phase with new Phase 6 Content Gates) | User Q3 chose "tách hẳn 8-phase". Phase 6 = 1 PR comment with 4 checkboxes (Design / Art / Feel / Perf — all human sign-off). Encoded in `CLAUDE.md.partial.hbs` marker block + `/unity-content-gate` command. |
| Camera + Sorting + URP + Atlas + Batching + Pivot/PPU + Perf budget + Cinemachine version | 10 rules in `unity-2.5d-conventions/SKILL.md` | Aggregated from Unity 6 docs + Android URP docs + GDC talks; verifier downgraded confidence on SetPass≤50 and 200-300 MB texture budget (community-aggregated, not Unity-published) — kept as configurable advisory defaults in `docs/perf-budget.md`. |

## CRITICAL UNVERIFIED items (maintainer pre-publish gate blocks publish)

1. **Tripo3D balance endpoint URL** — previously-proposed `/v2/openapi/user/balance` was flagged invented. Skill instructs shelling out to Python SDK `get_balance()` or reading live OpenAPI schema. Verify via `scripts/verify-game-unity-bake.ts` Check 4 (requires TRIPO_API_KEY env).
2. **CoplayDev `coplay-mcp-server` PyPI package + exact `uvx` invocation** — Verify via Check 2 (PyPI 404 = release-blocker).
3. **`perf-budget-check` ProfilerRecorder API behavior in batchmode** — `EnnamPerf.cs` template uses `Thread.Sleep` placeholder; production users should replace with EditorCoroutines. Documented in template comment + Editor-templates/README.md.

If `verify-game-unity-bake.ts` reports failure, **do not publish** — update `templates/game-unity/.mcp.json.partial.hbs` or `asset-pipeline-tripo3d/SKILL.md` to match verified shape, re-run.

## Files touched in v1.8.0

- 19 new under `templates/game-unity/` (profile shell + 3 agents + 3 commands + 4 SKILL.md + 1 fixture JSON + GDD.md.hbs + art-bible.md.hbs + docs/perf-budget.md + 2 Editor-templates .cs + Editor-templates/README.md + README.md)
- 1 new under `templates/_shared/` (`.gitattributes.append`)
- 1 modified under `templates/_shared/` (`.gitignore.append` appends `.ennam/`)
- 3 modified under `packages/cli/src/` (`profiles.ts`, `wizard.ts`, `ux.ts`)
- 5 modified under `tests/` (2 modified, 3 new — `game-unity-mcp-shape.test.ts`, `game-unity-skill-discipline.test.ts`, `profiles/game-unity.test.ts`)
- 1 new at repo root (`scripts/verify-game-unity-bake.ts` — maintainer-only)
- 1 new at repo root (`CHANGELOG.md` — first changelog file, captures v1.8.0)
- 1 new under `docs/superpowers/specs/` (`2026-06-26-game-unity-profile-design.md`)

## Verification evidence

- `npm run build`: ✅ tsup ESM 13ms
- `npm test`: ✅ 43 test files / 184 pass / 2 skipped (up from 39/166 in v1.6.0 — +4 files, +18 tests)
- No regressions in any existing profile test
- 3 new test files all green: game-unity-mcp-shape (3/3), game-unity-skill-discipline (8/8), profiles/game-unity (1/1, asserts all 19 expected files emit + .mcp.json merges Unity + .gitattributes has LFS for binaries but NOT for .unity/.prefab)

## What revisits this decision

- First user report of a Tripo skill `--live` invocation failing because the procedure references a Tripo API surface change → re-run `scripts/verify-game-unity-bake.ts`, update the skill
- CoplayDev publishes v10.x with breaking changes → `tests/unit/game-unity-mcp-shape.test.ts` snapshot fails → update partial + bump pin
- Unity official `com.unity.ai.assistant` exits `-pre` → activate the `--unity-mcp-flavor official` TODO block
- Stable, tokenless Sprite AI MCP emerges → revisit `mem:backlog/sprite-mcp-revisit-v1.8.x`
- ProfilerRecorder in batchmode proves unworkable → demote `perf-budget-check` from skill to interactive-only mode

## Workflow runtime

- Research: workflow `wf_75e1331e-263` (4 parallel research + 4 verify + 1 synthesize = 9 agents, ~406k tokens, ~9 min)
- Implementation: 3-advocate panel + 1 judge (4 agents); then ~25 file writes via main loop
