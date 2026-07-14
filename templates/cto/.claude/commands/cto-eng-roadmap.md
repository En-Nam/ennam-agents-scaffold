---
description: Draft an engineering roadmap for a period (themes, sequencing, dependencies, risks), saved to roadmap/<period>.md.
---

Usage: `/cto-eng-roadmap <period>`

Steps:
1. If the strategic priorities for the period, team capacity, or key dependencies are missing, ask the user before drafting.
2. Read prior roadmaps in `roadmap/`, the current `tech-strategy/`, and accepted `adr/` records to keep continuity and respect decisions already made.
3. Organize the roadmap around 3-5 **themes** (outcomes, not task lists), each with: the problem it addresses, rough sequencing, dependencies, and the bet it represents.
4. Sequence explicitly — what must land before what, and why. Name the critical path and where a slip cascades.
5. Attach a **risks** section: the assumptions the plan rests on (capacity, hiring, vendor, unproven tech) and an early-warning signal for each.
6. Cite a source for every figure — capacity, throughput, cost; mark anything you don't have as `[SOURCE TBD]` — never invent a number (Rule 13).
7. The roadmap advises; the CTO and engineering leads own the commitment (Rule 5) — the human owns the technical decision. Present it for them to accept, reject, or amend.
8. Save to `roadmap/<period>.md` with a `DRAFT` marker at the top until human sign-off.
9. Surface every sequencing assumption and unsourced figure in your handoff (Rule 12).
