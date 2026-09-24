# stockiq — Implementation Status & Roadmap

## 1. Current Phase: Phase 1 (Foundation) — COMPLETED

Phase 1 establishes the architectural, structural, database migration, configuration, security, role, and testing foundation for `stockiq`.

### What Was Created in Phase 1:
1. **Modular Monolith Project Structure**: Created `stockiq/` with all required directories (`api/`, `config/`, `database/`, `modules/`, `adapters/`, `tests/`, `web/`, `docs/`).
2. **Configuration System**: Strongly typed environment configuration with `Zod` validation, safe dev defaults, and `config/env.example` template without hardcoded secrets.
3. **API Foundation (`/api/v1`)**:
   - Express application with request correlation ID (`x-correlation-id`, `x-request-id`).
   - Structured JSON logging.
   - Centralized error handling returning consistent standardized JSON.
   - Global rate limiting foundation.
   - Liveness probe (`GET /health`) and Readiness probe (`GET /ready`).
   - Metadata endpoint (`GET /api/v1`) and platform roles endpoint (`GET /api/v1/roles`).
4. **Role Foundation (12 Roles)**:
   - Defined all 12 operational and regulatory roles in `modules/auth/roles.ts`.
   - Strict structural separation of `HNI` and `ACCREDITED_INVESTOR` statutory categories.
   - Reusable RBAC evaluator and middleware guards (`requireRoles`, `requirePermission`).
5. **Database & Migration Foundation**:
   - PostgreSQL connection pool abstraction with health check and graceful disconnect.
   - Migration `001_initial_foundation.sql`: Sets up `schema_migrations`, `roles`, `permissions`, `role_permissions`, `users`, `user_profiles`, `user_roles`, `audit_logs`, `data_access_logs`, `business_events`, and `system_settings`.
   - Seed `001_foundation_roles.sql`: Seeds the 12 platform roles and regulatory reference metadata.
   - Programmatic database migrator with validation (`database/migrator.ts`).
6. **Adapter Architecture & Mock Implementations**:
   - `PaymentGatewayAdapter` + `MockPaymentGatewayAdapter` (paise denomination).
   - `MarketDataAdapter` + `MockMarketDataAdapter` (outcome verification abstraction).
   - `ESignAdapter` + `MockESignAdapter` (SHA-256 agreement hash consent).
   - `OtpAdapter` + `MockOtpAdapter` (simulated SMS/email verification).
   - `ParrvaAdapter` + `MockParrvaAdapter` (SEBI PaRRVA verification abstraction).
   - All mock implementations clearly marked `DEVELOPMENT/TEST ONLY`.
7. **Module Boundary Contracts**:
   - Domain boundary types and interface contracts for all 15 modules.
8. **Testing Foundation**:
   - Complete automated test suite (`tests/unit/`, `tests/integration/`, `tests/e2e/`).
   - 21 automated tests covering config, RBAC, adapters, health, v1 routes, and startup lifecycle.
   - 100% test pass rate. Zero TypeScript compilation/type errors.

---

## 2. Intentionally Excluded per Phase 1 Current Phase Limits

In strict compliance with Phase 1 instructions, the following operational business workflows have NOT been implemented yet:
- Provider onboarding workflow & UI
- Complete SEBI registration verification workflow
- Public provider marketplace & discovery directory
- Service marketplace & checkout flow
- Recommendation publishing & live delivery engine
- Recommendation ledger calculation jobs
- Track-record calculation engine & historical backfilling
- PaRRVA live verification submission flows
- Investor risk assessment questionnaire scoring UI
- Agreements generation & live eSign ESP integration
- Real payment gateway webhook processors
- Complaints / Grievance redressal resolution workflow
- Community discussion feed & live moderation
- Education content CMS
- Complete Admin console UI

---

## 3. Known Limitations

1. **Database Mode**: In local development without an active PostgreSQL instance, the application runs with mock/degraded readiness, while the programmatic migrator can validate SQL migrations offline.
2. **Adapters Mode**: Adapters run in `mock` mode. Live external integrations require API credentials configured in `.env`.
3. **Authentication**: Authentication middleware currently supports simulated development bearer tokens (`Bearer mock-user:<id>:<role>`). Production asymmetric JWT verification will be wired in Phase 2.

---

## 4. Recommended Next Phase: Phase 2 (Authentication & Provider Credentialing)

**Recommended Scope for Phase 2**:
1. Full user identity service with mobile/email OTP authentication via `OtpAdapter`.
2. Provider onboarding foundation: RA/IA registration dossier submission, SEBI registration number validation, and verification officer approval workflow.
3. Database migration `002_providers_and_auth.sql` implementing provider profile and credential tables.
