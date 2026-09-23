# StockIQ — Product Requirements Document (PRD)

## 1. Product Overview

### 1.1 Product Name
**StockIQ** (Regulatory Compliance & Advisory Verification Platform)

### 1.2 Product Purpose
StockIQ is an institutional-grade, compliance-governed marketplace and immutable track-record verification platform tailored specifically for SEBI-registered Research Analysts (RAs) and Investment Advisers (IAs) in India. 

The platform bridges the trust deficit between retail/institutional investors and advisory providers by establishing tamper-evident recommendation logging, deterministic performance verification, statutory risk profiling, versioned client agreements, and regulatory audit readiness.

### 1.3 Problem Being Solved
1. **Proliferation of Unregistered Entities & Tipping Channels**: The Indian capital markets have experienced an explosion of unauthorized financial influencers ("finfluencers") operating via untracked social channels (Telegram, WhatsApp, YouTube), distributing speculative advice without accountability.
2. **Fabricated & Exaggerated Track Records**: Providers routinely advertise inflated historical returns, cherry-picked trades, or fictitious win rates without standardized calculation methodologies or third-party validation.
3. **Non-Compliance with SEBI Mandates**: RAs and IAs frequently fail to enforce strict client risk suitability assessments, mandatory fee caps, standardized client agreement executions, and statutory risk disclosures.
4. **Lack of Immutable Audit Trails**: Existing advisory delivery lacks cryptographic proof of when recommendations were dispatched, what targets/stop-losses were set, and whether post-facto edits occurred.
5. **Inefficient Grievance Redressal**: Investors lack transparent dispute mechanisms integrated with regulatory complaint tracking (such as SEBI SCORES escalation).

### 1.4 Target Users
* **Retail Investors**: Individual investors seeking vetted, SEBI-registered financial research and investment advice with clear risk disclaimers.
* **High Net-Worth Individuals (HNIs)**: Investors with substantial capital requiring customized advisory allocations and higher suitability thresholds.
* **Accredited Investors**: Institutional or certified individuals qualifying under SEBI’s statutory accreditation framework for flexible advisory terms.
* **Research Analysts (RAs)**: SEBI-registered professionals publishing research reports, stock ratings, and price-target recommendations.
* **Investment Advisers (IAs)**: SEBI-registered advisers delivering fee-based portfolio advice and individualized financial plans.
* **Compliance Officers & Auditors**: Internal compliance staff and external verifiers requiring immutable audit logs and legal hold controls.
* **Super Administrators**: Platform operators managing platform health, role delegations, and system settings.

---

## 2. User Roles & Classifications

StockIQ enforces twelve (12) discrete platform roles grouped into four operational categories. In strict accordance with Indian securities regulations, **High Net-Worth Individuals (HNI)** and **Accredited Investors** are maintained as distinct classifications with independent verification standards.

### 2.1 Administrative Category
1. **Super Admin (`SUPER_ADMIN`)**: Complete platform governance, system configuration, role delegation, break-glass security access, and global parameters.
2. **Compliance Admin (`COMPLIANCE_ADMIN`)**: Oversight of regulatory governance, disclosure templates, PaRRVA integration, legal hold enforcement, and regulatory report generation.
3. **Verification Officer (`VERIFICATION_OFFICER`)**: Responsible for auditing RA/IA registration dossiers, verifying SEBI certificates, PAN, qualifications, and approving provider listings.
4. **Content Moderator (`CONTENT_MODERATOR`)**: Inspection of public provider profiles, research disclaimers, community interactions, and enforcement of anti-tipping policies.
5. **Finance Admin (`FINANCE_ADMIN`)**: Financial ledger reconciliation, subscription fee settlements, invoice audits, GST compliance, and refund dispute resolutions.
6. **Support Admin (`SUPPORT_ADMIN`)**: Management of investor grievance tickets, SLA adherence tracking, dispute escalations, and SCORES bridge monitoring.

### 2.2 Provider Category (Advisers & Analysts)
7. **Research Analyst (`RESEARCH_ANALYST` / RA)**: SEBI-registered entity under SEBI (Research Analysts) Regulations, 2014. Authorized to publish structured research reports, target prices, and stock recommendations subject to tamper-evident logging.
8. **Investment Adviser (`INVESTMENT_ADVISER` / IA)**: SEBI-registered entity under SEBI (Investment Advisers) Regulations, 2013. Authorized to offer fee-based personal advice, asset allocation plans, and client-specific advisory services governed by suitability constraints.

### 2.3 Investor Category
9. **Retail Investor (`INVESTOR_RETAIL`)**: Standard investor accessing verified directories, completing risk profiling, executing client agreements, and subscribing to advisory channels.
10. **High Net-Worth Individual (`HNI`)**: Wealthy individual investor classified based on declared and verified portfolio asset thresholds.
11. **Accredited Investor (`ACCREDITED_INVESTOR`)**: Statutorily recognized investor holding valid certification under SEBI (Alternative Investment Funds / Investment Advisers) accreditation norms, permitting customized fee structures and differentiated risk thresholds.

### 2.4 Public Category
12. **Guest / Public (`GUEST_PUBLIC`)**: Unauthenticated visitor entitled only to view the factual public provider registry, verified historical snapshots, and regulatory educational resources.

---

## 3. Product Tiers

### 3.1 Investor App (Android Client)
* **Technology**: Modern Native Android application built with Kotlin, Jetpack Compose, Material 3, and Kotlin Coroutines/Flow.
* **Capabilities**:
  * Secure mobile/email OTP authentication with Android KeyStore-backed AES-GCM token storage.
  * Public directory search with real-time SEBI registration verification badges.
  * Transparent provider performance cards displaying verified metrics and track-record methodologies.
  * Multi-step investor onboarding: KYC validation, risk assessment questionnaires, and suitability score determination.
  * Digital agreement signing with SHA-256 consent verification.
  * Service subscription checkout with dynamic GST breakdown and invoice generation.
  * Real-time recommendation delivery feed with transparent entry price, targets (T1/T2/T3), and stop-loss bounds.
  * Formal grievance filing and ticket status tracking.

### 3.2 RA/IA Professional Suite
* **Technology**: Dedicated Web Workspace (TypeScript / React / Tailored Responsive Views).
* **Capabilities**:
  * Onboarding dossier submission (SEBI registration certificate, NISM certifications, compliance declarations).
  * Service catalog lifecycle management (Draft, Pending Approval, Active, Paused, Retired) with fee cap validation.
  * Structured recommendation publishing engine supporting multi-horizon price targets, rationale attachments, and stop-loss criteria.
  * Performance analytics dashboard displaying platform-recorded metrics against standardized methodologies.
  * Subscriber management matrix respecting suitability eligibility and active agreement statuses.

### 3.3 Admin & Compliance Console
* **Technology**: Centralized Web Console for Administrative and Compliance Personas.
* **Capabilities**:
  * Provider credentialing workflow (Document preview, verification checklists, approval/rejection logging).
  * Tamper-evident recommendation ledger inspector with cryptographic SHA-256 hash validation.
  * Dual-ledger audit viewer (Business Event Ledger + Data Access / Security Audit Logs).
  * Regulatory configuration engine (Dynamic adjustment of GST rates, fee caps, risk tiers, and disclaimer copy without code modification).
  * Legal hold subsystem enabling immutable retention freezes for regulatory investigations.
  * Grievance redressal dashboard with automated SLA breach alerts.

---

## 4. Planned Functional Scope & Blueprint

The complete StockIQ architecture comprises nineteen (19) core functional modules. The status of each module is rigorously categorized below as **Implemented**, **Planned**, or **Future Integration**.

| # | Module Name | Functional Scope Description | Implementation Status |
|---|---|---|---|
| 1 | **Authentication, MFA & Sessions** | OTP-based passwordless identity (SMS/Email), JWT issuance, refresh token management, role synchronization, device session tracking, and hardware-backed Android KeyStore encryption. | **Implemented** (Backend & Android) |
| 2 | **Provider Onboarding & Credentialing** | RA/IA registration dossier submission, SEBI certificate uploads, NISM validation, verification officer workflow, and state machine (Draft -> Under Review -> Verified / Rejected). | **Implemented** (Backend Modules & DB) |
| 3 | **Document Verification & Fingerprinting** | Cryptographic SHA-256 fingerprinting of uploaded licenses, PAN, and credentials, ensuring immutable proof of submission. | **Implemented** (Backend Database & Storage) |
| 4 | **Public Provider Directory** | Factual provider directory, filtering by category (RA vs IA), search by registration number, displaying verified credentials with zero promotional ranking. | **Implemented** (Backend REST API & DB) |
| 5 | **Service Lifecycle & Fee Versioning** | Advisory/research service management with strict fee cap compliance (e.g., SEBI limits), versioned pricing, duration tiers, and eligibility criteria. | **Implemented** (Backend REST API & DB) |
| 6 | **Immutable Recommendation Ledger** | Tamper-evident append-only ledger for all trade recommendations. Features SHA-256 hash chaining, raw original message preservation, parsing with human review, no auto-publishing on ambiguity, append-only corrections, and multi-target milestone integrity (T1/T2/T3). | **Implemented** (Backend Core & DB) |
| 7 | **Market-Data Verification Abstraction** | Market data adapter interface verifying execution prices, stop-loss triggers, and target achievements against factual market tick feeds. | **Implemented** (Adapter Architecture & Mock Service) |
| 8 | **Track-Record Methodology & Versioning** | Versioned calculation algorithms computing win-rates, risk-reward ratios, and holding periods with complete denominator transparency. Prevents selective omission. | **Implemented** (Backend Core & DB) |
| 9 | **PaRRVA Verification Abstraction** | Formal adapter and domain abstraction for Performance and Recommendation Verification Agencies (PaRRVA). Audits and signs performance snapshots. | **Implemented** (Adapter Abstraction & Data Models) |
| 10 | **Investor Onboarding & Risk Suitability** | Comprehensive KYC collection, statutory risk profiling questionnaire, deterministic score calculation, and suitability matching engine preventing unsuitable subscriptions. | **Implemented** (Backend Modules, Routes & DB) |
| 11 | **Client Agreements & Versioned Consent** | Dynamic agreement templating, SHA-256 template hashing, digital signature capture (IP address, user-agent, timestamp), and non-repudiation audit records. | **Implemented** (Backend Modules, Routes & DB) |
| 12 | **Subscription & Channel Authorization** | Client subscription lifecycle (Pending -> Active -> Expired -> Cancelled), entitlement validation, and `CAN_ACCESS_SERVICE_CHANNEL` authorization engine. | **Planned** (Domain Boundary Defined, Implementation Pending) |
| 13 | **Payment & Tax Ledger** | Paise-denominated double-entry financial ledger, configurable multi-state GST engine (IGST, CGST/SGST), idempotent checkout, refund processing, and immutable invoices. | **Controlled Resolution Required** (DB & Code drafted in Phase 9; pending final review) |
| 14 | **Realtime Channel Broadcast** | Low-latency WebSockets / SSE channel dispatcher distributing verified recommendations to subscribed investors with delivery receipts. | **Planned** |
| 15 | **Grievance Redressal & SLA Engine** | Structured investor complaint management, categorization, escalation timers, SLA monitoring, and SEBI SCORES bridge interface. | **Planned** |
| 16 | **Community & Anti-Tipping Moderation** | Investor forum with strict anti-tipping keyword detection, content moderation workflows, and automated provider promotion restrictions. | **Planned** |
| 17 | **Education & Regulatory Awareness** | Independent investor literacy repository, risk disclosure library, and regulatory alert notifications. | **Planned** |
| 18 | **Dual-Ledger Audit, Retention & Legal Hold** | Separation of business event ledger from security/access logs. Cryptographic verification, legal hold preservation freezing records against deletion. | **Implemented** (DB Schema & Core Events) |
| 19 | **Regulatory Reference & Configuration Engine** | Runtime configuration system managing statutory parameters (tax rates, fee limits, risk weightings, required disclaimer text) without application redeployment. | **Implemented** (Database Settings & Tax Engine) |

---

## 5. Distinction of Implementation Tiers

To maintain absolute fidelity and regulatory truthfulness, platform capabilities are classified into three distinct tiers:

### 5.1 Existing / Implemented Functionality
* **Core Security & Auth**: Full OTP verification flow, JWT lifecycle, RBAC middleware enforcing 12 roles, Android KeyStore AES-GCM encryption.
* **Provider Credentialing**: Database schema and endpoints for provider registration, document fingerprinting, and verification reviews.
* **Directory & Catalog**: Public API for exploring verified providers and fee-capped advisory services.
* **Recommendation Ledger**: Append-only ledger recording recommendations, amendments, raw messages, and milestone outcomes with SHA-256 hash chaining.
* **Track-Record & PaRRVA Foundations**: Standardized methodology versioning, snapshot generation, and mock PaRRVA verification adapter.
* **Investor Suitability & Agreements**: Comprehensive risk questionnaire scoring, suitability engine, versioned agreement templates, and signature audits.
* **Native Android Client**: Modern Compose interface featuring auth screens, role selection, dynamic dashboard, and real-time backend API synchronization.

### 5.2 Planned Functionality (Next Roadmap Horizons)
* Controlled resolution and formal validation of the Phase 9 Payment & Tax Ledger.
* Subscription state machine and real-time channel access authorization (`CAN_ACCESS_SERVICE_CHANNEL`).
* Real-time recommendation push dispatcher via WebSockets / FCM.
* Investor grievance ticketing and SLA escalation subsystem.
* Moderated investor community feeds with automated anti-tipping regex and linguistic filters.
* Comprehensive Web Admin & Compliance Console.

### 5.3 Future Integrations (External Service Dependencies)
* **Production Payment Gateways**: Integration with real Indian payment aggregators (e.g., Razorpay, Cashfree) using paise-denominated webhooks.
* **Live Market Data Feeds**: High-frequency tick data connectivity via authorized market data vendors (e.g., NSE/BSE authorized data feeds).
* **Licensed eSign ESPs**: Digital signing integration with Aadhaar eSign ESPs (CDSL/NSDL/eMudhra).
* **Official PaRRVA Regulatory APIs**: Direct system-to-system integration with SEBI-recognized Performance and Recommendation Verification Agencies once API standards are published.
* **SEBI SCORES Redressal API**: Automated bidirectional synchronization with SEBI Complaints Redress System (SCORES).

---

## 6. Critical Compliance & Safety Commitments

1. **Zero Promotional Ranking**: StockIQ does not operate "leaderboards", "top analyst lists", or "guaranteed return badges". Provider directories are sorted strictly by factual, objective criteria (e.g., registration date, methodology transparency).
2. **True Denominator Accounting**: Recommendation performance must account for all issued recommendations within a period, including expired, stopped-out, and unclosed calls. Selective omission is architecturally prohibited.
3. **No Claim of SEBI Endorsement**: StockIQ is an independent technology infrastructure platform. The platform and its software do not claim SEBI endorsement, certification, or partnership.
4. **Separation of Verified Data**: All user-facing performance metrics must explicitly state whether data is `PLATFORM_RECORDED`, `PROVIDER_SUPPLIED_HISTORICAL`, `EXTERNAL_VERIFIED`, or `REGULATORY_VERIFIED`.
