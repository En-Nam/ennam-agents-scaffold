---
description: Draft a board deck OUTLINE where every figure cites a source and no number is invented, saved to board/<period>.md.
---

Usage: `/ceo-board-deck <period>`

Steps:
1. If the period's key metrics, financials, or strategic themes are missing, ask the user for them or the source to pull them from before drafting.
2. Read prior board material in `board/` to match structure and continuity.
3. Draft the deck as an **outline** — slide-by-slide bullets, not prose. Typical arc: agenda, highlights & lowlights, KPIs vs plan, financials, strategic updates, risks, asks/decisions for the board.
4. **Every figure must cite a source** — and you must never invent one. Never recall a number from memory; pull each metric from a named source (dashboard, filing, finance export) and attribute it inline (Rule 13). If a number is not in hand, write `[SOURCE TBD]` — do not fill the gap from memory.
5. Frame board decisions as options for the board to decide — the deck informs, it does not pre-decide (Rule 5).
6. Treat the outline as material non-public information; keep it in the repo and mark it `DRAFT` until human sign-off.
7. Save to `board/<period>.md`.
8. In your handoff, list every `[SOURCE TBD]` placeholder and every figure whose source you could not verify (Rule 12).
