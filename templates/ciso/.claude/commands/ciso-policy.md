---
description: Draft a security policy document for a topic, saved to security/<topic>.md.
---

Usage: `/ciso-policy <topic>`

Steps:
1. If the scope, audience, or applicable systems are missing from the request, ask the user before drafting.
2. Read any existing files in `security/` to match tone and section order.
3. Draft the policy with sections: Purpose, Scope, Policy Statements, Roles & Responsibilities, Enforcement, Exceptions, Review Cadence.
4. Ground every requirement in an existing control or a cited standard — do not invent obligations. Where the policy touches a regulatory timeline, flag it to consult legal rather than asserting the deadline.
5. Mark any assumption or unresolved decision with `?` and surface it in the handoff (Rule 12).
6. Save to `security/<topic>.md` with a `DRAFT` marker at the top until human sign-off.
7. Note that adopting or enforcing the policy is a human action — this command drafts, it does not enact.
