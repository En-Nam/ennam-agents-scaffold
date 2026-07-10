# Official plugin menu

Plugins that amplify each scaffold role — **you install them yourself**, the scaffold does not.
Every entry is a one-liner you run inside Claude Code:

```
/plugin install <id>@claude-plugins-official
```

The scaffold deliberately **does not** enable these for you: `enabledPlugins` lives in the shared
`settings.json`, so per-role keys would break the byte-identical single-profile install (see issue #24).
This page is guidance only — nothing here mutates your `settings.json` or `.mcp.json`.

> **Popularity note.** Rankings reflect public signals as of 2026-07 (GitHub stars / "official" status).
> The two ecosystem anchors: the Superpowers methodology (already wired by the scaffold) and the
> built-in document skills. Only ids verified present in the official `claude-plugins-official`
> marketplace are listed; community collections (wshobson/agents, VoltAgent, aitmpl) are research
> sources, not install targets.

## Everyone (all roles)

- **Built-in document skills** (`pptx` / `docx` / `xlsx` / `pdf`) — enabled by default when File
  Creation / code execution is on; no install needed. The highest-leverage capability for any
  knowledge-worker role (decks, reports, spreadsheets, exports).
- `superpowers@claude-plugins-official` — the 7-phase workflow engine. **Already enabled by the
  scaffold**; if a headless/CI session did not auto-install it, run the command once.

## Developer (`next` · `react` · `react-native` · `flutter` · `python` · `go` · `dotnet-mvc` · `express`)

- A language server for your stack: `typescript-lsp` (next/react/react-native/express),
  `pyright-lsp` (python), `gopls-lsp` (go), `csharp-lsp` (dotnet-mvc).
- `code-review` + `code-simplifier` — align with Phase 6 (Review) of the workflow.
- `context7` — live library docs (already in the scaffold's base `.mcp.json`).
- `github` — PRs/issues/CI (already an `extraMcp` for `express`, `dotnet-mvc`, and the DevOps profiles).

## QA (`qa` · `qa-automation`)

- `playwright` — the official Playwright MCP for web E2E, pairs with the `qa-playwright` skill.

## Data & Analytics (`data-analytics`)

- `duckdb-skills` + `python-repl` — local analysis without touching production.
- `bigquery-data-analytics` / `snowflake` — warehouse queries (postgres is already in the scaffold catalog).
- Built-in `xlsx` skill — exports and pivot-style summaries.

## Product / Docs / HR / Business (`pm` · `tech-writer` · `hr` · `ba`)

- `notion` — official Notion MCP for PRDs, specs, the company wiki (OAuth connector).
- Built-in `docx` / `pdf` skills — the core deliverables for these roles.
- `slack` — status roll-ups and announcement drafting (workspace-admin OAuth).

## DevOps (`devops-aws` · `devops-azure` · `devops-gcp` · `devops-docker`)

- `github` — already wired as an `extraMcp`. Add your cloud provider's official MCP if/when one ships.

## Design (planned `design` profile, #29)

- `figma` — already the scaffold's answer via the `@ennamjsc/figma-mcp` wrapper (see Rule 7 below).
- `frontend-design` — Anthropic's internal design plugin.

## A note on figma / jira (Rule 7 — surface conflicts, don't blend)

The scaffold ships its **own** `@ennamjsc/figma-mcp` and `@ennamjsc/jira-mcp` wrappers in `.mcp.json`.
The official `figma@claude-plugins-official` and Atlassian plugins are alternatives, **not additions** —
running both double-registers the same capability. The scaffold's answer stays the `@ennamjsc/*` wrappers;
switch to the official plugin only if you deliberately remove the wrapper first.

## Not listed here (on purpose)

Remote-OAuth MCPs the scaffold cannot yet emit as static config (Canva, Gmail, HubSpot, Stripe,
Salesforce, Intercom, Linear) — connect those via Claude Code's connector UI. Whether any can be shipped
as static scaffold config is tracked by the OAuth-transport spike (#28).
