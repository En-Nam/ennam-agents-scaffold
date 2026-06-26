---
description: Kickoff a Phase 4 (Implement) greybox slice — minimal-art prototype of a gameplay system. Combines `gameplay-engineer` for the C# + a placeholder cube/sprite from `asset-pipeline` (dry-run by default).
---

Use `/unity-greybox <feature-name>` to start a greybox slice.

## What it does

1. Verifies prerequisites: Unity Editor running, MCP bridge connected (`unity-mcp-setup` skill), worktree clean.
2. Dispatches `gameplay-engineer` agent with the spec from `docs/superpowers/specs/<latest-feature>.md`.
3. Dispatches `asset-pipeline` agent (dry-run mode) to emit greybox placeholder sprites/meshes under `Assets/Generated/_greybox/`.
4. Returns when both agents have closed their loops (compile clean + console no error + greybox imported).

## What it does NOT do

- Live Tripo API calls (use `--live` flag explicitly to opt in)
- Phase 5 Verify / Phase 6 Content Gates (those are separate)
- Build / deploy to device (use `/unity-build-android`)

## Arguments

- `<feature-name>` — slug matching the spec filename under `docs/superpowers/specs/`. Required.
- `--live` — pass-through to `asset-pipeline-tripo3d` skill to make real Tripo API calls.

## Example

```
/unity-greybox player-jump
```

Outputs:
- C# in `Assets/Scripts/Gameplay/PlayerJump/`
- Greybox sprite in `Assets/Generated/_greybox/player_jump/`
- Both verified compile-clean + console-no-error
