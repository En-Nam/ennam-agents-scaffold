# Memory Index

## Services
(none yet — add `services/<svc>.md` and link here as services emerge)

## Decisions
- [Security dev trade-offs](decisions/security-dev-trade-offs.md) — broad allowlist + unpinned npx + serena git-HEAD kept on purpose
- [v1.4 scope](decisions/v1.4-scope.md) — MoSCoW for v1.4
- [Superpowers plugin strategy (v1.6.0)](decisions/superpowers-plugin-strategy.md) — passthrough to official plugin
- [No hardcoded model (v1.6.1)](decisions/no-hardcoded-model.md) — no `model` pin in shared settings
- [game-unity v1.8.0 big-bang + safety harness](decisions/game-unity-v1.8.0-bigbang-safety-harness.md)
- [v1.9 scope](decisions/v1.9-scope.md) — minClaudeCodeVersion, --analyze-claude, qa-automation, agent-org
- [org-layer v1.11](decisions/org-layer-v1.11.md) — #8 ORG.md standalone, skip-if-exists (expanded by enterprise-foundation-v1.11)
- [enterprise-foundation v1.11](decisions/enterprise-foundation-v1.11.md) — CTO⇄tech-lead batch: #8 org-layer + #9 role-adaptive AGENTS (ruleFamily) + #15 DoD + #14 governance (POLICY.md) + #10/#7 composition/multi-role. Shipped v1.11.0.
- [v1.12 enterprise-expansion](decisions/v1.12-enterprise-expansion.md) — team round on CTO's 4 asks (C-level profiles, plugin research, workflow-picker, doctor). → issues #22-#30 in 4 waves. Critique collapsed a 17-profile vision to a 3-profile proof wave (ceo/ciso/design).
- [v1.12 role-workflows](decisions/v1.12-role-workflows.md) — round 2: position-specific workflows for kế toán/HR/CEO/CFO/CISO. → 4 role-family presets (people-lifecycle/exec-decision/security-incident/finance-close) + issues #31-#33 + updates to #23/#26/#29/#30.

## Active Comms
(empty)

## Backlog
- [Sprite AI MCP revisit v1.8.x](backlog/sprite-mcp-revisit-v1.8.x.md) — re-eval tokenless Sprite AI MCP
- **Open issues #22-#33** (v1.12) — round 1 (#22-#30) see `mem:decisions/v1.12-enterprise-expansion`; round 2 role-workflows (#31-#33) see `mem:decisions/v1.12-role-workflows`. Hard blocker for ALL workflow work = #23 (slot). Only #22 + #23 are P0.
