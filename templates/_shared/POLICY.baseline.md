# Data & Governance Policy — baseline

> ⚠️ Đây là checklist khởi đầu, KHÔNG phải tuân thủ pháp lý và không thay thế tư vấn pháp lý.
> (This is a starting checklist, NOT legal compliance, and does not replace legal advice.)
>
> Seeded once by `@ennamjsc/agents-scaffold` and then **user-owned** — the scaffold never
> overwrites it on re-run. Tighten it for your org; delete rules that don't apply.

Every agent working in this repo MUST respect these baseline rules. Role profiles and
`ORG.md`'s data policy layer on top; where they conflict, the **stricter** rule wins.

## PII & sensitive data

- **Never log, paste, or send PII to an external tool or model** without explicit, recorded
  authorization. PII includes names, emails, phone numbers, government IDs, salary, health,
  CVs/resumes, and anything that identifies a person.
- **Minimize**: read/emit only the fields the task needs. Prefer aggregates over row-level data.
- **Never invent or guess** a personal detail. Unknown → `?`, surface it (Rule 12/13).
- Secrets (tokens, keys, connection strings) are never written to docs, memories, or output.

## Approval gates (before irreversible / outward-facing actions)

Stop and get explicit human approval BEFORE:

- Sending anything to an external party (email, ticket, published doc, API call that writes).
- Deleting or overwriting data you did not create.
- Any action touching production data or systems.
- Publishing or exporting a dataset/report containing personal or confidential data.

State the action, its blast radius, and why — then wait for a "yes" (Rule 12).

## Retention & residency

- Keep sensitive artifacts only as long as the task needs; note a disposal step.
- Respect data-residency constraints recorded in `ORG.md` (where data may live / be processed).
- Do not copy production/personal data into scratch, test fixtures, or memories.

## Audit trail

- Record consequential actions and approvals in a checkpoint (`.serena/memories/checkpoint/…`):
  what was done, who approved, when.
- An action taken without a recorded approval is a gap — flag it, don't hide it.
