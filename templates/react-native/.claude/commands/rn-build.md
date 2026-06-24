---
description: Run an EAS Build for iOS, Android, or both — surfaces credentials issues and asks for confirmation before any submission to the stores.
---

Usage: `/rn-build <ios|android|all>`

Steps:
1. Validate the argument is exactly `ios`, `android`, or `all`. Stop and ask if missing or invalid.
2. Confirm `eas.json` exists and read it. List the available build profiles (`development`, `preview`, `production`) and ASK the user which profile to use — do not guess. Default suggestion: `preview` for internal sharing, `production` only for store releases.
3. Run `npx expo-doctor` and surface any issues (mismatched native deps, missing config) BEFORE invoking EAS. Stop on errors.
4. Run `eas whoami` to confirm an authenticated session. If unauthenticated, surface `eas login` and stop — do NOT run it for the user.
5. Invoke the build:
   - `ios`     → `eas build --platform ios --profile <profile>`
   - `android` → `eas build --platform android --profile <profile>`
   - `all`     → `eas build --platform all --profile <profile>`
6. If EAS prompts about credentials (push certs, keystore, provisioning profile), STOP and ask the user how to proceed — do not auto-accept `Generate new credentials` for a production build. For development / preview, generated credentials are usually fine; still confirm.
7. Stream the build URL and wait for the build to finish. On failure, fetch the EAS log tail and summarize the root cause (missing dep, native config, signing). Do not retry blindly (Rule 5, Rule 12).
8. On success, print the artifact URL(s) and the build IDs.
9. Do NOT run `eas submit` automatically. If the user asked for a store submission, ASK for explicit confirmation first: which platform, which track (TestFlight vs App Store / Internal vs Production), which release notes. Only then run `eas submit --platform <p> --profile <profile>`.
10. Write a checkpoint with: profile used, platform(s), artifact URLs, any credentials decisions made, whether `eas submit` ran.
