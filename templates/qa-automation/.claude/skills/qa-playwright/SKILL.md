---
name: qa-playwright
description: Use WHEN authoring or debugging a Playwright spec for a web scenario. Owns Page Object + spec generation, JSDoc BDD header pattern (team convention — no .feature files for web), self-healing state.
---

# When to apply

- Authoring a NEW Playwright spec from a JSDoc BDD block or PRD.
- Adding a Page Object for a new screen/component.
- Fixing a flake — do the diagnosis (retry not a fix), then patch the wait/locator strategy.

# When NOT to apply

- Mobile flows → use `qa-maestro`.
- App code changes to fix a UI bug the spec exposed → NOT this skill. Escalate via `/escalate`.
- Manual QA sessions → use the `qa` profile.

# Team convention — the BDD delivery mode is different from mobile

**Mobile** authors `.feature` files → Maestro YAML.
**Web** SKIPS `.feature` files: BDD scenarios go into a **JSDoc header block** at the top of each spec file, then codified directly as Playwright + Page Object.

Reason: web team runs BDD as documentation-in-code, not as executable Gherkin. Cheaper to maintain than a parallel `.feature` tree.

# Workflow

```
JSDoc BDD block → gherkin-bdd parse → Page Object + spec → local run → CI → self-healing check
```

## 1. Spec structure (canonical shape)

Every spec starts with a JSDoc header enumerating scenarios by tag + TC-number:

```js
// @ts-check
/**
 * CLP — Like A Review
 *
 * Covers the 22 scenarios from the feature spec:
 *
 *   Display       TC1  Positive — Like icon on C4K cards
 *                 TC2  Negative — Like icon NOT on Google cards
 *                 TC3  Negative — Like icon hidden on own review
 *                 TC4  Positive — Guest sees like icon on all C4K cards
 *
 *   Count         TC5  Positive — Count shown when >=1
 *                 TC6  Positive — Count hidden when zero
 *
 *   Auth gate     TC15 Negative — Login prompt on guest click
 *                 TC16 Positive — Like auto-applied after login from prompt
 *                 TC17 Negative — Dismissing prompt does NOT apply like
 *
 *   Boundary      TC18 Boundary — 0->1 shows count
 *
 *   A11y          TC21 Positive — Keyboard nav (Tab + Enter/Space)
 *                 TC22 Positive — Screen reader announces state
 *
 * Each test self-heals state at the end (unlike any like it created) so the
 * suite can run repeatedly without polluting the fixture centre.
 */

const { test, expect } = require('@playwright/test');
const { CLPReviewPage } = require('../../pages/CLPReviewPage');
const { CLP_REVIEW } = require('../../fixtures/test-data');

test.describe('CLP Like A Review — Guest mode', () => {
  let clp;
  test.beforeEach(async ({ page }) => {
    clp = new CLPReviewPage(page);
    await clp.goto(CLP_REVIEW.path);
    await clp.openDrawer();
  });

  test('TC1 — Positive: like icon displayed on every C4K review card', async () => {
    const cards = await clp.getAllCardsSummary();
    expect(cards.every(c => c.hasLikeIcon)).toBe(true);
  });
});
```

Rules:

- ONE `test.describe` per JSDoc block. Nested describe only for auth-mode splits (`Guest` vs `Logged-in`).
- ONE `test(...)` per TC number. Test name = `"TCn — <Tag>: <name>"`. That prefix is REQUIRED — CI dashboard parses it.

## 2. Page Object convention

Layout:

```
tests-e2e/
├── pages/
│   ├── CLPReviewPage.js       # one class per screen/route
│   └── BaseAuthPage.js        # shared auth flows (login, logout, guest-mode)
├── fixtures/
│   └── test-data.js
├── specs/
│   └── clp/
│       └── clp-like-review.spec.js
└── playwright.config.js
```

Rules:

- ONE Page Object per **screen** (not per component). A screen = a distinct route or a modal.
- Page Object exposes SEMANTIC actions (`openDrawer()`, `likeCard(cardId)`) — NEVER raw locators.
- Locators are private (underscore-prefix or `#privateField`). Tests never touch them.
- Shared setup that spans multiple pages → `BaseAuthPage.js`. Do NOT copy-paste.

## 3. Locator strategy

Priority order (tightest to loosest):

1. `getByRole('button', { name: 'Like' })` — semantic; passes a11y check for free.
2. `getByTestId('like-btn')` — test-only ID; safest against copy changes.
3. `getByText('Like')` — brittle across i18n; only when 1 + 2 unavailable.
4. CSS selectors — LAST RESORT; document why in a comment.

NEVER use xpath. NEVER use `page.locator('div > div:nth-child(3)')`.

## 4. Self-healing state (REQUIRED)

Each test MUST undo what it did in an `afterEach` or inside the `test()` body:

```js
test('TC17 — Positive: like persists after refresh', async ({ page }) => {
  const initial = await clp.getCardLikeState('c4k-42');
  await clp.likeCard('c4k-42');
  await page.reload();
  await expect(clp.getCardLikeState('c4k-42')).resolves.toBe(true);

  // Self-heal: revert to initial state so the suite re-runs cleanly.
  if (!initial) await clp.unlikeCard('c4k-42');
});
```

Reason: the target dataset (`fixtures/test-data.js`) points at a shared staging environment. A test that leaks state pollutes the next run.

## 5. Flake diagnosis (NOT `retries: 3`)

Adding retries hides the real problem. When a test flakes:

1. Run 10x locally with `--repeat-each=10`. Get the exact failure signature.
2. Root cause: race (missing `await expect(...).toBeVisible()`), stale DOM (need `page.reload()`), or fixture drift (data changed under you).
3. Fix the underlying cause. Only THEN allow `retries: 1` for the specific test as a safety net.

# Related install

If the target repo installed via the `react` or `next` profile, `playwright.config.js` may already exist — do NOT overwrite it. This skill authors under `tests-e2e/**` only.

# Output

- New/modified `tests-e2e/specs/**/*.spec.js` + `tests-e2e/pages/**/*.js`.
- One row per Scenario in `docs/qa-automation-coverage.md`.
- ZERO changes to app code.
