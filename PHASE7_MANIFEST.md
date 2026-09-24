# Phase 7 Implementation Change Manifest

## Objective
Implement Phase 7: Track Record & PaRRVA Verification Abstraction foundation in `stockiq` in a completely non-destructive, incremental manner. Ensure existing Phase 1-6 integrations and tests are completely untouched, preserved, and passing perfectly.

## Files to be Created

1. **Database Migration**
   - `/stockiq/database/migrations/005_track_record_parrva.sql` (Schema setup for methodologies, calculation runs, snapshots, and verification records)

2. **Track Record Domain & Calculation Module**
   - `/stockiq/modules/track-record/methodology.service.ts` (Immutable methodology versioning and fetch methods)
   - `/stockiq/modules/track-record/calculation.service.ts` (Deterministic accounting, population processing, milestone differentiation, buy-above treatment)
   - `/stockiq/modules/track-record/snapshot.service.ts` (Snapshots management, storing, retrieving, publishing performance data with denominator transparency)
   - `/stockiq/modules/track-record/verification.service.ts` (Verification record handling, state transitions, metadata tracking)

3. **Routing and API Layer**
   - `/stockiq/api/routes/track_record.routes.ts` (API routes with server-side authorization: Provider, Admin/Compliance, and Public access controls)

4. **Integration/Route Mounts**
   - `/stockiq/api/routes/v1.routes.ts` (Modify minimally to mount `/track-record` sub-router)

5. **Unit and Integration Tests**
   - `/stockiq/tests/unit/phase7_track_record_parrva.test.ts` (Methodology, calculation determinism, milestone counting, source separation, PaRRVA adapter mock, RBAC, regression safety tests)

## Immutability, Safety & Constraints
- NO destructive changes to any migrations 001–004.
- NO automatic or promotional claims ("guaranteed returns", "best analyst", "leaderboard").
- Hard distinction between:
  - `PLATFORM_RECORDED`
  - `PROVIDER_SUPPLIED_HISTORICAL`
  - `EXTERNAL_VERIFIED`
  - `REGULATORY_VERIFIED`
- Pure factual methodology and verification infrastructure.
