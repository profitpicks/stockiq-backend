# stockiq — Security Notes & Unfinished Security Items

## 1. Implemented Security Foundation (Phase 1)

1. **Request & Correlation Tracking**: Every inbound HTTP request is tagged with an immutable `x-correlation-id` and `x-request-id` passed to downstream logs and response headers.
2. **Structured Logging**: Structured JSON logging format captures method, path, response time, correlation ID, and status code without logging sensitive credentials or tokens.
3. **Rate Limiting Foundation**: Global token-bucket / sliding window rate limiting prevents volumetric attacks and endpoint flooding.
4. **Role-Based Access Control (RBAC)**: Comprehensive definition and enforcement foundation across 12 distinct platform operational roles.
5. **Fail-Closed Authorization**: `requireRoles` and `requirePermission` middleware fail closed by default if the user is unauthenticated or lacks required privileges.
6. **Input Validation**: Schema validation using `Zod` blocks malformed requests and configuration values at the perimeter.
7. **Paise-Denominated Financial Arithmetic**: Prevents floating-point precision truncation attacks in financial transactions.
8. **Dual-Ledger Audit Logging Hooks**: Capture operational actions and state transitions with actor metadata, IP address, and old/new state snapshots.

---

## 2. Unfinished Security Items (Deferred to Subsequent Phases)

Per Phase 1 boundary guidelines, the following advanced security controls are explicitly identified and scheduled for subsequent phases:

1. **Asymmetric JWT / Key Rotation**:
   - Currently, authentication middleware supports token validation foundation and simulated mock tokens for local testing.
   - Production RS256/Ed25519 asymmetric signature verification and JWKS rotation will be integrated in the full Auth implementation phase.
2. **Distributed Redis Rate Limiting**:
   - The current rate limiter uses an in-memory sliding window bucket.
   - A distributed Redis-backed rate limiter with sliding logs will be required when scaling beyond a single Node.js instance.
3. **CSRF Token Generation for Cookie Sessions**:
   - CSRF protection is currently prepared for Bearer token authorization.
   - If cookie-based browser sessions are enabled for web applications, double-submit cookie or synchronizer token CSRF middleware must be added.
4. **Database-Level Encryption (Encryption at Rest)**:
   - Sensitive fields (PAN, KYC identifiers) in `user_profiles` require AES-256 field-level encryption or PostgreSQL pgcrypto at rest.
5. **Tamper-Evident SHA-256 Merkle Chaining Verification Service**:
   - The `business_events` table foundation defines `previous_event_hash` and `event_hash`.
   - A background verification daemon will be implemented to routinely traverse and verify unbroken cryptographic integrity across the event stream.
