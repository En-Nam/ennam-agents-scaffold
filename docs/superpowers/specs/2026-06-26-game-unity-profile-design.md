# v1.8.0 — `game-unity` profile (Unity 2.5D mobile)

**Date**: 2026-06-26
**Author**: tech-lead session (handoff: full autonomy)
**Status**: approved — implementing
**Memory**: `mem:decisions/game-unity-v1.8.0-bigbang-safety-harness`

## 0. Mission tie-in

Per `mem:project_ennam_scaffold_mission`, this repo is a **npx CLI scaffolding wizard**, not a runtime. The `game-unity` profile emits dotfiles + docs + agent/skill/command/template files into an **existing Unity project root**. It does NOT bootstrap a Unity project.

## 1. Decisions summary

| # | Decision | Choice | Source |
|---|---|---|---|
| Q1 | Profile scope | Single `game-unity`, Unity 2.5D mobile baked in | user Q1 |
| Q2 | Agent count | 3 agents (gameplay-engineer, asset-pipeline, build-and-test) + perf-budget-check as skill | user Q2 |
| Q3 | Workflow extension | Separate 8-phase workflow for game profile | user Q3 |
| Q4a | Unity MCP | CoplayDev/unity-mcp v9.7.3 (MIT, ~11.1k stars) — Coplay acquired justinpbarnett 2025-08 | research |
| Q4b | 3D asset gen | Tripo3D REST default; Meshy opt-in `--provider meshy` fallback | user + research |
| Q5 | Packaging | Big-bang in v1.8.0; current is v1.7.0 | user Q5 |
| D1 | Wizard category | "Game" new top-level role | user §1 default |
| D2 | Unity tested matrix | 6.5 primary; 6000.0, 2022.3 LTS, 2021.3 LTS supported | research synthesis |
| D3 | `--unity-mcp-flavor` | CLI flag only, default `coplay` | user §1 default |
| D4 | Post-install hook on missing uvx | Print checklist, don't refuse | user §1 default |
| D5 | Tripo pricing tier | Pro $13.93/mo annual minimum (Free = CC BY 4.0 NON-COMMERCIAL) | research verifier |
| D6 | Cinemachine target | CM 3.x primary; `--legacy` mode for CM 2.x | research |
| D7 | LFS rules location | `_shared/.gitattributes.append` (NEW) | user §1 default |
| D8 | 8-phase workflow placement | Inside `<!-- BEGIN:game-unity-workflow -->` marker | user §2 default |
| D9 | Disable Domain Reload enforcement | Both CLAUDE.md rule + `EnnamPreflight.cs` template in `unity-mcp-setup` skill | user §2 default |
| D10 | Phase 6 gates UX | 1 PR comment with 4 checkboxes | user §2 default |
| D11 | LFS extensions | `.fbx .glb .gltf .obj .png .jpg .jpeg .psd .tga .tif .wav .ogg .mp3 .mp4`; `.unity .prefab .asset` NOT LFS (Unity Smart Merge) | user §2 default |
| D12 | Agent tools frontmatter | Wildcard `mcp__unity__*` (verify scaffold accepts; fallback explicit list) | autonomous |
| D13 | EnnamPreflight.cs | Ship template in `templates/game-unity/Editor-templates/` | autonomous |
| D14 | EnnamPerf.cs | Ship template only (no bench scene) | autonomous |
| D15 | Tripo client | Shell out to official Python SDK via `uvx` (verified surface) | autonomous |
| D16 | Meshy fallback | Ship in v1.8.0 (per big-bang) | autonomous |

## 2. Implementation strategy (Judge verdict)

**Winner: C — Big-bang + Safety Harness** (advocate panel: A=verified-first, B=big-bang-as-designed, C=big-bang+safety-harness).

Salvaged from losers:
- From A: `CHANGELOG.md` + decision memory call out `[UNVERIFIED]` Tripo bits that stubs prove shape, not semantics
- From B: maintainer pre-publish gate (combined with C's script)
- From C (core): `--dry-run` default for Tripo skill; msw HTTP stubs in `tests/integration/`; `scripts/verify-game-unity-bake.mjs` maintainer script

5 binding implementer objections (from Judge):
1. `--dry-run` default MUST be enforced inside skill body, not just documented
2. msw stubs live under `tests/integration/`, never in runtime deps of published template
3. `scripts/verify-game-unity-bake.mjs` excluded from npx artifact (verify `files` field in `packages/cli/package.json` = `["dist", "templates"]` — confirmed; scripts/ at repo root is NOT published)
4. Wizard prompt copy must mention Tripo skill defaults to dry-run, so end users discover `--live` flag without reading SKILL.md
5. `templates/_shared/` protocol files don't need a bump for new agent contracts (no `_shared/AGENTS.md` change, no Session Boot Protocol change)

## 3. File tree (concrete)

```
templates/_shared/
├─ .gitignore.append                                  (MODIFY: append Unity LFS + Library/ rules)
└─ .gitattributes.append                              (NEW: Unity LFS standard rules)

templates/game-unity/                                 (NEW PROFILE ROOT — 19 new files)
├─ CLAUDE.md.partial.hbs
├─ .mcp.json.partial.hbs
├─ README.md                                          (prerequisites: Unity 6.x, Python ≥3.11+uv, ADB; flavor flag)
├─ .claude/
│  ├─ agents/
│  │  ├─ gameplay-engineer.md
│  │  ├─ asset-pipeline.md
│  │  └─ build-and-test.md
│  ├─ commands/
│  │  ├─ unity-greybox.md
│  │  ├─ unity-build-android.md
│  │  └─ unity-content-gate.md
│  └─ skills/
│     ├─ unity-mcp-setup/SKILL.md
│     ├─ unity-2.5d-conventions/SKILL.md
│     ├─ perf-budget-check/SKILL.md
│     └─ asset-pipeline-tripo3d/SKILL.md             (dry-run default; --live opt-in)
├─ GDD.md.hbs                                         (template with placeholder sections)
├─ art-bible.md.hbs                                   (template)
├─ docs/perf-budget.md                                (overridable thresholds)
└─ Editor-templates/
   ├─ EnnamPreflight.cs                               (asserts Domain Reload disabled + URP mobile compliance)
   ├─ EnnamPerf.cs                                    (ProfilerRecorder harness for perf-budget-check)
   └─ README.md                                       (instructs user to copy into Assets/Editor/)

packages/cli/src/
├─ profiles.ts                                        (MODIFY: append game-unity entry; extraMcp = [])
├─ wizard.ts                                          (MODIFY: add "Game-Dev" Role branch → "Unity 2.5D mobile")
└─ ux.ts                                              (MODIFY: extend printNextSteps with uvx/adb prereq check; mention dry-run default for Tripo skill)

tests/
├─ unit/
│  ├─ profiles.test.ts                                (MODIFY: assert game-unity registered)
│  ├─ wizard.test.ts                                  (MODIFY: assert resolveProfile('Game-Dev', ..., 'Unity 2.5D Mobile') == 'game-unity')
│  ├─ game-unity-mcp-shape.test.ts                    (NEW: snapshot .mcp.json snippet against CoplayDev v9.7.3 README)
│  └─ game-unity-skill-discipline.test.ts             (NEW — was originally proposed as integration/asset-pipeline-tripo3d.test.ts;
│                                                      pivoted to content-assertion grep because the Tripo skill ships as a markdown
│                                                      instruction set for an LLM agent, not executable JS. There is no request/poll
│                                                      loop to msw-stub. Greps SKILL.md for literal `--dry-run` enforcement language
│                                                      so a future edit dropping the dry-run gate fails CI — directly satisfies
│                                                      Judge objection #1 "enforced inside skill body, not just documented".)
└─ integration/
   └─ profiles/
      └─ game-unity.test.ts                           (NEW — was originally proposed as tests/integration/install-game-unity.test.ts;
                                                       moved to tests/integration/profiles/ to match Rule 11 — all other profile
                                                       install tests live under tests/integration/profiles/<name>.test.ts
                                                       (e.g., devops-docker.test.ts, react.test.ts). Functionally equivalent:
                                                       dogfood install asserts profile files emit + .mcp.json merges Unity correctly.)

templates/game-unity/.claude/skills/asset-pipeline-tripo3d/
└─ fixtures/
   └─ tripo-image-to-model-success.json               (NEW — fixture for --dry-run mode; example.invalid URLs that never resolve
                                                       so a misconfigured live invocation crashes loud rather than fetching a real
                                                       file. Already named by spec §5 paragraph "Fixture file path"; now also
                                                       enumerated in §3 file tree for completeness.)

scripts/
└─ verify-game-unity-bake.ts                          (NEW maintainer script — NOT in published artifact)

CHANGELOG.md                                          (MODIFY/CREATE: v1.8.0 entry)
.serena/memories/
├─ decisions/game-unity-v1.8.0-bigbang-safety-harness.md   (NEW via Serena MCP)
├─ INDEX.md                                                 (MODIFY: link new decision)
└─ checkpoint/tech-lead-2026-06-26.md                       (NEW via Serena MCP)
```

## 4. CLAUDE.md.partial.hbs structure

Sections in order:
1. `## Role: Unity 2.5D mobile game-dev (URP)` + stack table
2. `### Conventions` — 10 rules (verbatim from §2.3 design)
3. `### Common commands` — Unity batchmode + ADB + LFS + prereq checks
4. `<!-- BEGIN:game-unity-workflow -->` marker block — 8-phase workflow table + 4 content gates explanation
5. `<!-- BEGIN:game-unity-agent-rules -->` marker block — hard constraints (lock-Z, no free-3D, closed-loop, disable Domain Reload, gate bypass forbidden, LFS check)

## 5. Tripo skill `--dry-run` default enforcement (Judge objection #1)

The skill SKILL.md MUST:
- Open with: "**This skill defaults to `--dry-run`. Real Tripo API calls require explicit `--live` flag + interactive confirmation on first invocation.**"
- Define a `dry_run_invariant`: every `POST /v2/openapi/task` call site in the procedure must be preceded by an explicit branch on `live_mode`. The "request" step is described as: "IF `--live` flag set AND user has confirmed Pro tier active → POST. ELSE → return canned response from fixture file."
- Fixture file path: `.ennam/asset-pipeline/fixtures/tripo-image-to-model-success.json` (skill ships a copy as `templates/game-unity/.claude/skills/asset-pipeline-tripo3d/fixtures/`)
- Logging both modes: every invocation prints "MODE: dry-run" or "MODE: LIVE (paying Tripo Pro tier)" as the first line

## 6. Test coverage matrix

| Test | Type | Asserts |
|---|---|---|
| `tests/unit/profiles.test.ts` | unit (modified) | `getProfile('game-unity')` returns valid def; listProfiles includes it; extraMcp = [] (Unity MCP comes via own partial) |
| `tests/unit/wizard.test.ts` | unit (modified) | `resolveProfile('Game-Dev', 'Existing repository', undefined, undefined, 'Unity 2.5D Mobile')` returns `'game-unity'`; missing gameStack throws |
| `tests/unit/game-unity-mcp-shape.test.ts` | unit (new) | Loaded `.mcp.json.partial.hbs` parses as JSON; has `unity` server key with `uvx` command + `coplay-mcp-server` arg + `mcp-for-unity` + `--transport stdio` + `MCP_TOOL_TIMEOUT >= 60_000` env (asserts CoplayDev v9.7.3 README shape) |
| `tests/unit/game-unity-skill-discipline.test.ts` | unit (new — replaces the originally-proposed `tests/integration/asset-pipeline-tripo3d.test.ts`) | Greps `asset-pipeline-tripo3d/SKILL.md` for literal `--dry-run` enforcement language: defaults-to-dry-run declaration, `MODE: dry-run` + `MODE: LIVE` per-invocation lines, CC BY 4.0 NON-COMMERCIAL warning, no-hard-coded-balance-endpoint instruction, Meshy NEVER-auto-fallback rule. Also asserts fixture JSON exists + `unity-mcp-setup/SKILL.md` mentions uvx/3.11/Domain Reload/EnnamPreflight + `unity-2.5d-conventions/SKILL.md` has 10 numbered rule headings. **Rationale for pivot**: the Tripo skill ships as a markdown instruction set for an LLM agent — there is no executable JS request/poll loop to msw-stub. Content-assertion is the correct altitude per Judge objection #1 ("enforced inside skill body, not just documented"). |
| `tests/integration/profiles/game-unity.test.ts` | integration (new — moved from spec's originally-proposed `tests/integration/install-game-unity.test.ts` to `tests/integration/profiles/` subdir per Rule 11; all other profile install tests live there) | Fresh install of `game-unity` profile into tmpdir → asserts 19 expected files emit, `CLAUDE.md` has both marker blocks (`game-unity-workflow` + `game-unity-agent-rules`) and 8-phase + Content Gates language, `.mcp.json` merged correctly (serena + context7 + jira + unity), `.gitattributes` has LFS rules for `.fbx .png .wav` but NOT for `.unity .prefab` (Smart Merge guard), gameplay-engineer agent forbids asset/build work, asset-pipeline agent says NEVER auto-fallback Tripo→Meshy |

## 7. CHANGELOG.md v1.8.0 entry (sketch)

```markdown
## v1.8.0 — 2026-06-26

### Added
- **`game-unity` profile** — Unity 2.5D mobile (URP) game-dev scaffold
  - 3 agents (gameplay-engineer, asset-pipeline, build-and-test) + 3 commands + 4 skills
  - `CLAUDE.md.partial.hbs` with 10 Unity 2.5D conventions + 8-phase workflow incl. Phase 6 Content Gates (Design/Art/Feel/Perf, human sign-off)
  - Unity MCP via CoplayDev/unity-mcp v9.7.3 baked into `.mcp.json.partial.hbs`; `--unity-mcp-flavor` CLI flag prepared for `ivanmurzak` + `official` fallback
  - Tripo3D as default 3D asset gen (Pro tier $13.93/mo annual minimum — Free tier = CC BY 4.0 NON-COMMERCIAL, unusable for commercial games); Meshy `--provider meshy` opt-in fallback
  - **`--dry-run` default for `asset-pipeline-tripo3d` skill**: real API calls require explicit `--live` + interactive Pro-tier confirmation
  - GDD.md + art-bible.md + perf-budget.md templates emitted on install
  - Editor templates `EnnamPreflight.cs` + `EnnamPerf.cs` for Unity-side preflight + ProfilerRecorder harness
- `_shared/.gitattributes.append` — Unity LFS standard rules

### Known [UNVERIFIED]
- Tripo3D balance endpoint URL: previously proposed `/v2/openapi/user/balance` is unverified per pre-publish research; skill reads live OpenAPI schema OR shells out to `tripo3d` Python SDK `get_balance()` to avoid hard-coding
- Maintainer pre-publish: run `scripts/verify-game-unity-bake.mjs` to spot-check CoplayDev `uvx` invocation + Tripo balance handshake before tagging release
- `perf-budget-check` skill requires Unity Editor + ProfilerRecorder API; ships as advisory (not blocking) in v1.8.0 — gated by `EnnamPerf.cs` editor harness compile

### Wizard
- New top-level role: **Game-Dev** → "Unity 2.5D mobile"
```

## 8. Out of scope (v1.8.0)

- Bootstrap a Unity project (user pre-creates)
- `game-unity-2d` or `game-unity-3d` variants
- `game-godot` / `game-unreal` profiles
- Sprite AI MCP (omit per research; pointer in CLAUDE.md to `pixelforge-mcp` + `spritecook-mcp`)
- Unity official `com.unity.ai.assistant` flavor (blocked on package exiting `-pre.3`)
- Automated CI gate for Tripo live test (requires Python + Tripo API key in CI; deferred)

## 9. Verification gate (before user publishes v1.8.0)

1. `npm run build` → 0 errors
2. `npm test` → all green (39+ existing + 3 new = 42+ files)
3. (Maintainer-only) `node scripts/verify-game-unity-bake.mjs` → CoplayDev `uvx` parse OK; Tripo balance handshake OK (requires `TRIPO_API_KEY` env)
4. Dogfood install: `node packages/cli/dist/index.js --profile game-unity --no-prompts` in a tmp dir → 19 files emit; CLAUDE.md has both marker blocks; .mcp.json validates as JSON

User signs off → bump `package.json` version to `1.8.0` → `npm publish` (user-controlled, not this session).
