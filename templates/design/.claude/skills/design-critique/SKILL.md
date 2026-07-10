---
name: design-critique
description: Use when critiquing a screen, flow, or Figma frame. Evaluates against Nielsen-style usability heuristics and forces observation to stay separate from recommendation.
---

# Design critique playbook

A critique is evidence, not opinion. Its job is to surface what a design does to a user — good and bad — against known usability principles, and to keep "what I see" strictly separate from "what I'd change". Use this skill any time you review a screen, flow, or Figma frame.

## Observation before recommendation

The single rule that makes a critique useful: **never merge the two.**

- **Observation** — a neutral, verifiable statement of what the design does. *"The primary and secondary buttons share the same weight and color."*
- **Recommendation** — a separate proposal for change. *"Demote the secondary button to a text link so the primary action wins."*

Blending them (*"the buttons are wrong, fix them"*) hides the reasoning and makes the finding impossible to challenge or prioritize. Record them as separate fields for every finding (Rule 7).

## The heuristics (Nielsen-style)

Walk the target against each:

1. **Visibility of system status** — does the user always know what's happening?
2. **Match to the real world** — language and concepts the user already knows, not system jargon.
3. **User control and freedom** — clear exits, undo, and escape from mistakes.
4. **Consistency and standards** — the same thing looks and behaves the same way; follows platform conventions.
5. **Error prevention** — the design stops mistakes before they happen.
6. **Recognition over recall** — options are visible; the user isn't asked to remember.
7. **Flexibility and efficiency** — accelerators for experts without blocking novices.
8. **Aesthetic and minimalist design** — nothing noisy competing with the essential.
9. **Help users recognize and recover from errors** — plain-language errors with a way forward.
10. **Help and documentation** — available when needed, in context.

## Severity rating

Rate each finding so the reader can triage:

| Severity | Meaning |
|---|---|
| Cosmetic | Fix if time allows |
| Minor | Small friction; fix soon |
| Major | Meaningfully hurts the task; fix before ship |
| Blocker | Users cannot complete the task; fix now |

## Finding format

For each finding, record:
- **Heuristic** — which principle it touches.
- **Observation** — what the design does (neutral).
- **Impact** — what it costs the user.
- **Severity** — cosmetic / minor / major / blocker.
- **Recommendation** — the proposed change (kept separate from the observation).

## Before you finish

- Every finding has an observation that is separate from its recommendation.
- Severities are assigned so the list can be triaged.
- Anything that also fails accessibility is flagged for an a11y review (route to `/design-a11y`).
- Findings are proposals — nothing here changes production without sign-off.
