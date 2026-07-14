---
name: tech-strategy
description: Use when drafting or reviewing a tech strategy memo. Enforces context → options → recommendation-for-a-human → bets/risks structure, build-vs-buy reasoning, explicit sequencing, sourced figures, and the discipline that options are laid out for a human to choose — never auto-decided.
---

# Tech strategy playbook

A tech strategy memo helps engineers or the CTO make a technical bet — it does not make the bet. Use this skill any time you draft a strategy one-pager or review one before it goes to a decision-maker.

## Structure (in this order)

1. **Context** — the situation, why it matters now, and the constraints (time, capital, headcount, existing stack). 2-4 sentences. What decision is on the table, and who owns it?
2. **Options** — 2-4 genuine options. For each: what it is, the trade-offs, second-order effects, and what would have to be true for it to be the right call. If you only have one option, you have a proposal, not a memo.
3. **Recommendation** — your suggested option, stated *for the human to accept, reject, or amend*. Say why, and name the risk you're accepting by recommending it.
4. **Bets & Risks** — the assumptions each option rests on, the ones that would hurt most if wrong, and how you'd know early.

Keep it tight. Length hides weak thinking; cut narrative before you cut options.

## Build vs buy

For any capability, weigh building against buying before defaulting to either:

- **Build** when it's core to the product's differentiation, when no vendor fits, or when the long-run cost of lock-in outweighs the upfront work.
- **Buy** when it's undifferentiated heavy lifting (auth, payments, observability) and a mature vendor exists. Engineering time is the scarcest resource — spend it on what only you can build.
- Cost both paths with real numbers (license, run cost, engineering months) and cite the source — never a from-memory guess (Rule 13).

## Sequencing

Order matters as much as choice. Name what must land before what, the critical path, and where a slip cascades. A right decision in the wrong order still fails.

## Risk

Score the bets you're taking by likelihood × impact, name an owner and an early-warning signal for each, and say which assumption, if wrong, breaks the plan.

## Never auto-decide

This is the core discipline. The memo lays out the field and points, but a human owns the technical decision (Rule 5).

- Present real options, not a single pre-baked answer dressed up with two strawmen.
- Never phrase the recommendation as a done deal ("we will…"). Phrase it as advice ("I recommend… because…; the human should weigh…").
- When two architectures genuinely conflict, name the tension and let the human resolve it — do not average them into a mushy hybrid (Rule 7).
- Never write product code to "prove" an option — a spike is engineers' work, not the advisor's.

## Sourced figures only

- Every number — benchmark, cost, SLA, adoption, runway — cites a named source (vendor doc, benchmark run, billing export).
- Never invent a figure or recall one from memory. If it's not in hand, write `[SOURCE TBD]` and surface it (Rule 13).

## Review checklist (before the memo goes out)

- The decision and its owner are named up front.
- There are 2-4 real options, each with trade-offs and second-order effects.
- Build-vs-buy is reasoned where relevant, with costed paths.
- Sequencing and the critical path are explicit.
- The recommendation is framed as advice for a human, never as a decision already made (Rule 5).
- Bets and risks are explicit, with an early-warning signal for each.
- Every figure carries a source; every gap is a visible `[SOURCE TBD]`, not a guess (Rule 13).
- The memo starts with `DRAFT` until human sign-off.
