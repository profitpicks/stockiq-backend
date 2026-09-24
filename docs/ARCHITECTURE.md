# stockiq — Architecture Overview

## 1. Executive Architectural Blueprint

`stockiq` is designed as a compliance-governed marketplace and immutable track-record verification platform for SEBI-registered Research Analysts (RAs) and Investment Advisers (IAs) in India.

The architecture is built on five core principles:
1. **Modular Monolith**: High-cohesion, low-coupling modules with clear boundaries. Modules communicate via direct, strongly-typed internal interfaces rather than distributed RPC or microservices overhead.
2. **Immutable Append-Only Audit & Event Ledger**: Critical business events (recommendation publication, state changes, agreement execution, and performance verification) are preserved using SHA-256 hash chaining.
3. **Regulatory-Grade Verifiability**: Separation of provider-reported claims, market-data verified triggers, and external PaRRVA performance audits.
4. **Adapter Pattern for External Integrations**: All third-party systems (SMS/Email OTP, Payment Gateways, Market Data Feeds, eSign ESPs, and PaRRVA verification) are isolated behind strict interface contracts with Mock implementations for development and testing.
5. **Separation of Roles & Statutory Classifications**: Distinct roles for 12 operational personas, with strict non-merging of HNI and Accredited Investor classifications.

---

## 2. Directory Structure

```
stockiq/
├── web/                     # Frontend UI applications (Investor, Provider, Admin)
├── api/                     # HTTP API layer, routing, middleware, error handling
├── config/                  # Strongly typed environment configuration
├── database/                # PostgreSQL schema, migrations, and seeds
│   ├── migrations/
│   └── seeds/
├── modules/                 # Modular domain cores
│   ├── auth/                # Identity, session, roles, and RBAC
│   ├── providers/           # RA/IA registrations & verification dossiers
│   ├── services/            # Advisory & research service catalogue & fee versioning
│   ├── recommendations/     # Recommendations, 0..N target models, time horizons
│   ├── track-record/        # Methodology versioning & outcome verification tiers
│   ├── parrva/              # Past performance verification contracts & state
│   ├── onboarding/          # Investor KYC, suitability profiling, and classification
│   ├── agreements/          # Client agreements, template versioning, eSign tracking
│   ├── subscriptions/       # Subscription lifecycle & CAN_ACCESS_SERVICE_CHANNEL policy
│   ├── payments/            # Paise-denominated billing, dynamic GST calculation
│   ├── complaints/          # Grievance redressal, SLA monitoring, SCORES escalation
│   ├── community/           # Moderated investor discussions, anti-tipping controls
│   ├── education/           # Editorial-independent investor literacy repository
│   ├── compliance/          # Regulatory reference registry, disclaimers, legal holds
│   └── audit/               # Dual-ledger audit logging & business event chaining
├── adapters/                # Third-party integration contracts & mock implementations
│   ├── otp/
│   ├── payments/
│   ├── market-data/
│   ├── esign/
│   └── parrva/
├── tests/                   # Automated test suites
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/                    # Technical & regulatory system documentation
```

---

## 3. High-Level Data Flow

```
[Investor / Provider / Admin]
             │
             ▼
    [API Gateway / Express]
             │
   ├── Correlation & Request ID Middleware
   ├── Structured JSON Logging
   ├── Rate Limiting
   ├── Authentication & RBAC Middleware
             │
             ▼
      [Modules / Domain Core]
             │
   ┌─────────┴─────────────────────┐
   ▼                               ▼
[PostgreSQL Database]     [Adapters / Mocks]
- UUIDs, UTC Timestamps   - OTP Adapter
- Paise-denominated       - Payment Gateway
- Dual-Ledger Tables      - Market Data
                          - eSign ESP
                          - PaRRVA Verification
```
