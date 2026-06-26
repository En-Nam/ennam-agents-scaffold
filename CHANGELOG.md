# Changelog

## v1.8.0 — 2026-06-26 (unreleased)

### Added

- **`game-unity` profile** — Unity 2.5D mobile (URP) game-dev scaffold.
  - 3 agents (`gameplay-engineer`, `asset-pipeline`, `build-and-test`)
  - 3 commands (`/unity-greybox`, `/unity-build-android`, `/unity-content-gate`)
  - 4 skills (`unity-mcp-setup`, `unity-2.5d-conventions`, `perf-budget-check`, `asset-pipeline-tripo3d`)
  - `CLAUDE.md.partial.hbs` with 10 Unity 2.5D conventions + 8-phase workflow including new **Phase 6 Content Gates** (Design / Art / Feel / Perf — human sign-off required)
  - Unity MCP via `CoplayDev/unity-mcp` v9.7.3 baked into `.mcp.json.partial.hbs` (UPM `com.coplaydev.unity-mcp` + `uvx coplay-mcp-server`)
  - Tripo3D as default 3D asset gen, Meshy as opt-in `--provider meshy` fallback
  - **Tripo skill `--dry-run` by default** — real API calls require explicit `--live` flag + interactive Pro-tier confirmation (Free tier outputs = CC BY 4.0 NON-COMMERCIAL, unusable for commercial games; Pro tier $13.93/mo annual minimum to ship)
  - `GDD.md.hbs`, `art-bible.md.hbs`, `docs/perf-budget.md` templates emitted on install
  - `Editor-templates/EnnamPreflight.cs` + `EnnamPerf.cs` (user copies into `Assets/Editor/`)
- **`_shared/.gitattributes.append`** (new) — Unity LFS standard rules (`.fbx .glb .gltf .obj .png .jpg .jpeg .psd .tga .tif .wav .ogg .mp3 .mp4 .mov`). Unity Smart Merge text formats (`.unity .prefab .asset .meta`) deliberately excluded so Smart Merge can text-diff them.
- **`_shared/.gitignore.append`** — append `.ennam/` (runtime caches: asset-pipeline jobs, perf-budget results)
- **Wizard role**: new top-level **"Game-Dev"** → "Unity 2.5D Mobile"

### Changed

- `packages/cli/src/profiles.ts` — register `game-unity` (extraMcp = [], Unity MCP wired via own partial)
- `packages/cli/src/wizard.ts` — new `Game-Dev` role + `GameStack` type; `resolveProfile` gains optional 5th `gameStack` parameter (backward-compatible — existing call sites unchanged)
- `packages/cli/src/ux.ts` — `printNextSteps` extended with 7 game-unity-specific steps (uvx/adb prereq, Unity MCP UPM, Disable Domain Reload, Editor-templates copy, LFS init, GDD/art-bible fill prompt, Tripo dry-run default disclosure)

### Tests

- `tests/unit/profiles.test.ts` — adds `game-unity` to ALL_PROFILES + extraMcp = [] assertion
- `tests/unit/wizard.test.ts` — adds Game-Dev role cases (positive + negative)
- `tests/unit/game-unity-mcp-shape.test.ts` (new) — snapshots `.mcp.json.partial.hbs` against CoplayDev v9.7.3 README shape
- `tests/unit/game-unity-skill-discipline.test.ts` (new) — asserts `--dry-run` enforcement language in Tripo SKILL.md + 10 numbered rules in 2.5D-conventions SKILL.md
- `tests/integration/profiles/game-unity.test.ts` (new) — dogfood install asserts 19 files emit, CLAUDE.md has both marker blocks, .mcp.json merges Unity correctly, .gitattributes has LFS rules (and does NOT LFS .unity/.prefab)

### Known [UNVERIFIED] — maintainer pre-publish gate

The following items were flagged unverified by pre-publish research (see `docs/superpowers/specs/2026-06-26-game-unity-profile-design.md` §9). The maintainer MUST run `scripts/verify-game-unity-bake.mjs` before `npm publish` to spot-check them against the live world:

- Tripo3D balance endpoint URL — the previously-proposed `/v2/openapi/user/balance` was flagged invented; the skill instructs shelling out to the Python SDK `get_balance()` or fetching live OpenAPI schema
- CoplayDev `coplay-mcp-server` PyPI package presence + exact `uvx --from coplay-mcp-server mcp-for-unity --transport stdio` invocation
- `perf-budget-check` requires Unity Editor + ProfilerRecorder API — ships as advisory in v1.8.0 (cannot run in CI without a Unity license on the runner)

If `verify-game-unity-bake.ts` reports any failure, **do not publish** — update `templates/game-unity/.mcp.json.partial.hbs` or `asset-pipeline-tripo3d/SKILL.md` to match the verified shape, then re-run.

### Out of scope (deferred to v1.8.x+)

- `game-unity-2d` and `game-unity-3d` variants
- `game-godot` / `game-unreal` profiles
- Sprite AI MCP bake-in (CLAUDE.md points users to `pixelforge-mcp` + `spritecook-mcp` — none meets the scaffold's stability bar today)
- Unity official `com.unity.ai.assistant` flavor (blocked on package exiting `-pre.3`)
- Automated CI gate for the Tripo live test (would require Python + Tripo API key in CI)
- Bootstrapping a Unity project (user pre-creates)

### Architecture decision

Captured in `mem:decisions/game-unity-v1.8.0-bigbang-safety-harness`. 3-advocate panel + 1 judge picked **Big-bang + Safety Harness** (Advocate C) over Verified-first (A) and Big-bang-as-designed (B). Salvages from losers: A's `[UNVERIFIED]` documentation discipline + B's maintainer pre-publish gate, combined with C's `--dry-run` default and content-assertion tests.

---

## v1.7.0 — earlier

(prior history — see git log)
