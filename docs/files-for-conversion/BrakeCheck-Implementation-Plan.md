# BrakeCheck — Detailed Implementation Plan

**Status:** Engineering playbook, draft for team review
**Prepared:** 2026-04-22
**Companion to:** [BrakeCheck-Modernisation-and-Enterprise-Roadmap.md](BrakeCheck-Modernisation-and-Enterprise-Roadmap.md)
**Audience:** Engineering leads, tech leads, QA lead, security partner, release manager

---

## 0. How to Use This Document

The companion roadmap answers **what** and **why**. This plan answers **how, in what order, by whom, and how we know we're done**.

Every task here carries the ID from the roadmap (e.g. `A1`, `B3`, `D11`) plus, where a task has been expanded, a dotted sub-ID (e.g. `A6.2`). Tasks are grouped first by **phase** (P1–P4, one per quarter) and second by **week** within the phase. A task in week N may have dependencies on a task from an earlier week; those dependencies are labelled `⇠ <task-id>`.

Each task carries:

- **Owner role** — who drives it (LeadAnd = lead Android engineer; And = Android engineer; Be = backend engineer; QA = QA engineer; Sec = security partner; DevOps = platform engineer; PM = product manager; UX = designer).
- **Preconditions** — what must be true before starting.
- **Steps** — ordered implementation actions, concrete enough that an engineer can start without further specification.
- **Acceptance** — the observable check that the task is done.
- **Verification** — which tests, dashboards or reviews prove it in CI.
- **Rollback** — how to revert safely if the change misbehaves in production.
- **Effort** — developer-days (d), not calendar days. A task labelled "4d" is ~1 week of one engineer's focused time assuming meetings and context-switching.

**Effort discipline.** Single-engineer estimates; multiply by 1.3× for calendar elapsed to account for review, PR turnaround, and the cost of context-switching between tasks.

**Definition of done for any task:** merged to `main`, CI green on the new pipeline, acceptance checks recorded in the PR description, and the relevant `INVARIANTS.md` / `ADR` updated if the task changed a load-bearing rule.

---

## 1. Pre-flight (Week 0 — before Phase 1 kicks off)

Tasks that must complete before any engineer opens a PR against the new programme.

### P0.1 — Rotate placeholder credentials

- **Owner:** Sec + LeadAnd
- **Preconditions:** incumbent SMTP account exists; TTIL has control of the EDD licence endpoint and keystore.
- **Steps:**
  1. Treat every string in `mail/Config.java` and `app/build.gradle:4–11` as compromised.
  2. Issue a new SMTP account for the application; store credentials in the chosen secret store (GitHub Actions encrypted secrets + a vault for local dev). Deprecate the old account at the provider within 30 days.
  3. Generate a new upload keystore and enrol in Google Play App Signing. The old keystore is retired after the first Play-signed release.
  4. Revoke and reissue any API tokens associated with the `ttil.co.uk` EDD endpoint; document rotation cadence (quarterly).
- **Acceptance:** no secret present in the repository or in build output; a `git log -p` search for the old values returns nothing from this point forward.
- **Verification:** Gitleaks baseline run passes; PR template checklist adds "no secrets committed".
- **Rollback:** n/a — rotation is one-way; old credentials stay disabled.
- **Effort:** 2d Sec + 1d LeadAnd.

### P0.2 — Establish team branching and protection rules

- **Owner:** DevOps + LeadAnd
- **Preconditions:** GitHub org settings writable.
- **Steps:**
  1. Protect `main`: require PR, require passing CI, require 1 human review, dismiss stale reviews on new push, require signed commits.
  2. Create long-lived branch `harness-enablement` for the CI/test-harness work; short-lived feature branches merge to `main` via PR.
  3. Enable CODEOWNERS: `mail/`, `AndroidManifest.xml`, `build.gradle`, `app/proguard-rules.pro`, `docs/adr/` all require Sec review.
  4. Document the branch model in `CONTRIBUTING.md`.
- **Acceptance:** `main` is protected; a direct push fails; CODEOWNERS triggers reviews as expected on a probe PR.
- **Effort:** 1d DevOps.

### P0.3 — Stand up the doc baseline

- **Owner:** LeadAnd
- **Preconditions:** `docs/` folder exists.
- **Steps:**
  1. Create `docs/adr/` with `0001-record-architecture-decisions.md` (the canonical "we use ADRs" ADR).
  2. Create `docs/adr/INVARIANTS.md` with a placeholder for each invariant the codebase relies on; populate as tasks land.
  3. Create `docs/runbooks/` for operational procedures that will be authored across the programme.
  4. Update `CLAUDE.md` to point at the invariants and the roadmap.
- **Acceptance:** the three folders exist with a non-empty seed file each.
- **Effort:** 1d.

### P0.4 — Baseline test suite

- **Owner:** QA + LeadAnd
- **Preconditions:** none.
- **Steps:**
  1. Create `app/src/test/java/` and `app/src/test/resources/`.
  2. Add a smoke unit test that imports `Utils` and asserts one public constant — enough to prove the directory is wired up.
  3. Add JUnit 5 (`org.junit.jupiter:junit-jupiter:5.10+`), Mockito-Kotlin (or Mockito), Truth as the assertion library.
  4. Confirm `./gradlew :app:test` runs the smoke test and reports it.
- **Acceptance:** `./gradlew :app:test` passes with one discovered test.
- **Effort:** 0.5d.

---

## 2. Phase 1 — Q3 2026 (Weeks 1–12): Foundations

**Goal:** a fresh checkout builds a signed release APK on a fresh CI runner; measurement-integrity bugs are closed; a golden-trace regression suite exists; sensitive data is encrypted at rest; dependency injection is in place.

### Week 1 — Build stability

#### A1 — Pin Gradle and align JDK ⇠ P0.*

- **Owner:** DevOps.
- **Preconditions:** P0.2 complete.
- **Steps:**
  1. Change `gradle/wrapper/gradle-wrapper.properties` `distributionUrl` to `gradle-8.10.2-bin.zip`. Record the SHA-256 checksum in `distributionSha256Sum=…`.
  2. Add `sourceCompatibility = JavaVersion.VERSION_17` and `targetCompatibility = JavaVersion.VERSION_17` to `app/build.gradle` under an `android { compileOptions { … } }` block.
  3. Update `.github/workflows/android.yml` `java-version` from `'11'` to `'17'`.
  4. Run `./gradlew --stop && ./gradlew build` on a clean clone to confirm the Gradle daemon picks up the new wrapper.
- **Acceptance:** CI passes on a freshly-created branch; `gradlew --version` reports `Gradle 8.10.2` on JDK 17.
- **Verification:** the `build` job of CI shows JDK 17 in its setup step.
- **Rollback:** revert the wrapper properties file; the change is isolated.
- **Effort:** 1d.

#### A2 — Foreground-service type and real permission ⇠ A1

- **Owner:** And.
- **Steps:**
  1. In `AndroidManifest.xml`, on the `<service android:name=".LocationUpdatesService" … />` element, add `android:foregroundServiceType="location"`. Remove `android:permission="TODO"`.
  2. In `LocationUpdatesService.onStartCommand`, guard the `startForeground(...)` call with the Android 14+ `ForegroundServiceStartNotAllowedException` pattern — catch and log via Timber (once Timber is installed in C7; for now, `Log.e`).
  3. Declare `<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>` and `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>` in the manifest.
- **Acceptance:** a brake test starts and runs on an Android 14 tablet without `ForegroundServiceTypeException`.
- **Verification:** new instrumented test `LocationServiceLifecycleTest.startsForegroundOnAndroid14()` fakes time and asserts the service enters the foreground.
- **Rollback:** revert manifest edit; behaviour returns to today's state (crash on Android 14+, works on ≤13).
- **Effort:** 0.5d.

#### A3 — Externalise signing + Play App Signing ⇠ A1

- **Owner:** DevOps + LeadAnd.
- **Steps:**
  1. Create `key.properties` (gitignored) template with `keyAlias`, `keyPassword`, `storeFile`, `storePassword` keys. Each developer places their copy locally; CI reads from encrypted secrets.
  2. In `app/build.gradle`, replace the hard-coded `signingConfigs.release` block with a loader that reads `key.properties` if present, otherwise leaves the config unset.
  3. Uncomment `signingConfig signingConfigs.release` in `buildTypes.release`.
  4. Upload the current APK's certificate fingerprint to Google Play App Signing; download the new upload certificate; rotate the local upload key.
- **Acceptance:** `./gradlew :app:assembleRelease` with `key.properties` present produces a signed APK; without it, the task either fails clearly or produces an unsigned APK (document which).
- **Verification:** `jarsigner -verify` on the output reports "jar verified".
- **Rollback:** re-inline placeholder passwords; revert release-build signing. Not recommended — this task is load-bearing for the rest of the programme.
- **Effort:** 2d.

#### A4 — Narrow FileProvider paths ⇠ A1

- **Owner:** And.
- **Steps:**
  1. Grep the codebase for `FileProvider.getUriForFile` to enumerate the share surface. Catalogue the directories actually shared.
  2. Rewrite `res/xml/provider_paths.xml` to include **only** those directories, typically `<files-path name="exports" path="exports/" />` and `<files-path name="pdfs" path="pdfs/" />`.
  3. Refactor any call site that passes a path outside those directories to write to `exports/` first.
- **Acceptance:** an attempt to produce a `FileProvider` URI for a file outside `exports/` throws at runtime; an automated Espresso test exercises the "share result" flow and confirms the URI is still resolvable downstream.
- **Verification:** an instrumented test `FileProviderTest.scopedPathsOnly()` asserts that `getUriForFile` on a known-private-path input throws.
- **Rollback:** revert `provider_paths.xml`. Document the exposure risk in the revert PR.
- **Effort:** 1d.

#### A5 — Lock down backup ⇠ A1

- **Owner:** And.
- **Steps:**
  1. Author `res/xml/backup_rules.xml` and `res/xml/data_extraction_rules.xml` (Android 12+ split).
  2. Exclude `databases/ITEST_HISTORY.DB`, `shared_prefs/`, and the `exports/` directory from auto-backup and device-to-device transfer.
  3. On `<application>` add `android:fullBackupContent="@xml/backup_rules"` and `android:dataExtractionRules="@xml/data_extraction_rules"`.
  4. Decision: keep `allowBackup="true"` with rules, or set to `false`. Recommendation: `false` until Track D decides whether enterprise backup is a feature.
- **Acceptance:** running `adb backup -noapk com.jneades.BrakeCheck` produces an archive that does not contain the database or the shared_prefs directory.
- **Verification:** a manual verification script in `scripts/verify-backup.sh`.
- **Rollback:** revert the two XML files and the manifest attributes.
- **Effort:** 1d.

### Weeks 2–3 — Measurement integrity

#### A6 — Numeric and input hardening

This is the single highest-leverage set of tasks in Phase 1. Each sub-item is small; they ship as one PR or two.

##### A6.1 — NMEA guarding

- **Owner:** And.
- **Steps:**
  1. In `MainApp.parseNmeaString`, replace the `tokens[9]` access with a bounds check; if `tokens.length < 10` or `tokens[0]` doesn't start with `$GPGGA`, return without updating `mLastMslAltitude`.
  2. Validate the optional `*HH` NMEA checksum suffix; reject sentences that present a checksum and fail it.
  3. Wrap `Float.parseFloat(tokens[9])` in `Float.parseFloat(s.replace(',', '.'))` and force interpretation via `java.util.Locale.US`.
  4. Clamp the result to `[-500f, 9000f]` metres before storing.
- **Acceptance:** unit test `NmeaParserTest` with fixtures for valid, short, wrong-locale, wrong-checksum, and absurd-altitude sentences all pass.
- **Effort:** 1d.

##### A6.2 — Calibration coefficient bounds

- **Owner:** And.
- **Steps:**
  1. At the point `SensorFusion.setCalibration` / the read site in `SensorFusion.setSensorValues`, assert `mx.x`, `mx.y`, `mx.z` each in `[0.5f, 2.0f]`; `c.x`, `c.y`, `c.z` each in `[-2.0f, 2.0f]`.
  2. On violation, log via Timber at `warn`, fall back to unity calibration (`mx=1,c=0`), and surface a persistent in-app notice "Calibration out of range, please recalibrate".
- **Acceptance:** unit test `CalibrationGuardTest` asserts the fallback path and the notice's state object.
- **Effort:** 1d.

##### A6.3 — Arithmetic guards in the capture loop

- **Owner:** And.
- **Steps:**
  1. In `MainActivity.addAccelRecord`, clamp the argument to `Math.asin` with `Math.max(-1.0, Math.min(1.0, x))`.
  2. In the exponential-moving-average smoother, reject NaN/Inf input: skip the update and increment a `droppedSamples` counter.
  3. Log `droppedSamples` at the end of each test into the result JSON so field issues are observable.
- **Acceptance:** unit test `SmootherTest` asserts NaN-in produces no corruption; `AsinClampTest` asserts out-of-range input doesn't yield NaN.
- **Effort:** 1d.

##### A6.4 — Clock precision note

- **Owner:** And.
- **Steps:**
  1. In `MainActivity` capture loop, change `float dt` to `double dt` and the cast accordingly.
  2. Add an ADR: `docs/adr/0002-time-precision-in-capture-loop.md` explaining the decision and what soak test covers it.
- **Acceptance:** ADR merged; existing golden traces still pass after the change.
- **Effort:** 0.5d.

#### A7 — Harden the shared OkHttp client

- **Owner:** And.
- **Steps:**
  1. Create `util/http/HttpClients.kt` (or `HttpClientFactory.java` while Java stands) exposing a single `OkHttpClient` instance configured with:
     - `connectTimeout(10s)`, `readTimeout(20s)`, `writeTimeout(20s)`
     - `retryOnConnectionFailure(true)`
     - a logging interceptor gated on `BuildConfig.DEBUG`
     - a `CertificatePinner` for `ttil.co.uk` using the leaf certificate's SPKI SHA-256 hash, sourced from `BuildConfig` at build time
  2. Replace all `new OkHttpClient()` sites (there are 7 per Appendix C of the roadmap) with `HttpClientFactory.shared()`.
  3. Remove the commented `Bearer ` + `Utils.TOKEN` headers.
- **Acceptance:** `./gradlew :app:lintRelease` shows no `BareOkHttpClient` custom lint rule violations (to be authored in B8).
- **Verification:** unit test `PinningTest.badPinRejected()` uses a local MockWebServer with a mismatched cert and asserts the request fails.
- **Rollback:** the factory is a thin shim; revert the seven call sites to regain the old behaviour.
- **Effort:** 2d.

### Week 4 — Golden-trace harness and dependency injection foundations

#### B3 — Golden-trace regression suite (initial) ⇠ A6

- **Owner:** QA + And.
- **Preconditions:** A6 merged so the capture path is stable; a small corpus of anonymised real-world traces has been captured.
- **Steps:**
  1. Create `app/src/test/resources/golden/` and add 6–10 traces as CSV + a paired `expected.json` listing peak deceleration, mean deceleration, stopping distance, and duration.
  2. Extract the post-capture math from `MainActivity` into a pure-Java class `BrakeMetricsCalculator` in `util/metrics/`. The class takes a `List<RecordItem>` plus a `Calibration` and returns a `BrakeResult`.
  3. Author `GoldenTraceTest` that, for each fixture, loads the CSV, runs the calculator, and asserts each metric within ±0.5 % tolerance.
  4. Wire the test into `./gradlew :app:test`.
- **Acceptance:** 100 % of golden traces pass on CI for the current release.
- **Verification:** CI `PR` job runs the tests; a failure blocks merge.
- **Rollback:** revert the calculator extraction; the test module can remain dormant until a later PR reintroduces it.
- **Effort:** 4d (1d for corpus curation by QA, 2d for calculator extraction, 1d for test authorship).

#### C1 — Introduce Hilt ⇠ A7

- **Owner:** LeadAnd.
- **Preconditions:** A7 done so `HttpClientFactory` exists as a candidate provider.
- **Steps:**
  1. Add `com.google.dagger:hilt-android:2.51+` and the KAPT/kapt plugin (or KSP if Kotlin is already present) to `app/build.gradle`.
  2. Create `BrakeCheckApp extends MainApp` or re-annotate `MainApp` with `@HiltAndroidApp`. Prefer the latter to avoid a class rename.
  3. Author `DiModule`s under `di/`:
     - `NetworkModule` providing `OkHttpClient`.
     - `StorageModule` providing `DBManager` (temporary; to be replaced in D5).
     - `PrefsModule` providing `SharedPreferences`.
  4. Migrate three activities to Hilt injection: `ActivationActivity`, `MainActivity`, `HistoryListActivity`. Leave the rest for C2.
- **Acceptance:** the three activities compile with `@Inject` fields in place; no behavioural change in smoke tests.
- **Verification:** Hilt's own annotation processor validates graphs at compile time; CI failure catches misconfigurations.
- **Rollback:** revert the three activities and the modules; Hilt can live alongside old construction temporarily.
- **Effort:** 3d.

### Week 5 — CI pipeline split

#### B7 — Stage the CI pipeline ⇠ A1, B3

- **Owner:** DevOps.
- **Steps:**
  1. Create `.github/workflows/pr.yml` targeting `pull_request`: `lint`, `:app:test`, `:app:assembleDebug`, upload of unit + lint reports.
  2. Create `.github/workflows/main.yml` targeting `push` to `main`: all of the PR pipeline plus `:app:connectedCheck` against a Firebase Test Lab matrix (2 devices × 3 OS) and `:app:assembleRelease` signed with an upload key.
  3. Create `.github/workflows/release.yml` triggered on `v*` tag: runs the main pipeline, then `bundleRelease`, promotes to Play internal track via the Google Play CLI.
  4. Retire the old `android.yml`.
- **Acceptance:** opening a PR triggers only `pr.yml`; pushing to `main` triggers `main.yml`; tagging `v1.0.3` triggers `release.yml` and uploads to Play internal.
- **Verification:** a probe branch with an intentional lint break fails `pr.yml` but does not trigger `main.yml`.
- **Rollback:** re-enable the old workflow; delete the new ones.
- **Effort:** 3d.

#### B8 — Lint, Detekt, build cache

- **Owner:** DevOps.
- **Steps:**
  1. Enable `android.lintOptions { abortOnError true; warningsAsErrors true }` with an opt-out baseline file (`lint-baseline.xml`) to snapshot existing warnings — subsequent PRs cannot regress.
  2. If migrating any module to Kotlin, add Detekt with a `detekt.yml` containing a "starter" ruleset; baseline the current state.
  3. Enable the Gradle build cache locally (`org.gradle.caching=true` in `gradle.properties`) and in CI via `actions/cache` with a key derived from `**/build.gradle**` hashes.
- **Acceptance:** lint baseline file exists and is checked in; a deliberately-introduced new warning fails `pr.yml`.
- **Verification:** CI run time measurably drops on cache hit (expect 30–50 % improvement after first run).
- **Effort:** 2d.

#### B9 — Dependency vulnerability scanning

- **Owner:** DevOps + Sec.
- **Steps:**
  1. Add `OSV-Scanner` step to `pr.yml` targeting `build.gradle` and `app/build.gradle`.
  2. Configure failure threshold: any CVE with CVSS ≥ 7.0 fails the PR; below that, a comment is posted.
  3. Create `.osv-scanner-ignore.yml` for allow-listed findings with an expiry date and justification.
- **Acceptance:** a PR that introduces a known-vulnerable dep (e.g. `log4j:log4j:2.14.0` as a probe) fails the check.
- **Effort:** 1d.

#### B10 — Secret scanning

- **Owner:** DevOps.
- **Steps:**
  1. Add Gitleaks as a PR check, with `.gitleaks.toml` configured for Android conventions (keystore passwords, OAuth tokens, Google API keys, SMTP creds, the old Config.java patterns).
  2. Add a `pre-commit` hook in `scripts/hooks/pre-commit` that developers install via `scripts/install-hooks.sh`.
- **Acceptance:** a probe PR containing a fake AWS key fails the check.
- **Effort:** 0.5d.

### Week 6 — Crash reporting + support bundle

#### B14 — Crashlytics / Sentry

- **Owner:** And.
- **Steps:**
  1. Choose one (Sentry is recommended for self-hosted option and enterprise data-residency).
  2. Add the SDK; initialise in `MainApp.onCreate` **after** user has accepted the privacy notice (see D12).
  3. Install a PII-redaction hook: strip anything that looks like an email, a 32-char token, or a JSON array of numbers (sensor trace) from breadcrumb strings.
  4. Upload mapping files from `release.yml` so stack traces deminify server-side.
- **Acceptance:** a deliberate crash on a debug build shows up in the dashboard within 60 seconds.
- **Effort:** 2d.

#### C9 — Support-bundle export

- **Owner:** And.
- **Steps:**
  1. Add a hidden menu item in `SettingsActivity` (tap-app-version 7 times, or a config-gated flag).
  2. On invocation, bundle: last 500 lines of Timber-captured logs (ring buffer to be added in C7), last 10 test JSONs, the current `data_extraction_rules`-compliant preferences dump, and the calibration file.
  3. Encrypt the zip with a support-team public key (pinned via `assets/support-public.pem`); write to `exports/` so `FileProvider` can share it.
- **Acceptance:** an encrypted zip is produced; Sec can decrypt with the matching private key.
- **Effort:** 3d.

### Weeks 7–8 — Lifecycle migration and AsyncTask retirement

#### A10 — Migrate lifecycle + AsyncTask retirement

- **Owner:** And × 2.
- **Steps:**
  1. Swap `android.arch.lifecycle:*:1.1.1` for `androidx.lifecycle:*:2.7+` in `app/build.gradle`. Imports auto-fix via Android Studio's migration tool.
  2. Enumerate `AsyncTask` subclasses (~8 expected). For each:
     - If it's a one-off network call, replace with a `CoroutineScope(Dispatchers.IO).launch { … }` in a ViewModel or with `WorkManager.enqueue(…)` for retry-safe work.
     - If it blocks UI with a dialog, replace with `lifecycleScope.launch { … }` and a `StateFlow`-driven progress bar.
  3. Delete the `AsyncTask` classes once call sites have migrated.
- **Acceptance:** grep for `extends AsyncTask` returns zero hits.
- **Verification:** instrumented smoke suite still passes.
- **Rollback:** per-call-site revert; do not revert as a single change.
- **Effort:** 8d (pairs well with two engineers in parallel on disjoint call sites).

### Weeks 9–10 — Release-path polish

#### A8 — Enable R8

- **Owner:** And.
- **Steps:**
  1. Set `minifyEnabled true` and `shrinkResources true` on the `release` build type.
  2. Author `proguard-rules.pro`:
     - `-keep` rules for `com.sun.mail.**`, `com.google.android.gms.**`, `com.journeyapps.barcodescanner.**`, `com.github.mikephil.charting.**`, reflection users.
     - Preserve `@Keep`-annotated classes; add the annotation where needed.
  3. Run `assembleRelease`; install on a test device; exercise every screen; capture any `ClassNotFoundException` or reflection failure and augment rules.
- **Acceptance:** signed release APK runs end-to-end on a test matrix.
- **Verification:** an instrumented smoke suite runs against the release APK in CI (not just debug).
- **Rollback:** set `minifyEnabled false`; an issue-specific revert is cheap.
- **Effort:** 3d.

#### A9 — Retire lint debt

- **Owner:** And.
- **Steps:**
  1. Remove `<uses-permission android:name="android.permission.GET_ACCOUNTS"/>` from the manifest.
  2. Delete the `gauge/` module and confirm no reference survives.
  3. Delete the commented `Utils.TOKEN` `Bearer` headers (7 sites).
  4. Repair `styles.xml` — change `24dp` to `24sp` on line 21; remove the stray `item>` on line 22.
- **Acceptance:** lint run produces fewer errors than before (diff the baseline).
- **Effort:** 1d.

### Weeks 11–12 — Encryption at rest (security quick-wins)

#### D5 — SQLCipher migration ⇠ C1

- **Owner:** And + Sec.
- **Steps:**
  1. Add `net.zetetic:android-database-sqlcipher:4.5+` and `androidx.sqlite:sqlite-ktx`.
  2. Migrate `DatabaseHelper` to extend `net.sqlcipher.database.SQLiteOpenHelper`.
  3. Derive the DB encryption key from a per-device random value stored in Android Keystore via `MasterKey` (AES-256-GCM, StrongBox where available).
  4. Author migration `V1→V2`: on first launch post-upgrade, read the plaintext DB, write an encrypted copy, atomically swap, delete the plaintext file. Log progress to a persistent step counter so a crash mid-migration resumes.
  5. Add a migration-specific UI: blocking dialog with progress bar; on failure, a "contact support" path that exports the plaintext DB for triage and aborts the upgrade.
- **Acceptance:** pre-upgrade DB with 500 rows becomes encrypted post-upgrade; all rows retrievable; app-private `ITEST_HISTORY.DB` contains no readable strings under `strings(1)`.
- **Verification:** `SqlCipherMigrationTest` exercises upgrade and rollback paths with fixture DBs.
- **Rollback:** per-PR feature flag `sqlcipherMigrationEnabled`. If the flag is off, the old SQLiteOpenHelper is used. Flip to on after a staged rollout.
- **Effort:** 6d.

#### D6 — EncryptedSharedPreferences

- **Owner:** And.
- **Steps:**
  1. Add `androidx.security:security-crypto:1.1.0-alpha06+`.
  2. Create `EncryptedPrefsStore` (a Hilt-provided singleton) that wraps `EncryptedSharedPreferences.create(...)`.
  3. Migrate the sensitive keys listed in Appendix C of the roadmap (`activationCode`, `activationExpiryDate`, `pref_emailKey2`) to the encrypted store; leave the rest in the default prefs.
  4. On first launch after upgrade, copy the sensitive values from plain to encrypted store; overwrite with empty string; commit.
- **Acceptance:** `cat /data/data/com.jneades.BrakeCheck/shared_prefs/*.xml` on a device shows no activation code.
- **Effort:** 2d.

#### D7 — Certificate pinning hardening ⇠ A7

- **Owner:** And + Sec.
- **Steps:**
  1. Author `res/xml/network_security_config.xml` disabling cleartext (`cleartextTrafficPermitted="false"`) for `ttil.co.uk` and the future enterprise hostname.
  2. Pin the leaf and one backup certificate via SPKI hash.
  3. Declare `android:networkSecurityConfig="@xml/network_security_config"` in the manifest.
  4. Document the key rotation playbook in `docs/runbooks/certificate-rotation.md`.
- **Acceptance:** Charles Proxy with a self-signed cert blocks the licence check; confirmed manually by Sec.
- **Effort:** 2d.

### Phase 1 exit gate

All of A1–A10, B3, B7–B10, B14, C1, C9, D5–D7 merged to `main`. Signed release build producible on any CI runner. Golden-trace suite has ≥10 fixtures and runs on every PR. Crash reporter catches crashes in staging. Go/no-go for Phase 2.

---

## 3. Phase 2 — Q4 2026 (Weeks 13–24): Platform

**Goal:** the backend exists; SSO authentication works end-to-end; the client is modular enough for AI-assisted change; licence validation is signed; audit log streams to backend.

### Weeks 13–14 — Backend bootstrap

#### D1.0 — Backend repository and scaffolding

- **Owner:** Be + LeadAnd + DevOps.
- **Steps:**
  1. Provision a new repo `brakecheck-backend`. Choose stack: Kotlin + Ktor, or Go + Echo — recommendation: Kotlin + Ktor for code-sharing potential with the Android client.
  2. Set up the same CI conventions: PR pipeline with tests, SCA, SBOM; `main` pipeline with deploy to staging.
  3. Stand up environments: `dev`, `staging`, `prod`. Cloud: AWS EU-West (to anchor data residency).
  4. Provision Postgres (RDS), S3 (for sensor trace uploads), CloudWatch / Sentry for logs, AWS KMS for key management.
- **Acceptance:** staging returns 200 on `GET /healthz`.
- **Effort:** 10d (mostly one-time devops setup).

#### D9 — Signed licence payloads (server side)

- **Owner:** Be + Sec.
- **Steps:**
  1. Provision an RS256 keypair in KMS. Public key published at `/v1/.well-known/jwks.json`.
  2. Migrate the EDD validation logic into the backend; client calls `POST /v1/licences/check` with the activation code; server issues a JWT with claims `{ sub, org_id, site_id, seat_ceiling, exp, iat, jti }`.
  3. Client caches the JWT in `EncryptedSharedPreferences`; refreshes before `exp`.
- **Acceptance:** a JWT with a tampered payload fails verification client-side.
- **Effort:** 6d (3d backend, 3d client).

### Weeks 15–16 — Identity

#### D1 — Introduce Organisation/Site/User model

- **Owner:** Be + PM.
- **Steps:**
  1. Schema: `organisation`, `site`, `user`, `membership` (user→site→role), `device`.
  2. Admin onboarding flow: `POST /v1/organisations` creates org + root admin; root admin invites users via email.
  3. Each `device` enrolment produces a device secret stored client-side in Keystore; enrolled devices identify themselves with an OIDC client-credentials flow.
- **Acceptance:** a fresh install can enrol under an existing org via an invitation code; multi-site queries return scoped data.
- **Effort:** 10d (largely backend).

#### D2 — OIDC via hosted identity ⇠ D1

- **Owner:** Be + And.
- **Steps:**
  1. Stand up the identity provider (recommendation: WorkOS for quick SSO breadth; alternative: Auth0; self-hosted alternative: Keycloak).
  2. Connect Google Workspace and Azure AD test tenants; SCIM v2 provisioning enabled.
  3. Client side: `AppAuth` library for the OIDC flow; refresh tokens stored in Keystore.
  4. Device-level enrolment flow separated from user sign-in — a device is enrolled to a site by an admin and can be used by any user in that site.
- **Acceptance:** a test user from an Azure AD tenant signs into a freshly-enrolled device and sees only their site's history.
- **Effort:** 10d.

### Weeks 17–18 — Transport migration

#### D8 — SMTP → REST relay

- **Owner:** Be + And.
- **Steps:**
  1. Add a backend endpoint `POST /v1/test-results` accepting the JSON payload, a CSV multipart attachment, and the device JWT.
  2. On receipt, enqueue a job that emails the configured site contact via the backend's SES / transactional provider.
  3. Client: refactor `SendMail`-call sites into a `TestResultUploader` (DI-provided). Dual-run: if the backend upload succeeds, skip SMTP; if it fails, fall back to SMTP and mark the record `needsReconciliation=true`.
  4. After 30 days of telemetry showing ≤0.1 % SMTP fallback rate, delete the SMTP path.
- **Acceptance:** 99.9 % of result uploads complete via REST; zero SMTP credentials in the next release.
- **Verification:** dashboard `% of results via REST` over 30 days.
- **Effort:** 12d.

#### D11 — Audit log (v1) ⇠ D8

- **Owner:** Be.
- **Steps:**
  1. Append-only table `audit_event` in Postgres, with monthly partitions.
  2. Stream events: sign-in, sign-out, test submitted, calibration recorded, licence check, permission granted/revoked, admin action.
  3. Client SDK emits events via a low-priority batch endpoint; gracefully degrades if offline (local buffer, flush on reconnect).
  4. Expose `GET /v1/audit` gated by Org Admin role.
- **Acceptance:** a test submission from device A shows up in the audit log within 60 s of the device regaining connectivity.
- **Effort:** 6d.

### Weeks 19–22 — Client modularisation

#### C2 — Feature-module split ⇠ C1

- **Owner:** And × 2.
- **Steps:**
  1. Introduce a Gradle convention plugin that defines `feature.module` and `core.module` flavours.
  2. Extract feature modules in this order:
     - `feature-history` (extracted first, lowest risk).
     - `feature-calibration` (self-contained capture + math).
     - `feature-test` (MainActivity broken into `TestViewModel`, `TestScreen`, `TestService`).
     - `feature-settings` (migrate to `PreferenceFragmentCompat` in the same PR).
     - `feature-activation` (inherits the new OIDC flow from D2).
  3. Pull shared code into `core-ui`, `core-data`, `core-domain`, `core-network`.
- **Acceptance:** `:app` is a thin glue module; each feature module has its own test dir and lint baseline.
- **Effort:** 20d; expect to span 3 weeks with 2 engineers.

#### C6 — Feature flags ⇠ C2

- **Owner:** And + Be.
- **Steps:**
  1. Add a small feature-flag SDK: client reads flags from `GET /v1/flags` on start and on reconnect; caches in `EncryptedSharedPreferences`.
  2. Author `FeatureFlags.kt` with typed accessors.
  3. Wire the first live flag: `useRestResultUpload` (gates D8); second flag: `requireSignedLicence` (gates D9).
- **Acceptance:** toggling a flag on the admin console changes client behaviour within 30 s of the next start or push notification.
- **Effort:** 4d client + 3d backend.

#### C7 — Structured logging with Timber ⇠ C2

- **Owner:** And.
- **Steps:**
  1. Add `com.jakewharton.timber:timber:5+`.
  2. Replace every `Log.d/i/w/e` and `e.printStackTrace()` (~50 sites) with a Timber call.
  3. Plant a `DebugTree` on debug builds and a `CrashReportingTree` on release builds that forwards at `warn` and above to Crashlytics / Sentry.
  4. Add a ring-buffer tree capturing the last 500 lines for the support-bundle flow (C9).
- **Acceptance:** grep for `Log\.` and `printStackTrace` returns zero hits outside test code.
- **Effort:** 3d.

#### C10 — Remote kill switch ⇠ C6

- **Owner:** And.
- **Steps:**
  1. Add `emergency.disableLicenceCheck`, `emergency.disableResultUpload` flags.
  2. When a flag is on, the corresponding subsystem short-circuits and shows a persistent in-app banner explaining the degraded mode.
- **Acceptance:** flipping `emergency.disableResultUpload` stops all uploads within 60 s and surfaces the banner.
- **Effort:** 2d.

### Weeks 23–24 — Observability

#### C8 — OpenTelemetry client + backend wiring

- **Owner:** And + Be.
- **Steps:**
  1. Add `io.opentelemetry.android:instrumentation-android` (once stable, else `io.opentelemetry:opentelemetry-api`).
  2. Instrument: `LocationUpdatesService` lifecycle, sensor sample-rate observations (once per test), network RTT on all backend calls, test-flow span from "start pressed" to "result saved".
  3. Backend: already instrumented from D1.0; add correlation via the device JWT's `jti` claim to stitch device spans into backend traces.
- **Acceptance:** a single test end-to-end produces a trace with device and backend spans joined in the APM UI.
- **Effort:** 5d.

### Phase 2 exit gate

Backend in staging and production. OIDC SSO wired to at least one enterprise IdP. Licence flow signed and pinned. Results upload via REST with SMTP fallback. Audit log operational. Feature flags live with two flags in production. Client split into feature modules. A Phase-1 regression suite runs against a modularised `:app`.

---

## 4. Phase 3 — Q1 2027 (Weeks 25–36): Enterprise Surface

**Goal:** enterprise-grade controls, billing, admin console; compliance track begins; Kotlin migration reaches 60 % of active code.

### Weeks 25–27 — Access control

#### D3 — MDM (Android Enterprise) support

- **Owner:** And.
- **Steps:**
  1. Add `<application android:restrictionsHandler="…">` and define `app_restrictions.xml`.
  2. Support: `defaultServerUrl`, `mandatoryCalibrationIntervalDays`, `allowCrashReporting`, `disableCamera` (QR scan fallback).
  3. Publish the app to managed Google Play.
  4. Author an admin guide: `docs/runbooks/mdm-deployment.md`.
- **Acceptance:** enrolling a device via Intune with the pushed config visibly changes in-app behaviour.
- **Effort:** 5d.

#### D4 — Role-based access control

- **Owner:** And + Be.
- **Steps:**
  1. Backend: add `permission` enum and map to roles in the auth token.
  2. Client: hide UI for missing permissions; when a guarded action is attempted without permission (e.g. via deep link), show a "not authorised" screen instead of silently failing.
  3. Add role assignment UI in the admin console (D21 stub).
- **Acceptance:** a Tester role cannot see the "Run Calibration" button; attempting a direct deep link to `CalibrationActivity` is blocked.
- **Effort:** 8d.

### Weeks 28–30 — Kotlin migration (incremental)

#### C3 — Kotlin migration

- **Owner:** And × 2.
- **Preconditions:** C2 complete; modules are small enough to migrate one at a time.
- **Steps:**
  1. Enable Kotlin + KSP at the project level.
  2. Migrate in this order: `util/`, `core-network`, `core-data`, `feature-activation`, `feature-settings`. Leave `MainActivity` / capture loop for Phase 4.
  3. During migration: prefer data classes, sealed classes for result types, coroutines for async. Ban `AsyncTask` re-introduction via a custom lint rule.
- **Acceptance:** SLOC Kotlin vs Java ratio is ≥60 % by week 30.
- **Verification:** golden-trace suite still passes; crash-reporter shows no Kotlin-specific NPE cluster post-release.
- **Effort:** 20d (two engineers, three weeks).

### Weeks 29–32 — Compliance track begins (parallel to C3)

#### D12 — Privacy, consent, data-subject flows

- **Owner:** Be + And + Sec.
- **Steps:**
  1. Backend: endpoints `POST /v1/me/export` (GDPR Art. 15 — returns a signed download URL) and `POST /v1/me/delete` (Art. 17 — 30-day soft delete then cryptographic shred).
  2. Client: first-launch screen shows privacy notice, terms, open-source attribution (auto-generated from `licenseesPlugin`). User must accept before the app becomes functional.
  3. In-app "My data" screen lists the categories held and offers export + delete.
  4. Cookie / tracking disclosure language (none if there is no tracking — state so explicitly).
- **Acceptance:** Sec signs off on consent wording; export flow produces a zip that includes every row attributable to the user.
- **Effort:** 10d.

#### D13 — Data-residency

- **Owner:** Be + DevOps.
- **Steps:**
  1. Stand up `eu-west-1`, `us-east-1`, `ap-southeast-1` deployments.
  2. Organisation creation picks a region; cross-region routing is disallowed at the API gateway.
  3. Audit: an internal tool verifies that a given org's data is only present in the chosen region.
- **Acceptance:** a `us-east` org cannot read data from `eu-west`; bill is reconciled per region.
- **Effort:** 10d.

#### D14 — Certification kick-off

- **Owner:** Sec + Exec sponsor.
- **Steps:**
  1. Engage a SOC 2 auditor (Prescient, A-LIGN, or similar) — start the 12-month observation window now.
  2. Adopt a controls framework (SecureFrame, Drata, or Vanta) wired to GitHub, AWS, Google Workspace.
  3. Schedule ISO 27001 Stage 1 for month 10.
- **Acceptance:** auditor onboarded; Drata (or equivalent) dashboard shows all controls mapped.
- **Effort:** 5d setup + ongoing.

#### D15 — DPA, sub-processor list, DPIA

- **Owner:** Sec + Legal partner.
- **Steps:**
  1. Author a DPA template; publish on the marketing site.
  2. Publish the sub-processor list (AWS, the IdP, Sentry, Stripe).
  3. DPIA covers: location collection, device identifiers, vehicle registration, audit-log retention.
- **Acceptance:** the DPA is ready to sign; DPIA passes internal review.
- **Effort:** 8d.

### Weeks 33–35 — Billing and admin console

#### D17 — Decouple licence from device ⇠ D1

- **Owner:** Be.
- **Steps:**
  1. Move the seat model to backend: `organisation.seat_ceiling`, `device.seat_id`, `seat.assigned_user`.
  2. Device enrolment checks ceiling; an admin can reassign a seat.
- **Acceptance:** a fresh APK on a new tablet enrols against an existing org without a per-device licence code.
- **Effort:** 6d.

#### D18 — Billing (dual track)

- **Owner:** Be + And.
- **Steps:**
  1. Consumer / small-business: Google Play Billing Library for monthly/annual subscriptions; product IDs `brakecheck_pro_monthly_v1`, `brakecheck_pro_annual_v1`.
  2. Enterprise: Stripe Billing + a sales-driven invoicing flow; integration with NetSuite via Stripe's accounting export.
  3. Both tracks write to the same `subscription` table; backend is the source of truth.
- **Acceptance:** purchasing a Play subscription updates the backend within 60 s via a server-to-server notification; Stripe invoice payment flips subscription status.
- **Effort:** 10d (spread between the two tracks).

#### D19 — Entitlements service ⇠ D18

- **Owner:** Be.
- **Steps:**
  1. Expose `GET /v1/me/entitlements`; client caches and checks before enabling gated features.
  2. Migrate the existing "CMI submission" capability to an entitlement (`submitToCmi`); gate it on `plan in {Pro, Enterprise}`.
- **Acceptance:** downgrading a subscription removes the gated UI within one reconnection cycle.
- **Effort:** 4d.

#### D21 — Admin console (MVP)

- **Owner:** Be + UX + frontend engineer.
- **Steps:**
  1. Stand up a React admin at `admin.brakecheck.tti.co.uk`.
  2. MVP scope: org overview, sites, users, devices, audit log view, billing status, entitlements.
  3. Authentication: the same OIDC flow used by the mobile client.
- **Acceptance:** an Org Admin can invite a user, assign them to a site and see the subsequent login in the audit log — all without engineering intervention.
- **Effort:** 15d.

### Week 36 — External penetration test

#### D-PEN — Third-party penetration test

- **Owner:** Sec + an external specialist.
- **Steps:**
  1. Scope: app + backend + admin console + OIDC.
  2. Remediate P0/P1 findings within 14 days; P2 within 60 days.
  3. Publish a short executive summary in the trust centre (see D22).
- **Acceptance:** zero unremediated P0/P1 findings at report delivery + 14 days.
- **Effort:** 10d elapsed (specialist), 5d internal remediation budget.

### Phase 3 exit gate

All of D1–D4, D8–D15, D17–D19, D21 in production. At least 60 % of active code in Kotlin. Admin console live. Penetration test closed. SOC 2 observation window ticking.

---

## 5. Phase 4 — Q2 2027 (Weeks 37–52): Scale and Attest

**Goal:** compliance attestations land; accessibility conformance target met; support contract in place; programme closes with a GA launch.

### Weeks 37–40 — Accessibility

#### D16 — WCAG 2.2 AA

- **Owner:** UX + And.
- **Steps:**
  1. Accessibility audit by an external firm; produce a defect list.
  2. Add `contentDescription` to every actionable `ImageButton` / custom view, including `AccelView`, `LatAccelView`, `SpeedoView`.
  3. Respect system font scale across the capture and results screens (stop computing pixel sizes from `Display` metrics).
  4. Introduce a high-contrast theme and the Material 3 night variant.
  5. Target 48 dp minimum touch targets; fix all lint `TouchTarget` warnings.
- **Acceptance:** external re-audit returns no AA failures.
- **Effort:** 15d (across UX and engineering).

### Weeks 41–44 — Optional FIPS

#### D10 — FIPS-validated crypto (conditional)

- **Owner:** And + Sec.
- **Decision gate:** only if a committed US federal / MoD opportunity is in flight; otherwise defer.
- **Steps:** swap to Conscrypt with BoringSSL FIPS module; revalidate TLS and `EncryptedSharedPreferences` flows on FIPS builds.
- **Acceptance:** FIPS crypto-mode boot logs show enforcement.
- **Effort:** 10d.

### Weeks 45–48 — Support and reliability

#### D22 — Support tiers and SLA

- **Owner:** PM + CS lead.
- **Steps:**
  1. Define tiers: Community, Business, Enterprise.
  2. Stand up status page (status.brakecheck.tti.co.uk) wired to backend uptime checks.
  3. Publish an SLA: 99.9 % monthly uptime for Enterprise; response time matrix.
  4. Enterprise customers get a named CSM and a Slack Connect channel.
- **Acceptance:** an Enterprise customer trial concludes with a signed SLA.
- **Effort:** 10d.

#### B6 — Load and soak regression

- **Owner:** QA.
- **Steps:**
  1. Nightly job replays a 30-minute synthetic trace against the modularised capture pipeline.
  2. Asserts: memory-growth ≤10 % baseline, no dropped samples, battery within device-specific tolerance.
- **Acceptance:** three consecutive green nightly runs before any release.
- **Effort:** 3d.

### Weeks 49–50 — Certification

#### D14-2 — SOC 2 Type II delivery

- **Owner:** Sec + auditor.
- **Steps:** final evidence collection; auditor fieldwork; report issuance.
- **Acceptance:** SOC 2 Type II report delivered; published in trust centre.
- **Effort:** mostly auditor time; ~3d internal.

#### D14-3 — ISO 27001 Stage 2 audit

- **Owner:** Sec + auditor.
- **Steps:** Stage 2 on-site; address findings within 30 days.
- **Acceptance:** certification issued.
- **Effort:** ~5d internal.

### Weeks 51–52 — GA launch

#### GA — General availability

- **Owner:** PM + LeadAnd + CS.
- **Steps:**
  1. Final release cut; promoted to production track; marketing launch.
  2. Pricing-page publication; procurement pack (SBOM, DPA, pentest summary, SOC 2 report, ISO cert, accessibility statement).
  3. Retrospective: what tracks over-ran, what under-ran, what the next programme owes.
- **Acceptance:** the first paid Enterprise contract is signable.
- **Effort:** 5d (launch activities).

---

## 6. Cross-cutting Playbooks

### 6.1 Release playbook

1. Cut `release/x.y.z` branch from `main`.
2. Update `versionCode`, `versionName`, `CHANGELOG.md`.
3. Run `release.yml` via tag `v<x.y.z>`.
4. Smoke-test the internal track build on the reference tablet matrix.
5. Promote to closed track for customer QA; collect sign-off in the release ticket.
6. Promote to production track; monitor Crashlytics / Sentry for 48 hours before announcing.
7. If `emergency.*` flag needs to fire, do it from the admin console; do not attempt a hotfix during the monitoring window unless directed by Sec.

### 6.2 SQLCipher migration playbook (D5)

- **Pre-flight:** verify the migration job runs on a corpus of 10 real-world databases sampled from field devices (with user consent, under existing DPA). Record migration duration per size.
- **Execution:** flag off. Ship the release. After 7 days, flip the flag for 5 % of devices; wait 72 h; escalate to 20 %, then 50 %, then 100 %. Each step requires a green migration-success dashboard.
- **Rollback:** flag off returns devices to plaintext on next start only if the reverse-migration path was preserved; otherwise the rollback is "revert to the previous APK" (the encrypted DB is then inaccessible without the key held in Keystore, so the reverse migration must be built in and tested).

### 6.3 SMTP → REST migration playbook (D8)

- **Dual-run** for 30 days. Client sends via REST; on 5xx, falls back to SMTP; every event is tagged with the path taken.
- **Cut-over** when 30-day rolling SMTP-fallback rate ≤0.1 % and no reconciliation discrepancies for 7 consecutive days.
- **Retirement:** delete `mail/`, rotate the SMTP credentials, update `INVARIANTS.md` to state that SMTP is no longer a transport.

### 6.4 Kill-switch playbook

- A flag flip takes ≤60 s to reach a connected device and ≤5 min to reach 99 % of fleet (depending on reconnection cadence).
- Every kill switch has a paired dashboard and alert. Firing the kill switch without an alert fires the "manual kill-switch used" audit event.
- Kill switches are exercised quarterly in a controlled window, under the `game-day` runbook (`docs/runbooks/game-day.md`).

### 6.5 Incident response

- PagerDuty rotation for L2 on-call (backend + mobile). 24×7 coverage reached by Week 44.
- Classifications: SEV1 (data loss / active exploit / Enterprise SLA breach), SEV2 (degraded feature for > 5 % of fleet), SEV3 (minor).
- Post-mortem within 5 business days of every SEV1 and SEV2.

---

## 7. RACI

Abbreviations: **R**esponsible · **A**ccountable · **C**onsulted · **I**nformed.

| Workstream | LeadAnd | And | Be | DevOps | QA | Sec | PM | UX | Exec |
|---|---|---|---|---|---|---|---|---|---|
| Track A — stabilise | A | R | — | C | C | C | I | — | I |
| Track B — CI/CD | C | C | — | R/A | R | C | I | — | I |
| Track B — test harness | C | R | — | C | A | C | I | — | I |
| Track C — DI, modularisation | R/A | R | C | C | C | — | I | — | I |
| Track C — observability | C | R | C | A | — | C | I | — | I |
| Track D — identity | C | R | A | C | C | R | R | C | I |
| Track D — encryption | A | R | C | C | C | A | I | — | I |
| Track D — billing | C | C | R/A | C | C | — | A | C | I |
| Track D — certification | — | — | C | C | — | R/A | C | — | A |
| Track D — admin console | — | — | R | C | C | C | A | R | I |
| Release playbook | A | R | C | R | R | C | I | — | I |
| Incident response | R | R | R | R | C | R | A | — | I |

---

## 8. Risk Register (Implementation-Level)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| I1 | Golden-trace corpus is too small; refactor ships with a silent regression | M | H | Corpus grows with every field-reported anomaly; QA owns a monthly audit of trace coverage |
| I2 | SQLCipher migration corrupts a customer DB | L | H | Dual-write phase keeps the plaintext original for 14 days post-migration; daily audit run |
| I3 | Backend IdP rollout blocks devices that cannot reach the internet (poor depot Wi-Fi) | M | H | Offline grace period of 72 h; device-secret authentication falls back to cached JWT with conservative TTL |
| I4 | Play Billing policy rejects the enterprise billing flow | L | M | Engage a Google Play compliance consultant before submission; keep the enterprise track Stripe-only |
| I5 | SOC 2 observation window finds a control gap late | M | M | SecureFrame/Drata flagging is continuous; monthly control-health review |
| I6 | Accessibility audit reveals significant rework in the capture screen | M | M | Early accessibility spike in week 25; fix in a dedicated pairing sprint |
| I7 | Kotlin migration introduces a null-safety bug that alters a brake calculation | L | H | Every calculation-touching Kotlin PR reruns the golden suite; any discrepancy blocks merge |
| I8 | A third-party dep is yanked mid-programme | M | M | SBOM diffing in the weekly DevOps sync; an ADR captures any critical pin |
| I9 | An AI-authored change bypasses a security invariant | M | H | Sec is a CODEOWNER of `mail/`, `build.gradle`, `AndroidManifest.xml`, and every file in `security/`; the `AI_ACTIVITY.md` log is reviewed weekly |
| I10 | A customer MDM policy conflicts with a feature flag | L | M | Every flag is documented with its MDM interaction; `runbooks/mdm-flag-conflicts.md` enumerates known cases |

---

## 9. Dependency Graph (Condensed)

```
A1 ── A2 ── A3 ── A4 ── A5
  ╰─ A6 ── A7 ── A10
             ╰─ C1 ─ C2 ─ C3
                ╰─ D5 ─ D6 ─ D7
B3 ── A6 (parallel)
B7 ── B8 ── B9 ── B10 ── B14
D1.0 ── D1 ── D2 ── D3 ── D4
         ╰─ D8 ─ D11
         ╰─ D9
C6 ── D8 | D9 (gated by flag)
C7 ── C9
C8 ── D11
D12 ─ D13 ─ D14 ─ D15 ─ D-PEN
D17 ─ D18 ─ D19 ─ D21
D16 ─ D22 ─ GA
```

Parallelism maximised within each phase; cross-phase dependencies are the bottlenecks. The critical path is A1 → A6 → B3 → C1 → D5 → D8 → D11 → D14 → GA.

---

## 10. Definition of Done for the Programme

1. A fresh clone on a clean CI runner produces a signed AAB that a new tablet can install from the production Play track.
2. Every PR runs lint, Detekt, unit, golden-trace, SCA, secret-scan, and at least one instrumented smoke test.
3. Every release produces an SBOM, a mapping file, and a crash-reporter symbol upload.
4. SOC 2 Type II report is issued; ISO/IEC 27001:2022 certificate is in hand; WCAG 2.2 AA conformance statement is published.
5. An Enterprise customer can sign a DPA, federate their IdP, enrol 100 devices via MDM, receive results via REST, view the audit log in the admin console, and be billed via Stripe — all without engineering intervention.
6. A new engineer can ship a non-trivial change on day 3 by following the `CONTRIBUTING.md`, the `CLAUDE.md`, and the `INVARIANTS.md` — no tribal knowledge required.
7. AI-assisted work can ship a non-trivial change per `docs/runbooks/ai-operation.md` with one human-review round and no measurement regression.

---

## 11. Appendices

### Appendix 1 — Tooling and service catalogue (target state)

| Category | Choice | Notes |
|---|---|---|
| Source control | GitHub Enterprise | branch protection, required reviews, Dependabot, SCIM |
| CI | GitHub Actions | three-stage pipeline per §2 |
| Build cache | Gradle Enterprise or Remote Cache on Actions | 30–50 % CI time reduction |
| Secret store | GitHub Actions Secrets + HashiCorp Vault for local dev | OIDC-federated |
| Crash reporting | Sentry self-hosted (eu-west) | PII redaction configured; 30-day retention |
| APM / tracing | Grafana Tempo + Loki + Prometheus | self-hosted; one pane of glass |
| Feature flags | GrowthBook self-hosted | avoids a vendor dependency on a critical path |
| Identity | WorkOS | quickest SSO breadth; Keycloak as fall-back plan |
| Billing | Google Play Billing + Stripe Billing | dual track |
| Compliance | Drata or SecureFrame | wired to AWS, GitHub, Google Workspace |
| Status page | Statuspage.io | simple and procurement-friendly |
| Pen-testing | Rotating annual vendor | NCC Group, Pen Test Partners, Trail of Bits |
| Accessibility | External audit firm (e.g. AbilityNet) | twice per year |

### Appendix 2 — Example PR pipeline (Actions)

```yaml
name: PR
on:
  pull_request:
    branches: [main]

jobs:
  pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: gradle
      - name: Lint
        run: ./gradlew lintDebug
      - name: Unit tests
        run: ./gradlew testDebugUnitTest
      - name: Golden traces
        run: ./gradlew :app:testDebugUnitTest --tests '*GoldenTraceTest'
      - name: SCA
        uses: google/osv-scanner-action@v1
      - name: Secret scan
        uses: gitleaks/gitleaks-action@v2
      - name: Assemble debug
        run: ./gradlew assembleDebug
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: reports
          path: |
            app/build/reports
            app/build/outputs/apk/debug
```

### Appendix 3 — Example Hilt module skeleton

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides @Singleton
    fun okHttpClient(
        @ApplicationContext ctx: Context,
    ): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .certificatePinner(
                CertificatePinner.Builder()
                    .add("ttil.co.uk", BuildConfig.TTIL_PIN_SPKI_SHA256)
                    .build(),
            )
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) Level.BODY else Level.NONE
            })
            .build()

    @Provides @Singleton
    fun brakeCheckApi(client: OkHttpClient): BrakeCheckApi =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(BrakeCheckApi::class.java)
}
```

### Appendix 4 — Example feature-flag usage

```kotlin
class TestResultUploader @Inject constructor(
    private val api: BrakeCheckApi,
    private val smtp: LegacySmtpSender,
    private val flags: FeatureFlags,
) {
    suspend fun upload(result: TestResult) =
        if (flags.useRestResultUpload && !flags.emergencyDisableResultUpload) {
            runCatching { api.uploadResult(result) }
                .getOrElse {
                    Timber.w(it, "REST upload failed, falling back to SMTP")
                    smtp.send(result)
                    result.copy(needsReconciliation = true)
                }
        } else {
            smtp.send(result)
            result
        }
}
```

### Appendix 5 — Checklist an engineer can paste into a PR description

```
[ ] Ticket link
[ ] Description: what changed and why
[ ] Screenshots / recordings where UI-affecting
[ ] Lint baseline unchanged or justified
[ ] Unit tests added / updated
[ ] Golden-trace suite still green
[ ] Measurement-path impact: yes/no; if yes, explain
[ ] Security-relevant: yes/no; if yes, Sec reviewer requested
[ ] Feature flag wiring: new flag / existing / n/a
[ ] Rollback plan documented
[ ] INVARIANTS.md / ADR updates as needed
[ ] AI_ACTIVITY.md entry added (if AI-authored)
```

### Appendix 6 — Estimated effort summary

| Phase | Dev-days (engineering) | Dev-days (QA / Sec / DevOps / PM / UX) | Calendar |
|---|---|---|---|
| Pre-flight | 3 | 4 | 1 week |
| Phase 1 — Foundations | 52 | 12 | 12 weeks (2 engineers) |
| Phase 2 — Platform | 85 | 28 | 12 weeks (3 engineers) |
| Phase 3 — Enterprise surface | 82 | 36 | 12 weeks (3 engineers + 1 FE) |
| Phase 4 — Scale & attest | 48 | 30 | 16 weeks (3 engineers) |
| **Total** | **~270** | **~110** | **~13 months** |

Assume a cost of £750/dev-day blended; the programme lands at roughly **£285k engineering + £80k specialist** plus tooling (~£50k/year) and audit fees (~£70k), in line with the envelope in §10 of the roadmap.

---

*End of document.*
