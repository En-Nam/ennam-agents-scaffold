# game-unity profile

Unity 2.5D mobile (URP) scaffold for `@ennamjsc/agents-scaffold` v1.8.0+.

## Prerequisites (host machine)

| Tool | Version | Install |
|---|---|---|
| Unity Editor | 6.5 primary; supported 6000.0, 2022.3 LTS, 2021.3 LTS | https://unity.com/download |
| Python | ≥ 3.11 (required by Coplay Unity MCP bridge) | https://www.python.org/downloads/ |
| `uv` / `uvx` | latest | https://docs.astral.sh/uv/getting-started/installation/ |
| ADB (Android Platform Tools) | latest | https://developer.android.com/tools/releases/platform-tools |
| Git LFS | ≥ 3.x | https://git-lfs.com/ |
| Node | ≥ 20 (for this scaffold CLI itself) | https://nodejs.org/ |

## Install

Run the scaffold from your Unity project root (folder containing `Assets/`, `Packages/`, `ProjectSettings/`):

```bash
# Interactive
npx @ennamjsc/agents-scaffold

# Non-interactive
npx @ennamjsc/agents-scaffold --profile game-unity --no-prompts
```

The scaffold emits:

```
your-unity-project/
├─ .claude/                        # agents, commands, skills, settings
├─ .serena/                        # memory store
├─ .mcp.json                       # Unity MCP (Coplay) + serena + context7 + jira (merged)
├─ CLAUDE.md                       # scaffold-managed block + your project-specific context above
├─ AGENTS.md                       # 13 behavioral rules
├─ GDD.md                          # game design doc skeleton (fill in)
├─ art-bible.md                    # art style/palette/forbidden (fill in)
├─ docs/
│  ├─ perf-budget.md               # overridable perf thresholds
│  └─ superpowers/                 # specs/ and plans/
├─ Editor-templates/               # copy EnnamPreflight.cs + EnnamPerf.cs → Assets/Editor/ yourself
└─ .gitattributes                  # Git LFS rules for Unity binary assets
```

## Post-install one-time setup

### 1. Configure Unity MCP (Coplay)

In Unity Editor: `Window → Package Manager → + → Add package from git URL` →

```
https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#v9.7.3
```

Then `Window → MCP for Unity → Configure All Detected Clients`. Unity will write `.mcp.json` entries for Claude Code automatically (the scaffold has also written one).

Open the project — the bridge auto-connects when the Editor and the MCP host are both running.

### 2. Copy Editor templates into your Unity project

```bash
# From your Unity project root
mkdir -p Assets/Editor
cp Editor-templates/EnnamPreflight.cs Assets/Editor/
cp Editor-templates/EnnamPerf.cs Assets/Editor/
```

Open Unity once after copying. Both scripts compile and:
- `EnnamPreflight` checks Domain Reload disabled + URP mobile compliance, prints to Console
- `EnnamPerf` exposes the `EnnamPerf.RunBudgetCheck` static method for the `perf-budget-check` skill

### 3. Disable Domain Reload (required for Unity MCP bridge stability)

`Edit → Project Settings → Editor → Enter Play Mode Settings`:
- ✅ Enter Play Mode Settings (enabled)
- ✅ Reload Domain (UNCHECKED)
- ✅ Reload Scene (UNCHECKED)

If you skip this, the Unity MCP bridge drops on every Play Mode toggle — the `unity-mcp-setup` skill will surface the failure loud (Rule 12).

### 4. Initialize Git LFS

```bash
git lfs install
git add .gitattributes
git commit -m "Add Git LFS rules"
```

The `.gitattributes` file tracks `.fbx .glb .gltf .obj .png .jpg .jpeg .psd .tga .tif .wav .ogg .mp3 .mp4` in LFS by default. `.unity .prefab .asset` are NOT LFS (Unity Smart Merge needs text diffs).

### 5. Set environment variables

```bash
# Required for 3D asset generation (asset-pipeline-tripo3d skill)
export TRIPO_API_KEY="tsk_..."   # mint at https://platform.tripo3d.ai/api-keys
# Pro tier ($13.93/mo annual / $19.90/mo monthly) is the MINIMUM for commercial games —
# Free tier outputs are CC BY 4.0 NON-COMMERCIAL.

# Optional: Meshy fallback for rigged characters
export MESHY_API_KEY="msy_..."   # only if you'll use `--provider meshy`
```

The Tripo skill defaults to **`--dry-run`** mode — it returns canned fixture responses and does NOT call the live API. To make real API calls, pass `--live` and confirm Pro-tier active on first invocation. See [`asset-pipeline-tripo3d/SKILL.md`](.claude/skills/asset-pipeline-tripo3d/SKILL.md).

## CLI flags

| Flag | Default | Meaning |
|---|---|---|
| `--unity-mcp-flavor coplay\|ivanmurzak\|official` | `coplay` | Which Unity MCP bridge to wire. `official` emits TODO block — blocked on `com.unity.ai.assistant` exiting `-pre`. |

## What's NOT in v1.8.0

- Unity 2D-only and 3D-only variants (`game-unity-2d`, `game-unity-3d`)
- Godot / Unreal profiles
- A Sprite AI MCP baked in (see CLAUDE.md "Sprite AI" section for pointers)
- Bootstrap of a Unity project (you create the Unity project first)
- Automated CI gate for Tripo live test (requires Python + Tripo API key in CI — deferred)
