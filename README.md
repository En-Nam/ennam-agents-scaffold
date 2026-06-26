# @ennamjsc/agents-scaffold

[![npm version](https://img.shields.io/npm/v/@ennamjsc/agents-scaffold.svg)](https://www.npmjs.com/package/@ennamjsc/agents-scaffold)
[![node](https://img.shields.io/node/v/@ennamjsc/agents-scaffold.svg)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-source--available-blue.svg)](#license)

Install Claude Code tooling (Superpowers workflow + Serena memories + role agents + MCP servers) into an existing project — without touching application code.

## Quickstart

Option 1 — guided wizard (recommended). Walks you through role → project type → stack:

```bash
cd <target>
npx @ennamjsc/agents-scaffold
```

For application repos, point `<target>` at the repo root. For the orchestration root (`local-root` profile), point at an empty directory.

Option 2 — install a profile directly (skips the wizard):

```bash
cd <target>
npx @ennamjsc/agents-scaffold <profile>
```

### Install flow

```mermaid
flowchart TD
    Start([npx @ennamjsc/agents-scaffold]) --> Role{role?}

    Role -->|Developer| PType{project type?}
    Role -->|QA-QC| QA[qa profile]
    Role -->|BA| BA[ba profile]
    Role -->|HR| HR[hr profile]
    Role -->|DevOps| Cloud{cloud?}
    Role -->|Game-Dev| GameStack{game stack?}

    PType -->|Local-root| LR[local-root profile]
    PType -->|Existing repository| Stack{stack?}

    Stack -->|Next.js| Next[next profile]
    Stack -->|React Vite SPA| React[react profile]
    Stack -->|React Native Expo| RN[react-native profile]
    Stack -->|Flutter| Flutter[flutter profile]
    Stack -->|Python| Python[python profile]
    Stack -->|Go| Go[go profile]
    Stack -->|.NET MVC| Dotnet[dotnet-mvc profile]
    Stack -->|Express.js| Express[express profile]

    Cloud -->|AWS| AWS[devops-aws profile]
    Cloud -->|Azure| Azure[devops-azure profile]
    Cloud -->|Google Cloud| GCP[devops-gcp profile]
    Cloud -->|Docker self-hosted| DockerProfile[devops-docker profile]

    GameStack -->|Unity 2.5D Mobile| GameUnity[game-unity profile]

    classDef leaf fill:#d4edda,stroke:#155724,color:#155724;
    class QA,BA,HR,LR,Next,React,RN,Flutter,Python,Go,Dotnet,Express,AWS,Azure,GCP,DockerProfile,GameUnity leaf;
```

> The diagram above renders on GitHub. On npmjs.com, the mermaid code block is shown verbatim — open this README on GitHub for the rendered flowchart.

## Profiles

### Developer (stack-specific)

| Profile | Stack | Extra MCP |
|---|---|---|
| `next` | Next.js 16 + React 19 + TS strict + Tailwind 4 | figma |
| `react` | React 19 SPA — Vite 6 + React Router 7 + TanStack Query + shadcn/ui + Tailwind 4 + Vitest | figma |
| `react-native` | React Native 0.76+ (New Architecture) + Expo SDK 52+ + Expo Router + NativeWind + Reanimated 3 + Maestro | figma |
| `flutter` | Flutter 3.x + Dart + Riverpod/Bloc | figma |
| `python` | Python 3.12 + FastAPI + uv + ruff + pytest | — |
| `go` | Go 1.24 + stdlib net/http + pgx + slog | — |
| `dotnet-mvc` | .NET 9 + ASP.NET Core MVC + EF Core 9 + xUnit | postgres, github |
| `express` | Node 20 + Express 5 + TypeScript strict + Jest + Zod | github |

### QA / BA / HR (role-specific, no stack branch)

| Profile | Role | Extra MCP |
|---|---|---|
| `qa` | QA workflow (test-cases + evidence + `/qa-run` `/qa-report`) | — |
| `ba` | Business Analyst — user stories + Gherkin AC + BPMN flows + `/ba-story` `/ba-flow` | — |
| `hr` | HR — JD authoring + interview kits + `/hr-jd` `/hr-interview-kit` | — |

### DevOps (cloud / infra-target-specific)

| Profile | Stack | Extra MCP |
|---|---|---|
| `devops-aws` | Terraform + AWS (ECS, RDS, IAM, Secrets Manager, CloudWatch) | github |
| `devops-azure` | Bicep/Terraform + Azure (AKS, App Service, Key Vault, Log Analytics) | github |
| `devops-gcp` | Terraform + GCP (GKE, Cloud Run, Cloud SQL, Secret Manager, Cloud Logging) | github |
| `devops-docker` | Self-hosted Docker fleet — Komodo (GitOps Resource Sync + RBAC + audit) + Tecnativa socket-proxy + Tailscale sidecar + Dozzle + cAdvisor/Prometheus/Grafana + Uptime Kuma + Diun + Renovate | github |

### Game-Dev (engine-specific)

| Profile | Stack | Extra MCP |
|---|---|---|
| `game-unity` | Unity 6.5 (URP mobile, 2.5D) + Cinemachine 3.x + CoplayDev Unity MCP v9.7.3 + Tripo3D 3D asset gen (`--dry-run` default, `--provider meshy` opt-in fallback) + Git LFS | unity (CoplayDev) |

### Orchestration

| Profile | Purpose | Extra MCP |
|---|---|---|
| `local-root` | Polyrepo coordinator — reads sub-platform `.serena/` memories | — |

All profiles also register `serena`, `context7`, and `jira` via the shared MCP partial. The `Extra MCP` column lists only the profile-specific additions on top of that base. (`game-unity`'s Unity MCP comes via its own `.mcp.json.partial.hbs`, not the shared catalog.)

Each role/cloud profile ships with its own `.claude/agents/<specialist>.md`, one or two `.claude/commands/<verb>.md` slash commands, and one or two `.claude/skills/<topic>/SKILL.md` skills that auto-load when the topic comes up in conversation. `game-unity` is the first profile to ship 3 agents + 3 commands + 4 skills (rationale: game-dev domain rạch ròi between gameplay code / asset pipeline / build-and-test; each agent has explicit "When NOT" boundaries).

## What gets added

- `AGENTS.md` — 13 universal behavioral rules
- `CLAUDE.md` — appended scaffold-managed block (with markers, idempotent on re-run)
- `.claude/` — settings, hooks, slash commands (`/boot`, `/checkpoint`, `/memory`, `/escalate`), role agents
- `.mcp.json` — deep-merged with any existing config (user wins on conflicts)
- `.serena/` — memories skeleton + checkpoint folder
- `docs/superpowers/` — empty specs and plans folders
- `.gitignore` — append-only with dedup (no duplicates on re-run)

Each merge backs up the original to `.ennam-scaffold-backup/<timestamp>/`. Backups rotate to the 3 most recent.

### No-repo behavior

When the target directory does not contain a `.git` directory, the scaffold silently skips the `.gitignore` append step for ALL profiles. Every other file is still written. To enable `.gitignore` handling, run `git init` first. This requires no flags.

### Claude for Chrome integration

Browser-side debugging and UI verification are handled by the [Claude for Chrome](https://www.anthropic.com/news/claude-for-chrome) extension, not by an MCP server. Install the extension separately; the scaffold's `next` and `qa` profiles reference it from their CLAUDE.md partials. There is no `.mcp.json` entry to add — Claude for Chrome is a browser extension, not an MCP.

### Upgrading from v1.1

v1.2 removed the `chrome-devtools` MCP server in favour of the Claude for Chrome extension (above). If your project already has `mcpServers.chrome-devtools` in its `.mcp.json` from a prior install, remove that entry manually — the merge is user-wins on conflicts, so re-running the scaffold will not delete it. The CLI prints a warning after install when it detects a stale entry.

### Upgrading from v1.2

v1.3 fixes a silent-exit bug under `npx`: pre-1.3 invocations would print nothing and exit 0 without scaffolding anything because the entry-point guard compared the symlinked bin path against the realpath of the module. If `npx @ennamjsc/agents-scaffold` worked silently for you on v1.2, upgrading to v1.3 will make it actually run. v1.3 also adds 7 new profiles (`dotnet-mvc`, `express`, `ba`, `hr`, `devops-aws`, `devops-azure`, `devops-gcp`) and three new wizard roles (BA, HR, DevOps with cloud branch). No existing profile names changed — existing pin-by-name calls (`npx ... next`, `npx ... qa`, etc.) keep working.

### Upgrading from v1.3

v1.4 adds two Developer stacks: `react` (Vite SPA — React 19 + React Router 7 + TanStack Query + Tailwind 4 + Vitest) and `react-native` (Expo SDK 52+ on the New Architecture, Expo Router, NativeWind, Reanimated 3, Maestro for E2E). All profile-specific agent and skill prompts were audited against current Anthropic subagent guidance — most were already compliant; a handful received surgical edits. No profile names changed; no behavior changed for existing installs.

### Upgrading from v1.5.0 → v1.5.1

v1.5.1 fixes two broken shapes the scaffold has been shipping in `.claude/settings.json` since v1.0:

1. `permissions.additionalAllowList` (legacy key Claude Code silently ignores) → corrected to `permissions.allow`. Net effect for upgraders: your auto-allow rules for `Bash(npm:*)` / `Bash(git:*)` etc. were never in effect — they will be once you re-run or migrate manually.
2. `hooks.SessionStart` entries used the legacy bare `{command}` shape. Current Claude Code rejects this with **"Expected array, but received undefined"** and refuses to load any settings from the file. Corrected to the required nested `{hooks: [{type: "command", command: "…"}]}` wrapper.

Because `.claude/settings.json` is merged user-wins on arrays, **re-running the scaffold cannot auto-rewrite an existing broken file** — the CLI now prints a loud warning at the end of every install when it detects either legacy shape so you know to fix it by hand.

### Upgrading from v1.7

v1.8 adds the **`game-unity`** profile — a Game-Dev role for Unity 2.5D mobile (URP). Pick from the wizard under **Game-Dev → Unity 2.5D Mobile**.

- **Engine**: Unity 6.5 primary (also supported: 6000.0, 2022.3 LTS, 2021.3 LTS via `--legacy`); URP 17+ mobile renderer asset; Cinemachine 3.x.
- **Unity Editor MCP**: [CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp) v9.7.3 (formerly justinpbarnett/unity-mcp; acquired by Coplay 2025-08). Baked into `.mcp.json.partial.hbs` as `uvx coplay-mcp-server` (Python ≥3.11 + uv required on host).
- **3D asset generation**: [Tripo3D](https://www.tripo3d.ai/) Python SDK (`TripoClient` async API) as default. The `asset-pipeline-tripo3d` skill **defaults to `--dry-run`** — real API calls require explicit `--live` flag + interactive confirmation that **Pro tier ($13.93/mo annual minimum)** is active. Free tier outputs are CC BY 4.0 **NON-COMMERCIAL** — unusable for commercial games. Meshy `--provider meshy` is an opt-in fallback for rigged characters (Meshy's 500+ animation library is the unmatched lead there). NEVER auto-fallback — Rule 12.
- **Sprite AI MCP**: omitted in v1.8.0 — no stable, tokenless option meets bake-in bar. CLAUDE.md points to `pixelforge-mcp` (MIT, Gemini key) + `spritecook-mcp` (paid SaaS). Revisit tracked in [`mem:backlog/sprite-mcp-revisit-v1.8.x`](.serena/memories/backlog/sprite-mcp-revisit-v1.8.x.md).
- **Workflow**: extends the shared 7-phase workflow with **Phase 6 Content Gates** — 4 human sign-off checkboxes in the PR body (Design / Art / Feel / Perf) before Phase 7 begins.
- **Templates emitted**: `GDD.md.hbs`, `art-bible.md.hbs`, `docs/perf-budget.md`, plus 2 Editor C# templates (`EnnamPreflight.cs` asserts Domain Reload disabled + URP mobile compliance; `EnnamPerf.cs` runs ProfilerRecorder harness for `perf-budget-check` skill). Copy the .cs files into your Unity `Assets/Editor/` after install — README in `Editor-templates/` explains why.
- **Git LFS**: new `_shared/.gitattributes.append` ships Unity binary rules (`.fbx .glb .png .psd .wav` etc.). `.unity .prefab .asset .meta` are deliberately NOT LFS — Unity Smart Merge needs text diffs.
- **Wizard**: new top-level role **Game-Dev**; `resolveProfile` gains optional 5th `gameStack` parameter (backward-compatible — all existing call sites unchanged).
- **Pre-publish maintainer gate**: `scripts/verify-game-unity-bake.mjs` runs 5 checks against the live world (`uvx` presence, PyPI `coplay-mcp-server`, Tripo base URL alive, Python SDK `TripoClient.get_balance()` handshake with `TRIPO_API_KEY`, npm `files[]` excludes `scripts/`). Run BEFORE `npm publish` of the scaffold itself; not part of the user-facing flow.

### Upgrading from v1.4

v1.5 adds the `devops-docker` profile — a DevOps role for self-hosted Docker fleets. The recommended stack is **Komodo** (GitOps Resource Sync + RBAC + audit, all free under GPL-3.0) as the management UI, with **Tecnativa docker-socket-proxy** fronting every Docker socket (no raw socket bind anywhere), **Tailscale sidecar pattern** for remote access (one sidecar per exposed service; no public ports), **Dozzle** for log search, **cAdvisor + Prometheus + Grafana** for metrics history, **Uptime Kuma** for alerts, **Diun** for notify-only image updates, and **Renovate** for PR-based image bumps (no Watchtower — archived in 2024). The agent prompt forbids `:latest` tags, raw `/var/run/docker.sock` binds, `privileged: true`, Watchtower/ctop, and Tailscale Funnel for admin UIs. Pick this profile from the wizard under **DevOps → Docker (self-hosted)**.

**New: post-install handoff prompt.** After every interactive install (except `local-root`), the CLI now prints a copy-paste prompt you paste into a fresh `claude` session at the repo. It instructs Claude to fill in your project-specific context — stack, key directories, commands, conventions, hot zones — in the area ABOVE the scaffold-managed marker block in `CLAUDE.md`. The scaffold tool itself only manages the block between the markers; the project-profile area above is yours. The prompt has hard guardrails: it forbids the agent from touching anything between the markers, requires every claim to cite a file the agent actually read, and demands a unified diff + confirmation before writing. The prompt is suppressed under `--no-prompts` (CI mode).

## Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Print plan, write nothing |
| `--force` | Same as `--merge-strategy=overwrite` |
| `--merge-strategy <s>` | `ask` (default) \| `skip` \| `overwrite` \| `append` \| `json-merge` |
| `--no-prompts` | Fail on missing info (CI mode) |
| `--verbose` | Verbose output |

## Manual review after merge

Every merge into an existing file backs up the original to `.ennam-scaffold-backup/<timestamp>/`. If you want to review or hand-edit the merged result:

```bash
diff .ennam-scaffold-backup/<timestamp>/CLAUDE.md ./CLAUDE.md
# edit CLAUDE.md in your IDE
```

There is no interactive editor mode — `git diff` and your IDE give you better tooling than a one-shot `$EDITOR` invocation would.

## Unix users

After install, make the bash hook executable:

```bash
chmod +x .claude/hooks/session-start.sh
```

## Development

```bash
npm install
npm -w @ennamjsc/agents-scaffold run build
npm -w @ennamjsc/agents-scaffold run test
```

See [docs/superpowers/specs/](docs/superpowers/specs/) for design.

## License

Published publicly on npm for `npx` convenience. Internal Ennam Engineering tool; no proprietary content. No formal open-source license yet — treat as "source available, internal use".
