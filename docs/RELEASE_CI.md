# Release CI

`.github/workflows/release.yml` builds Recapd with the **native toolchains** — Gradle and Xcode, no
Expo account, no EAS credits — and ships it **to testers**: Play internal track and TestFlight.
It never releases to the public stores.

## Why not straight to production

- App Review takes days and a version can only be submitted once. A merge-triggered production
  submit would queue behind the previous one and fail with `already submitted this version`.
- Play production rollouts are staged and want release notes written by a human.
- macOS runners bill at **10x** on a private repo, so iOS is opt-in.

`scripts/ci/play-upload.mjs` refuses `production` outright.

## One-time setup

### 1. Export the Android upload keystore from EAS

EAS holds the keystore Play expects. `eas credentials` is interactive, so this part is manual:

```bash
npx eas-cli@24 credentials --platform android
#   -> production -> Keystore: Manage everything -> Download
mkdir -p credentials/android && mv <downloaded>.jks credentials/android/upload.jks
```

Note the keystore password, key alias and key password it prints. Do **not** generate a fresh
keystore: with Play App Signing the upload key is registered, and swapping it needs a reset request.

### 2. Get an iOS distribution certificate and profile

Two routes.

**a. Export from EAS** (keeps using the cert that shipped 1.13.0):

```bash
npx eas-cli@24 credentials --platform ios
#   -> production -> Distribution Certificate -> Download (.p12 + password)
#   -> Provisioning Profile -> Download
mkdir -p credentials/ios
# save as credentials/ios/distribution.p12 and credentials/ios/recapd-appstore.mobileprovision
```

**b. Create a fresh one owned by this repo**, via the App Store Connect API. Apple allows up to
three distribution certificates and you currently have one, so this revokes nothing.

Either way the workflow needs the `.p12`, its password, and the `.mobileprovision`.

### 3. Create a Sentry auth token

Source maps are uploaded during the native build, otherwise production stack traces stay minified
(every frame reads `app:///main.jsbundle`). Create a token at
<https://zaim-imran.sentry.io/settings/auth-tokens/> with **project:releases** and **org:read**, then:

```bash
SENTRY_AUTH_TOKEN=sntrys_... ./scripts/ci/setup-release-secrets.sh sentry
```

The `@sentry/react-native/expo` plugin writes `sentry.properties` into both native projects during
prebuild with the org and project baked in; only the token comes from the environment. Both jobs
fail fast if it is missing, so a build never silently ships without symbols.

### 4. Push everything to GitHub

```bash
./scripts/ci/setup-release-secrets.sh
```

It reads the app config from `.env`, base64s the credential files, prompts for the three passwords,
and sets `IOS_PROVISIONING_PROFILE_NAME` from the profile itself.

| Secret | Source |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | `.env` |
| `PLAY_SERVICE_ACCOUNT_JSON` | `credentials/android/serviceAccountKey.json` |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | step 1 |
| `IOS_DIST_P12_BASE64`, `IOS_DIST_P12_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64` | step 2 |
| `ASC_KEY_P8` | `~/Downloads/AuthKey_734B75F2PY.p8` |
| `SENTRY_AUTH_TOKEN` | step 3 |

Variables: `IOS_PROVISIONING_PROFILE_NAME` (set by the script), plus the two switches below.

Everything under `credentials/` is gitignored. Keep it that way.

### 5. Turn it on

Both jobs are off until you say so, so merging the workflow ships nothing.

```bash
gh workflow run release.yml -f platform=android     # try one by hand first
gh variable set ENABLE_ANDROID_RELEASE --body true  # then every push to main
gh variable set ENABLE_IOS_RELEASE --body true      # iOS too (10x minutes)
```

## Versions

`app.json` `expo.version` is the **single source of truth** for the marketing version. CI checks out
clean, `ios/` and `android/` are gitignored, and `expo prebuild` regenerates both native projects
from it.

The version and the build number are both bumped by the `prepare` job, not by hand. See
[One number per release](#one-number-per-release). `scripts/ci/apply-build-number.mjs` then stamps
`versionCode` / `versionName` into `android/app/build.gradle` and `CFBundleVersion` /
`CFBundleShortVersionString` into `Info.plist`.

## What each job does

**Android** (`ubuntu-latest`): prebuild, stamp version, inject the release signing config
(`scripts/ci/android-release-signing.mjs` — the Expo template signs release with the debug key,
which Play rejects), write the keystore, `./gradlew :app:bundleRelease`, verify the AAB is
non-empty, upload to the internal track with `scripts/ci/play-upload.mjs`, shred credentials.

**iOS** (`macos-26`, Xcode 26.6): import the `.p12` into a throwaway keychain, install the profile,
prebuild, stamp version, `xcodebuild archive` with manual signing, `-exportArchive` to an IPA,
upload with `xcrun altool --upload-app` using the ASC API key, delete the keychain.

Team ID `9L246T935B` and ASC key `734B75F2PY` are baked into the workflow; they are identifiers, not
credentials.

## Promoting to production

```bash
# Android: promote the reviewed internal build
eas submit --platform android --profile production --path <the .aab from the run>
#   or the same androidpublisher flow with track: production

# iOS: TestFlight builds are already uploaded. Submitting for review needs the
# reviewSubmissions API (the legacy appStoreVersionSubmissions endpoint 403s).
```

Add Play release notes after submitting; the upload does not carry them.

## Build time

Almost all of this job is Gradle. With `newArchEnabled=true` the React Native C++ layer (Fabric,
TurboModules, codegen) is compiled **once per ABI**, and Expo's default is four of them.

Measure before changing anything here. On a **private** repo `ubuntu-latest` is **2 cores and 7 GB**,
not the 4 and 16 a public repo gets, so a tuning knob that assumes a big machine makes things worse:

| Run | ABIs | `Build the AAB` |
| --- | --- | --- |
| before any tuning | 4 | 45m18s |
| `-Xmx6g` and `--build-cache` | 3 | over 53m, hit the 60-minute timeout |

`-Xmx6g` was the mistake. The compiles that dominate are `clang` and `ninja`, native processes
**outside** the JVM, so handing 6 of 7 GB to the Gradle heap starves the work it is waiting on. The
heap is now 3 GB. `--build-cache` went with it: `expo prebuild --clean` deletes `android/` every run
and external native builds are not cacheable, so it had nothing to hit.

What is applied now:

| Lever | Effect |
| --- | --- |
| `ANDROID_ABIS` is `armeabi-v7a,arm64-v8a` | two full C++ compiles instead of four |
| ccache in `~/.ccache`, restored by `actions/cache` | repeat runs skip the compiles themselves |
| `cache: gradle` on setup-java | later runs reuse the dependency and transform cache |
| `-Xmx3g` | fits alongside the native compilers on a 7 GB runner |

ccache is the one that matters, because it survives `prebuild --clean` (the project-local
`android/app/.cxx` does not) and keys on file contents, not timestamps, which `npm ci` rewrites on
every run. A cold cache costs a few percent; a warm one skips most of the C++.

Play serves per-ABI splits from the bundle, so removing an architecture only means devices of that
kind stop receiving updates. Nothing already installed breaks.

## One number per release

`release.json` holds the last build number used. The `prepare` job bumps it, bumps the patch in
`app.json`, commits both to `main` and tags `v<version>+<build>`. Every other job checks out that
commit, so Android and iOS stamp the **same build number** even when they are built hours apart.

```
release.json { "build": 110 }   ->   android versionCode 110
app.json     "version": "1.14.1"     ios      CFBundleVersion 110
                                     tag      v1.14.1+110
```

Before this, the number was `100 + github.run_number`, and every dispatch burned one. That is why
2026-09-22 produced Android **108** and iOS **109** from the same commit.

Release notes live in `store/release-notes/`. You write the next ones in **`next.md`**; the prepare
job renames it to `<new version>.md` and leaves a fresh empty `next.md` behind. An empty `next.md`
fails the release on purpose, because the version bump is automatic and a release nobody can read is
worse than a release that did not happen.

The prepare job pushes to `main` with `GITHUB_TOKEN`, which by design does not retrigger workflows,
so there is no loop. It does need `contents: write`, and it will fail if branch protection forbids
the push.

## Submitting for review

Both jobs ship to testers by default. Run the workflow with **submission: staged** and each store
also gets a submission that sits there until you approve it. Nothing goes public without a human.

| Store | What CI creates | Where you finish it |
| --- | --- | --- |
| App Store | a review submission with the build attached, deliberately not submitted | App Store Connect → Review Submissions |
| Play | a **draft** release on the production track | Play Console → the release, then Review release and roll out |

Release notes come from `store/release-notes/<version>.md`, where `<version>` is `expo.version` in
`app.json`. Both stores get the same text. The file has to exist before a staged run or the job
fails, which is on purpose: a release without notes is a release nobody can read.

The iOS half runs in its own Linux job, because Apple takes 10 to 20 minutes to process an upload
before the build can be attached, and waiting on a macOS runner bills at 10x. It reuses an open
review submission rather than creating a second one, and it never sets `submitted`.

`play-upload.mjs` still refuses the production track outright unless `--draft` is passed.

## Things that will bite

- The Expo Android template signs release with the **debug** key. That is what the signing script
  fixes; if a future Expo upgrade reshapes `build.gradle`, the script fails loudly rather than
  silently shipping a debug-signed AAB.
- Certificates expire: the distribution cert and profile both run out **2027-05-22**. Re-export and
  re-run the setup script before then.
- `macos-26` defaults to Xcode 26.6, which satisfies Apple's Xcode 26 SDK requirement. Pinning an
  older image gets uploads rejected.
- `PROVISIONING_PROFILE_SPECIFIER` matches the profile **name**, not its UUID. EAS-generated names
  look like `*[expo] com.zaimimran.recapd AppStore 2026-01-20T14:48:50.439Z`; the setup script reads
  it out of the profile so you never type it.
- Concurrency is `cancel-in-progress: false`: a release in flight is never killed by a newer push.
