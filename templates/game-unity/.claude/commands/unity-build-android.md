---
description: Run Unity Android build via CLI batchmode and (optionally) deploy to a connected ADB device with logcat capture.
---

Use `/unity-build-android [--deploy] [--target dev|release]` to build.

## What it does

1. Verifies `$UNITY` env var points to a Unity Editor executable.
2. Verifies `adb` on PATH (if `--deploy` passed).
3. Dispatches `build-and-test` agent with the batchmode flags:
   ```bash
   "$UNITY" -batchmode -nographics -quit -projectPath . \
     -buildTarget Android -executeMethod Build.Android{Dev|Release} \
     -logFile build.log
   ```
4. On success: computes SHA256 → writes `build/game.apk.sha256`.
5. If `--deploy` passed: `adb install -r build/game.apk` + starts logcat capture into `.ennam/build-and-test/runs/<timestamp>/device.log`.

## What it does NOT do

- iOS build (defer to v1.8.x)
- Sign release builds (build script `Build.AndroidRelease` is responsible for keystore — agent does not handle credentials)
- Push to Play Console (manual or fastlane lane outside this scaffold)

## Arguments

- `--deploy` — install + logcat after build
- `--target dev|release` — default `dev`. Selects `Build.AndroidDev` vs `Build.AndroidRelease` executeMethod.

## Example

```
/unity-build-android --deploy --target dev
```
