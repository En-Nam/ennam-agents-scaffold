---
description: Draft a tech strategy memo (context, options, recommendation-for-a-human, bets/risks), saved to tech-strategy/<topic>.md.
---

Usage: `/cto-tech-strategy <topic>`

Steps:
1. If the question, its owner, the timeframe, or key constraints are missing from the request, ask the user before drafting.
2. Read any existing memos in `tech-strategy/` and relevant records in `adr/` to match tone, section order, and decisions already made.
3. Draft the memo with sections: **Context** (situation, why now, constraints), **Options** (2-4 real options with trade-offs, second-order effects, and build-vs-buy where relevant), **Recommendation** (for the engineers or CTO to accept, reject, or amend — never a decision made on their behalf, Rule 5), **Bets & Risks** (the assumptions each option rests on and what could break, with an early-warning signal for each).
4. Cite a source for every figure — benchmark, cost, SLA, adoption number; mark anything you don't have as `[SOURCE TBD]` — never invent a number (Rule 13).
5. Keep it tight. If it runs long, cut narrative, not options.
6. Save to `tech-strategy/<topic>.md` with a `DRAFT` marker at the top until human sign-off.
7. Surface every open question, judgment call, and unsourced figure in your handoff (Rule 12).
