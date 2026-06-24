---
name: gherkin-acceptance-criteria
description: Use when writing or reviewing acceptance criteria, user stories, or BDD scenarios. Enforces Given/When/Then discipline, one behavior per scenario, testable verbs, no implementation details.
---

# Gherkin Acceptance Criteria

Acceptance criteria are the contract between the BA and the dev/QA agents. They are testable, behavioral, and free of implementation.

## Structure

Every scenario uses Given / When / Then:

- **Given** — the precondition / state of the world. May chain with `And`.
- **When** — the single action or event under test. Exactly one `When` per scenario.
- **Then** — the observable outcome. May chain with `And`.

```gherkin
Scenario: Customer redeems a valid loyalty voucher at checkout
  Given the customer has a voucher worth 50,000 VND in their wallet
  And the cart subtotal is at least 200,000 VND
  When the customer applies the voucher at checkout
  Then the order total is reduced by 50,000 VND
  And the voucher is marked as redeemed
```

## Rules

1. **One behavior per scenario.** If you find yourself writing two `When`s or describing two outcomes, split it.
2. **Testable verbs only.** "is displayed", "is reduced by", "is rejected with message X" — not "works correctly", "handles properly", "feels fast".
3. **No implementation details.** Never name an HTTP status, SQL query, component, or library. The dev chooses how; AC defines what.
4. **Concrete values.** Prefer `50,000 VND` over `a discount`. Prefer `at least 200,000 VND` over `a large enough cart`.
5. **Data tables for parameter sweeps.** When the same behavior applies to many inputs, use a `Scenario Outline` with `Examples:`.

```gherkin
Scenario Outline: Voucher rejected when cart is below minimum
  Given the cart subtotal is <subtotal>
  When the customer applies a voucher with minimum spend <minimum>
  Then the voucher is rejected with reason "minimum-not-met"

  Examples:
    | subtotal | minimum  |
    | 100,000  | 200,000  |
    | 0        | 50,000   |
```

## Review checklist

Before declaring AC done, confirm:

- [ ] Every scenario has exactly one `When`.
- [ ] Every `Then` is observable by the user or a downstream system.
- [ ] No scenario mentions a framework, library, endpoint, table, or HTTP code.
- [ ] Negative paths (rejection, validation, permission) are covered, not only the happy path.
- [ ] Concrete values replace vague quantifiers ("some", "many", "large").

If any item fails, fix the AC before handoff — do not let the dev or QA agent guess.
