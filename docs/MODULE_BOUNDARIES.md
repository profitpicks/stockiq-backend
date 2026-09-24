# stockiq — Module Boundaries Specification

This document defines the clear boundaries for all 15 business and compliance modules in the modular monolith. Each module is self-contained and communicates through documented interfaces.

| Module | Core Responsibility | Key Entities / Concepts | Inbound Dependencies |
| :--- | :--- | :--- | :--- |
| **`auth`** | User authentication, identity, session management, and RBAC evaluation. | `User`, `PlatformRole` (12 roles), `Permission`, `RbacEngine` | None (Foundation) |
| **`providers`** | Registration, credentialing, and dossier tracking for SEBI-registered RAs and IAs. | `ProviderRegistration`, `ProviderType` (RA vs IA), `ProviderEntityType` (Individual vs Non-Individual) | `auth`, `audit` |
| **`services`** | Service catalog, subscription tiers, fee definitions in paise, and terms versioning. | `ServiceDefinition`, `ServiceBillingFrequency`, `feeInPaise` | `providers` |
| **`recommendations`** | Publication, tracking, and rationale for RA research calls and IA advice. | `Recommendation`, `PriceTarget` (0..N flexible targets), `RecommendationStatus` | `services`, `providers`, `audit` |
| **`track-record`** | Quantitative performance aggregation and outcome provenance verification. | `TrackRecordMetric`, `methodologyVersion` (v1.0), `VerificationTier` | `recommendations`, `parrva` |
| **`parrva`** | Past Performance Verification abstraction aligned with SEBI circulars. | `ParrvaRecord`, `ParrvaVerificationStatus`, `ParrvaSubmissionParams` | `adapters/parrva` |
| **`onboarding`** | Investor KYC, risk questionnaire, and classification. | `InvestorOnboardingRecord`, `RiskProfile`, `InvestorClassification` (Retail vs HNI vs Accredited) | `auth` |
| **`agreements`** | Statutory client service agreements, terms hashing, and eSign records. | `ClientServiceAgreement`, `agreementHash`, `eSignReferenceId` | `onboarding`, `services`, `adapters/esign` |
| **`subscriptions`** | Subscription billing states and `CAN_ACCESS_SERVICE_CHANNEL` enforcement. | `Subscription`, `ServiceAccessCheckResult` | `agreements`, `payments`, `services` |
| **`payments`** | Invoicing, payment processing in paise, and dynamic GST tax calculation. | `PaymentInvoice`, `TaxBreakdown` (CGST, SGST, IGST), `PaymentGatewayAdapter` | `adapters/payments` |
| **`complaints`** | Grievance redressal, SLA deadline tracking, and SCORES escalation hooks. | `ComplaintTicket`, `ComplaintStatus`, `slaDeadline` | `auth`, `providers` |
| **`community`** | Pre-moderated community interactions with strict anti-tipping controls. | `CommunityPost`, `ContentModerationStatus` | `auth` |
| **`education`** | Unbiased investor education articles free from commercial promotion. | `EducationalArticle`, `category`, `isSponsored=false` | None |
| **`compliance`** | Regulatory circular registry, mandatory disclaimers, and legal hold freezes. | `RegulatoryReference`, `MandatoryDisclaimer`, `LegalHold` | All business modules |
| **`audit`** | Dual-ledger audit logging: operational security logs and SHA-256 chained business events. | `SecurityAuditRecord`, `BusinessEventRecord`, `eventHash` | All business modules |

---

## Service Channel Access Rule: `CAN_ACCESS_SERVICE_CHANNEL`

A critical architectural invariant enforced across `subscriptions` and `agreements`:
An investor is permitted to access a service channel if and only if:
1. An active, non-expired `Subscription` exists.
2. An executed `ClientServiceAgreement` with verified signature hash exists.
3. For IA services: The investor's risk profile from `onboarding` matches or permits the service risk rating.
