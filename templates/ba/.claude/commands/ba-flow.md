---
description: Model a business process as a mermaid flow with actors, triggers, decisions, and edges.
---

Usage: `/ba-flow <process-name>`

Steps:
1. Identify the actors (human roles + systems) and the trigger that starts the process.
2. Identify the terminal states (success, failure modes, abandonment).
3. Produce a mermaid diagram — `sequenceDiagram` for multi-actor handoffs, `flowchart TD` for decision-heavy single-actor processes.
4. List every decision point as a bullet under "Decisions" with the rule that governs the branch.
5. List edge cases and exception flows as bullets under "Edge cases" (timeout, permission denied, concurrent modification, data missing).
6. List assumptions and open questions under "Open Questions".
7. Save to `requirements/flows/<process-name>.md` and append a one-line entry to `requirements/INDEX.md`.
