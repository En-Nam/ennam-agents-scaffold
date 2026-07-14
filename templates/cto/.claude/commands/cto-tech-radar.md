---
description: Draft a tech radar (adopt/trial/assess/hold across the tech stack), saved to radar/radar.md.
---

Usage: `/cto-tech-radar`

Steps:
1. If the technologies to place or the team's current usage are missing, ask the user before drafting — a radar reflects real practice, not aspiration.
2. Read the existing `radar/radar.md` (if any) and relevant `adr/` records to carry forward prior placements and the decisions behind them.
3. Group entries into the four rings, with a one-line rationale for each placement:
   - **Adopt** — proven here; use by default for new work.
   - **Trial** — worth pursuing on a real project with a fallback; not yet a default.
   - **Assess** — worth a spike or proof-of-concept to understand; not for production yet.
   - **Hold** — avoid for new work; legacy or actively problematic.
4. Optionally tag each entry by quadrant (techniques, tools, platforms, languages & frameworks).
5. Note movement since the last radar (e.g. `moved Trial → Adopt`) with the ADR or evidence that justifies it. Cite a source for any figure — never invent one (Rule 13).
6. The radar advises; engineers and the CTO decide what to actually adopt (Rule 5). Present it as a recommendation, not a mandate.
7. Save to `radar/radar.md` with a `DRAFT` marker at the top until human sign-off.
8. Flag any placement you're unsure of or that conflicts with an existing ADR (Rule 12).
