<!-- ennam-agents-scaffold:begin v1.0.0-rc.0 -->
## Agents Workflow
@AGENTS.md

### Session Boot Protocol (Serena-only — 2 steps)
Every agent MUST follow at session start:

1. Read `.serena/memories/INDEX.md`. From it, read the relevant `services/<svc>.md`, then check `comms/active/` for messages addressed to your role, then `backlog/` for pending items in your domain.
2. Read the latest checkpoint in `.serena/checkpoint/` for your role.

Do NOT scan source code, run `find`, or browse directories until steps 1-2 are complete.

### Superpowers Workflow (7 phases)

1. **Understand** — `superpowers:brainstorming` (skip for typo / config / hotfix)
2. **Plan** — `superpowers:writing-plans` (skip for single-file obvious change)
3. **Isolate** — `superpowers:using-git-worktrees` (skip for hotfix / docs)
4. **Implement** — TDD / executing-plans / dispatching-parallel-agents
5. **Verify** — `superpowers:verification-before-completion` (NEVER SKIP)
6. **Review** — `superpowers:requesting-code-review`
7. **Complete** — `superpowers:finishing-a-development-branch`

### Mandatory Session Checkpoint

At the end of every session, write `.serena/checkpoint/<agent-name>-2026-05-21.md` with:

```markdown
# Checkpoint: <agent-name> — <date>

## What was done
- ...

## Files changed
- ...

## Current state
- working / broken / partial

## Next steps
- ...

## Blockers / Risks
- ...
```

Rules:
- One file per agent per day; append if multiple sessions same day.
- Write checkpoint even if the session failed (note the failure).
- Keep under 50 lines.

### Knowledge Source Priority

1. `.serena/memories/` — read FIRST (decisions, services, comms, backlog)
2. Source code / git log — only AFTER memory is consulted

### Memory Write Protocol

| You want to... | Write to | Naming |
|----------------|----------|--------|
| Record a technical decision | `.serena/memories/decisions/<topic>.md` | Descriptive topic |
| Update service state | `.serena/memories/services/<service>.md` | Append/replace section |
| Flag work for another agent | `.serena/memories/backlog/<service>-<topic>.md` | Prefix target service |
| Ask another agent a question | `.serena/memories/comms/active/<you>-to-<them>-<topic>.md` | |
| Close a thread | Move both files to `.serena/memories/comms/resolved/` | |

Always update `.serena/memories/INDEX.md` when adding to `decisions/` or `services/`.

### Profile: next

## Stack: Next.js 16 + React 19 + TypeScript

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI runtime | React 19 (Server Components by default) |
| Language | TypeScript strict mode |
| Data fetching | TanStack Query for client-side; Server Components for server-side |
| UI primitives | shadcn/ui + Tailwind CSS 4 |
| Session | iron-session (cookie-based) |
| Linter | ESLint (next/core-web-vitals) |
| Build | `npm run build` (Turbopack) |

### Conventions

- **Default to Server Components.** Add `'use client'` only when the component uses state, effects, or browser APIs.
- **Tailwind 4 syntax.** Avoid `@apply` where utility classes work; lean on theme tokens.
- **Don't reinvent shadcn primitives.** Compose them; if you need a new one, copy from the shadcn registry rather than write from scratch.
- **Type-check before declaring done:** `npm run build` (catches type errors that `tsc --noEmit` may miss in App Router).
- **Use Chrome DevTools MCP** for runtime debugging when changes touch interactivity (a11y, network, console errors, LCP).

### Common commands

```bash
npm run dev          # local dev server (port 3000)
npm run build        # production build + type-check
npm run start        # serve the production build
npm run lint         # eslint
```

<!-- ennam-agents-scaffold:end -->
