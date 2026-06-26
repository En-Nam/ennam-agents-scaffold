---
name: sprite-mcp-revisit-v1.8.x
description: Re-evaluate baking a Sprite AI MCP into game-unity profile when a stable, tokenless option emerges. Baseline captured at v1.8.0.
metadata:
  type: backlog
---

# Sprite AI MCP — revisit for v1.8.x

## Baseline at v1.8.0 publish time (2026-06-26)

Per `mem:decisions/game-unity-v1.8.0-bigbang-safety-harness`, no Sprite AI MCP was baked into the `game-unity` profile because:

- **SpriteCook MCP** (`spritecook-mcp@0.2.17`, MIT) — only purpose-built game-sprite MCP, but: single-maintainer "Kimo", ~4 months old (first release 2026-02-13), 18 stars on supporting `SpriteCook/skills` repo, proprietary SaaS backend (40 free credits / 30 days, paid thereafter), `cursor-plugin` repo unlicensed.
- **game-asset-mcp** (MubarakHAlketbi, 146 stars, MIT) — install via `npm install` (not npx), output white-bg PNGs (not transparent), no sprite-sheet.
- **pixelforge-mcp** (freema, MIT) — npx-installable, requires Google Gemini key, has `forge_animation` tool, but 1 star + stale (2026-03-25).
- **ludo-mcp** (Ludo.ai, 4 stars) — proprietary license, paid-only.
- **pixel-mcp / aseprite-mcp** — wrap local Aseprite, no AI gen.
- **mcp-server-stability-ai** (tadasant, 83 stars, MIT) — generic SD bridge, no sprite-sheet/character-consistency, 12-18 months stale.
- **No DALL-E or Midjourney MCP** with sprite-sheet/consistent-pose/tileable output surfaced on awesome-mcp-servers / mcpservers.org / pulsemcp.com.

## Current CLAUDE.md pointer (game-unity profile)

The profile's `CLAUDE.md.partial.hbs` "Sprite AI" section lists `pixelforge-mcp` first (tokenless/OSS alignment) and `spritecook-mcp` second (more polished but paid). Users add to `.mcp.json` themselves.

## Re-evaluation triggers

- SpriteCook reaches 1.0 + ≥ 500 stars + ≥ 2 maintainers + tokenless tier ≥ 100 credits → re-evaluate as bake-in candidate
- A new stable Sprite AI MCP appears with OSI license + npx installer + no paid SaaS requirement → bake-in candidate
- Anthropic ships an official sprite/game-asset MCP → strong default
- User feedback shows Tripo3D 2D sprite mode (announced in 2026) is good enough → consolidate to Tripo skill, drop need for Sprite AI MCP entirely

## Cost of doing nothing (acceptable)

Users who need sprite AI today follow the CLAUDE.md pointer and add their preferred MCP to `.mcp.json`. The scaffold does not block them; it merely declines to opinionate on an immature ecosystem.

## Action item

Audit this backlog at v1.8.5 / v1.9.0 boundary. If any trigger fires, write a `decisions/sprite-mcp-bake-v1.x.md` memory and update `templates/game-unity/.mcp.json.partial.hbs` + CLAUDE.md.partial.hbs Sprite AI section.

Links: `mem:decisions/game-unity-v1.8.0-bigbang-safety-harness`
