---
description: Document a design-system token or component — usage, variants, do/don't — saved to design-system/<component>.md.
---

Usage: `/design-system <component>`

Steps:
1. Read the token or component as it exists in Figma via the figma MCP and in any current `design-system/` docs — document what's there, don't invent a new variant (Rule 11).
2. Document with sections:
   - **Usage** — when to reach for it, and when not to.
   - **Variants** — each named, with its purpose and the props/states it exposes.
   - **Do / Don't** — paired examples of correct and incorrect use.
   - **Accessibility notes** — contrast, focus, and labeling requirements for the component.
3. Keep it descriptive of the real system. If the token/component doesn't exist yet, mark the doc as a PROPOSAL pending sign-off rather than presenting it as current.
4. Save to `design-system/<component>.md`.
5. Never redefine production tokens or components here without human sign-off — surface any change you'd recommend separately (Rule 12).
