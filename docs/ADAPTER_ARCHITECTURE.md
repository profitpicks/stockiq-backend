# stockiq — Adapter Architecture & Mock Implementations

## 1. Design Rationale

External dependencies introduce operational fragility, rate limits, regulatory liabilities, and complex network setup. `stockiq` encapsulates all third-party and regulatory external systems behind strict TypeScript interfaces.

Every adapter provides:
1. A **Typed Interface Contract** defining standard inputs and outputs.
2. A **Mock Implementation** explicitly marked `DEVELOPMENT/TEST ONLY`.

---

## 2. Adapter Contracts & Mock Implementations

### 1. OTP Adapter (`adapters/otp/otp.adapter.ts`)
- **Contract**: `OtpAdapter` (`sendOtp`, `verifyOtp`).
- **Mock**: `MockOtpAdapter`. Generates predictable test OTP (`123456`) and simulates expiry without making actual network requests to telecom aggregators.
- **Production Target**: SMS Gateway (DLT registered template in India) / Email provider.

### 2. Payment Gateway Adapter (`adapters/payments/payment.adapter.ts`)
- **Contract**: `PaymentGatewayAdapter` (`createOrder`, `verifyPayment`, `initiateRefund`).
- **Paise Precision**: All transactions are denominated strictly in paise (`amountInPaise`).
- **Mock**: `MockPaymentGatewayAdapter`. Simulates order creation and HMAC verification.
- **Production Target**: Razorpay / Cashfree / PayU with webhook signature validation.

### 3. Market Data Adapter (`adapters/market-data/market-data.adapter.ts`)
- **Contract**: `MarketDataAdapter` (`getQuote`, `verifyPriceCondition`, `isConfigured`).
- **Outcome Verification**: Explicitly prevents fake verification claims. When no approved market feed is configured, returns `status: "SOURCE_UNCONFIGURED"` with note: *"Outcome verification source not configured."*
- **Mock**: `MockMarketDataAdapter`. Simulates quotes for local testing.
- **Production Target**: Licensed Indian exchange tick data provider (NSE/BSE authorized data vendor).

### 4. Electronic Signature Adapter (`adapters/esign/esign.adapter.ts`)
- **Contract**: `ESignAdapter` (`initiateSignature`, `getSignatureStatus`).
- **Hashing**: Precomputes SHA-256 hash of agreement terms prior to requesting consent.
- **Mock**: `MockESignAdapter`. Simulates consent verification and provides simulated certificate fingerprints.
- **Production Target**: Licensed Electronic Signature Service Provider (ESP) compliant with IT Act 2000.

### 5. PaRRVA Adapter (`adapters/parrva/parrva.adapter.ts`)
- **Contract**: `ParrvaAdapter` (`submitForVerification`, `getVerificationStatus`).
- **Regulatory Alignment**: Implements the `PAST_PERFORMANCE_VERIFICATION` abstraction aligned with SEBI circulars on the operationalisation of PaRRVA (Performance and Return Reporting & Verification Architecture).
- **Statuses**: `NOT_APPLICABLE`, `NOT_SUBMITTED`, `SUBMITTED`, `UNDER_VERIFICATION`, `VERIFIED`, `REJECTED`, `EXPIRED`, `WITHDRAWN`.
- **Mock**: `MockParrvaAdapter`. Stores and simulates verification records for local testing.
- **Production Target**: Official PaRRVA interface when API specifications are operationalized.
