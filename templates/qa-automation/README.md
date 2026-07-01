# qa-automation profile

Ennam Agents Scaffold — QA Automation Engineer profile (v1.9.0).

Scope: automated authoring workflow. Mobile (Maestro) + web (Playwright) + shared Gherkin BDD parsing.

## What ships

- `CLAUDE.md.partial.hbs` — role guidance for the QA Automation Engineer agent.
- `.claude/skills/qa-maestro/SKILL.md` — Maestro authoring (mobile). YAML flow conventions, `list_devices` → `inspect_screen` → `run` loop, cloud run polling, sub-flow reuse pattern.
- `.claude/skills/qa-playwright/SKILL.md` — Playwright authoring (web). Page Object + spec generation, team's JSDoc BDD header convention (no `.feature` files for web), self-healing state.
- `.claude/skills/gherkin-bdd/SKILL.md` — shared parser + step matching. Feature/Scenario/Given/When/Then → normalized action intents.

## Not in scope

- Manual QA — see the `qa` profile (test cases + evidence capture).
- App code changes — QA Automation drives the app through UI, does not patch it. Failures go through `/escalate`.

## Related profiles

- `react-native` — if the target repo already installed React Native + Maestro via that profile, this profile references the existing `.maestro/` install rather than duplicating.
- `qa` — manual QA counterpart; the wizard branches on "Manual or Automation?" at install time.
