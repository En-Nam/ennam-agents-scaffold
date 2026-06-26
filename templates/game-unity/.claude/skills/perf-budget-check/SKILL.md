---
name: perf-budget-check
description: Use after Phase 5 (Verify) on any change that adds rendering load (new scene, new shader, new high-poly mesh, new lighting setup). Runs a playmode editor harness via Assets/Editor/EnnamPerf.cs, dumps Profiler counters (draw calls / SetPass / triangles / texture memory), compares to budget in docs/perf-budget.md.
---

# Hard constraint

This skill is **NOT a static lint**. It requires running Unity Editor in playmode (`-runTests -batchmode -testPlatform PlayMode` or interactive). It cannot be enforced from CI without a Unity license + Editor install on the runner.

# When to apply

- Phase 5 (Verify) complete on a perf-sensitive slice — new scene/level, new shader/material, new asset > 5 MB
- Pre-PR if the change added: Light, PostProcess volume, or SpriteAtlas
- Weekly health check on `main`

# Prerequisites

- `Assets/Editor/EnnamPerf.cs` present (copied from `Editor-templates/EnnamPerf.cs` per README §2)
- Unity Editor 6.5+ (uses `ProfilerRecorder` API stable since Unity 2022)
- A scene to bench: read from `docs/perf-budget.md` `bench_scenes:` list

# Procedure

## Step 1 — Confirm harness compiled

```bash
"$UNITY" -batchmode -nographics -projectPath . \
  -executeMethod EnnamPerf.SelfTest -logFile perf-selftest.log -quit
```

`SelfTest` is a one-line `Debug.Log("[ennam-perf] harness ok")` — surfaces compile failure of `EnnamPerf.cs` early.

## Step 2 — Run budget check (playmode)

```bash
"$UNITY" -batchmode -nographics -projectPath . \
  -executeMethod EnnamPerf.RunBudgetCheck \
  -logFile perf-budget-check.log -quit
```

The harness:
1. Loads each scene listed under `bench_scenes:` in `docs/perf-budget.md`
2. Enters Play Mode (Domain Reload disabled — see `unity-mcp-setup` skill)
3. Uses `ProfilerRecorder` to sample 300 frames after warmup of 60 frames
4. Captures: draw calls, SetPass calls, triangles, allocated texture memory
5. Writes results to `.ennam/perf/last-run.json` (machine-readable)
6. Exits with code 0 (PASS) / 1 (WARN — exceeded soft budget) / 2 (FAIL — exceeded hard budget by ≥ 1.2x)

## Step 3 — Compare against budget

Read `docs/perf-budget.md`:

```yaml
budget:
  draw_calls_per_frame: 100
  set_pass_per_frame: 50
  triangles_visible: 100000
  texture_memory_mb_resident: 300

bench_scenes:
  - Assets/Scenes/Bench.unity        # add your own
```

The harness prints a per-scene line:

```
Scenes/Level01: 87 draws (budget 100), 92k tris (100k), 215 MB tex (300) — PASS
Scenes/Level02: 124 draws (budget 100), 110k tris (100k), 280 MB tex (300) — WARN (draws > 1.0x ≤ 1.2x)
Scenes/Boss:    150 draws (budget 100), 200k tris (100k), 410 MB tex (300) — FAIL (all > 1.2x)
```

# Output

- `.ennam/perf/last-run.json` — machine-readable; consumed by `unity-2.5d-conventions` rule #8 (advisory freshness check)
- Human summary table per bench scene
- Exit code 0 / 1 / 2 (mapped to PASS / WARN / FAIL)

# Failure handling

- **WARN**: log the over-budget metric, do not block PR. User decides whether to optimize.
- **FAIL**: surface the failing scene + metric + diff vs last good run (if `.ennam/perf/last-run.json` exists). Suggest concrete fixes from `unity-2.5d-conventions` rules #5 (atlas size), #6 (batching), #4 (sprite max size).
- **NO BUDGET FILE**: if `docs/perf-budget.md` is missing or has no `budget:` block, surface as a setup error (Rule 12) — do NOT silently use defaults.

# Limitations

- Cannot run in CI without Unity license + Editor install on the runner (deferred to v1.8.x)
- ProfilerRecorder is sampling-based; 300 frames may not catch worst-case spikes — use this skill as a baseline check, not a stress test
- Numbers (100 draws / 100k tris / 300 MB tex) are community-aggregated rules of thumb for mid-tier Android (60 fps target). Override per project via `docs/perf-budget.md`.
