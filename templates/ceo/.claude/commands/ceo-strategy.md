---
description: Draft a one-page strategy memo (context, options, recommendation-for-a-human, bets/risks), saved to strategy/<topic>.md.
---

Usage: `/ceo-strategy <topic>`

Steps:
1. If the decision, its owner, the timeframe, or key constraints are missing from the request, ask the user before drafting.
2. Read any existing memos in `strategy/` to match tone and section order.
3. Draft the one-page memo with sections: **Context** (situation, why now, constraints), **Options** (2-4 real options with trade-offs and second-order effects), **Recommendation** (for the human to accept, reject, or amend — never a decision made on their behalf, Rule 5), **Bets & Risks** (the assumptions each option rests on and what could break).
4. Cite a source for every figure; mark anything you don't have as `[SOURCE TBD]` — never invent a number (Rule 13).
5. Keep it to one page. If it runs longer, cut narrative, not options.
6. Save to `strategy/<topic>.md` with a `DRAFT` marker at the top until human sign-off.
7. Surface every open question, judgment call, and unsourced figure in your handoff (Rule 12).
