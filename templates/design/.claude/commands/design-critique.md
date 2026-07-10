---
description: Run a heuristic-based usability critique of a target, saved to critiques/<target>.md.
---

Usage: `/design-critique <target>`

Steps:
1. Identify the target — a Figma frame, a screen, or a flow. Pull it from Figma via the figma MCP if it lives there.
2. Walk it against the usability heuristics (Nielsen-style) using @design-critique.
3. For each finding, record the observation and the recommendation as separate fields — never blend what you see with what you'd change.
4. Rate each finding's severity (cosmetic, minor, major, blocker) so the reader can triage.
5. Save to `critiques/<target>.md`.
6. Flag anything that also fails accessibility so it can be routed to `/design-a11y` (Rule 12).
