---
name: security-dev-trade-offs
description: Why the scaffold's allowlist is broad and its MCP servers run unpinned npx — conscious trade-offs to keep, NOT bugs to fix.
metadata:
  type: decision
---

# Security trade-offs in this scaffold

A v1.2.1 commit security review surfaced 4 findings on the dogfooded `.mcp.json` and `.claude/settings.json`. **One is a real bug we patched in v1.2.2** (dependency confusion via `@ennam/*` scope — fixed by renaming all references to `@ennamjsc/*`). **Three are conscious dev-machine trade-offs we keep.**

## Findings we accept

### Over-broad allowlist (`.claude/settings.json`)
`Bash(npm:*)`, `Bash(npx:*)`, `Bash(node:*)`, `Bash(git:*)` — each `:*` permits any arguments.

**Why we keep it:** This is a developer scaffold for *building* projects; the agent runs `npm install`, `npm test`, `git diff`, `npx tsc`, `node dist/index.js` constantly. Narrowing the allowlist to specific subcommands turns every novel command into a prompt and breaks flow. The scaffold is opt-in (`npx @ennamjsc/agents-scaffold`); a paranoid user can override `.claude/settings.json` post-install.

**How to apply:** If a downstream user complains about the broad allowlist for a production-sensitive checkout, point them at `.claude/settings.json` and let them tighten it themselves. Don't ship a tightened default — the dev workflow regression is worse than the marginal safety win.

### Unpinned `npx -y <pkg>` MCP servers (`.mcp.json` templates)
Every MCP server entry uses `npx -y <pkg>` with no `@<version>` pin. A compromised upstream publishes a bad version → next agent session executes it.

**Why we keep it:** Pinning means every upstream MCP fix needs a scaffold release. MCP servers iterate fast (context7, jira-mcp, figma-mcp); freezing them to a SHA defeats the point of `npx -y`. Real protection comes from npm 2FA on the publisher accounts of those MCPs, not from us pinning consumer-side.

**How to apply:** When a new MCP server is added to the scaffold, do NOT pre-emptively pin its version. Only pin if upstream's threat model demands it (e.g., a known-malicious release window).

### Serena from `git+https://github.com/oraios/serena` (no commit pin)
Serena's MCP entry runs from `git+HEAD`, not a tagged commit.

**Why we keep it:** Serena's project is moving fast and the maintainer adds MCP-relevant fixes weekly. Pinning to a SHA means we ship a broken serena to anyone whose template install is more than a few weeks old.

**How to apply:** If serena upstream publishes a breaking change (rare), bump the scaffold to point at the prior known-good SHA, then unpin when fixed.

## What we DID fix

`@ennam/jira-mcp` and `@ennam/figma-mcp` references → renamed to `@ennamjsc/*` in v1.2.2. The npm scope `@ennam` is not owned by Ennam Engineering (we own `@ennamjsc`); unclaimed scopes are dependency-confusion vectors. See [[v1.2.2-security-patch]] checkpoint or the v1.2.2 commit history.
