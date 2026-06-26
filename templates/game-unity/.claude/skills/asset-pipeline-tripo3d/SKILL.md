---
name: asset-pipeline-tripo3d
description: Use when generating a new 3D asset for Unity 2.5D mobile via Tripo3D REST. Handles auth + balance check + license confirm + request + poll + download + Unity import + ASTC compression. DEFAULTS TO --dry-run; real API calls require explicit --live flag + interactive Pro-tier confirmation. Meshy --provider meshy opt-in fallback for rigged characters.
---

# **This skill defaults to `--dry-run`. Real Tripo API calls require explicit `--live` flag + interactive confirmation on first invocation.**

`--dry-run` mode returns canned fixture responses from `fixtures/tripo-image-to-model-success.json` and does NOT call the live API. This protects against:
- Accidental burn of paid Tripo credits during exploration
- The previously-proposed `/v2/openapi/user/balance` endpoint URL being **unverified** at v1.8.0 publish time (per pre-publish research — see `scripts/verify-game-unity-bake.ts`)

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
  echo "Pro tier ($13.93/mo annual / $19.90/mo monthly) is the minimum to ship commercial."
  exit 2
}
```

Balance check — **do NOT hard-code an endpoint URL** (the previously proposed `/v2/openapi/user/balance` was flagged as invented by pre-publish verifier). Use one of:

```bash
# Preferred: official Python SDK (verified surface)
uvx --from tripo3d python -c "from tripo3d import Tripo3D; print(Tripo3D(api_key='$TRIPO_API_KEY').get_balance())"

# OR: fetch the live OpenAPI schema and look up the balance endpoint
curl -fsSL https://platform.tripo3d.ai/docs/schema | jq '.paths | keys[]' | grep -i balance
```

Print balance + estimated cost preview. Abort if balance < estimated cost.

## Step 3 — REQUEST

```bash
# Live mode:
curl -X POST "https://api.tripo3d.ai/v2/openapi/task" \
  -H "Authorization: Bearer $TRIPO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image_to_model",
    "image": {...},
    "model_version": "v3.1",
    "face_limit": 8000,
    "texture": true,
    "pbr": true,
    "auto_scale": true,
    "quad": false
  }'

# Dry-run mode:
cat fixtures/tripo-image-to-model-success.json
```

Polycount defaults:
- LOD0 (hero): 8000
- LOD1: 4000
- LOD2: 1500

`quad: false` — tris are fine for Unity mobile and avoid the reported +$0.05 surcharge (unverified — third-party aggregator).

Persist `task_id` → `.ennam/asset-pipeline/jobs/<task_id>.json` (crash recovery via `--resume <task_id>`).

## Step 4 — POLL

```
GET https://api.tripo3d.ai/v2/openapi/task/{task_id}
```

Interval: 3s (Turbo model_version) or 8s (Standard). Max 5 minutes. Statuses:

- `Success` → step 5
- `Failed` → surface error + ask user: "Retry Tripo, or switch to `--provider meshy`?" (NEVER auto-fallback — Rule 12)
- timeout → instruct `--resume <task_id>` on re-run

Dry-run: return canned `Success` response immediately.

## Step 5 — DOWNLOAD

Read `.output.model` / `.output.pbr_model` / `.output.rendered_image` URLs from the success payload. Download to `Assets/Generated/<slug>/source/` within the retention window (reported ~24h for Free tier — not contractual; downloads must be immediate regardless of tier).

Compute + persist SHA256 next to each file (`<slug>/source/<file>.sha256`) — idempotency on re-runs.

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

If `--rig` flag passed: chain `POST /v2/openapi/task` with `type: animate_rig`, referencing the original `task_id`. Then re-import the new rigged FBX.

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
node scripts/verify-game-unity-bake.ts
```

The script (excluded from the published artifact — see `packages/cli/package.json` `files` field) hits the live Tripo API with a `TRIPO_API_KEY` env to capture:

1. The actual balance endpoint URL
2. Whether `face_limit: 1500` actually returns ≤ 1500 polys
3. Whether `quad: true` triggers a $0.05 surcharge line item
4. Whether output URLs are signed/expiring

Results are written to `.serena/memories/decisions/game-unity-v1.8.0-bigbang-safety-harness.md` "Verification" appendix.

If the script reports any divergence from this SKILL.md's procedure, update the procedure BEFORE publish.

# Configuration

`docs/perf-budget.md` is read for default `face_limit` overrides:

```yaml
asset_pipeline:
  face_limit_default: 8000
  face_limit_lod1: 4000
  face_limit_lod2: 1500
```
