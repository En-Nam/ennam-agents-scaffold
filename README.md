# @ennam/agents-scaffold

Install Claude Code tooling (Superpowers workflow + Serena memories + role agents + MCP servers) into an existing project — without touching application code.

**MVP scope (v0.1):** `next` profile only. CLAUDE.md and `.mcp.json` merging deferred to v0.2.

## Quickstart

```bash
cd my-existing-nextjs-app
npx @ennam/agents-scaffold next
```

This adds:
- `AGENTS.md` — 12 universal agent behavioral rules
- `.claude/` — settings, hooks, slash commands (`/boot`, `/checkpoint`, `/memory`, `/escalate`), 4 agents (project-owner, team-lead, reviewer, web-dev)
- `.mcp.json` — Serena + Context7 + Jira MCP servers (Chrome DevTools and Figma for `next` not yet wired in MVP)
- `.serena/` — memories skeleton + checkpoint folder
- `docs/superpowers/` — empty specs and plans folders

It does NOT add:
- Application code (you `create-next-app` yourself first)
- `CLAUDE.md` (Plan 2 will add marker-based merge)
- `.gitignore` modifications (Plan 2)

## Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Print plan, write nothing |
| `--force` | Same as `--merge-strategy=overwrite` |
| `--merge-strategy ask\|skip\|overwrite` | Default `ask` |
| `--no-prompts` | Fail on missing info (CI) |
| `--verbose` | Verbose output |

## Unix users

After install, make the bash hook executable:

```bash
chmod +x .claude/hooks/session-start.sh
```

(Plan 2 will automate this in post-install.)

## Development

```bash
npm install
npm -w @ennam/agents-scaffold run build
npm -w @ennam/agents-scaffold run test
```

See [docs/superpowers/specs/](docs/superpowers/specs/) for design.

## License

Internal (Ennam Engineering). Not yet open-sourced.

