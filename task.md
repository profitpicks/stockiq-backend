# StockIQ — Project Task Roadmap

## 1. Roadmap Overview & Status Structure

This document is the authoritative task tracking roadmap for StockIQ. All past, present, and planned milestones are recorded herein.

Roadmap categories:
* **COMPLETED**: Fully implemented, verified, tested, and accepted.
* **IN PROGRESS**: Currently active tasks under development.
* **NEXT**: Immediate candidate tasks awaiting deliberate scheduling.
* **PLANNED**: Future architectural phases in the project lifecycle.
* **FINAL VERIFICATION**: Comprehensive end-to-end audit and deployment checks.

---

## 2. Completed Milestones (COMPLETED)

* [x] **Phase 1: Foundation**
  * Modular monolith backend structure (`stockiq/`).
  * Strongly typed configuration engine (`Zod` validation, safe dev defaults).
  * API foundation (`/api/v1`) with correlation ID, structured JSON logging, rate limiting, and RFC-7807 error handling.
  * Platform roles architecture (12 roles, explicit separation of HNI vs. Accredited Investor).
  * PostgreSQL connection pool, programmatic migrator, and `001_initial_foundation.sql`.
  * Adapter contracts and mock implementations (Payments, Market Data, eSign, OTP, PaRRVA).
  * Automated test suite (unit and integration tests, 100% pass rate).

* [x] **Phase 2: Authentication & Provider Credentialing**
  * Passwordless OTP identity service with `OtpAdapter`.
  * JWT session lifecycle, refresh token mechanics, and RBAC middleware.
  * Provider profile model, SEBI registration number validation, and credential document fingerprinting (SHA-256).
  * Database migration `002_auth_provider_credentialing.sql`.
  * Verification officer review and credentialing approval endpoints.

* [x] **Phase 2 Hardening**
  * Security hardening, rate limiting on sensitive auth endpoints, and token revocation controls.
  * Unit and integration test coverage for authentication edge cases.

* [x] **PostgreSQL Verification**
  * Database connection pool resilience, transaction boundary validation, and health probe integration.
  * Offline schema migration validation routines.

* [x] **Phase 5: Public Directory & Service Catalog**
  * Factual public provider directory endpoints with filtering by provider category (RA vs IA).
  * Advisory service catalog lifecycle (Draft, Active, Retired) and tier definitions.
  * Database migration `003_public_directory_service_catalog.sql`.
  * Zero-promotional ranking policy enforcement (no leaderboards or cherry-picked sorting).

* [x] **Phase 6: Immutable Recommendation Ledger**
  * Tamper-evident append-only ledger for trading recommendations.
  * Verbatim preservation of `original_message`.
  * Recommendation parser with mandatory human review (no auto-publishing on ambiguity).
  * Append-only correction model (revisions recorded as new business events).
  * Target price milestone integrity (T1, T2, T3 as milestones of one single recommendation).
  * Buy-above trigger status accounting (untriggered orders never counted as losses).
  * Database migration `004_recommendation_ledger.sql`.

* [x] **Phase 7: Track Record & PaRRVA Abstraction**
  * Standardized performance calculation engine with versioned methodologies.
  * Full denominator transparency (accounting for expired, stopped-out, and unclosed calls).
  * Strict classification of performance sources (`PLATFORM_RECORDED`, `PROVIDER_SUPPLIED_HISTORICAL`, `EXTERNAL_VERIFIED`, `REGULATORY_VERIFIED`).
  * PaRRVA adapter abstraction, audit submission flow, and verification certificate handling.
  * Database migration `005_track_record_parrva.sql`.

* [x] **Phase 8: Investor Onboarding, Risk Suitability & Agreements**
  * Investor onboarding state machine (KYC submission, document evidence).
  * Statutory risk profiling questionnaire and deterministic score calculation.
  * Suitability matching matrix preventing unsuitable advisory subscriptions.
  * Client agreement templating, SHA-256 template hashing, and eSign consent logging (IP, user-agent, timestamp).
  * Database migration `006_investor_onboarding_agreements.sql`.

* [x] **Android UI Foundation**
  * Modern Native Android Jetpack Compose application with Material 3 theming.
  * Application shell (`StockIQAppShell`), TopAppBar with dual-tone logo, and Bottom Navigation.
  * Reusable Loading (`StockIQLoadingState`), Empty (`StockIQEmptyState`), and Error (`StockIQErrorState`) components.
  * Auth screens (Welcome, Login, Role Selection) and dynamic Dashboard.

* [x] **Android Real Authentication API Integration**
  * Real Retrofit & OkHttp networking layer connecting Android emulator (`http://10.0.2.2:3000`) to Express backend.
  * Two-stage OTP login flow: mobile/email entry -> reference ID -> 6-digit OTP validation.
  * Cryptographic token persistence using `SecurePreferences` backed by the **Android KeyStore** system (`AES/GCM/NoPadding`).
  * Graceful fallback encryption in `SecurePreferences` for deterministic execution under Robolectric JVM test runners.
  * Real session validation (`GET /api/v1/auth/me`) establishing backend roles as the sole source of truth.
  * Server-side logout handling (`POST /api/v1/auth/logout`) with local token scrubbing.
  * Passing Robolectric integration and screenshot tests (`AuthIntegrationTest`, `ExampleRobolectricTest`, `GreetingScreenshotTest`).

---

## 3. Immediate Project State & In Progress (IN PROGRESS)

* [x] **Documentation & Project Control Initialization** (Current Task)
  * Establishing canonical root control files: `PRD.md`, `architecture.md`, `rules.md`, `design.md`, `task.md`, and `memory.md`.
  * Synchronizing operational guidelines, architectural invariants, and active project memory.

---

## 4. Next Scheduled Milestone (NEXT)

> **CRITICAL RULE**: The next functional phase must be selected deliberately by the user from the remaining roadmap. Do **NOT** automatically re-implement Phase 9.

### Candidate Next Milestones:
1. **Option A: Controlled Resolution of Phase 9 (Payments & Tax Ledger)**
   * Note: Phase 9 has drafted code and migration `007_payments_tax.sql`, but its implementation history included a canceled run. It requires an intentional, controlled audit, verification, and formal sign-off rather than an automatic re-run.
2. **Option B: Subscriptions & Channel Entitlements Engine**
   * Implementing subscriber lifecycle management, payment linking, and the `CAN_ACCESS_SERVICE_CHANNEL` authorization engine.
3. **Option C: Android Screen Expansion (Directory & Onboarding Flows)**
   * Building client-side Compose screens for the Public Provider Directory and Investor Risk Assessment Questionnaire.

---

## 5. Remaining Roadmap Horizons (PLANNED)

* [ ] **Phase 9 Resolution: Payments & Tax Ledger Audit**
  * Formal audit of paise-denominated ledger, dynamic multi-state GST engine, invoice generation, refund controls, and idempotent webhook handlers.
* [ ] **Phase 10: Subscriptions & Access Authorization**
  * Subscription lifecycle (Pending -> Active -> Expired -> Cancelled).
  * `CAN_ACCESS_SERVICE_CHANNEL` policy engine enforcing active agreement, risk suitability, and valid payment status prior to channel access.
* [ ] **Phase 11: Realtime Channel Broadcast & Notifications**
  * High-speed WebSockets / SSE channel dispatcher distributing approved recommendations.
  * Android Push Notification integration (Firebase Cloud Messaging) with delivery audit tracking.
* [ ] **Phase 12: Grievance Redressal & SLA Monitoring**
  * Investor complaint submission, ticket categorization, resolution timelines, and automated SLA breach alerts.
  * SEBI SCORES bridge interface abstraction.
* [ ] **Phase 13: Investor Education & Regulatory Disclosures**
  * Educational content repository, statutory risk disclosure notices, and mandatory pre-trade risk acknowledgment modals.
* [ ] **Phase 14: Community Moderation & Anti-Tipping Controls**
  * Investor discussion feeds with automated keyword filters detecting unsolicited tips, price guarantees, and unauthorized advisory claims.
  * Content moderator approval queue.
* [ ] **Phase 15: Admin & Compliance Governance Console**
  * Dedicated administrative web views for provider credential audits, recommendation ledger inspection, and system metrics.
* [ ] **Phase 16: Audit Dual-Ledger, Retention & Legal Hold**
  * Full audit-trail verification dashboard.
  * Legal hold subsystem freezing historical records against deletion during regulatory investigations.
* [ ] **Phase 17: Platform Security & Production Hardening**
  * Rate limiting fine-tuning, penetration testing, header security (Helmet / CSP), and production credential isolation.

---

## 6. Final Verification (FINAL VERIFICATION)

* [ ] Comprehensive end-to-end integration test run across Android and Backend.
* [ ] Full regression verification of all backend test suites (`001` through `009+`).
* [ ] Zero-warning build audit for Android APK / AAB compilation.
* [ ] Final regulatory compliance audit against SEBI RA & IA statutory mandates.
