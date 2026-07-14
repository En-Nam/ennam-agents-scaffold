---
description: Draft a campaign brief (goal, audience, channels, KPIs, budget) saved to campaigns/<name>.md.
---

Usage: `/cmo-campaign <name>`

Steps:
1. If the goal, audience, or timeframe are missing, ask the user before drafting.
2. Read the relevant positioning in `positioning/` and any prior briefs in `campaigns/` to stay consistent with the messaging and tone.
3. Draft the brief with sections: Goal (one measurable objective), Audience, Channels, KPIs (each with a target and a source for the baseline), Budget (`[BUDGET PLACEHOLDER]` unless the user supplied a figure), and Timeline.
4. Keep it to a single measurable goal — if there are two goals, split the campaign or pick the primary one.
5. Any baseline or benchmark figure cites its source, or is marked `[SOURCE TBD]` — never invented (Rule 13).
6. Run the @campaign-brief checklist before saving.
7. Save to `campaigns/<name>.md` with a `DRAFT` marker until human sign-off.
8. Flag any KPI that isn't measurable and any figure you had to guess (Rule 12).
