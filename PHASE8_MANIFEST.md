# Phase 8 Change Manifest: Onboarding, Suitability & Agreements

This manifest tracks all additions and updates introduced during Phase 8.

## Proposed Changes

### Database Migration
*   Create `stockiq/database/migrations/006_investor_onboarding_agreements.sql` defining:
    *   `investor_profiles` for tracking onboarding progress, residency, income details, and completion.
    *   `classification_evidence` for audited classification qualifications (ITR, Net Worth Certificate, Demat Statements).
    *   `risk_assessments` storing versioned questionnaire answers, risk scores, and deterministic categories.
    *   `agreement_templates` for versioned client agreements, risk disclosures, etc., with contents and SHA-256 hashes.
    *   `agreement_signatures` for binding client signatures and clicks with IP, user-agent, and SHA-256 validation.

### Business Logic Modules
*   **Onboarding Service (`stockiq/modules/onboarding/onboarding.service.ts`)**:
    *   Manages investor onboarding state machine.
    *   Protects transitions server-side (e.g., cannot go directly to `COMPLETED`).
    *   Submits profiles and stores classification evidence.
*   **Risk Profile Service (`stockiq/modules/onboarding/risk.service.ts`)**:
    *   Saves and retrieves versioned assessments.
    *   Calculates deterministic risk profile categories based on questionnaire scores.
*   **Suitability Service (`stockiq/modules/onboarding/suitability.service.ts`)**:
    *   Evaluates compatibility between investor risk profile and service eligibility constraints.
*   **Agreement Service (`stockiq/modules/agreements/agreements.service.ts`)**:
    *   Registers versioned templates, computes SHA-256 content hashes, and captures immutable user signatures.
    *   Distinguishes explicit acceptance consent from certified mock e-signatures.

### Routing & Controllers
*   Create `stockiq/api/routes/onboarding.routes.ts` exposing endpoints for investor flow.
*   Create `stockiq/api/routes/agreements.routes.ts` exposing endpoints for template management and sign operations.
*   Mount routes in `stockiq/api/routes/v1.routes.ts`.

### Tests
*   Create `stockiq/tests/unit/phase8_investor_onboarding.test.ts` to fully assert and audit Phase 8 constraints.
