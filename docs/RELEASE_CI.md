# Release CI

`.github/workflows/release.yml` builds Recapd and ships it **to testers**: Play internal track and
TestFlight. It never releases to the public stores. Promotion to production stays manual, on purpose.

## Why not straight to production

- App Review takes days, and a version can only be submitted once. A merge-triggered production
  submit would queue behind the previous one and fail with `already submitted this version`.
- Play production rollouts are staged and want release notes written by a human.
- macOS runners bill at **10x** on a private repo. A 30 minute iOS build costs ~300 billable
  minutes, so iOS is opt-in rather than on by default.

## Turning it on

Both jobs are disabled until you say otherwise. Nothing ships by merging the workflow itself.

```bash
gh variable set ENABLE_ANDROID_RELEASE --body true   # Android on every push to main
gh variable set ENABLE_IOS_RELEASE --body true       # iOS too (10x minutes, read above)
```

`workflow_dispatch` ignores the variables, so you can always run it by hand from the Actions tab and
pick android / ios / both.

## Secrets

| Secret | What it is | How to produce it |
| --- | --- | --- |
| `EXPO_TOKEN` | EAS access token; lets `--local` builds fetch the signing credentials EAS already holds | expo.dev -> Account -> Access tokens |
| `PLAY_SERVICE_ACCOUNT_JSON` | base64 of `credentials/android/serviceAccountKey.json` | `base64 -i credentials/android/serviceAccountKey.json \| pbcopy` |
| `ASC_KEY_P8` | base64 of the App Store Connect key `AuthKey_734B75F2PY.p8` | `base64 -i ~/Downloads/AuthKey_734B75F2PY.p8 \| pbcopy` |

```bash
gh secret set EXPO_TOKEN
gh secret set PLAY_SERVICE_ACCOUNT_JSON < <(base64 -i credentials/android/serviceAccountKey.json)
gh secret set ASC_KEY_P8 < <(base64 -i ~/Downloads/AuthKey_734B75F2PY.p8)
```

Both key files are written to disk only for the length of the job and deleted in an `always()` step.
`credentials/android/*.json` and `credentials/ios/*.p8` are gitignored; keep it that way.

## Before the first automated submit: fix the version drift

Three places currently disagree:

| Source | Value |
| --- | --- |
| `app.json` `expo.version` | 1.12.0 |
| `ios/Recapd/Info.plist` | 1.11.0 |
| Both stores | 1.13.0 |

CI checks out clean and `ios/` is gitignored, so EAS regenerates `Info.plist` from `app.json` during
prebuild. **In CI, `app.json` is the single source of truth.** The stale `Info.plist` only affects
local builds. Bump `app.json` to match reality (1.13.0, or 1.14.0 for the next release) before
enabling the jobs, or the first upload will collide with a version the store already has.

Build numbers are handled by EAS: `eas.json` sets `appVersionSource: remote` with `autoIncrement` on
the production profile, so each build gets the next number server side.

## Environment variables

Verified with `eas-cli@24`: even though the `production` build profile has no `environment` key, the
CLI resolves the **production** EAS environment and loads `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`,
`EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
and `EXPO_PUBLIC_SUPABASE_URL` from the server. CI therefore needs no `.env` file, and the RevenueCat
keys land in the bundle the same way they do in your local builds.

## What each job does

1. Checkout, Node 22, `npm ci` (plus JDK 17 on Android).
2. Write the store credential from its secret.
3. `eas build --local --profile production` — builds on the runner, so it consumes **no EAS build
   credits**.
4. Verify the artifact is non-empty. `eas build` can exit 0 having produced nothing, so the check is
   deliberate.
5. `eas submit --profile internal` — Play internal track, or TestFlight.
6. Upload the artifact to the workflow run, kept 14 days.
7. Delete the credential file.

## Promoting to production

Still manual, and still the safer path:

```bash
# Android: move the reviewed internal build to production
eas submit --platform android --profile production --path <the .aab from the run>

# iOS: eas submit only uploads. Submitting for review needs the reviewSubmissions API
# (the legacy appStoreVersionSubmissions endpoint 403s).
```

Add Play release notes after submitting; `eas submit` does not carry them.

## Things that will bite

- `eas build --local` exits 0 on some failures. That is why step 4 exists.
- The Android build needs `ANDROID_HOME`; the job exports it from `ANDROID_SDK_ROOT`.
- `macos-26` runners default to Xcode 26.6, which satisfies Apple's Xcode 26 SDK requirement. Pinning
  an older runner image will get uploads rejected.
- Concurrency is `cancel-in-progress: false`: a release in flight is never killed by a newer push.
