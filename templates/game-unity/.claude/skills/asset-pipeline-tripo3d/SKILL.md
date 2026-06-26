---
name: asset-pipeline-tripo3d
description: Use when generating a new 3D asset for Unity 2.5D mobile via Tripo3D REST. Handles auth + balance check + license confirm + request + poll + download + Unity import + ASTC compression. DEFAULTS TO --dry-run; real API calls require explicit --live flag + interactive Pro-tier confirmation. Meshy --provider meshy opt-in fallback for rigged characters.
---

# **This skill defaults to `--dry-run`. Real Tripo API calls require explicit `--live` flag + interactive confirmation on first invocation.**

`--dry-run` mode returns canned fixture responses from `fixtures/tripo-image-to-model-success.json` and does NOT call the live API. This protects against:
- Accidental burn of paid Tripo credits during exploration
- Drift between the SDK's REST surface and what this skill documents (the maintainer pre-publish gate `scripts/verify-game-unity-bake.mjs` snapshots the live SDK shape; SKILL.md procedure ALWAYS routes through the official Python SDK rather than hand-crafted curl so we get SDK-managed auth/error/retry behavior)

Every invocation logs `MODE: dry-run` or `MODE: LIVE (paying Tripo Pro tier)` as the first line. If neither prints, the skill was invoked incorrectly — STOP and re-read this file.

# Hard constraint (licensing blocker)

- Tripo Free tier outputs = **CC BY 4.0 NON-COMMERCIAL**. NOT usable for any commercial mobile game, even with attribution.
- **Pro tier ($13.93/mo annual / $19.90/mo monthly) is the minimum to ship a commercial game.**
- First `--live` run: print license summary + require interactive confirmation:
  - "Is this project commercial? [Y/n]"
  - If Y → "Is your Tripo Pro/Max plan active? [Y/n]" — if N, STOP.
  - If N → "Project is non-commercial / learning-only — proceed with Free tier? [y/N]" — if N, STOP.

# When to apply

- New asset request from `art-bible.md` with text/image input
- Re-generate at a different polycount (LOD0 / LOD1 / LOD2)
- Rig existing Tripo mesh (chain `animate_rig`)

# Procedure

## Step 1 — Mode declaration

```
echo "MODE: dry-run"   # default
echo "MODE: LIVE (paying Tripo Pro tier)"   # only if --live AND license confirmed
```

## Step 2 — AUTH GATE (live mode only; dry-run skips)

```bash
[ -n "$TRIPO_API_KEY" ] || {
  echo "TRIPO_API_KEY missing. Mint at https://platform.tripo3d.ai/api-keys"
  echo "Pro tier (\$13.93/mo annual / \$19.90/mo monthly) is the minimum to ship commercial."
  exit 2
}
```

Balance check — **prefer the official Python SDK over hand-crafted curl**. The SDK manages auth headers, error parsing, and retries; calling raw REST means re-implementing those plus tracking endpoint moves. Do NOT hard-code REST paths in your skill's own code when an SDK method exists.

The official SDK is `tripo3d` on PyPI (`VAST-AI-Research/tripo-python-sdk`, MIT). Class = `TripoClient` (NOT `Tripo3D`); all methods are **async** — must wrap in `asyncio.run`. Base URL = `https://api.tripo3d.ai/v2/openapi` (set by `TripoClient.BASE_URL`).

```python
# Live mode (run via: uvx --from tripo3d python -c '<this script>')
import os, asyncio, dataclasses
from tripo3d import TripoClient

async def check():
    c = TripoClient(api_key=os.environ["TRIPO_API_KEY"])
    try:
        bal = await c.get_balance()          # → Balance(balance, frozen)
        print(f"Balance: {bal.balance} credits (frozen: {bal.frozen})")
    finally:
        await c.close()                       # async close

asyncio.run(check())
```

Print balance + estimated cost preview. Abort if `balance < estimated_cost`. (For SDK provenance + per-method signatures, see `scripts/verify-game-unity-bake.mjs` Check 4.)

## Step 3 — REQUEST

The SDK exposes `TripoClient.image_to_model()` and `TripoClient.text_to_model()` — use those instead of raw POST. Real `model_version` values (verified via SDK signature inspection at v1.8.0 publish time):

- **Quality**: `v3.1-20260211` (default for hero assets)
- **Speed**: `Turbo-v1.0-20250506` (~10s gen, lower fidelity — good for greybox / iteration)
- **New low-poly mode**: `P1-20260311` (Smart Mesh P1 — purpose-built for game-ready clean topology)
- Older: `v3.0-20250812`, `v2.5-20250123` (SDK default), `v2.0-20240919`, `v1.4-20240625`

```python
# Live mode
task_id = await client.image_to_model(
    image=image_url,                          # str: URL or file token
    model_version="v3.1-20260211",            # quality default for hero
    face_limit=8000,                          # LOD0 mobile-gameplay default
    texture=True,
    pbr=True,
    auto_size=True,                           # NOTE: SDK param is `auto_size`, NOT `auto_scale`
    quad=False,                               # tris OK for Unity mobile; quad has ~$0.05 surcharge
    texture_quality="standard",               # or "detailed"
    geometry_quality="standard",              # or "detailed"
)
# task_id is a plain str — persist immediately

# Dry-run mode
import json, pathlib
fixture = json.loads(pathlib.Path("fixtures/tripo-image-to-model-success.json").read_text())
task_id = fixture["data"]["task_id"]          # "00000000-0000-0000-0000-fixture00001"
```

Polycount defaults (apply via `face_limit`):
- LOD0 (hero): 8000
- LOD1: 4000
- LOD2: 1500

Persist `task_id` → `.ennam/asset-pipeline/jobs/<task_id>.json` (crash recovery via `--resume <task_id>`).

## Step 4 — POLL

Use the SDK's built-in `wait_for_task` — it implements the poll loop with a single call, returns a `Task` object whose `.status` is a `TaskStatus` enum.

```python
from tripo3d import TaskStatus

task = await client.wait_for_task(
    task_id,
    polling_interval=3.0,                     # 3s for Turbo, 8s for Standard
    timeout=300,                              # 5 min hard cap
    verbose=False,
)

# task.status ∈ {QUEUED, RUNNING, SUCCESS, FAILED, CANCELLED, UNKNOWN, BANNED, EXPIRED}
if task.status == TaskStatus.SUCCESS:
    pass  # → step 5
elif task.status == TaskStatus.FAILED:
    raise RuntimeError(f"Tripo task failed: {task}")  # → surface to user, NEVER auto-fallback
else:
    raise RuntimeError(f"Unexpected task.status={task.status}; resume with --resume {task_id}")
```

On `FAILED`: ask the user "Retry Tripo, or switch to `--provider meshy`?" (Rule 12 — NEVER auto-fallback).
On `timeout`: instruct `--resume <task_id>` on re-run.

Dry-run: skip the SDK call; synthesize a Task with `status=TaskStatus.SUCCESS` from the fixture.

## Step 5 — DOWNLOAD

Use the SDK's `download_task_models` — it handles signed URL expiry, retries, and writes a `{kind: local_path}` map.

```python
files = await client.download_task_models(task, "Assets/Generated/<slug>/source/")
# files == {"model": ".../source/...glb", "pbr_model": ".../source/...glb", "rendered_image": "...png"}
```

Compute + persist SHA256 next to each file (`<slug>/source/<file>.sha256`) — idempotency on re-runs.

Note on Tripo retention: third-party summary reports ~24h for Free tier (not contractual SLA). Download immediately regardless of tier — do not treat Tripo as a CDN.

## Step 6 — UNITY IMPORT (deterministic, no LLM — Rule 5)

Apply `ModelImporter` preset (write the `.meta` override deterministically; do NOT ask the LLM):

- `meshCompression: 1` (Medium)
- `importAnimation: 0` unless `animate_rig` was the task type
- `bakeAxisConversion: 1`
- `globalScale: 1`

Texture preset (write `.png.meta` override):

- `maxTextureSize: 1024`
- `textureCompression: 1` (Compressed)
- `androidETC2FallbackOverride: 1`
- `platformSettings`: Android → `textureFormat: 48` (ASTC_6x6)
- `mipmapEnabled: 0` if asset lives under `Assets/UI/` or `Assets/HUD/`
- `isReadable: 0`

## Step 7 — OPTIONAL RIG

If `--rig` flag passed: use the SDK's dedicated `rig_model` method (NOT a chained generic POST). `rig_model` is its own task type with its own model versions.

```python
from tripo3d import RigType, RigSpec

rigged_task_id = await client.rig_model(
    original_model_task_id=task_id,           # the task_id from step 3
    model_version="v2.0-20250506",            # or "v1.0-20240301"
    out_format="fbx",                         # or "glb"
    rig_type=RigType.BIPED,                   # only humanoid biped supported in v1.8.0
    spec=RigSpec.TRIPO,
)
# Then re-run wait_for_task + download_task_models for the rigged result.
```

## Step 8 — FALLBACK (OPT-IN, never silent)

`--provider meshy` swaps body shape to Meshy's `POST /openapi/v2/image-to-3d`:

```bash
[ -n "$MESHY_API_KEY" ] || { echo "MESHY_API_KEY missing"; exit 2; }

curl -X POST "https://api.meshy.ai/openapi/v2/image-to-3d" \
  -H "Authorization: Bearer $MESHY_API_KEY" \
  -d '{
    "image_url": "...",
    "ai_model": "meshy-6",
    "topology": "triangle",
    "target_polycount": 8000,
    "should_texture": true,
    "should_remesh": true,
    "enable_pbr": true
  }'
```

Document divergence in skill output: "Switched provider: Tripo → Meshy. Meshy strengths: rigged characters + 500+ preset animation library."

## Step 9 — SUMMARY

```
MODE: LIVE (Tripo)
<slug>: 7842 tris, 3 mats, 2 textures @ 1024 ASTC. Cost: $0.32. Ready in Assets/Generated/<slug>/
```

Dry-run summary:

```
MODE: dry-run
<slug>: [FIXTURE] 7842 tris, 3 mats, 2 textures @ 1024 ASTC. Cost: $0.00 (dry-run, no API call). Fixture loaded from fixtures/tripo-image-to-model-success.json
```

# Pre-publish verification (maintainer-only — blocks `npm publish`)

Before tagging v1.8.0, the scaffold maintainer MUST run:

```bash
node scripts/verify-game-unity-bake.mjs
```

The script (excluded from the published artifact — see `packages/cli/package.json` `files` field) hits the live Tripo SDK with a `TRIPO_API_KEY` env to capture:

1. SDK version + class shape (Check 4 confirms `from tripo3d import TripoClient` succeeds, `get_balance()` is async-coroutine returning a Balance dataclass)
2. Live balance handshake hits real Tripo endpoint (verified at v1.8.0 publish: `GET https://api.tripo3d.ai/v2/openapi/user/balance` via `TripoClient.BASE_URL + /user/balance`)

If the script reports any divergence from this SKILL.md's procedure (e.g., SDK rename, new required parameter, deprecated method), update the procedure BEFORE publish. Results are summarized in `.serena/memories/decisions/game-unity-v1.8.0-bigbang-safety-harness.md` "Verification" appendix.

# Configuration

`docs/perf-budget.md` is read for default `face_limit` overrides:

```yaml
asset_pipeline:
  face_limit_default: 8000
  face_limit_lod1: 4000
  face_limit_lod2: 1500
```
