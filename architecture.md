# StockIQ — Technical Architecture

## 1. Architectural Philosophy & Overview

StockIQ is engineered as an institutional-grade, compliance-governed platform designed for reliability, cryptographic auditability, and regulatory adherence under Indian financial laws. 

The system utilizes a **Modular Monolith** architecture for its backend services, combined with a **Modern Native Android Client** (Jetpack Compose / MVVM) for mobile stakeholders and planned Web workspaces for providers and compliance administrators.

---

## 2. Directory Structure: Planned vs. Actual

### 2.1 Planned Unified Repository Blueprint
The idealized conceptual organization of the complete StockIQ platform is structured as follows:

```
stockiq/
├── app/                         # Mobile Native Android Application (Compose)
├── web/                         # Administrative & Provider Web Portals
├── api/                         # HTTP routing, middleware, controllers
├── database/                    # PostgreSQL migrations, seeds, migrator
│   ├── migrations/
│   └── seeds/
├── modules/                     # Isolated domain business logic
│   ├── auth/                    # Identity, roles, sessions, RBAC
│   ├── providers/               # Registration dossiers & credentialing
│   ├── services/                # Advisory catalogs & fee versioning
│   ├── recommendations/         # Tamper-evident recommendation ledger
│   ├── track-record/            # Performance calculation & methodology
│   ├── parrva/                  # PaRRVA verification abstraction
│   ├── onboarding/              # Investor KYC, risk profiling & suitability
│   ├── agreements/              # Client agreements & versioned eSign
│   ├── subscriptions/           # Subscription authorization & channel policies
│   ├── payments/                # Double-entry ledger, dynamic tax, invoices
│   ├── complaints/              # Grievance redressal & SLA escalation
│   ├── community/               # Moderated discussions & anti-tipping
│   ├── education/               # Regulatory awareness & disclosure library
│   ├── compliance/              # Regulatory references & legal holds
│   └── audit/                   # Dual-ledger audit & event chaining
├── adapters/                    # External service boundary contracts & mocks
│   ├── payments/                # Payment Gateway abstraction
│   ├── market-data/             # Exchange feed / tick data abstraction
│   ├── esign/                   # Electronic signature provider abstraction
│   ├── otp/                     # SMS/Email verification abstraction
│   └── parrva/                  # Regulatory audit agency abstraction
├── tests/                       # Unit, integration, and E2E automated suites
├── config/                      # Strongly typed environment configuration
└── docs/                        # Architecture & compliance documentation
```

### 2.2 Actual Workspace Layout
In the active repository environment, the workspace is cleanly split at the workspace root into the Android build module and the backend platform directory:

```
/ (Workspace Root)
├── app/                         # Android Application Source Code
│   ├── src/main/java/com/example/
│   │   ├── data/
│   │   │   ├── model/           # Strongly typed DTOs & response schemas
│   │   │   ├── remote/          # Retrofit API service & OkHttp NetworkClient
│   │   │   ├── repository/      # UserRepository & session management
│   │   │   └── security/        # SecurePreferences (Android KeyStore AES-GCM)
│   │   └── ui/
│   │       ├── components/      # AppShell, Loading, Empty, Error composables
│   │       ├── navigation/      # NavGraph & type-safe screen destinations
│   │       ├── screens/         # Welcome, Login, RoleSelection, Dashboard
│   │       └── theme/           # Color, Theme, Typography design system
│   ├── src/test/java/com/example/ # Robolectric & Unit test suites
│   └── build.gradle.kts         # Android module build configuration
├── stockiq/                     # Modular Monolith Backend
│   ├── api/                     # Express router, middleware, endpoints
│   ├── config/                  # Zod environment schemas & configuration
│   ├── database/                # Migrations 001–007, seeds, programmatic migrator
│   ├── modules/                 # All 15 domain business modules
│   ├── adapters/                # 5 boundary adapters (OTP, Payments, etc.)
│   ├── tests/                   # Automated backend test suites (unit, integration)
│   ├── web/                     # Web views placeholder
│   └── docs/                    # Technical manifests & status documentation
├── build.gradle.kts             # Root Gradle build script
├── settings.gradle.kts          # Gradle project configuration
└── metadata.json                # Platform deployment metadata
```

---

## 3. Core Architectural Principles

StockIQ enforces twelve (12) fundamental architectural invariants across all subsystems:

1. **Server-Side Authorization**: The client (Android or Web) is treated as inherently untrusted. All authorization decisions, role evaluations, and data access checks occur strictly on the backend via verified JWT claims and database records.
2. **Backend Determines Roles**: The client application must **never** be the authority for user roles or entitlements. Role selection in UI sandboxes is purely for preview; true operational rights depend exclusively on backend database verification.
3. **No Client-Side Authority for Permissions**: Permissions cannot be granted, escalated, or assumed by Android UI code. Endpoints validate permissions at the controller and domain boundaries.
4. **Strict API Versioning**: All public and private endpoints are isolated under versioned paths (e.g., `/api/v1/auth`, `/api/v1/recommendations`). Breaking contract changes require a new API version.
5. **PostgreSQL as Single Source of Truth**: The operational database is PostgreSQL, utilizing ACID transactions, UUID primary keys, and strict foreign key integrity.
6. **Adapter Pattern for External Boundaries**: External services (Payment gateways, OTP providers, Market data feeds, eSign providers, PaRRVA agencies) are strictly isolated behind TypeScript interfaces. Code interacts with adapters, never third-party SDKs directly.
7. **Strict UTC Timestamps**: All temporal data (transaction timestamps, recommendation dispatches, audit events, signatures) are calculated, stored, and exchanged exclusively in ISO 8601 UTC.
8. **Monetary Values Stored in Paise**: To completely avoid floating-point rounding inaccuracies, all currency values are represented and stored as integers/numeric values in **paise** (1 INR = 100 paise).
9. **NUMERIC/Decimal in Schema**: Where fractional financial arithmetic is mandatory (e.g., tax percentages, return ratios), the database uses exact `NUMERIC(18, 4)` precision, never floating-point types (`REAL` or `DOUBLE PRECISION`).
10. **Dual-Ledger Audit Architecture**: The platform maintains two distinct log types:
    * **Business Event Ledger**: Append-only, tamper-evident log capturing domain state transitions (recommendations, subscriptions, approvals) with SHA-256 hash chaining.
    * **Data Access & Security Audit Log**: Immutable record of authentication events, access denials, data reads, and administrative interventions.
11. **Configurable Regulatory Rules**: Regulatory parameters (such as GST rates, maximum advisory fee caps, risk weighting thresholds) are managed via configuration and database settings rather than hardcoded in business logic.
12. **Truth in Regulatory Claims**:
    * The platform strictly forbids claiming SEBI endorsement, certification, or affiliation.
    * Platform-recorded performance must never be misrepresented as officially certified by a PaRRVA agency without an actual cryptographic verification certificate.

---

## 4. Subsystem Architectures

### 4.1 Backend Architecture (Node.js / TypeScript / Express)
* **Framework**: Express.js structured as a Modular Monolith.
* **Domain Organization**: Each domain in `/stockiq/modules/` maintains its own types, services, and domain logic. Modules communicate through typed service calls rather than arbitrary database mutations.
* **HTTP Pipeline**:
  ```
  Incoming Request
       │
       ▼
  [Correlation & Request ID Middleware] (x-correlation-id, x-request-id)
       │
       ▼
  [Structured JSON Logger]
       │
       ▼
  [Global & IP Rate Limiting]
       │
       ▼
  [Authentication Middleware] (Bearer JWT extraction & validation)
       │
       ▼
  [RBAC Middleware] (requireRoles, requirePermission)
       │
       ▼
  [Controller & Zod Validation]
       │
       ▼
  [Domain Service Layer] ────► [PostgreSQL Pool / Transaction]
       │
       ▼
  [Adapter Boundary] ────► [External Provider / Mock]
       │
       ▼
  [Centralized Error Handler] (Standardized RFC-7807 formatted JSON)
  ```
* **Validation**: Runtime input validation using `Zod` schemas. Malformed payloads are rejected prior to reaching domain services.

### 4.2 Database & Persistence Architecture (PostgreSQL)
* **Database Engine**: PostgreSQL with `pg` connection pooling.
* **Migration Strategy**: Sequential, non-destructive SQL migrations managed by a custom TypeScript migrator (`database/migrator.ts`) recording history in `schema_migrations`:
  * `001_initial_foundation.sql`: Users, profiles, roles, permissions, audit logs, business events, system settings.
  * `002_auth_provider_credentialing.sql`: Provider profiles, registration dossiers, credential verification documents.
  * `003_public_directory_service_catalog.sql`: Public directory listings, advisory services, fee tiers.
  * `004_recommendation_ledger.sql`: Immutable recommendation records, original messages, revisions, targets (T1/T2/T3).
  * `005_track_record_parrva.sql`: Performance methodologies, calculation runs, snapshots, PaRRVA verification logs.
  * `006_investor_onboarding_agreements.sql`: Investor profiles, suitability questionnaires, risk categories, agreement templates, digital signatures.
  * `007_payments_tax.sql`: Configurable tax rules, payment orders, transactions, webhook events, invoices, reconciliation ledger.
* **Immutability Controls**: Critical ledger tables (`business_events`, `recommendations`, `agreement_signatures`, `invoices`) enforce append-only policies where updates and hard deletions are architecturally prohibited.

### 4.3 Native Android Client Architecture (Kotlin / Jetpack Compose)
* **Pattern**: Clean Architecture / MVVM (Model-View-ViewModel).
* **UI Layer**:
  * Declarative Jetpack Compose using Material Design 3.
  * Adaptive design supporting phone and tablet layouts.
  * Centralized theming (`Color.kt`, `Theme.kt`, `Type.kt`).
  * Reusable application shell (`StockIQAppShell`) with standardized loading, empty, and error composables.
* **Navigation**: Type-safe navigation routes (`Screen.kt`, `NavGraph.kt`) managing backstack and session transitions.
* **State Management**:
  * `AuthViewModel` exposes unidirectional data flows via `StateFlow<AuthUiState>`.
  * Compose collects state lifecycle-safely using `collectAsState()`.
* **Data & Networking Layer**:
  * `NetworkClient`: OkHttpClient singleton configured with timeouts, logging interceptors, and loopback connectivity (`http://10.0.2.2:3000` for Android emulator).
  * `AuthApiService`: Retrofit interface defining REST endpoints for OTP dispatch, verification, profile retrieval, and session revocation.
  * `UserRepository`: Repository pattern orchestrating network calls on `Dispatchers.IO` and managing local session states.
* **Cryptographic Local Storage**:
  * `SecurePreferences`: Hardware-backed encryption using the `AndroidKeyStore` provider.
  * Generates an AES-256 key inside the device's secure enclave (`KeyProperties.KEY_ALGORITHM_AES`, `AES/GCM/NoPadding`).
  * Encrypts JWT session tokens before writing to SharedPreferences.
  * Features a deterministic fallback to safely support local JVM test runners (Robolectric) without compromising on-device hardware security.

### 4.4 Adapter Architecture
Third-party services are decoupled via explicit interface contracts in `/stockiq/adapters/`:
1. **`PaymentGatewayAdapter`**: Defines `createOrder`, `verifyWebhook`, `processRefund`. Implemented by `MockPaymentGatewayAdapter` (simulating Razorpay/Cashfree order IDs, signature verification, and paise accounting).
2. **`MarketDataAdapter`**: Defines `getQuote`, `verifyPriceTrigger`, `getHistoricalTicks`. Implemented by `MockMarketDataAdapter` (verifying recommendation target hits and stop-loss breaches against simulated price series).
3. **`ESignAdapter`**: Defines `initiateSigning`, `verifySignature`, `getSignedDocument`. Implemented by `MockESignAdapter` (validating SHA-256 agreement hashes and generating audit-compliant digital signature artifacts).
4. **`OtpAdapter`**: Defines `sendOtp`, `verifyOtp`. Implemented by `MockOtpAdapter` (managing test reference codes and deterministic sandbox verification).
5. **`ParrvaAdapter`**: Defines `submitSnapshotForAudit`, `checkAuditStatus`, `retrieveVerificationCertificate`. Implemented by `MockParrvaAdapter` (simulating external PaRRVA audit cycles and cryptographic signature issuance).

---

## 5. Verification & Test Architecture

### 5.1 Android Automated Tests
* **Frameworks**: JUnit 4, Robolectric, Roborazzi.
* **Suites**:
  * `AuthIntegrationTest.kt`: Validates `SecurePreferences` hardware/fallback token encryption, decryption, clearing, and `UserRepository` lifecycle synchronization.
  * `ExampleRobolectricTest.kt`: Asserts correct localized string resource resolution.
  * `GreetingScreenshotTest.kt`: Baseline visual regression capture for the StockIQ welcome gateway screen.

### 5.2 Backend Automated Tests
* **Framework**: Jest / TypeScript.
* **Suites**:
  * `tests/unit/`: Tests configuration validation, RBAC evaluation, domain calculation services, tax engines, and adapter logic.
  * `tests/integration/`: Validates HTTP API routes, database migrator correctness, and end-to-end request pipelines.
  * Individual phase test files (e.g., `phase7_track_record_parrva.test.ts`, `phase8_investor_onboarding.test.ts`, `phase9_payments_tax.test.ts`) ensuring regression safety across historical phases.
