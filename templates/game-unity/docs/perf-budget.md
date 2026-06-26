# Perf budget — {{projectName}}

> Mid-tier Android (60 fps target). Override per project — these are scaffold defaults aggregated from community guides, NOT Unity-published specs.
> Used by `perf-budget-check` skill (auto) and `unity-2.5d-conventions` skill rules #5, #8.

## Rendering budget (per frame, per scene)

```yaml
budget:
  draw_calls_per_frame: 100
  set_pass_per_frame: 50
  triangles_visible: 100000
  texture_memory_mb_resident: 300

# Fail when measured > 1.2x of any hard budget above (perf-budget-check exit code 2).
# Warn when measured > 1.0x but ≤ 1.2x (exit code 1).
warn_threshold_multiplier: 1.0
fail_threshold_multiplier: 1.2
```

## Asset pipeline polycount defaults

```yaml
asset_pipeline:
  face_limit_default: 8000    # LOD0 hero
  face_limit_lod1: 4000
  face_limit_lod2: 1500
```

## Atlas size limit (rule #5)

```yaml
atlas:
  max_texture_size: 2048
  max_uncompressed_bytes: 16777216   # 16 MB; N*N*4 bytes RGBA8 at 2048 = exactly this
  padding_min: 4
  tight_packing: true
```

## Bench scenes (consumed by perf-budget-check)

```yaml
bench_scenes:
  # Add the scenes you want benchmarked. perf-budget-check loads each, enters
  # PlayMode, samples 300 frames after 60-frame warmup.
  # - Assets/Scenes/Bench.unity
  # - Assets/Scenes/Level01.unity
  # - Assets/Scenes/Level02.unity
```

## Project constants (read by unity-2.5d-conventions rule #7)

```yaml
project:
  pixels_per_unit: 100
  allowed_pivots:
    - Bottom    # x: 0.5, y: 0
    - Center    # x: 0.5, y: 0.5
    - Top       # x: 0.5, y: 1
```

## Overriding budgets

A scene that genuinely needs a higher budget (e.g., a boss arena) can opt out per-scene by adding to `.ennam/perf/overrides.json`:

```json
{
  "scenes": {
    "Assets/Scenes/BossArena.unity": {
      "draw_calls_per_frame": 150,
      "triangles_visible": 150000
    }
  }
}
```

Per-scene overrides are PR-reviewable — diff them in code review and justify in the Phase 6 Perf gate comment.

---

**Caveats**:
- These numbers are community-aggregated rules of thumb (Unity blog 2025, GeneralistProgrammer 2025, Angry Shark Studio). Adjust to your target device tier.
- `set_pass_per_frame: 50` and `texture_memory_mb_resident: 300` are low-medium confidence per pre-publish research — treat as starting defaults.
- `perf-budget-check` requires a Unity Editor + ProfilerRecorder API (cannot run in CI without a Unity license on the runner).
