---
name: user-story-quality
description: Use when drafting or refining a user story. Applies the INVEST checklist, demands a measurable "so that" clause, enforces vertical slices, and offers splitting patterns when a story is too large.
---

# User Story Quality

A good user story is a promise of a conversation that delivers user-visible value. Use this skill any time you draft, review, or split a story.

## Format

```
As a <specific role>
I want <capability>
So that <measurable business value>
```

- **Role**: a specific persona, not "user". "Checkout cashier", "loyalty member", "store manager".
- **Capability**: what they can do, not how the system does it.
- **So that**: the value, expressed measurably where possible ("reduce checkout time by X", "recover Y abandoned carts/week"). If you cannot name the value, the story is not ready.

## INVEST checklist

| Letter | Meaning | Failure smell |
|---|---|---|
| **I**ndependent | Can ship without other stories | "Blocked by story B which is blocked by C" |
| **N**egotiable | Details are open until refinement | Story reads like a spec with no room to discuss |
| **V**aluable | Delivers user-visible value | "So that the system has a new field" |
| **E**stimable | Dev can size it | Too many unknowns; needs a spike first |
| **S**mall | Fits in one sprint | "Build the entire reporting module" |
| **T**estable | Has Gherkin AC that can pass/fail | "Works well", "feels intuitive" |

If any letter fails, fix it or split.

## Vertical slices

A vertical slice cuts through every layer (UI, API, data, validation) for one narrow scenario. A horizontal slice (e.g. "build all the API endpoints") is not a story — it has no user value.

- Bad: "Implement the loyalty database schema."
- Good: "As a member, I can see my current points balance on the home screen, so that I know what I can redeem."

## Splitting patterns

When a story is too big, split by:

1. **Workflow steps** — sign-up, then verify, then onboard.
2. **Business rule variations** — domestic shipping first, international next.
3. **Happy path vs edge cases** — successful redemption first; expired / insufficient / concurrent next.
4. **Data variations** — single-item cart first; multi-item / mixed-tax next.
5. **CRUD slice** — read first, then create, then edit, then delete.
6. **Acceptance criteria** — if one AC is itself a feature, lift it into its own story.

Never split by technical layer (DB / API / UI). That produces horizontal slices and breaks INVEST-V.

## Review checklist

- [ ] Role is a specific persona, not "user".
- [ ] "So that" names measurable business value.
- [ ] Passes all six INVEST letters.
- [ ] Is a vertical slice — user can see / use the outcome.
- [ ] Has Gherkin AC attached (see @.claude/skills/gherkin-acceptance-criteria/SKILL.md).
