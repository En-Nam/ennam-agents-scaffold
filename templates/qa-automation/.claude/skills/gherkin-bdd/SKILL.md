---
name: gherkin-bdd
description: Use WHEN parsing a Gherkin `.feature` file or a JSDoc BDD block into normalized action intents that qa-maestro or qa-playwright can codify. Shared across both mobile + web authoring skills.
---

# When to apply

- Before authoring a Maestro YAML flow — parse the source `.feature` file first.
- Before authoring a Playwright spec — parse the JSDoc BDD header block first.
- When step phrases are ambiguous (multiple possible actions) — surface the ambiguity, do NOT guess.

# What this skill owns

Parsing + step matching. Nothing else. It does NOT know about Maestro YAML or Playwright syntax — that belongs to `qa-maestro` and `qa-playwright`.

# Grammar (subset — team's actual usage)

```
Feature: <name>            # optional, one per file
  Background:              # optional, shared preconditions per Scenario
    Given <phrase>
  Scenario: <name>         # or "Scenario Outline:" with Examples table
    @<tag> @<tag>          # tags on the line above Scenario
    Given <phrase>         # precondition
    And <phrase>
    When <phrase>          # action
    Then <phrase>          # assertion
    And <phrase>
```

Tags supported: `@positive @negative @boundary @logic @a11y @navigation @<feature-name>` — free-form; used by `qa-playwright` for `test.describe` filters.

# Output shape (JSON — passed to qa-maestro / qa-playwright)

```json
{
  "feature": "CLP Like A Review",
  "background": [
    { "keyword": "Given", "phrase": "User is on the CLP page" }
  ],
  "scenarios": [
    {
      "name": "Positive - Like icon on C4K cards",
      "tags": ["positive", "display"],
      "steps": [
        { "keyword": "Given", "phrase": "User is on the CLP page", "intent": "goto" },
        { "keyword": "When",  "phrase": "User opens the drawer",   "intent": "click" },
        { "keyword": "Then",  "phrase": "Like icon is visible on every C4K card", "intent": "assert.visible" }
      ]
    }
  ]
}
```

# Step-phrase → intent mapping

Best-effort keyword scan. Each rule is one line; extend in the target repo's `.ennam/gherkin-intents.json` if the team has domain-specific verbs.

| Phrase contains | Intent |
|---|---|
| "is on the … screen" / "is on the … page" | `goto` |
| "sees the …" / "is shown" / "is visible" / "is displayed" | `assert.visible` |
| "does NOT see" / "is hidden" / "is not visible" | `assert.hidden` |
| "taps" / "clicks" / "opens the …" | `click` |
| "types" / "enters" / "fills" | `type` |
| "swipes" / "scrolls" | `scroll` |
| "waits for …" / "should eventually see" | `wait.visible` |
| "toast … shown" / "snackbar … shown" | `assert.toast` |
| "count is <N>" | `assert.count` |
| "the … is updated" / "value equals …" | `assert.value` |

# Ambiguity policy

- Two intents match → return BOTH in a `candidates` array; do NOT pick one. The authoring skill (`qa-maestro`/`qa-playwright`) surfaces to the human.
- Zero intents match → return `intent: "unmapped"` with the raw phrase. Authoring skill escalates via `/escalate` — do NOT invent an action.

# Web variant — JSDoc BDD header

Web specs skip `.feature` files (team convention). Parse the JSDoc block instead:

```js
/**
 * CLP — Like A Review
 *
 * Covers the 22 scenarios from the feature spec:
 *
 *   Display       TC1  Positive — Like icon on C4K cards
 *                 TC2  Negative — Like icon NOT on Google cards
 *   Count         TC5  Positive — Count shown when >=1
 *   Auth gate     TC15 Negative — Login prompt on guest click
 */
```

Parse each `TCn  <Tag> — <name>` line as one scenario with tag = `<Tag>`. Emit the same JSON shape as the Gherkin path so downstream skills are agnostic.

# Non-goals

- Does NOT execute anything.
- Does NOT know Maestro or Playwright syntax.
- Does NOT own the mapping FROM intent TO framework call — that's the authoring skill's job.
