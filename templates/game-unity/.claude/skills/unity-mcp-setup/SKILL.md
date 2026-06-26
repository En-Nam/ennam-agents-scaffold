---
name: unity-mcp-setup
description: Use BEFORE the first Unity MCP call in any session — validates Unity Editor is running, MCP bridge is connected, prereqs (uvx + Python ≥ 3.11) are present, and Domain Reload is disabled. Fail loud (Rule 12) if any check fails.
---

# When to apply

Run as the **first check** of any session that will call `mcp__unity__*` tools. If any check fails, surface the fix to the user and STOP — do not attempt to work around.

# Procedure (decision tree)

## Step 1 — Host prerequisites

```bash
command -v uvx       >/dev/null || { echo "[ennam] Install uv: https://docs.astral.sh/uv/getting-started/installation/"; exit 2; }
python3 --version    # require ≥ 3.11
```

If `python3 --version` < 3.11, STOP. Print: `Install Python 3.11+ from https://www.python.org/downloads/ and re-run.`

## Step 2 — Unity Editor running

Try `mcp__unity__ping` (or first read-only call like `mcp__unity__get_active_scene`). If no response within 3s:

- Check the Unity Editor process is running (psutil / `tasklist | findstr Unity.exe` on Windows; `pgrep -f Unity` on Unix).
- **If not running**: instruct the user to open Unity Editor + verify `Window → MCP for Unity` window shows "Connected".
- **If running but bridge silent**: check Unity Editor's Console for bridge errors (search for `[MCP]`); the CoplayDev bridge logs handshake state on Editor open.

## Step 3 — Editor preflight script

The scaffold has emitted `Editor-templates/EnnamPreflight.cs`. The user copies it to `Assets/Editor/EnnamPreflight.cs` (one-time, per project — README §2).

`EnnamPreflight` runs on every Editor open (via `[InitializeOnLoad]`) and asserts:

- `EditorSettings.enterPlayModeOptionsEnabled == true && (EditorSettings.enterPlayModeOptions & EnterPlayModeOptions.DisableDomainReload) != 0` — Domain Reload disabled
- URP Asset (`GraphicsSettings.currentRenderPipeline`) has HDR off, MSAA ≤ 2, PostFX disabled
- Cinemachine package resolved version (from `Packages/packages-lock.json`) ≥ 3.0

Violations are logged as Console errors. Read them via `mcp__unity__read_console` and surface to the user with the fix instruction inline.

## Step 4 — Self-test (scaffold-side, no Unity required)

The scaffold's `tests/unit/game-unity-mcp-shape.test.ts` snapshots the `.mcp.json.partial.hbs` shape against the CoplayDev v9.7.3 README. If the snapshot fails after a CoplayDev release, the scaffold maintainer must update the snippet — surface that as a maintainer issue, not a user issue.

# Output

- ✅ "Unity MCP ready — Editor connected, prereqs OK, Domain Reload disabled, URP mobile asset compliant, Cinemachine 3.x"
- ❌ One specific failure with the fix instruction. STOP — do not attempt to work around.

# Why this skill exists

Per CLAUDE.md hard constraint: **agent must not work around a broken Unity MCP bridge**. If the bridge is down, every `mcp__unity__*` call will silently fail or hang. The closed-loop discipline (Phase 4) depends on `compile_scripts` + `read_console` being responsive. Loud failure here saves hours of confused debugging later.
