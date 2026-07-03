---
name: style-guide
description: Use when writing or reviewing docs for voice, tone, and terminology consistency. Enforces one-concept-one-term, plain language, active voice, and glossary alignment. Never invent product identifiers.
---

# Style Guide

Consistency is a feature. Readers build a mental model from your words; every synonym for the same concept forces them to re-check whether it is really the same thing. Use this skill on any doc pass.

## Terminology — the highest-value rule

- **One concept, one term.** If the product calls it a "workspace", never write "project", "environment", or "space" for the same thing. Pick the canonical term from the glossary and use it everywhere.
- **The glossary is the source of truth.** When a term is missing, add it to the glossary (with sign-off) rather than inventing a synonym in prose.
- **Never invent identifiers.** Commands, flags, file paths, API names, env vars, and version numbers are copied from a verified source, not recalled. Claude normalizes and abbreviates exact strings — open the file (Rule 13).

## Voice and tone

| Do | Don't |
|---|---|
| Active voice ("Run the migration") | Passive ("The migration should be run") |
| Present tense ("The CLI writes a backup") | Future/conditional ("will write", "would write") |
| Second person for instructions ("You set…") | First person plural except in tutorials |
| Short sentences, one idea each | Nested clauses hiding the action |
| Concrete: name the file, the flag, the value | Vague: "the appropriate setting" |

## Plain language

- Cut filler: "in order to" → "to"; "at this point in time" → "now"; "utilize" → "use".
- Define an acronym on first use, then use it consistently.
- Prefer a code block or table over a paragraph when the content is steps or facts.

## Review checklist

- [ ] Every glossary term is used consistently (no synonyms for one concept).
- [ ] All identifiers (commands/paths/flags/versions) are traced to a source, not recalled.
- [ ] Instructions are active voice, present tense, imperative.
- [ ] Acronyms are defined on first use.
- [ ] No filler phrases; sentences carry one idea.
