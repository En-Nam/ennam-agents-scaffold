---
name: qa-maestro
description: Use WHEN authoring or debugging a Maestro flow for a mobile scenario. Owns list_devices → inspect_screen → run loop, YAML flow conventions, cloud-run polling. Consumes `gherkin-bdd` output.
---

# When to apply

- Authoring a NEW Maestro flow from a `.feature` file.
- Debugging a failing flow (needs `inspect_screen` to re-derive locator strategy).
- Wiring cloud runs (Maestro Cloud / robot.run) for CI.

# When NOT to apply

- Web tests → use `qa-playwright` instead.
- App code changes to fix a UI bug the flow exposed → NOT this skill. Escalate to the app dev agent via `/escalate`.
- Manual QA sessions → use the `qa` profile instead.

# Workflow

```
list_devices → inspect_screen → author YAML → run locally → cloud run (CI) → assert green
     ^                                            |
     +--- (re-run inspect after each step) -------+
```

## 1. list_devices

Before ANY authoring, enumerate connected + available cloud devices:

```bash
maestro list-devices        # local emulators / connected phones
maestro cloud --list        # available cloud device matrix (needs $MAESTRO_CLOUD_API_KEY)
```

Pick ONE local target for authoring, ONE cloud target for CI reproduction.

## 2. inspect_screen (author-time locator strategy)

Before writing the first step, snapshot the view hierarchy:

```bash
maestro studio          # opens interactive inspector; export the tree JSON
maestro hierarchy       # one-shot dump to stdout
```

Rules:

- Prefer `text: "..."` (visible label) over `id: "..."` (resource ID) unless the label is duplicated or translated.
- NEVER use raw coords (`point: 100, 500`) — brittle across screen densities.
- Duplicate labels → use `text: "..." + relativeToId: "..."` compound selectors.

## 3. YAML flow conventions

**File layout:**

```
.maestro/
├── config.yaml                    # global appId + waitToStartTimeout (do NOT edit if react-native profile owns it)
├── flows/
│   ├── change-email/
│   │   ├── TC-positive_correct-otp.yaml       # 1 file per Scenario
│   │   ├── TC-negative_wrong-otp.yaml
│   │   └── _change_email_setup.yaml           # underscore-prefixed = sub-flow (reusable precondition)
```

**One file per Scenario.** Underscore-prefix sub-flows: consumed via `runFlow:` — see example below.

## 4. Concrete example (change-email OTP flow, team convention)

Given a Gherkin scenario:

```gherkin
@positive @logic @navigation @change-email
Scenario: Positive - Correct OTP updates the email and returns to Personal Details
  Given User is on the Verify Email screen
  When User enters the correct code "123456"
  Then The email is updated in the profile
  And The toast "Email successfully updated" is shown
  And The system returns to the Personal Details screen showing the new email
```

Author the YAML as:

```yaml
appId: ${APP_ID}
name: "change-email / TC-positive: Correct OTP updates email"
---
# Precondition: user on Verify Email screen (share via reusable sub-flow)
- runFlow: _change_email_setup.yaml

# When — read the DEV-OTP echo (dev build only), strip non-digits, type it
- copyTextFrom:
    text: "DEV OTP: .*"
- inputText: ${maestro.copiedText.replace(/[^0-9]/g, '')}

# Then — auto-submit on 6th digit; wait for toast + nav back
- extendedWaitUntil:
    visible:
      text: "Email successfully updated"
    timeout: 10000
- takeScreenshot: "change_email_success_toast"
- extendedWaitUntil:
    visible:
      text: "Personal Details"
    timeout: 5000
- assertVisible: "new.email@example.com"
```

Notes:

- `copyTextFrom` + `inputText: ${maestro.copiedText}` is the team's OTP handling pattern (dev build echoes OTP on-screen). Wrap the regex strip in the same step — do NOT split into two steps.
- `extendedWaitUntil` with explicit `timeout:` — plain `assertVisible` races against the toast auto-dismiss and flakes.
- `takeScreenshot:` after every observable assertion — evidence for the test report.

## 5. Cloud run polling

Local pass ≠ CI pass. Cloud run polling contract:

```bash
maestro cloud \
  --api-key "$MAESTRO_CLOUD_API_KEY" \
  --app-file build/app-release.apk \
  --device "Pixel 6 API 33" \
  --format junit \
  .maestro/flows/change-email/TC-positive_correct-otp.yaml
```

- ALWAYS pass `--format junit` in CI so the runner surfaces the failure in PR checks.
- If the upload step succeeds but the run status is `PENDING` for >5 minutes, that's a cloud-queue backlog, NOT a test failure — do not mark red.

# Reference to related install

If the target repo installed via `react-native` profile, `.maestro/config.yaml` is already present. **Do NOT overwrite it.** This skill authors flows under `.maestro/flows/**` only.

# Output

- New/modified `.maestro/flows/**/*.yaml` files.
- One `takeScreenshot:` name per observable assertion (used by CI for evidence).
- One row per Scenario in `docs/qa-automation-coverage.md` — the coverage log.
