# Memory Index

## Services
(none yet — add `services/<svc>.md` and link here as services emerge)

## Decisions
- [Security dev trade-offs](decisions/security-dev-trade-offs.md) — why the broad allowlist + unpinned npx + serena git-HEAD are kept on purpose, what was fixed in v1.2.2 instead
- [v1.4 scope](decisions/v1.4-scope.md) — MoSCoW for v1.4: refine all 13 + add react/react-native; handoff prompt was user-overridden into v1.4 (see Addendum)
- [Superpowers plugin strategy (v1.6.0)](decisions/superpowers-plugin-strategy.md) — passthrough to `superpowers@claude-plugins-official`; rejected fork & overlay; headless mode requires manual `/plugin install` (Anthropic limitation)
- [No hardcoded model (v1.6.1)](decisions/no-hardcoded-model.md) — scaffold must NOT pin `model` in shared settings template; fixes issue #3
- [game-unity v1.8.0 big-bang + safety harness](decisions/game-unity-v1.8.0-bigbang-safety-harness.md) — new profile for Unity 2.5D mobile; CoplayDev MCP + Tripo3D `--dry-run` default + maintainer pre-publish gate; judge panel C wins over verified-first (A) / bare big-bang (B)
- [v1.9 scope](decisions/v1.9-scope.md) — MUST: `minClaudeCodeVersion` field + wizard preflight, `--analyze-claude` (#4a), `qa-automation` profile (#2), meta-spike → `agent-org` profile; WON'T: DESIGN doc as-written; DEFER: `--claude-strategy=minimal` (#4b) to v1.10
- [org-layer v1.11](decisions/org-layer-v1.11.md) — issue #8: org-context base layer emitted as standalone `ORG.md` (user-owned, skip-if-exists); shipped v1.11.0. Consultant-round enterprise expansion: v1.10 shipped pm/tech-writer/data-analytics + `--list` (#11/#12/#13/#15-catalog); #9/#10/#7/#14/#15-DoD still open (triage recs posted)

## Active Comms
(empty)

## Backlog
- [Sprite AI MCP revisit v1.8.x](backlog/sprite-mcp-revisit-v1.8.x.md) — no stable tokenless Sprite AI MCP today; baseline captured at v1.8.0 for re-eval
