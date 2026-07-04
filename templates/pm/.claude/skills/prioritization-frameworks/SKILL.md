---
name: prioritization-frameworks
description: Use when ranking a backlog or choosing what to build next. Covers RICE, MoSCoW, and value-vs-effort — when to use each, how to score without faking precision, and how to record human overrides.
---

# Prioritization Frameworks

Prioritization is a decision you must be able to defend, not a vibe. The framework's job is to make the trade-off visible so a reorder is a decision, not an opinion. Pick one, show the math.

## Choosing a framework

| Framework | Use when | Output |
|---|---|---|
| **RICE** | Continuous backlog, comparable initiatives | A numeric score per item |
| **MoSCoW** | Fixed release / deadline, must-have vs the rest | Must / Should / Could / Won't buckets |
| **Value vs Effort (2x2)** | Fast first cut, many small items | Quick-wins / big-bets / fill-ins / time-sinks |

## RICE

`Score = (Reach × Impact × Confidence) / Effort`

- **Reach** — how many users/events per time period. Use a real number, not a feeling.
- **Impact** — per-user effect on the outcome (e.g. massive=3, high=2, medium=1, low=0.5).
- **Confidence** — % you believe your Reach/Impact estimates (100/80/50). This is where honesty lives.
- **Effort** — person-months (or points) from the DEV team, not the PM.

## Discipline

- **Never fake precision.** A guessed Reach labelled as measured is a lie the roadmap inherits (Rule 13). Mark estimates as estimates; low Confidence is the honest lever.
- **Effort is not yours to invent.** Sizing comes from the people who will build it.
- **Record overrides.** When a human bumps a low-scoring item for a strategic reason, keep the score AND write the reason beside it. Do not silently re-sort to match the gut call (Rule 7 — surface the conflict).
- **One framework per exercise.** Mixing RICE numbers with MoSCoW buckets in one table hides the trade-off instead of showing it.

## Review checklist

- [ ] Exactly one framework, named at the top.
- [ ] Every scoring column is visible (no hidden math).
- [ ] Estimated inputs are labelled as estimates.
- [ ] Effort came from the dev team, not the PM.
- [ ] Any human override records both the score and the reason.
