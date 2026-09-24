# StockIQ — Controlled Project Memory & Context

> **PURPOSE**: This document is the persistent operational memory for the StockIQ project. It tracks architectural decisions, immutable system invariants, subsystem states, resolved blockers, and technical debt. It is a curated control record, NOT an unedited conversation log.

---

## 1. Project Context & Objectives

StockIQ is an institutional-grade, compliance-governed advisory marketplace and immutable recommendation verification platform for SEBI-registered Research Analysts (RAs) and Investment Advisers (IAs) in India.

The primary objective is to replace opaque, unverified social media tip channels ("finfluencers") with a legally sound, cryptographically auditable platform where:
* Providers are formally credentialed via verified SEBI registration dossiers.
* Recommendations are preserved in an append-only, tamper-evident ledger with full verbatim input capture.
* Performance track records are computed deterministically using standardized, versioned methodologies with complete denominator transparency.
* Investors undergo mandatory statutory KYC, risk profiling, suitability verification, and digital client agreement signing before gaining access to advisory services.
* Transactions and tax allocations are audited using double-entry paise accounting and configurable GST rules.

---

## 2. Active Architectural Decision Records (ADRs)

### ADR-001: Modular Monolith Backend Architecture
* **Decision**: Adopt a Modular Monolith in Node.js/TypeScript using Express rather than distributed microservices.
* **Rationale**: High cohesion and direct typed interfaces reduce operational overhead, simplify transactional integrity across modules, and avoid distributed consensus complexities while maintaining clean domain boundaries.

### ADR-002: Server-Side Authority for Roles and Permissions
* **Decision**: User roles and operational permissions are determined strictly on the backend.
* **Rationale**: Client applications (Android / Web) are untrusted runtimes. Selecting a role in the UI sandbox merely previews UI states and never grants server-side authorizations.

### ADR-003: Paired External Adapter Pattern
* **Decision**: Isolate all third-party external services (Payment Gateways, Market Data Feeds, eSign ESPs, OTP providers, PaRRVA agencies) behind TypeScript interfaces with accompanied `Mock...Adapter` implementations.
* **Rationale**: Enables comprehensive local automated testing and sandboxed CI execution without requiring live external API credentials or incurring third-party network costs.

### ADR-004: Android Hardware-Backed Keystore Storage with Test Fallback
* **Decision**: Encrypt session JWT tokens in Android SharedPreferences using `AES/GCM/NoPadding` with an AES key generated directly in the device's `AndroidKeyStore`. Catch KeyStore initialization exceptions to activate a deterministic Base64 fallback under JVM test runners (Robolectric).
* **Rationale**: Maximizes on-device physical hardware security in production while allowing JVM-based unit and integration test suites to execute without native Android KeyStore crashes.

### ADR-005: Paise-Denominated Financial Arithmetic & NUMERIC Storage
* **Decision**: All financial currency values must be stored in paise (1 INR = 100 paise) as integers or exact `NUMERIC(18, 4)` decimals.
* **Rationale**: Completely eliminates floating-point rounding inaccuracies and conforms to Indian banking and tax standards.

### ADR-006: Separation of HNI and Accredited Investor Classifications
* **Decision**: High Net-Worth Individuals (`HNI`) and Accredited Investors (`ACCREDITED_INVESTOR`) are maintained as strictly separate platform roles and database classifications.
* **Rationale**: Compliance with SEBI regulations where "Accredited Investor" is a specific statutory status requiring certification under SEBI norms, whereas HNI is a wealth tier based on portfolio declarations.

### ADR-007: Append-Only Recommendation Ledger
* **Decision**: Recommendations, price targets, and revisions are stored append-only using SHA-256 hash chaining. Revisions or cancellations create new business event rows rather than mutating historical records.
* **Rationale**: Guarantees tamper-evident auditability and prevents post-facto alteration of financial calls.

### ADR-008: True Denominator Track-Record Methodology
* **Decision**: Performance statistics must include all recommendations issued within a measurement window, including expired calls, stopped-out calls, and untriggered orders.
* **Rationale**: Prevents selective omission (cherry-picking) and ensures factual, non-misleading performance reporting.

---

## 3. Core Invariants (Rules That Must Never Be Broken)

1. **Client is Untrusted**: Android or web clients must never dictate permissions or bypass backend authorization checks.
2. **Original Recommendation Message Preservation**: The exact string dispatched by the provider (`original_message`) must be saved verbatim and never altered.
3. **No Automated Publishing on Parsing Ambiguity**: Parsed recommendations with conflicting or ambiguous parameters require human review before publishing.
4. **Milestone Counting Rule**: Multiple target prices (T1, T2, T3) represent milestones of a single recommendation and must never be counted as multiple separate calls.
5. **Untriggered Order Rule**: A "BUY ABOVE X" order where market price never reaches X is an untriggered call and must never be counted as a trading loss.
6. **No False Regulatory Claims**: StockIQ must never claim SEBI endorsement, partnership, or certification. Platform data must never be represented as PaRRVA-verified without an actual verification certificate.
7. **Sequential, Non-Destructive Migrations**: Applied database migrations must never be edited. Schema updates require new, sequential migration scripts.

---

## 4. Current State of Every Module & Subsystem

### 4.1 Backend Domain Modules (`/stockiq/modules/`)
| Module | State | Implementation Details |
|---|---|---|
| `auth` | **Active** | 12 roles defined, JWT lifecycle, RBAC middleware, OTP validation. |
| `providers` | **Active** | Provider profile registration, document fingerprinting, verification review. |
| `services` | **Active** | Advisory service catalogs, fee caps, lifecycle states (Draft/Active/Retired). |
| `recommendations` | **Active** | Append-only ledger, milestone tracking (T1/T2/T3), hash chaining, raw message capture. |
| `track-record` | **Active** | Versioned calculation algorithms, denominator transparency, snapshot storage. |
| `parrva` | **Active** | PaRRVA adapter contract, snapshot audit submission, verification records. |
| `onboarding` | **Active** | Investor KYC submission, risk questionnaire scoring, suitability engine. |
| `agreements` | **Active** | Versioned agreement templates, SHA-256 template hashing, eSign consent logging. |
| `payments` | **Under Audit** | Code and DB migration `007` created; requires controlled verification and sign-off. |
| `subscriptions` | **Planned** | Domain boundary defined; channel access policy pending implementation. |
| `complaints` | **Planned** | Domain boundary defined; grievance workflows pending. |
| `community` | **Planned** | Domain boundary defined; anti-tipping moderation filters pending. |
| `education` | **Planned** | Domain boundary defined; CMS and disclosure library pending. |
| `compliance` | **Active** | Regulatory reference engine, system settings, legal hold foundation. |
| `audit` | **Active** | Append-only business event ledger, data-access logs. |

### 4.2 Adapters (`/stockiq/adapters/`)
* `otp/`: Active. `MockOtpAdapter` supports deterministic sandbox testing.
* `market-data/`: Active. `MockMarketDataAdapter` verifies price trigger events.
* `esign/`: Active. `MockESignAdapter` computes SHA-256 agreement hashes.
* `parrva/`: Active. `MockParrvaAdapter` models external regulatory audit cycles.
* `payments/`: Active. `MockPaymentGatewayAdapter` simulates paise payment orders and webhooks.

### 4.3 Android Client (`/app/`)
* **State**: Active and compiling cleanly.
* **Architecture**: Jetpack Compose, MVVM, ViewModel, StateFlow, Coroutines.
* **Networking**: OkHttp + Retrofit mapped to `/api/v1/auth/` routes on Express backend.
* **Storage**: `SecurePreferences` with hardware-backed `AndroidKeyStore` AES-GCM encryption.
* **Tests**: Robolectric and Roborazzi tests passing 100% green (`testDebugUnitTest`).

### 4.4 Database (`/stockiq/database/`)
* **State**: Migrations `001` through `007` defined and verified.
* **Migrator**: Programmatic TypeScript runner (`database/migrator.ts`) with offline validation capabilities.

---

## 5. Resolved Blockers & Lessons Learned

1. **Android Emulator Loopback Connectivity**:
   * *Problem*: Android emulator failed to reach Express backend using `localhost:3000`.
   * *Resolution*: Configured default backend URL to `http://10.0.2.2:3000`, the standard Android emulator host loopback address, and injected it safely via Secrets Gradle Plugin / `.env`.
2. **Robolectric JVM Android KeyStore Incompatibility**:
   * *Problem*: In JVM unit tests, `KeyStore.getInstance("AndroidKeyStore")` threw `KeyStoreException: KeyStore AndroidKeyStore not found`.
   * *Resolution*: Added a resilient fallback to `SecurePreferences` that catches Keystore initialization failures and runs in deterministic Base64 mode under tests, keeping 100% hardware-backed encryption in production.
3. **Robolectric Context String Mismatch**:
   * *Problem*: `ExampleRobolectricTest` failed asserting the old template name `"My Application"`.
   * *Resolution*: Aligned test assertion with the actual production resource string `"stockiq"`.
4. **Old Greeting Composable in Screenshot Test**:
   * *Problem*: `GreetingScreenshotTest` attempted to render the deleted template `Greeting` function.
   * *Resolution*: Updated test to render `WelcomeScreen`, establishing a high-fidelity visual baseline for the StockIQ gateway.

---

## 6. Unresolved Issues & Technical Debt

1. **Phase 9 (Payments & Tax) Formal Audit**:
   * *Status*: Phase 9 migration `007_payments_tax.sql` and payment modules exist in the codebase, but the phase included a canceled run during past execution. It requires a dedicated, controlled audit before being accepted as complete.
2. **Subscriptions Domain Module Implementation**:
   * *Status*: Need to wire the `subscriptions` module to connect payments, active agreements, and the `CAN_ACCESS_SERVICE_CHANNEL` gatekeeper.
3. **Realtime Delivery Infrastructure**:
   * *Status*: Recommendations currently rely on polling. WebSockets or SSE architecture is required for real-time recommendation broadcasting.

---

## 7. Critical Regulatory Safety Mandates

1. **SEBI (Research Analysts) Regulations, 2014**:
   * Mandatory disclaimers on research reports.
   * Prohibition of performance guarantees.
   * Retention of records for a minimum statutory period (5 years).
2. **SEBI (Investment Advisers) Regulations, 2013**:
   * Mandatory client agreements with explicit risk consent prior to charging fees.
   * Enforced fee caps (e.g., maximum percentage of AUA or fixed fee caps per family).
   * Documented risk assessment and suitability justification for all recommendations.
3. **PaRRVA Governance**:
   * Strict boundary between internal performance logs and officially certified PaRRVA audit certificates.
