# Checkpoint: tech-consultant — 2026-06-25

## What was done
- Acted as Technical Consultant for R&D on an autonomous "GitHub Issues → multi-agent Claude Code → PR → Google Chat" pipeline (every-2-days cadence).
- Ran 2 ultracode Workflows (17 + 15 subagents, ~2.4M tokens, ~60 min total) producing 2 R&D reports:
  - **Variant A — CI-based** (GitHub Actions + ANTHROPIC_API_KEY + curl webhook, ~$135/mo): 2170 lines, 119 KB.
  - **Variant B — Desktop + MCP + Subscription** (pivot after user answered Q3=GitHub MCP, Q4=Google Chat connector, Q6=Claude Code Desktop subscription): 869 lines, 63 KB.
- v2 surfaced 3 critical findings: (1) Anthropic Google Chat connector **does not exist** (Help Center / Connectors Directory confirmed) → must fallback to raw webhook; (2) Cloud Routines has open bugs blocking custom-MCP attachment (#43397/#63233/#35899) → must use Desktop Scheduled Tasks instead; (3) `claude -p` from OS cron silently falls back to API-key billing unless `CLAUDE_CODE_OAUTH_TOKEN` is set.
- User then scope-corrected: auto-pipeline is **not** in the mission of `ennam-agents-scaffold` (which is a setup scaffold tool). Decided to spin off into a separate project.
- Spun off cleanly: new repo at `d:/Projects/EnNam/ennam-auto-pipeline/` (git init, branch `main`, initial commit `db46337`, 5 files: README + .gitignore + docs/{origin.md, RD-v1-ci-based.md, RD-v2-desktop-based.md}). Files renamed during move to clarify they are parallel variants, not v1-superseded-by-v2.
- Saved Claude auto-memory documenting scaffold mission so future sessions reject similar scope creep.

## Files changed
- **CREATED (new repo `ennam-auto-pipeline`):** README.md, .gitignore, docs/origin.md, docs/RD-v1-ci-based.md, docs/RD-v2-desktop-based.md.
- **MOVED OUT of scaffold:** `docs/superpowers/specs/RD-auto-issue-pipeline.md` and `…-v2.md` → into new repo (renamed).
- **Claude auto-memory:** `project_ennam_scaffold_mission.md` + updated `MEMORY.md` index (outside repo, in `C:\Users\ADMIN\.claude\projects\…\memory\`).
- **UNTOUCHED (user WIP, do not commit):** `packages/cli/src/{wizard.ts, profiles.ts}`, `tests/unit/{handoff-prompt, profiles, wizard}.test.ts`, `templates/devops-docker/`.

## Current state
- Scaffold repo `git status` restored to pre-detour baseline: only the user's WIP files + `templates/devops-docker/` untracked. R&D markdowns are gone from this repo.
- New repo `ennam-auto-pipeline` exists locally, has initial commit, **no remote yet** — user must `gh repo create En-Nam/ennam-auto-pipeline` and `git push -u origin main` when ready.
- No production code for the pipeline; both reports are R&D-only deliverables.
- Workflow scripts + transcripts persisted under session's `workflows/scripts/` and `subagents/workflows/` (resumable via `Workflow({scriptPath, resumeFromRunId})` within same session only).

## Next steps
- (User, scaffold) Resume wizard work — `wizard.ts`, `profiles.ts`, 3 test files are mid-flight; user will brief which feature.
- (User, new repo) Create `En-Nam/ennam-auto-pipeline` on GitHub, push initial commit.
- (Future session, new repo) Phase 0 spike: pick variant A or B, verify prerequisites with budget <$20 over ~1 week.

## Blockers / Risks
- 3 open architecture blockers for the new project documented in v2 §10.1: subscription tier choice, GitHub identity (service account `ennam-bot` vs PAT), Google Chat space ownership.
- Cloud Routines MCP-attachment bug is upstream Anthropic — out of our control; Desktop Scheduled Tasks is the current viable path but adds laptop-must-be-on dependency.
- v2 report has explicit **[UNVERIFIED]** markers (Desktop Scheduled Tasks UI field names, minimum cron interval, `.mcp.json` env-var expansion form) — Phase 0 must verify before writing any skill/config.
