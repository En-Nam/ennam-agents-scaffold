# Organization Context

> **Org-wide context shared by every role** installed by `@ennamjsc/agents-scaffold`.
> Every role agent (dev, QA, BA, PM, tech-writer, data, HR, DevOps, …) reads this
> file at session start for company-level facts it must not re-ask or invent.
>
> **This file is yours.** The scaffold seeds it once and never overwrites it on
> re-run (`skip-if-exists`). Fill in the sections below and delete this note.
> Leave a field as `?` if unknown — agents must surface `?`, never guess (Rule 12/13).

## Company

- **Name**: ?
- **What we do** (one sentence): ?
- **Primary domains / URLs**: ?

## Products & services

<!-- One line per product/service the org ships or operates. Agents map work to these. -->
- ?

## Glossary

<!-- Canonical terms. One concept → one term, org-wide. Agents use these exact terms
     instead of synonyms (see the tech-writer style-guide). Add a row per term. -->

| Term | Definition | Notes / synonyms to avoid |
|---|---|---|
| ? | ? | ? |

## Stakeholders & departments

<!-- Who owns what. Agents route questions / sign-offs to the right owner. -->

| Area | Owner / department | Contact or channel |
|---|---|---|
| ? | ? | ? |

## Communication channels

- **Where decisions are recorded**: ? (e.g. Serena `decisions/`, Confluence, Notion)
- **Where work is tracked**: ? (e.g. Jira project key)
- **Escalation path**: ? (who to ping when blocked)

## Data & tool policy

<!-- Org-wide rules every role must respect. Role profiles and the governance pack
     (if installed) layer stricter rules on top; these are the baseline. -->

- **Sensitive data (PII / secrets)**: ? (what must never be logged, pasted, or sent to external tools)
- **Approved tools / MCP servers**: ?
- **Banned tools / actions**: ?
- **Data retention / residency**: ?
