---
description: Run an accessibility review of a target against WCAG 2.2 AA, saved to a11y/<target>.md.
---

Usage: `/design-a11y <target>`

Steps:
1. Identify the target — a Figma frame, a screen, or a flow. Pull it from Figma via the figma MCP if it lives there.
2. Run the @accessibility-review checklist against WCAG 2.2 AA.
3. Check, at minimum: text contrast (4.5:1 for body text, 3:1 for large text and UI components), keyboard navigation, focus order and visible focus, alt text for meaningful images, and semantic structure (headings, landmarks, labels).
4. For each issue, record the observation, the WCAG success criterion it fails, the severity, and the recommendation — as separate fields.
5. Save to `a11y/<target>.md`.
6. Surface every contrast or keyboard failure loudly; do not soften a blocker into a suggestion (Rule 12).
