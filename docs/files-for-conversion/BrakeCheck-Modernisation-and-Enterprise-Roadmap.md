# BrakeCheck — Modernisation & Enterprise Roadmap

**Status:** Draft for executive review
**Prepared:** 2026-04-22
**Scope:** Existing Android application, CI/CD, test harness, AI-managed operation, enterprise-grade feature set
**Audience:** Executive sponsors, engineering leadership, prospective enterprise customers

---

## 1. Executive Summary

BrakeCheck is a specialist Android application that measures commercial-vehicle braking performance using the handset's accelerometer, GPS and optional gyroscope, writes results to a local SQLite history, emails a copy to operators, and validates a paid licence against a TTIL-hosted endpoint. The code works. It has been in the field long enough to develop a recognisable domain model and a loyal user base. But, measured against what it would take to sell this product into a large fleet operator, a regulator, or a connected-vehicle programme, the current implementation carries material risk in five areas: **correctness, security, testability, operability, and compliance**.

This document recommends a phased, three-to-four quarter programme that turns BrakeCheck from a single-APK point tool into a platform an enterprise buyer can procure with confidence. The programme is organised into four tracks that run in parallel from Q3 2026:

| Track | Outcome | Indicative duration | Priority |
|---|---|---|---|
| **A. Stabilise** | Fix the ~20 latent defects uncovered in this review that will either crash on Android 14/15 devices or produce incorrect braking numbers | 4–6 weeks | Must-do, blocker for everything else |
| **B. CI/CD & Test Harness** | Bring the project to a state where every commit runs lint, unit, instrumented and integration tests, and produces a signed, reproducible artefact | 6–10 weeks | Pre-requisite for AI-managed work and for enterprise audit |
| **C. AI-Managed Operation** | Make the codebase safe and legible for AI-assisted change — dependency injection, documented invariants, golden-data regression suite, observable runtime | 8–12 weeks | Enables step-change in delivery velocity |
| **D. Enterprise Readiness** | SSO, encryption at rest and in transit, tenancy, billing, audit, certification path | 2–3 quarters | Required to sell above a single-site licence |

**Headline numbers the executive should carry away:**

- **Zero automated tests exist today.** The single instrumented test file is 100 % commented out. Every regression is discovered in the field by a customer with a brake drum on a lorry.
- **The current release pipeline will not produce a working release APK.** Signing configuration in `app/build.gradle` is placeholder, release signing is commented out, and the Gradle wrapper is pinned to a **pre-release milestone** (`gradle-9.0-milestone-1`). CI uses JDK 11 while AGP 8.11.1 requires JDK 17.
- **Licence validation is trivially bypassable.** The server response is unsigned JSON over HTTPS with no certificate pinning; a compromised network returning `{"license":"valid"}` extends any installation indefinitely.
- **`AndroidManifest.xml`** declares `android:allowBackup="true"`, the `FileProvider` exposes the entire private and external data root, and `LocationUpdatesService` lacks the `foregroundServiceType` attribute that Android 14 made mandatory — installations on Android 14+ tablets can crash the moment a test starts.
- **No enterprise-ready features exist.** There is no SSO, no multi-tenancy, no audit log, no encrypted storage, no in-app billing, no administrator surface, no data export beyond email. Every deployment today is a single-device, single-operator licence.

The recommended programme is **~2 FTE-years of Android and platform engineering** spread over three to four calendar quarters, plus **~0.5 FTE of compliance/security partnership** for certification work. It converts BrakeCheck from a well-loved niche tool into a platform a tier-one logistics operator, Ryder fleet contract, or MOT test regulator can adopt with procurement confidence.

---

## 2. How to Read This Document

Section 3 states what BrakeCheck is today. Section 4 summarises the findings from a systematic review of every Activity, the measurement pipeline, persistence, networking, the build system, and the CI workflow. Sections 5 through 8 present the four recommendation tracks with justification for each item. Section 9 lays out a phased roadmap and decision gates. Section 10 summarises commercial and regulatory justification. The **appendices** contain the citeable technical detail: file paths, line numbers, specific algorithm risks, schema diagrams, and the raw dependency and permission audits. An engineering reader should start at the appendices. An executive reader can stop after Section 10.

Every recommendation in sections 5–8 is labelled with **Priority** (P0 blocker / P1 enterprise-required / P2 enabling / P3 opportunistic), **Effort** (S < 2 weeks / M 2–6 weeks / L > 6 weeks) and a **Justification** line tied either to a concrete finding in the appendix or a commercial outcome.

---

## 3. Product & Codebase Context

BrakeCheck is a single-module Android application written in Java, targeting Android 7.0 (API 24) through Android 15 (API 36). The application package is `com.jneades.BrakeCheck`. Core surfaces are:

- **StartActivity** — launcher and permission gate.
- **TestInputActivity → MainActivity → ResultsActivity** — primary brake-test workflow, capturing accelerometer, gyroscope, magnetometer and fused-location data, displaying a live speedometer and accelerometer gauges, and emitting a PDF, CSV and JSON record.
- **CalibrationStart → CalibrationActivity** — two-year rolling calibration routine that establishes per-device slope/offset for the accelerometer axes.
- **HistoryListActivity (`database/`) / FileListActivity** — review and resend of past tests; SQLite-backed history.
- **ActivationActivity / CaptureActivity** — licence entry via manual key or QR scan; licence is checked against `https://ttil.co.uk` (an Easy Digital Downloads endpoint).
- **SettingsActivity / StartInfoActivity** — user preferences, backed by `android.preference.PreferenceActivity` (deprecated since API 28).
- **LocationUpdatesService** — bound-then-foreground service that consumes `FusedLocationProviderClient` at 1 Hz and publishes via `LocalBroadcastManager`.
- **MainApp** — the `Application` subclass that owns cross-screen state (licence status, calibration expiry, NMEA-derived altitude, service binding).

Supporting code lives in `util/` (sensor fusion, calibration data structures, custom dialog fragments, file adapters) and `mail/` (JavaMail wrappers that ship CSV attachments over SMTP).

An orphaned `gauge/` module sits at the repo root but is **not** included in `settings.gradle` — it compiles independently and has never shipped.

There are no unit tests. The CI workflow runs `./gradlew build` on pushes and pull requests to `master` and publishes no artefact.

---

## 4. Current-State Assessment

The following observations were sourced from a systematic read of every class in `app/src/main/java/com/jneades/BrakeCheck/`, every XML resource under `app/src/main/res/`, the Gradle configuration, the manifest, and the CI workflow. Supporting file:line citations are in the appendices.

### 4.1 Correctness and measurement integrity

Because BrakeCheck's output is used in vehicle-safety decisions, correctness issues dominate the risk register:

1. **NMEA altitude parsing is unguarded.** `MainApp.parseNmeaString` (`MainApp.java:198–210`) splits on commas and indexes `tokens[9]` without bounds or checksum validation. A malformed sentence from a flaky GPS puck throws `ArrayIndexOutOfBoundsException`; a sentence reporting "99999" is accepted as altitude. `Float.parseFloat` also inherits system locale, so a device in fr-FR parses "1234,56" as 1234.
2. **Sensor-fusion state is shared across threads without synchronisation.** `SensorFusion.fusedOrientation` / `gyroOrientation` / `accMagOrientation` are plain `float[]` arrays updated from the sensor hardware thread (`onSensorChanged`) and read from the `Timer` task thread (`SensorFusion.java:162`). No `volatile`, no lock — under load the consumer can read a torn value.
3. **Calibration has no sanity bounds.** `accel[i] = raw[i] * mx[i] + c[i] * GRAVITY` (`SensorFusion.java:235–237`) will happily accept `mx.x == 0`, turning every acceleration reading into a constant. There is no clamp on the calibration coefficients loaded from `SharedPreferences`.
4. **Numerical risks in the capture loop.** `Math.asin` is called on `accRef[0] * radPerG` in the GPS levelling code without clamping to [-1, 1] (risk of `NaN` contamination of downstream smoothing). The exponential-moving-average smoother propagates any `NaN` input forward permanently. Tests longer than ~16 hours lose dt precision because `event.timestamp` differences are cast to `float`.
5. **The magnetometer channel is effectively disabled.** `SensorFusion` uses a hard-coded geomagnetic reference vector `{1.0, 0.0, 0.0}` (`SensorFusion.java:253`) instead of the live magnetometer, meaning pitch/roll are not absolute-Earth-frame referenced. This may be deliberate; it is undocumented and untestable.

### 4.2 Security posture

1. **Licence flow accepts unsigned server responses.** `MainApp.EDDAction.run` uses a bare `new OkHttpClient()` with no certificate pinning, no timeouts, no response signing. A JSON `{"license":"valid",...}` from any MITM grants indefinite activation.
2. **Secrets live in source control.** `mail/Config.java:7–11` holds placeholder SMTP credentials that production builds are expected to overwrite *in-file*. `app/build.gradle:4–11` holds placeholder keystore credentials. The pattern invites accidental commits.
3. **`FileProvider` exposes the entire app sandbox.** `app/src/main/res/xml/provider_paths.xml:3–5` declares `<files-path path="/"/>`, `<external-files-path path="/"/>` and `<root-path name="root" path=""/>`. Any external app that receives one of BrakeCheck's share intents can request URIs for the SQLite database, calibration files, or any file in the app sandbox.
4. **Auto-backup is enabled, database is plaintext.** `android:allowBackup="true"` (`AndroidManifest.xml:34`) combined with an unencrypted SQLite file (`ITEST_HISTORY.DB`, `DatabaseHelper.java:28`) means vehicle registrations, test results, email addresses and activation codes are mirrored to Google Drive via adb/cloud backup.
5. **`GET_ACCOUNTS` permission** (`AndroidManifest.xml:25`) is declared but unused in code. Modern lint will flag it; Android 11+ devices will decline to grant it.
6. **`LocationUpdatesService` declares `android:permission="TODO"`** (`AndroidManifest.xml:132`). That string is not a real permission — any caller can bind. The service also lacks `android:foregroundServiceType="location"`, which is mandatory on Android 14+ and will throw at runtime.
7. **Activation code is 32 bytes of plain text in default SharedPreferences** (`ActivationActivity.java:109`). No Android Keystore, no `EncryptedSharedPreferences`.
8. **SQL construction uses concatenation of long IDs in WHERE clauses** (`DBManager.java:79, 104, 125, 133, 154, 163, 183, 190, 203, 211, 231, 248`). Because the concatenated values are all `long` primitives, classical SQL-injection through this path is not reachable — but every such site should move to parameterised queries for defence-in-depth and to satisfy static analysers.

### 4.3 Architecture and maintainability

1. **Activities are god-objects.** `MainActivity.java` exceeds ~3,500 lines, combining UI, sensor wiring, licence check, result upload and PDF rendering. `StartActivity.java` similarly conflates entry UI, permission flow, and a bespoke HTTP call to fetch server-side configuration.
2. **`MainApp` holds static mutable state** (`bIsStart`, `bIsCalibrated`, `szActivationCode`, `bIsActivated`, `m_DaysLeft`). These are read/written from multiple threads (licence `AsyncTask` post-execute, Activity onResume, sensor callbacks).
3. **Deprecated `AsyncTask` is the default concurrency primitive.** Removed from Android API 33 and discouraged since API 30.
4. **Legacy lifecycle** — `android.arch.lifecycle:1.1.1` is pinned specifically so `ProcessLifecycleOwner` still compiles; migration to `androidx.lifecycle` is overdue.
5. **Custom `SpinnerAdapterGrey` / manual font sizing / deprecated `DialogFragment`** — the UI layer predates Material Design 3, has no night-mode support, and performs pixel-level layout in Java with hard-coded magic numbers (`WIDE / 32.0f`).
6. **`CaptureActivity`** inherits from the ZXing embedded scanner but uses the old class rather than `com.journeyapps.barcodescanner.CaptureActivity`.
7. **Orphaned `gauge/` module** adds repo surface area without ever being built.
8. **Dead code** — ~7 references to `Utils.TOKEN` that is never defined (all commented `//.addHeader("Authorization", "Bearer " + Utils.TOKEN)`), large commented DVSA calibration workflow in `CalibrationStart`, commented MOT version check in `StartActivity`, unused activities and menus.

### 4.4 Build, CI/CD and test posture

1. **Gradle wrapper points at `gradle-9.0-milestone-1`** (a pre-release candidate). CI uses JDK 11 while AGP 8.11.1 mandates JDK 17. The build works today because local developers compensate manually; a fresh checkout on a clean CI agent can fail.
2. **Release signing is commented out** in `app/build.gradle:30`. The project cannot produce a Play-Store-installable APK without a human intervening.
3. **R8/ProGuard is disabled** (`minifyEnabled false`). The APK ships with full class names, method names and string literals — trivially reversible.
4. **`ExampleInstrumentedTest.java` is 100 % commented out.** No `src/test/` directory exists. There is no unit-test harness.
5. **CI runs `./gradlew build` on push and PR** — no separate lint, no test report, no artefact upload, no dependency scanning, no secret detection, no PR preview build.
6. **`strings.xml:129`** holds `<string name="auth_key">keyauthkey</string>` — a placeholder that appears in code paths and is shipped to every end user as a literal resource.
7. **`styles.xml:22`** contains `<item name="android:background">@color/colorText</item>item>` (stray `item>` text) and **line 21** sets `<item name="android:textSize">24dp</item>` (`dp` where `sp` is intended). Both are latent issues the build tolerates today.

### 4.5 UX and accessibility

1. **Every activity is locked to `screenOrientation="fullSensor"`** — including those that would be more usable portrait-only on small tablets.
2. **No `contentDescription` on the custom `Gauge` / `AccelView` / `SpeedoView` views.** Screen readers announce nothing.
3. **Hard-coded English strings in Toasts, Snackbars and `AlertDialog` messages** even though `strings.xml` exists. Any future localisation requires a sweep of ~40 call sites.
4. **No dark-mode theme**, no Material 3 surfaces, no system font-scale respect (UI scales are computed from display metrics manually).
5. **`allowBackup="true"`** is a UX *and* privacy concern: customers who wipe a device and restore often find activation codes carried over to a new account they did not intend.

### 4.6 Compliance, legal and commercial

1. **No privacy policy** shown in-app; no consent prompt for location tracking; no open-source attribution screen (required by Google Play for apps using Play Services).
2. **No data retention controls.** Every test accumulates forever. There is no "delete my data" button.
3. **No in-app billing.** Licence is sold off-Play via EDD. This is legal but constrains distribution channels (enterprise MDM deployment aside, Play Store policy wants IAP for digital goods).
4. **No audit log.** A depot manager cannot see who ran what test when.
5. **No multi-tenancy.** One depot = one APK = one licence = one email address. There is no concept of an organisation, a site, a role, or delegated administration.

---

## 5. Track A — Stabilise the Existing App

These are the items that must be fixed before any other track delivers value, because they either crash on current Android versions, produce wrong numbers, or put the release pipeline on a pre-release Gradle milestone.

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| A1 | Pin `gradle-wrapper.properties` to a stable Gradle (8.10.2+), move CI JDK to 17, re-run full build on a clean agent | P0 | S | AGP 8.x requires JDK 17; milestone Gradle is unsupported for production. A single contributor's machine currently masks this. |
| A2 | Add `android:foregroundServiceType="location"` to `LocationUpdatesService`; replace `android:permission="TODO"` with a real signature-level permission or remove the attribute | P0 | S | Android 14+ throws `ForegroundServiceTypeException` at `startForeground` without it. All tests on new tablets crash today. |
| A3 | Externalise signing: move keystore path, alias and passwords to `local.properties` / CI secrets; re-enable release signing; add a Play App Signing plan | P0 | S | Secrets must leave source control before any wider team can collaborate; no signed release possible today. |
| A4 | Lock down `FileProvider` paths in `provider_paths.xml` to only `exports/` and `shared/` subdirectories | P0 | S | `root-path="" `exposes the whole sandbox; a share intent can leak the licence DB. |
| A5 | Set `android:allowBackup="false"` or author a `data_extraction_rules.xml` that excludes the DB and prefs | P0 | S | Unencrypted SQLite otherwise mirrors to Google Drive, including activation codes. |
| A6 | Harden NMEA and calibration inputs: guard `tokens[9]`, clamp altitude to \[-500, 9000 m\], force `Locale.US` on `Float.parseFloat`, clamp `mx.x/mx.y/mx.z` to `[0.5, 2.0]`, clamp `Math.asin` input to `[-1, 1]`, reject `NaN` into the EMA smoother | P0 | M | Each of these directly affects the recorded braking number. Appendix B catalogues every site. |
| A7 | Replace the bare `new OkHttpClient()` usage with a shared, configured client: explicit timeouts, retry policy, logging interceptor behind a `BuildConfig.DEBUG` gate, and a pinned certificate for `ttil.co.uk` | P0 | S | Needed before any enterprise conversation about licence integrity. |
| A8 | Add ProGuard/R8 rules and set `minifyEnabled true` for `release` | P1 | M | Obfuscation is a standard pre-requisite for enterprise software distribution; unobfuscated release leaks class/method names. |
| A9 | Remove `GET_ACCOUNTS`; remove the orphaned `gauge/` module; delete dead `Utils.TOKEN` commented headers; repair `styles.xml` lines 21–22 | P1 | S | Lint debt; costs nothing to retire and reduces noise so real issues surface. |
| A10 | Migrate `AsyncTask` usages to `ExecutorService`/coroutines (or `WorkManager` for the licence check and result upload); migrate `android.arch.lifecycle` to `androidx.lifecycle 2.6+` | P1 | M | Required before dependency injection and testing work in Track C; otherwise test harness has to deal with a pool of deprecated primitives. |

**Exit criteria for Track A:** a fresh clone on a fresh CI runner produces a signed release APK that installs on Android 14/15, passes lint with no errors, and the manifest no longer references deprecated permissions. No new features required.

---

## 6. Track B — CI/CD and Test Harness

BrakeCheck has no tests. It has one CI job that runs `./gradlew build`. Before we can say anything credible to a regulator or a fleet customer about correctness, we need the ability to demonstrate that a specific release was evaluated against a known, versioned corpus of braking traces.

### 6.1 Test harness

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| B1 | Stand up `app/src/test/` with JUnit 5, Robolectric for Android-only classes, Mockito for collaborators | P1 | S | No unit tests exist today (Appendix D confirms `src/test` absent; `ExampleInstrumentedTest` fully commented). |
| B2 | Extract `SensorFusion` calibration math, `parseNmeaString`, `Utils.*` and the PDF/CSV writers into pure-function utility classes behind interfaces, so they can be tested without Android | P1 | M | The measurement pipeline is currently untestable in isolation — Appendix B details tight coupling to `Activity`, `SharedPreferences` and `Timer`. |
| B3 | Author a **golden-data regression suite**: a versioned folder of captured sensor + GPS traces (anonymised) from real brake tests, with expected deceleration curves in CSV. Every PR reprocesses the corpus and diffs against the golden | P0-for-safety | M | The company cannot currently demonstrate that a refactor preserved braking-calculation accuracy. This is the single most valuable testing artefact for customer confidence and regulator dialogue. |
| B4 | Add instrumented (Espresso) tests on a Firebase Test Lab matrix covering 2 tablets × 3 OS versions; smoke tests for Start → Test Input → Main → Results; UIAutomator to exercise the permission grant screens | P1 | M | Required both for CI confidence and, later, Play Store pre-launch reports. |
| B5 | Add contract tests for the licence server endpoint using a stub server (MockWebServer) with every documented EDD response shape (valid, inactive, expired, invalid, malformed) | P1 | S | Today the licence response handler has a large `if/else` chain with no coverage; changing it is scary. |
| B6 | Load and soak tests in a Gradle-managed virtual device: replay a 30-minute trace and assert no memory growth, no dropped sensor samples, battery within tolerance | P2 | M | Catches the ArrayList-unbounded-growth issue Appendix B flags for long tests. |

### 6.2 Continuous integration

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| B7 | Split CI into staged workflows: **PR pipeline** (lint, unit, assembleDebug, golden-trace diff, SCA) ~ 8 min; **main pipeline** (everything in PR + instrumented matrix + artefact signing + SBOM generation + crash-reporting upload) ~ 25 min; **release pipeline** (tag-triggered, produces signed AAB, uploads to Play internal track) | P1 | M | Today one single job runs on every push — no separation of concerns, no fast feedback, no artefact at the end. |
| B8 | Add Android Lint, Detekt (or SpotBugs), and Gradle Enterprise (or GitHub Actions caching) to the PR pipeline | P1 | S | Cheap quality gates; every finding flagged in this review would have been caught. |
| B9 | Add dependency-vulnerability scanning (OSV-Scanner or Snyk) on PR; fail on CVSS ≥ 7.0; allow-list with justification | P1 | S | `MPAndroidChart v3.1.0` (2018) and `com.sun.mail:android-mail` are typical SCA hits. |
| B10 | Add secret scanning (Gitleaks) as a pre-commit and PR check | P1 | S | Placeholder creds in `mail/Config.java` / `build.gradle` make this a live risk. |
| B11 | Produce a CycloneDX SBOM per release; attach to GitHub Release; retain for 7 years | P1 | S | Precondition for any enterprise procurement questionnaire (SOC2, ISO 27001). |
| B12 | Add Gradle build cache + Kotlin DSL migration (`build.gradle.kts`) — latter is optional but accelerates refactors | P2 | M | Quality-of-life; reduces CI minute spend materially for a small codebase like this. |
| B13 | Store release signing keys in Google Play App Signing (upload-key-only local); GitHub Actions uses an encrypted secret with OIDC to fetch from a vault | P1 | M | Eliminates the "keystore on a laptop" anti-pattern. |
| B14 | Publish per-build crash reports (Firebase Crashlytics or Sentry) with PII redaction | P1 | S | Today field failures are invisible; Track C cannot make AI-driven decisions without this signal. |

**Exit criteria for Track B:** every pull request produces a green check that includes lint, unit tests, a golden-trace regression pass, an Espresso smoke suite, an SBOM and a dependency-vulnerability report. Every tagged release produces a signed AAB, an SBOM and a crash-reporting symbol upload.

---

## 7. Track C — AI-Managed Operation

By "AI-managed" we mean the codebase is in a state where an AI assistant (Claude Code, Copilot, or a bespoke harness) can reliably make non-trivial changes — refactors, bug fixes, new features — with a high first-pass success rate and a short human review loop. That requires both code-level hygiene and operational signal.

### 7.1 Codebase legibility for AI collaborators

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| C1 | Introduce dependency injection (Hilt) so sensor, location, licence, DB and mail subsystems are swappable behind interfaces | P1 | L | Track C, and half of B, cannot execute without this. Appendix B catalogues the static and Activity-coupled collaborators that block testing. |
| C2 | Break `MainActivity`, `CalibrationActivity`, `StartActivity` into feature modules with a ViewModel per surface; migrate preference UI to `PreferenceFragmentCompat` | P1 | L | 3,000-line Activities are not AI-reviewable — the diffs become unscannable and the context window cost is punitive. |
| C3 | Replace Java + `AsyncTask` with Kotlin + coroutines incrementally (`strangler` module by module). Start at `util/` and the mail/licence classes; leave Activities until their surface is settled | P2 | L | Kotlin carries structural guarantees (nullability, data classes, sealed classes) that reduce the class of bugs AI assistants create. |
| C4 | Adopt a `CLAUDE.md` (already present — keep it current) and a per-module `DESIGN.md` that captures invariants a reader must not violate (calibration slope bounds, sensor thread rules, licence-cache refresh policy) | P1 | S | AI assistants are dramatically more reliable when load-bearing invariants are written down; today they are tribal knowledge. |
| C5 | Author an ADR (Architecture Decision Record) log in `docs/adr/` for every decision that cost someone a weekend — magnetometer replacement, 2-year calibration, email-as-transport. | P2 | S | Ensures AI (and new humans) do not revert known-hard decisions. |
| C6 | Add runtime feature flags (GrowthBook, LaunchDarkly, or an internal "remote config" JSON) so AI-authored features can ship dark and roll gradually | P1 | M | Pre-requisite for AI-accelerated delivery; otherwise every AI change is all-or-nothing. |

### 7.2 Operability signal

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| C7 | Structured, levelled logging via `Timber` (or `slf4j-android`) replacing `Log.d` and `e.printStackTrace()` at ~50 sites | P1 | M | Today failures are invisible; Appendix C lists every `printStackTrace` call site that leaks PII to logcat. |
| C8 | OpenTelemetry for the Android client with exporters for test durations, sensor sample-rate, licence-check RTT, and upload success/failure | P2 | M | Fleet dashboards need aggregate health; regulators may request per-event traces. |
| C9 | A "support-bundle" menu that exports the last N logs + last M test results as an encrypted zip for L3 triage | P1 | S | Replaces "please screenshot the error and email it" — today's actual support flow. |
| C10 | Remote-config-driven kill switch for the licence check and for the SMTP upload (so an AI-managed rollout can freeze a bad path without a forced update) | P1 | M | Pre-requisite for rolling any AI-led change to production without Play Store approval latency. |
| C11 | An "AI change log" file (`AI_ACTIVITY.md`) that any AI collaborator is prompted to append to when it makes a non-trivial change — what, why, what it did not change | P2 | S | Makes AI work auditable and reviewable as a block of commits; valuable for enterprise audit too. |

**Exit criteria for Track C:** an AI assistant can, given only the repo + the `CLAUDE.md` + the ADR log, author and ship a non-trivial refactor (e.g. "replace JavaMail with a backend-hosted email relay") with a single human review round and no regressions detected in the golden trace suite.

---

## 8. Track D — Enterprise Readiness

A fleet operator's procurement team will ask for SSO, encryption, audit, a signed SBOM, data-residency assurances, a billing mechanism they can put on a PO, and a support SLA. Here is the minimum the product must carry to clear that conversation.

### 8.1 Identity and access

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| D1 | Introduce a user/organisation/site model and move authentication to OIDC via a hosted identity layer (Auth0, WorkOS, Keycloak) — SAML and OIDC connectors out of the box | P1 | L | Current model is one-device-one-licence-one-email; unsaleable to any multi-site operator. |
| D2 | Add app-level support for enterprise SSO (Azure AD, Okta, Google Workspace) and SCIM provisioning | P1 | M | Standard ask in any RFP. |
| D3 | Device-level enrolment via Android Enterprise / managed Google Play; MDM config via `AppRestrictions` (server URL, default email domain, enforced calibration cadence) | P1 | M | Needed for fleet rollouts via Intune or SOTI. |
| D4 | Role-based access control: Tester, Calibrator, Depot Admin, Organisation Admin — enforced both client-side and (once the backend exists) server-side | P1 | M | Today every user has every capability. |

### 8.2 Encryption and data protection

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| D5 | Replace SQLite with SQLCipher or encrypted Room; keys held in Android Keystore, wrapped per-device | P1 | M | `ITEST_HISTORY.DB` is plaintext and contains vehicle identifiers (PII under GDPR). |
| D6 | Replace default `SharedPreferences` for any sensitive key (activation code, future OAuth refresh tokens, mail credentials) with `EncryptedSharedPreferences` or a Keystore-backed store | P1 | S | Appendix C lists every sensitive key currently stored plain. |
| D7 | TLS 1.2+ only, certificate pinning for `ttil.co.uk` and the future enterprise backend, HSTS preload on the web endpoint | P1 | S | Licence bypass risk (§4.2) closed. |
| D8 | Replace SMTP-as-transport with a backend REST endpoint and server-side email relay; clients authenticate with short-lived OAuth tokens | P1 | M | Eliminates shared SMTP credentials and JSON-in-email-body PII leakage; gives the operator an audit trail. |
| D9 | Signed licence payloads: server returns JWT with RS256 signature; client verifies public key pinned into app | P1 | M | Closes §4.2 (unsigned response). |
| D10 | FIPS-validated crypto modules where customer requires (Conscrypt with BoringSSL) | P2 | L | US federal / defence-adjacent fleet customers ask for this. |

### 8.3 Audit, governance and compliance

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| D11 | Immutable audit log: every test, calibration, licence check, permission grant/revoke shipped to backend; retained 7 years | P1 | M | Procurement, ISO 27001 A.12.4, DVSA traceability. |
| D12 | In-app Privacy Policy, Terms, Open Source Attribution, Consent flow on first launch; export-my-data and delete-my-data flows (GDPR Art. 15 / 17) | P1 | M | Legal blocker for EU deployment. |
| D13 | Data-residency controls — choose `eu-west`, `us-east`, `ap-southeast` at organisation onboarding; data never leaves region | P1 | L | Standard in RFPs from logistics and automotive OEMs. |
| D14 | Roadmap to **SOC 2 Type II** (12-month observation), **ISO/IEC 27001:2022** certification, and **Cyber Essentials Plus** (UK Government / MoD contracts); engage an auditor by Q1 2027 | P1 | L | One year of evidence is required; start accumulating now. |
| D15 | GDPR DPIA documented; DPA template for enterprise customers; sub-processor list published | P1 | S | Required to answer the standard procurement questionnaire. |
| D16 | Accessibility conformance: WCAG 2.2 AA target; TalkBack walkthroughs, high-contrast theme, configurable font scale, minimum 48 dp touch targets | P2 | M | Required for UK public-sector procurement; strong UX win broadly. |

### 8.4 Commercial surface

| # | Recommendation | Priority | Effort | Justification |
|---|---|---|---|---|
| D17 | Decouple licence from device: per-seat, per-site or consumption-based via the backend; keep QR activation as a "device enrolment" flow | P1 | M | Today's model (per-device code) does not scale. |
| D18 | Integrate Google Play Billing Library for consumer/small-business tier and a B2B invoicing/PO flow (Stripe Billing + NetSuite integration) for enterprise tier | P1 | M | Dual-track billing — self-serve and procurement — is table stakes. |
| D19 | Entitlements service: feature flags gated by plan (e.g. "CMI submission" on Pro, "multi-site dashboard" on Enterprise) | P2 | M | Required to monetise the platform features Track D introduces. |
| D20 | In-app usage metering (tests/month, active tablets/seat) reported to backend for billing and capacity planning | P2 | M | Enables consumption pricing and customer-success motions. |
| D21 | Customer-facing admin console (web) for organisation admins: seats, sites, calibrations, audit, export | P1 | L | The phone is no place to administer a 400-tablet fleet. |
| D22 | Support tiers: Community (forum), Business (email 1 BD), Enterprise (24×7, 99.9 % SLA, named CSM); SLA-backed uptime on backend; a status page | P1 | M | SLA is part of the procurement signature. |

---

## 9. Phased Roadmap

The tracks are independently owned but share dependencies. A plausible sequencing:

**Q3 2026 (Weeks 1–12) — Foundations**
- Track A in full (A1–A10). Non-negotiable.
- Track B through B6 and B10, B13, B14. PR CI pipeline green with unit + golden tests.
- Track C: C1 (Hilt), C4 (CLAUDE.md/DESIGN.md), C7 (Timber), C9 (support bundle).
- Track D: D5–D7 (encryption, pinning) — security quick wins.

**Q4 2026 (Weeks 13–24) — Platform**
- Track B: B4–B9, B11–B12 (instrumented matrix, SCA, SBOM, cache).
- Track C: C2 (modularisation), C6 (feature flags), C8 (OTel), C10 (kill switch).
- Track D: D1–D4 (identity + RBAC), D8–D9 (backend relay, signed licences), D11 (audit log).
- Kick off SOC 2 observation window.

**Q1 2027 (Weeks 25–36) — Enterprise surface**
- Track C: C3 (Kotlin migration, incrementally), C11 (AI change log).
- Track D: D12–D15 (privacy, residency, certification prep), D17–D20 (billing, entitlements, metering), D21 (admin console first release).
- External penetration test against the backend and the app.

**Q2 2027 (Weeks 37–52) — Scale and attest**
- Track D: D10 (FIPS, optional), D16 (WCAG), D22 (support SLA), SOC 2 Type II audit completes, ISO 27001 Stage 2.
- General availability announcement with enterprise pricing and procurement pack.

**Decision gates** — at the end of Q3 2026 (after Track A), and at the end of Q4 2026 (after the first backend release), the programme should pause for a steering-committee go/no-go. These are the two moments where scope can be most cheaply descoped if market signal moves.

---

## 10. Investment, ROI and Risk

**Headcount.** Steady-state programme needs:
- 2 senior Android engineers (full programme)
- 1 backend / platform engineer (from Q4 2026)
- 1 QA / test-engineering (from Q3 2026)
- 0.5 security / compliance partner (from Q3 2026)
- 0.25 product designer (intermittent)

**Approximate cost envelope (3 quarters, UK blended rates):** £650k–£850k direct engineering + £80k–£120k audit / certification fees + £40k–£80k tooling (Play, Firebase, identity, observability, vulnerability scanning, secret store).

**Commercial returns, indicative.** A single 1,000-tablet fleet contract at £15/tablet/month yields £180k ARR; three such contracts over the following 24 months exceeds the programme spend. The real return is optionality — without Track D the product cannot be sold into a procurement function; with it, BrakeCheck becomes a platform the incumbent brake-tester vendors will want to acquire or partner with.

**Top commercial risks** (with mitigating track):
1. Regulator (DVSA, DfT) changes the CMI submission format mid-programme → Track B3 (golden data) and Track C6 (feature flags) shorten response time from weeks to hours.
2. A competitor ships first with SSO + Play Billing → Track D sequencing brings SSO to beta by end Q4 2026.
3. An Android 15/16 change breaks a bespoke legacy API usage → Track A normalises these; Track B4 instrumented matrix catches the next one in CI.
4. Hardware sensor variability on new tablets invalidates calibration → Track B3 + C5 (ADR) make it tractable to regression test and document.

**Top technical risks:**
1. Measurement-accuracy regression during refactor → Track B3 golden data is the insurance policy; **do not start Track C without B3 in place.**
2. SMTP-as-transport replacement strands field devices that cannot reach the new backend → dual-run the SMTP and REST paths for one release; telemetry determines cut-over.
3. SQLCipher migration on already-populated devices → Track D5 must ship with a one-shot migration that re-encrypts existing data in place, tested against a corpus of real history databases.

---

## 11. Immediate Next Steps (30 days)

1. **Approve Track A funding.** Without it, nothing else is truthful.
2. **Rotate the placeholder credentials.** Treat every string in `Config.java` and `build.gradle` as compromised; issue fresh ones into a secret store.
3. **Commission a short security assessment** of the licence flow and the SMTP path, independent of this review.
4. **Adopt the `CLAUDE.md` already in the repo** as the living contract for AI-assisted work; extend it as Track C progresses.
5. **Publish this document to steering committee** with a 90-minute walkthrough; agree the two decision gates in Section 9.

---

## Appendices

- **Appendix A** — Activities and front-end findings (file:line citations)
- **Appendix B** — Measurement pipeline: sensors, location, fusion, numeric risks
- **Appendix C** — Persistence, networking, licensing, mail, FileProvider
- **Appendix D** — Build, manifest, CI, test-harness, dependency audit
- **Appendix E** — Proposed CI pipeline topology
- **Appendix F** — Proposed data model and encryption strategy
- **Appendix G** — Proposed identity and billing model
- **Appendix H** — Proposed AI-operation runbook

---

## Appendix A — Activities and front-end findings

### Entry and navigation

- `StartActivity` is the `MAIN`/`LAUNCHER` activity (`AndroidManifest.xml:80–91`). It is the only `exported="true"` entry; every other activity is implicit-false by omission, which `lint` on API 31+ flags as ambiguous — each `<activity>` should declare `android:exported` explicitly.
- Navigation is all `Intent`-based, with `parentActivityName` set in the manifest for back-stack-by-hierarchy. There is no `NavHost` / `Navigation` component.
- Several activities carry `android:noHistory="true"` (e.g. `TestInputActivity`, `MainActivity`) — deliberate to prevent the user backing into a half-finished test.

### StartActivity

- Permission request flow blocks the start of the app; uses deprecated `SharedPreferences.commit()`.
- Calls a bespoke HTTPS endpoint on start to fetch configuration; uses `new OkHttpClient()` with no timeout configuration.
- UI layout metrics are computed from `Display` measurements with magic factors (e.g. `WIDE / 32.0f`), bypassing the system font-scale setting.

### TestInputActivity

- Validates user input only for emptiness (e.g. user name, vehicle ID). No length bounds, no character class restriction, no format check on work-order numbers beyond emptiness.
- `SpinnerAdapterGrey` sets `0xffcccccc` inline rather than via a color resource.
- Deprecated `editor.commit()` is used instead of `apply()`.
- Test-type selection (`getSelectedItemId() == 4`) uses a magic number for "Other" rather than an enum or a resource-backed value.

### CalibrationActivity

- Manual smoothing filter with hard-coded `smooth = 0.3859f`.
- JSON for calibration is built with manual `StringBuilder` concatenation; no versioning field, so format migration is impossible without breaking existing calibrations.
- Password-check logic uses `substring(0, 4)` / `substring(4)` against a user-entered string — brittle if the pattern changes.
- Exception sites (e.g. DB operations in the calibration write path) use `e.printStackTrace()` and a user-facing `Toast`; there is no structured logging or crash report.

### ResultsActivity

- CSV parsing uses `StringTokenizer` with no encoding specification.
- Array access `values[N]` without bounds checking on lines parsing result rows — an empty row from a truncated test file raises `IndexOutOfBoundsException`.
- Graph description is disabled on the `LineChart`, so screen readers have nothing to announce.
- `MPAndroidChart v3.1.0` (2018) provides the chart — no security patches since release.

### FileListActivity / HistoryListActivity

- SD-card path discovery uses deprecated environment variables (`SECONDARY_STORAGE`, `EXTERNAL_SDCARD_STORAGE`); does not use scoped storage. Will gradually stop working on new Android versions.
- `listFiles()` results used without null checks.
- `SimpleCursorAdapter` — legacy; modern equivalent is RecyclerView + a list adapter populated by a Room query / `Flow`.
- Email default recipient `"email@ttil.co.uk"` is in `strings.xml`.

### Custom views

- `AccelView`, `LatAccelView`, `LogoView`, `SpeedoView` extend the in-repo `Gauge` base. None declare `contentDescription`. None respect system font scaling.
- `GestureDetector` handling has no haptic-feedback announcement.
- Colour references: `colors.xml` defines `colorBackground #000020` and `colorText #fafafa` — permanently dark, no theme alternative.

### Theming and localisation

- `styles.xml`:
  - Line 21: `<item name="android:textSize">24dp</item>` — should be `24sp`.
  - Line 22: `<item name="android:background">@color/colorText</item>item>` — the stray `item>` is invalid markup tolerated by the resources compiler.
- Only `values/` exists — no `values-xx/` for any other locale. Hard-coded English strings in `Toast.makeText`, `AlertDialog.setMessage`, and a handful of `Snackbar.make` sites.
- No `Theme.Material3.*` usage. No night-mode qualifier.

---

## Appendix B — Measurement pipeline

### Sensor fusion (`util/SensorFusion.java`)

- Implements a complementary filter combining gyro-integrated orientation with accel/mag-derived orientation; weighting `filter_coeff = 0.98f` (line 119) — 98 % gyro, 2 % accel/mag.
- Initialisation consumes 125 samples (line 116) to establish a baseline before fusion begins. During init, the algorithm returns stale data; `SensorFusion.getInit()` gates consumers.
- Calibration applied in `setSensorValues` (lines 235–237): `accel[i] = raw[i] * mx[i] + c[i] * GRAVITY`. **`mx` is not clamped** — a corrupted calibration with `mx.x == 0` silently produces a constant acceleration.
- **Magnetometer is replaced with a constant** `geomagnetic = {1.0f, 0.0f, 0.0f}` (line 253). Pitch/roll are therefore not Earth-frame absolute. Whether this is deliberate (to reduce magnetic-interference sensitivity in vehicle cabins) is undocumented.
- **Thread safety**: `gyroOrientation`, `fusedOrientation`, `accMagOrientation` are non-volatile `float[]` arrays updated from the sensor-hardware thread in `onSensorChanged` and read from the fusion `Timer` task thread (line 162). Torn-read risk.
- **Tight coupling**: holds a reference to `Activity` and calls `((MainActivity) mActivity).getAccXY()` (line 595), making isolated unit testing impossible.
- **Lifecycle**: spawns an internal `Timer` (line 162) with `scheduleAtFixedRate(20 ms)` — leaks if the activity that owns the fusion instance is destroyed without calling `stopFuseTimer`.

### NMEA parsing (`MainApp.parseNmeaString`)

- Lines 198–210 split on commas and index `tokens[9]` unguarded.
- No checksum validation.
- `Float.parseFloat(tokens[9])` uses platform locale — `fr-FR` will misparse "1234,56" as 1234.
- No altitude clamp; "99999" is accepted.

### Capture loop (`MainActivity.addAccelRecord`)

- Smoothing: `accSmooth += 0.3859 * (acc - accSmooth)` — EMA with time-constant not specified relative to sample rate (sample rate is `SENSOR_DELAY_GAME`, ~50 Hz, giving an effective filter cutoff of ~20 Hz). If an AI or human refactor changes the sample rate, the smoother behaves differently without warning.
- `Math.asin(accRef[0] * radPerG)` without clamping `[-1, 1]` — `NaN` risk when device briefly goes past 90°.
- `dt = (float)((event.timestamp - lastTimestamp) * NS2S)` — cast to `float` loses precision beyond ~16 h of cumulative nanoseconds; real brake tests are seconds, so this is only a theoretical long-session risk, but worth noting for soak tests.
- `ArrayList<RecordItem> recordItems` appended from the sensor thread while `setGraphData` iterates on the UI thread — concurrent-modification risk, no `CopyOnWriteArrayList`.
- `RecordItem.clone()` manually copies 66 fields by hand; adding a field requires remembering to update `clone()`.

### Location service (`LocationUpdatesService.java`)

- Uses `FusedLocationProviderClient` with `PRIORITY_HIGH_ACCURACY`, 1000 ms interval, 500 ms fastest.
- Returns `START_NOT_STICKY` from `onStartCommand` — deliberate; means a crash does not auto-restart. Combined with a bound client, the service will promote itself to foreground on `onUnbind` to survive backgrounding.
- **Missing `android:foregroundServiceType="location"`** in the manifest — crash on Android 14+ at `startForeground`.
- Manifest `android:permission="TODO"` — invalid, equivalent to no permission.

### Calibration storage

- Calibration slopes/offsets live in `SharedPreferences`; read unsynchronised from multiple threads (`SensorFusion.java:184–190`).
- `MainApp.updateIsCalibrated` uses 2 years + 1 day from the stored `calibrationDateKey` as expiry.

---

## Appendix C — Persistence, networking, licensing, mail

### SQLite (`database/DatabaseHelper.java`, `database/DBManager.java`)

- Database `ITEST_HISTORY.DB`, version `1`. Single `HISTORY` table, columns: `_id, unitreg, date, datelong, result, sent, sendattempts, recordtype, jsonfileuri, csvfileuri, jsoncontent, rydercontent`.
- `DatabaseHelper.onUpgrade` performs drop + recreate — schema change will delete user history. Unacceptable for enterprise retention.
- No row-level encryption; no PII column masking.
- `DBManager` WHERE clauses use `"_ID = " + _id` and `"DATELONG < " + newDate` style concatenation (lines 79, 104, 125, 133, 154, 163, 183, 190, 203, 211, 231, 248). Both operands are `long`, so classical SQLi is not reachable via these sites — still, the pattern should be migrated to selection args for defence-in-depth and to satisfy automated SAST.

### SharedPreferences

- Sensitive keys stored plain: `activationCode` (32-char licence), `activationExpiryDate`, `isActivated`, `calibrationDateKey`, `pref_emailKey2`.
- Non-sensitive keys (brake thresholds, unit choices, test type) also here.
- No use of `EncryptedSharedPreferences` or Android Keystore. `allowBackup=true` means these keys auto-backup unencrypted.

### Licence flow (`ActivationActivity`, `MainApp.EDDAction`)

- Endpoint: `https://ttil.co.uk/index.php?edd_action=check_license&license=<32-char>&item_id=39`.
- Transport: HTTPS, no certificate pinning.
- Client: `new OkHttpClient()` with no timeout, no interceptor, no retry policy.
- Server returns JSON (unsigned) parsed with `JSONObject`; top-level key `license` drives a switch with no default crash.
- Offline mode: the last known `isActivated` boolean in prefs is trusted indefinitely if the server is unreachable.
- **Bypass vector**: any MITM with a forged certificate returns `{"license":"valid", ...}` and the app believes it.
- The `Authorization: Bearer + Utils.TOKEN` header is commented out in 7 files (`StartActivity:359`, `CalibrationStart:213,226`, `ActivationActivity:350`, `MainApp:469`, `MainActivity:646`, `HistoryListActivity:923`) — `Utils.TOKEN` does not exist.

### Mail (`mail/Config.java`, `mail/SendMail.java`, `mail/EmailUtil.java`)

- SMTP credentials are constants in source (`Config.java:7–11`), shipped in the APK.
- STARTTLS + TLSv1.2 — configured correctly.
- Sender hard-coded to `BrakeCheck@ttil.co.uk` (`SendMail.java:133`). Default recipient `email@ttil.co.uk` (`HistoryListActivity.java:659`).
- Email body concatenates the full JSON test result — ships PII over SMTP.
- Error handling: `e.printStackTrace()` to logcat — credentials can appear in exception messages.
- Fire-and-forget `AsyncTask`; no retry queue; no offline persistence.

### FileProvider

- `res/xml/provider_paths.xml`:
  ```xml
  <files-path name="int_files" path="/"/>
  <external-files-path name="ext_files" path="/"/>
  <root-path name="root" path="" />
  ```
- `<root-path>` with empty `path` exposes the entire filesystem accessible to the app. Any share intent receiver can request URIs for anything.

### Logging

- 19 files use `printStackTrace()`. Exceptions from JSON parse, licence check, SMTP and DB flows can all leak PII (full JSON payloads, email addresses, activation codes-in-URL) to logcat.
- On debuggable builds, logcat is readable by any ADB-connected host.

### Hard-coded endpoints

| Value | File | Line |
|---|---|---|
| `https://ttil.co.uk/index.php?` | `Utils.java` | 110 |
| `&item_id=39` | `Utils.java` | 111 |
| `BrakeCheck@ttil.co.uk` | `SendMail.java` | 133 |
| `email@ttil.co.uk` | `HistoryListActivity.java` | 659 |
| `<string name="auth_key">keyauthkey</string>` | `res/values/strings.xml` | 129 |

---

## Appendix D — Build, manifest, CI, dependency audit

### Build

- Root `build.gradle`: AGP `8.11.1` (line 9). No version catalogue; versions scattered.
- `gradle-wrapper.properties`: `gradle-9.0-milestone-1` — pre-release. Should be `gradle-8.10.2` or `8.12` (stable).
- `app/build.gradle`: `compileSdkVersion 36`, `minSdkVersion 24`, `targetSdkVersion 36`, `versionCode 1002`, `versionName '1.0.2'`.
- `sourceCompatibility` / `targetCompatibility` not set; compiler defaults used.
- Signing: placeholder `storeFile file('certificate path')`, hard-coded passwords, `release` `signingConfig` commented out (line 30).
- `minifyEnabled false` — R8 disabled for release.
- `productFlavors {}` empty; no staging/prod/internal split.
- APK naming customised to `BrakeCheck-${versionName}.apk`.

### ProGuard (`app/proguard-rules.pro`)

- 99 % commented. Remaining rules reference `android.support.v4` and ActionBarSherlock (neither in use). Effectively no R8 configuration.

### Manifest findings (already enumerated in §4.2 and Appendix C)

Notable additions:
- No `android:dataExtractionRules` attribute — Android 12+ should have an explicit `data_extraction_rules.xml`.
- No `networkSecurityConfig` — should pin certs and disable cleartext.
- `android:screenOrientation="fullSensor"` on every user-facing activity.

### Dependencies (`app/build.gradle:61–110`)

| Dependency | Version | State |
|---|---|---|
| `com.android.support.test.espresso:espresso-core` | 2.2.2 | 2015; replace with `androidx.test.espresso:espresso-core:3.5.1+` |
| `androidx.appcompat:appcompat` | 1.7.1 | current |
| `com.google.android.material:material` | 1.12.0 | current — still Material 2 surface, no Material 3 adoption |
| `androidx.vectordrawable:vectordrawable` | 1.2.0 | current |
| `androidx.constraintlayout:constraintlayout` | 2.2.1 | current |
| `androidx.legacy:legacy-support-v4` | 1.0.0 | legacy, retire when callers migrate |
| `android.arch.lifecycle:extensions` | 1.1.1 | pre-AndroidX, pinned; migrate to `androidx.lifecycle:2.6+` |
| `android.arch.lifecycle:runtime` | 1.1.1 | same |
| `commons-codec:commons-codec` | 1.19.0 | current |
| `com.google.zxing:javase` | 3.5.3 | current |
| `com.squareup.okhttp3:okhttp` | 4.12.0 | current; consider 4.12.1 / 5.0 alpha |
| `com.sun.mail:android-mail` | 1.6.7 | retire in favour of backend relay |
| `com.sun.mail:android-activation` | 1.6.7 | ditto |
| `com.journeyapps:zxing-android-embedded` | 4.3.0 | current |
| `com.github.PhilJay:MPAndroidChart` | v3.1.0 | 2018, unmaintained; consider `vico` or `MPAndroidChart` fork |
| `com.google.android.gms:play-services-location` | 21.3.0 | current |
| `junit:junit` | 4.13.2 | usable; plan JUnit 5 migration |

### CI (`.github/workflows/android.yml`)

- Single job, `ubuntu-latest`, `actions/setup-java@v4` with `java-version: '11'`, Gradle cache enabled, runs `./gradlew build`.
- No test report upload, no artefact, no lint, no SCA, no SBOM, no signed release, no caching beyond Gradle.
- JDK 11 mismatches AGP 8.x requirement of JDK 17 — build likely only works because developers override locally or the Gradle daemon self-upgrades.

### Tests

- `app/src/test/` — does not exist.
- `app/src/androidTest/` — one file, fully commented.
- No coverage reporting.

### Orphaned module

- `gauge/build.gradle` declares `com.android.library`; not listed in `settings.gradle`. Never built. Contains a pre-AndroidX dependency on `com.android.support:appcompat-v7:26.+` — would fail to build against current platform if re-included.

---

## Appendix E — Proposed CI Pipeline Topology

```
┌──────────────────────────── PR pipeline (target ≤ 8 min) ────────────────────────────┐
│                                                                                       │
│  lint ── detekt ── unit+robolectric ── golden-trace diff ── assembleDebug             │
│                                            ↓                                           │
│                                       SCA (OSV-Scanner) ── secret-scan (Gitleaks)     │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────── main pipeline (target ≤ 25 min) ─────────────────────────┐
│                                                                                       │
│  everything in PR                                                                     │
│     + instrumented (Firebase Test Lab, 2 tablets × 3 OS)                              │
│     + soak-trace replay                                                               │
│     + SBOM (CycloneDX)                                                                │
│     + symbol upload (Crashlytics / Sentry)                                            │
│     + signed AAB → internal track                                                     │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────── release pipeline (tag v*) ───────────────────────────────┐
│                                                                                       │
│  main pipeline + promote → closed track → external QA → production track              │
│     + GitHub Release attaches AAB, mapping.txt, SBOM, changelog                       │
│     + Slack / email ops notification                                                  │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Keystore and tokens live in GitHub Actions secrets (or a dedicated vault) and are fetched at job start via OIDC; no secret is ever printed to logs. The runner clears the Gradle cache once per week to catch stale-cache bugs.

---

## Appendix F — Proposed Data Model and Encryption Strategy

**Client-side (device):**
- SQLCipher-encrypted Room database; key derived from a per-device random salt stored in Android Keystore (`EC` or `AES256-GCM`, StrongBox-backed where available).
- Migration path from legacy plain SQLite: one-shot re-encryption on first launch of the new version; migration progress surfaced in UI; rollback-safe.
- `EncryptedSharedPreferences` for any key flagged sensitive in Appendix C.
- Files in app-private storage only; external storage never written to.

**Client → backend:**
- All mutations (`test result submitted`, `calibration recorded`, `licence validated`) go through a single REST API authenticated with short-lived OAuth2 access tokens from the identity provider.
- Large payloads (raw sensor traces) uploaded via pre-signed URLs to object storage (S3/GCS) with server-side encryption.
- Certificate pinning for the API hostname and the identity hostname.

**Backend (future, not in scope for this document):**
- Row-level encryption in Postgres for PII columns; KMS-managed keys.
- Audit log stream to append-only storage (e.g. AWS QLDB or an equivalent); retention 7 years, immutable under WORM policy.

---

## Appendix G — Proposed Identity, Tenancy and Billing Model

**Entities.** `Organisation → Site → User`. `User` has one or more `Role` (Tester, Calibrator, Depot Admin, Org Admin). A `Device` is enrolled to a `Site` and carries a short-lived device-attestation token refreshed on each check-in.

**Authentication.** OIDC with hosted provider. Enterprise customers federate their IdP (Okta, Azure AD, Google Workspace) via SAML or OIDC. SCIM v2 for user provisioning.

**Authorisation.** JWT access tokens include organisation ID, site ID, role list. Server enforces; client hides UI elements for unauthorised capabilities.

**Billing.** Two tracks:
- **Self-serve.** Google Play Billing, monthly/annual, up to N seats.
- **Procurement.** Stripe Billing via sales. Optional integration with customer's NetSuite/Coupa.

**Entitlements.** Feature flags keyed by plan; evaluated client-side with the server as source of truth. Offline grace period 72 h.

**Metering.** Tests per month, active devices, API calls — metered events shipped to backend nightly (or on reconnect), retained 13 months for billing and 7 years for audit.

---

## Appendix H — Proposed AI-Operation Runbook

1. **Invariants file (`docs/adr/INVARIANTS.md`)** — every load-bearing rule (calibration slope range, sensor-thread write rules, licence cache refresh cadence) stated as a one-line assertion with a link to the backing test.
2. **AI change log (`AI_ACTIVITY.md`)** — every AI-authored commit appends a short entry: intent, files touched, tests added, risk assessed. Reviewers read this before the diff.
3. **Per-task prompt templates** in `docs/prompts/` — e.g. `add-new-test-type.md`, `migrate-settings-screen.md` — capture what research the AI must do before touching code. Reduces context thrash.
4. **Feature-flag-first rule** — no AI-authored feature ships without a kill switch. Enforced by a `pre-push` hook that scans new code for `BuildConfig`-gated paths or remote-config lookups.
5. **Golden-trace requirement** — any change to measurement code must include at least one new golden-trace test case or justify in the change log why none applies.
6. **Dual-review policy for security-relevant files** — `manifest`, `Config.java`, anything under `mail/` or the licence flow — requires one human reviewer in addition to AI review.
7. **Post-release telemetry watch** — for 72 h after a release, an AI agent watches crash-reporter, cross-references new crashes against the diff, and pages the on-call if any regression correlates with the release.
8. **Knowledge hygiene** — weekly, an AI agent runs `docs/consistency-check.md` which asserts `CLAUDE.md` references still resolve, `docs/adr/` links aren't dead, and `INVARIANTS.md` assertions still have live tests.

---

*End of document.*
