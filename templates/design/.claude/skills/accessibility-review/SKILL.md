---
name: accessibility-review
description: Use when reviewing a screen, flow, or Figma frame for accessibility. A WCAG 2.2 AA checklist covering contrast, keyboard navigation, focus order, alt text, and semantic structure.
---

# Accessibility review playbook

Accessibility is a requirement, not a nice-to-have. This skill runs a design against WCAG 2.2 Level AA so that people using assistive technology, keyboards, or low-vision settings can complete the task. Use it any time you review a screen, flow, or Figma frame.

## Contrast

- **Body text** — at least **4.5:1** against its background (WCAG 1.4.3).
- **Large text** (>=24px, or >=18.66px bold) — at least **3:1**.
- **UI components and meaningful graphics** (icons, input borders, focus rings) — at least **3:1** (WCAG 1.4.11).
- Check every state — hover, disabled, placeholder, and text set over images or gradients.

## Keyboard navigation

- Every interactive element is reachable and operable with the keyboard alone (WCAG 2.1.1).
- No keyboard traps — the user can always move focus away from a component (WCAG 2.1.2).
- Custom controls (menus, tabs, sliders) support the expected keys (arrows, Enter, Space, Escape).

## Focus order and visible focus

- Focus order follows the visual and logical reading order (WCAG 2.4.3).
- Focus is always visible, with an indicator meeting 3:1 contrast (WCAG 2.4.7 / 2.4.11).
- Focus is managed on route changes, dialogs, and dynamic content — it never jumps to nowhere.

## Alt text and non-text content

- Meaningful images have descriptive alt text; decorative images are marked decorative (empty alt) (WCAG 1.1.1).
- Icon-only buttons carry an accessible name.
- Information is never conveyed by color alone (WCAG 1.4.1).

## Semantic structure

- One logical heading hierarchy (h1 -> h2 -> h3), no skipped levels (WCAG 1.3.1).
- Landmarks/regions (header, nav, main, footer) are present and labeled.
- Form fields have programmatically associated labels; errors are announced (WCAG 3.3.1 / 3.3.2).
- Reading order and DOM order match the visual order.

## Target size and motion

- Interactive targets are at least 24x24 px, or have adequate spacing (WCAG 2.5.8).
- Motion and auto-playing content can be paused or reduced (WCAG 2.2.2); honor reduced-motion preferences.

## Finding format

For each issue, record separately:
- **Element** — what it is and where it lives.
- **Observation** — what the design does.
- **WCAG criterion** — the specific success criterion it fails (e.g. 1.4.3 Contrast).
- **Severity** — blocker / major / minor.
- **Recommendation** — the fix.

## Before you finish

- Every text and UI element has been checked for contrast against the AA thresholds.
- Keyboard operability, focus order, and visible focus are confirmed.
- Alt text, color-independence, and semantic structure are covered.
- Each finding cites the WCAG success criterion it fails.
- Failures are surfaced loudly; a blocker is never softened into a suggestion (Rule 12).
