---
name: prd-authoring
description: Use when drafting or reviewing a PRD / product one-pager. Enforces problem-before-solution structure, a measurable outcome metric with a baseline, an explicit out-of-scope list, and named risks.
---

# PRD Authoring

A PRD is a decision document, not a feature list. It exists to align people on a problem worth solving and how you will know it is solved. Use this skill any time you draft, review, or trim a PRD or one-pager.

## Required sections

| Section | What good looks like | Failure smell |
|---|---|---|
| **Problem** | A user pain with evidence (ticket, interview, metric) | Opens with a feature or a solution |
| **Target user** | A specific persona / segment | "All users" |
| **Outcome metric** | A number + baseline + direction ("activation 22% → 30%") | "Improve engagement" |
| **Scope — In** | The narrow slice you will ship | A wish list |
| **Scope — Out** | What you are explicitly NOT doing | Section missing |
| **Solution sketch** | Enough to align, not a spec | Prescribes implementation/architecture |
| **Risks & dependencies** | Named, with an owner or mitigation | "None" |
| **Open questions** | Honest unknowns, surfaced | Hidden behind confident prose |

## Rules

- **Problem before solution.** If the first paragraph is a feature, the PRD is not ready. Reframe around the user pain and the outcome.
- **No metric, no PRD.** Every initiative names the number it moves and today's baseline. If unknown, write `[METRIC TBD]` and list it in Open questions — never invent a baseline (Rule 12 / Rule 13).
- **Scope-Out is mandatory.** Ambiguity about what is *not* included is where projects bleed.
- **Own the why/what, not the how.** The solution sketch aligns direction; it does not choose the stack, schema, or component library — that is the dev/design call.
- **Cite evidence.** "Users are frustrated" needs a source: a ticket ID, an interview date, a metric. No source → mark it an assumption.

## Review checklist

- [ ] Opens with a user problem, not a feature.
- [ ] Outcome metric has a number AND a baseline.
- [ ] Scope has an explicit "Out" list.
- [ ] Solution sketch does not prescribe implementation details.
- [ ] Every risk has an owner or a mitigation.
- [ ] Open questions are surfaced, not buried.
