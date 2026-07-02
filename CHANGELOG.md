# Changelog

## v1.9.1 — 2026-07-02

### Added

- **npm auto-publish workflow** (`.github/workflows/publish.yml`) — publishes `@ennamjsc/agents-scaffold` on GitHub Release (and `workflow_dispatch`). Authenticates via the `NPM_Publish` GitHub Environment's `NPM_TOKEN` secret and publishes with `--provenance` for a verified repository link on npmjs.com.
- **Package repository metadata** — `repository` (with `directory: packages/cli`), `homepage`, `bugs`, `keywords`, and `license` fields on the published package so the npm page links back to GitHub.

### Changed

- **README** — fancier header, live GitHub stars badge, CI + downloads badges, and a lighter tone.

### Fixed

- **`npx-symlink-bin` integration test** — the simulated package could not resolve external runtime deps (`cac`, `handlebars`, …) in an isolated temp dir, failing in CI. It now symlinks the repo's hoisted `node_modules`, so the suite passes on clean runners and unblocks the publish job.

## v1.9.0 — 2026-07-01

### Added

- **`qa-automation` profile** — QA Automation Engineer with 3 skills (issue [#2](https://github.com/En-Nam/ennam-agents-scaffold/issues/2), per @alden-exnodes' spec).
  - `qa-maestro` — Maestro authoring (mobile). Owns `list_devices` → `inspect_screen` → `run` loop, YAML flow conventions, team's `copyTextFrom` + `${maestro.copiedText.replace(...)}` OTP echo pattern, underscore-prefix sub-flow reuse, cloud run polling contract.
  - `qa-playwright` — Playwright authoring (web). Owns Page Object + spec generation, team's JSDoc BDD header convention (NO `.feature` files for web), CLPReviewPage reference, self-healing state as a required §, locator priority (getByRole → no xpath), flake diagnosis (NOT `retries: 3`).
  - `gherkin-bdd` — shared parser + step matching. Feature/Scenario/Given/When/Then → normalized `intent` output, ambiguity policy (Rule 12 — return `candidates`/`unmapped`, never invent).
  - References (does NOT duplicate) Maestro install from `react-native` profile.
  - CLAUDE.md.partial.hbs enforces `/escalate` on failures — no silent app-code patches.
- **`agent-org` profile** — multi-agent dispatch template (mem:decisions/v1.9-scope, MUST item 4).
  - 3-role trio: `orchestrator` (Opus tier, plans + dispatches), `implementer` (Sonnet, executes ONE subtask + runs build/test green), `reviewer` (Sonnet, reads diff + reports by severity).
  - Log-only `SubagentStop` hook (`.ps1` + `.sh`) that appends timestamped markers to `.serena/memories/comms/active/agent-org-log.md`.
  - **Cost disclosure** in the profile's own CLAUDE.md.partial.hbs — Opus + Sonnet fleet on end-user's account; ~5-10× tokens vs solo.
  - `printNextSteps` shows the paste-ready `SubagentStop` JSON for `.claude/settings.json` — profile-specific hook auto-merge deferred to v1.10.x.
- **`--analyze-claude` CLI flag** — Feature A from issue [#4](https://github.com/En-Nam/ennam-agents-scaffold/issues/4), per @ian-exnodes' spec.
  - Scans `./CLAUDE.md` HEADINGS for 12 approved section patterns: `Task Startup Protocol`, `Adaptive Session Boot Protocol`, `Skill Loading Policy`, `Serena MCP Policy`, `Session Checkpoint Protocol`, `Completion Signal`, `Workflow`, `Verification`, `Plugin / MCP Capability Discovery`, `Plugin Activation Matrix`, `End-of-Task Sentinel`, `Source of Truth`.
  - Prints line-cited warnings + recommendation, exits 0. Short-circuits BEFORE the wizard/install flow — non-destructive by contract.
  - Feature B (`--claude-strategy=minimal`) parked for v1.10.
- **`minClaudeCodeVersion` field on `ProfileDef`** — optional string, semver-lite comparison.
  - Wizard preflight execs `claude --version` and WARNS (does not block) if installed < required.
  - Policy is warn-not-block: end-user chose to run the wizard, they can decide (CTO answer #2 — token budget lives on end-user's Anthropic account).
  - First consumer: `agent-org` (`'2.1.178'`). All other profiles omit the field.
  - Injectable `VersionFetcher` for tests.
- **Meta-spike infra in this repo** — `.claude/agents/{orchestrator,implementer}.md` + `.claude/hooks/subagent-log.{ps1,sh}` + `SubagentStop` hook registered in `.claude/settings.json`. Used in-place to dogfood the `agent-org` design.

### Changed

- `packages/cli/src/types.ts` — `ProfileDef` gains optional `minClaudeCodeVersion?: string`.
- `packages/cli/src/profiles.ts` — registers `qa-automation` (between `qa` and `react`) and `agent-org` (after `game-unity`); `agent-org` sets `minClaudeCodeVersion: '2.1.178'`.
- `packages/cli/src/wizard.ts` — new `QAKind` and `'Agent-Org'` Role types; `resolveProfile` gains optional 6th `qaKind` parameter (backward-compat: undefined → 'qa'). QA-QC branch throws on bogus `qaKind` values (Rule 12 defense-in-depth mirroring the DevOps/Game-Dev enum-throws pattern). `runWizard` adds Manual/Automation sub-select under QA-QC and stack-agnostic Agent-Org role.
- `packages/cli/src/index.ts` — imports `checkPreflight` + `runAnalyzeClaude`. New `--analyze-claude` flag short-circuits at the top of `.action`. Preflight is called after `getProfile` and before file operations; non-blocking WARN loop over `preflight.warnings`.
- `packages/cli/src/ux.ts` — `printNextSteps` adds 4 `agent-org`-specific steps: paste-ready SubagentStop hook JSON, non-Windows `.sh` fallback, cost disclosure line, Claude Code version reminder.

### Tests

- `tests/unit/preflight.test.ts` (new, 16 tests) — extractVersion / compareVersions / checkPreflight coverage including claude-not-installed and older/equal/newer versions.
- `tests/unit/analyze-claude.test.ts` (new, 14 tests) — locks all 12 patterns, case-insensitivity, H1-H6, variant spellings for `Plugin/MCP` (slash, ampersand), body-vs-heading discrimination.
- `tests/integration/analyze-claude-cli.test.ts` (new, 3 tests) — spawns the CLI with `--analyze-claude` and asserts stdout has the correct format + non-destructive behavior (no wizard, no plan output).
- `tests/unit/qa-automation-skill-shape.test.ts` (new, 4 tests) — locks each SKILL against Alden's real production examples (change-email OTP flow, CLPReviewPage anchor, JSDoc BDD header pattern, self-healing state).
- `tests/unit/agent-org-shape.test.ts` (new, 9 tests) — locks the 3-role trio + ASCII-only hook script + cost/version disclosures + registry `minClaudeCodeVersion` value.
- `tests/unit/profiles.test.ts` — adds `agent-org` + `qa-automation` to `ALL_PROFILES`; asserts `agent-org` is the ONLY profile in v1.9.0 with `minClaudeCodeVersion` set.
- `tests/unit/wizard.test.ts` — adds Manual/Automation explicit cases, bogus-qaKind throws, Agent-Org resolves to `agent-org`, updated `every resolved name is a registered profile` matrix.

### Baseline
- v1.8.0: 43 files / 184 pass / 2 skipped
- v1.9.0: **48 files / 238 pass / 2 skipped** (+5 files / +54 tests)
- `npm run build`: tsup ESM 17ms

### Meta-spike verdict

Multi-agent orchestration was proposed as a scaffold *runtime* in the R&D docs (Vietnamese VISION + DESIGN). Rejected as-written: mission drift vs [`mem:project-ennam-scaffold-mission`](.serena/memories/project_ennam_scaffold_mission.md) (npx CLI wizard, stable/slow/backward-compatible) and stack mismatch (docs assume Python, repo is Node/TS). Accepted with scope change per reframer analysis in workflow `wf_de93563c-a3c`: **ship as a scaffold profile, not a scaffold runtime.** Anthropic ships the runtime (Agent View + Teams primitives verified real against `code.claude.com/docs`); our job is to emit templates.

Adversarial review in workflow `wf_1722d568-237` (3 lenses: alden-spec + convention-match + rule-discipline + judge synthesis) reached `ship-with-fixes` — zero blockers from the source-of-truth lens (alden-spec), zero blockers from the rule-discipline lens, two release-mechanical blockers from convention-match (version string drift + missing root-README doc block for the new profiles). Both patched in this release. See [`mem:decisions/v1.9-scope`](.serena/memories/decisions/v1.9-scope.md) for the full CTO-answer record + kill criteria.

### Deferred to v1.10

- `--claude-strategy=minimal` (Feature B from issue #4). Observe real semantic-conflict reports from v1.9.0 users before defining "integration bits" precisely.
- `.claude/settings.json.partial.hbs` merge support — currently the shared `settings.json.hbs` cannot deep-merge profile-specific hook fragments. `agent-org` documents the SubagentStop registration as a manual `printNextSteps` step until this lands.
- Small polish items from the review pass: split `gherkin-bdd` JSON example into mobile/web variants, add cloud-queue upper bound in `qa-maestro`, align "When NOT to apply" vs "Non-goals" section headings across the qa-automation triad. See workflow `wf_1722d568-237` result for the full deferred list.

---

## v1.8.0 — 2026-06-26

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

### Pre-publish verification (maintainer-only)

The maintainer ran `scripts/verify-game-unity-bake.mjs` before publish; results:

- ✅ **CoplayDev `coplay-mcp-server` PyPI package** — VERIFIED present (latest 1.5.5). The `uvx --from coplay-mcp-server mcp-for-unity --transport stdio` invocation in `.mcp.json.partial.hbs` resolves on user install.
- ✅ **Tripo3D Python SDK class shape** — VERIFIED: class is `TripoClient` (NOT the `Tripo3D` name that research initially guessed); all methods are async; `get_balance()` returns a `Balance(balance, frozen)` dataclass. Real REST endpoint (from SDK traceback): `GET https://api.tripo3d.ai/v2/openapi/user/balance`. SKILL.md procedure rewritten to use the SDK helpers `TripoClient.image_to_model`, `wait_for_task`, `download_task_models`, `rig_model` (which abstract the REST surface and insulate against future endpoint moves).
- ✅ **Tripo3D base URL alive** — VERIFIED (responds 401 without auth, as expected).
- ⊘ **Tripo3D balance handshake** — requires `TRIPO_API_KEY` set; maintainer verified locally with a real Pro-tier key before publish.
- ⚠️ **`perf-budget-check`** — still requires Unity Editor + ProfilerRecorder API; ships as **advisory** in v1.8.0 (cannot run in CI without a Unity license on the runner). The `EnnamPerf.cs` template uses `Thread.Sleep` as a placeholder for frame-sampling; production users should swap to `EditorCoroutines`.

If `verify-game-unity-bake.mjs` reports any failure on a future re-run (e.g., SDK rename, CoplayDev PyPI 404), **do not publish** — update `templates/game-unity/.mcp.json.partial.hbs` or `asset-pipeline-tripo3d/SKILL.md` to match the verified shape, then re-run.

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
