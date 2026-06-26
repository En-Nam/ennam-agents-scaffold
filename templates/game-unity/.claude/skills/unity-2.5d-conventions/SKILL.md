---
name: unity-2.5d-conventions
description: Use BEFORE marking Phase 5 (Verify) complete on any change that touches scenes, prefabs, sprites, atlases, the camera rig, or URP renderer assets. Lints against the 10 rules in CLAUDE.md §Conventions.
---

# When to apply

- After implementing a gameplay feature that touched `Assets/Scenes/`, `Assets/Prefabs/`, or the Camera rig
- After importing new sprites via the `asset-pipeline` agent
- Before opening a PR that includes URP asset or Renderer asset changes

# Checklist (10 rules — each is a deterministic check)

## 1. Camera Z-script ban

```bash
# Grep gameplay code for forbidden Z mutations on Camera-tagged objects
grep -RnE 'Camera\.main\.[A-Za-z_]*\.position\.z\s*=' Assets/Scripts/
grep -RnE 'transform\.position\.z\s*=' Assets/Scripts/Gameplay/Camera*
```

FAIL if either grep returns a hit unless the enclosing method/class has the `[CameraZAllowed]` attribute (cutscene/shake opt-in).

## 2. SortingGroup + Custom Axis (0, 1, 0)

Parse the 2D Renderer `.asset` YAML (under `Assets/Settings/Renderer2D.asset` or similar). Assert:

- `m_TransparencySortMode: 4` (Custom Axis)
- `m_TransparencySortAxis: {x: 0, y: 1, z: 0}`

## 3. URP mobile renderer flags

Parse the URP Asset `.asset` YAML. Assert:

- `m_SupportsHDR: 0`
- `m_MSAA: 1` (no MSAA) or `2` (2x — acceptable on tile-based mobile)
- `m_RendererFeatures` does not include `UniversalRendererPostProcessing`
- `m_MainLightShadowsSupported: 0` or (`1` AND `m_MainLightShadowResolution: 1024` AND `m_MainLightShadowCascadeOption: 0`)
- `m_AdditionalLightsRenderingMode: 0` (Per-Vertex) or `2` (Disabled)

## 4. Sprite import

Walk every `*.png.meta` under `Assets/Sprites/` and `Assets/Generated/`:

- `textureType: 8` (Sprite)
- `maxTextureSize: 1024` (gameplay) or `2048` (full-screen background only — flag for human review)
- `textureFormat: -1` (Auto) — let platform overrides handle ASTC; OR explicit `48` (ASTC_6x6)
- `mipmapEnabled: 0` for sprites in `Assets/UI/` and `Assets/HUD/`
- `isReadable: 0`

## 5. Sprite Atlas

Parse each `*.spriteatlas` YAML. Assert:

- `maxTextureSize: 2048` (NEVER 4096)
- `padding: ≥ 4`
- `enableTightPacking: 1`
- Refuse atlases where `N*N*4 > 16_777_216` (16 MB uncompressed RGBA8) — configurable via `docs/perf-budget.md`

## 6. Batching

For every Prefab containing a SpriteRenderer (grep `m_Sprite:` in `.prefab` YAML):

- Assert `sharedMaterial.GUID` matches the project's default sprite material OR the sprite is packed in a SpriteAtlas asset (grep `.spriteatlas` for the sprite GUID)

## 7. Pivot / PPU

Walk sprite `.meta` files:

- `pixelsPerUnit:` matches the project constant (parsed from `docs/perf-budget.md` or `.ennam/conventions.json`)
- `pivot:` ∈ {`{x: 0.5, y: 0}` (Bottom), `{x: 0.5, y: 0.5}` (Center), `{x: 0.5, y: 1}` (Top)} — no fractional Custom pivots

## 8. Perf budget (advisory)

Defer to the `perf-budget-check` skill (requires playmode editor harness). This rule is **advisory** — does not block PR. If the `.ennam/perf/last-run.json` file is older than 7 days, surface a warning: "Perf budget not re-measured in 7+ days; consider running `perf-budget-check`."

## 9. Profiler harness presence

Assert `Assets/Editor/EnnamPerf.cs` exists. If missing, instruct the user to copy from `Editor-templates/EnnamPerf.cs` (Rule 12 — do not silently skip the perf check).

## 10. Cinemachine version

Read `Packages/packages-lock.json` (NOT `manifest.json`). Find the entry for `com.unity.cinemachine`. Assert resolved version's major ≥ 3.

If major == 2: the user must pass `--legacy` to the scaffold's invocation. If they didn't, surface: "Cinemachine 2.x detected — re-run scaffold with `--legacy` to use CM 2.x field-name maps."

# Output

- **PASS list**: rules that passed (one line each)
- **FAIL list**: rule number + file:line + fix hint
- **Block PR** if any FAIL is in severity `error` (configurable via `.ennam/2.5d-conventions.json` — defaults are: rules 1-7, 9-10 = error; rule 8 = warn)

# Configuration

Create `.ennam/2.5d-conventions.json` to override severity per rule:

```json
{
  "rules": {
    "1": "error",
    "2": "error",
    "8": "warn",
    "10": "warn"
  }
}
```
