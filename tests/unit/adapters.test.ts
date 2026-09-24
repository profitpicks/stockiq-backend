import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockOtpAdapter } from "../../adapters/otp/otp.adapter.js";
import { MockPaymentGatewayAdapter } from "../../adapters/payments/payment.adapter.js";
import { MockMarketDataAdapter } from "../../adapters/market-data/market-data.adapter.js";
import { MockESignAdapter } from "../../adapters/esign/esign.adapter.js";
import { MockParrvaAdapter, ParrvaVerificationStatuses } from "../../adapters/parrva/parrva.adapter.js";

describe("Unit: Adapters & Mock Implementations", () => {
  it("OTP Adapter: sends and verifies mock OTP", async () => {
    const otpAdapter = new MockOtpAdapter();
    assert.equal(MockOtpAdapter.IS_MOCK, true);

    const sendRes = await otpAdapter.sendOtp({
      identifier: "+919876543210",
      purpose: "LOGIN",
    });

    assert.equal(sendRes.success, true);
    assert.ok(sendRes.referenceId);

    // Verify valid OTP
    const verifySuccess = await otpAdapter.verifyOtp({
      identifier: "+919876543210",
      otp: MockOtpAdapter.DEFAULT_TEST_OTP,
      purpose: "LOGIN",
    });
    assert.equal(verifySuccess.valid, true);

    // Verify invalid OTP
    const verifyFail = await otpAdapter.verifyOtp({
      identifier: "+919876543210",
      otp: "999999",
      purpose: "LOGIN",
    });
    assert.equal(verifyFail.valid, false);
  });

  it("Payment Gateway Adapter: creates order in paise, verifies payment, initiates refund", async () => {
    const paymentAdapter = new MockPaymentGatewayAdapter();
    assert.equal(MockPaymentGatewayAdapter.IS_MOCK, true);

    const order = await paymentAdapter.createOrder({
      amountInPaise: 250000, // Rs 2,500
      currency: "INR",
      receipt: "rcpt_001",
    });

    assert.ok(order.orderId.startsWith("order_mock_"));
    assert.equal(order.amountInPaise, 250000);
    assert.equal(order.currency, "INR");
    assert.equal(order.status, "CREATED");

    const verification = await paymentAdapter.verifyPayment({
      orderId: order.orderId,
      paymentId: "pay_123456",
    });
    assert.equal(verification.verified, true);
    assert.equal(verification.status, "SUCCESS");

    const refund = await paymentAdapter.initiateRefund({
      paymentId: "pay_123456",
      amountInPaise: 250000,
      reason: "Client request",
    });
    assert.equal(refund.status, "SUCCESS");
  });

  it("Market Data Adapter: returns quotes and verifies conditions or unconfigured state", async () => {
    const adapter = new MockMarketDataAdapter(true);
    assert.equal(MockMarketDataAdapter.IS_MOCK, true);

    const quote = await adapter.getQuote("RELIANCE");
    assert.ok(quote);
    assert.equal(quote.symbol, "RELIANCE");
    assert.ok(quote.lastPrice > 0);

    const priceCheck = await adapter.verifyPriceCondition({
      symbol: "RELIANCE",
      condition: "ABOVE",
      targetPrice: 2500,
      timeWindowStart: new Date(Date.now() - 3600000).toISOString(),
      timeWindowEnd: new Date().toISOString(),
    });
    assert.equal(priceCheck.status, "VERIFIED");

    // Test unconfigured adapter
    const unconfiguredAdapter = new MockMarketDataAdapter(false);
    assert.equal(unconfiguredAdapter.isConfigured(), false);
    const unconfCheck = await unconfiguredAdapter.verifyPriceCondition({
      symbol: "RELIANCE",
      condition: "ABOVE",
      targetPrice: 2500,
      timeWindowStart: new Date().toISOString(),
      timeWindowEnd: new Date().toISOString(),
    });
    assert.equal(unconfCheck.status, "SOURCE_UNCONFIGURED");
    assert.equal(unconfCheck.notes, "Outcome verification source not configured.");
  });

  it("eSign Adapter: initiates signature request and returns reference", async () => {
    const esignAdapter = new MockESignAdapter();
    assert.equal(MockESignAdapter.IS_MOCK, true);

    const result = await esignAdapter.initiateSignature({
      documentId: "doc-1",
      documentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      documentTitle: "Advisory Service Agreement",
      signerEmail: "investor@example.com",
      signerMobile: "+919876543210",
      signerName: "John Doe",
      method: "OTP_CONSENT_HASH",
    });

    assert.ok(result.signatureReferenceId.startsWith("esign_mock_"));
    assert.equal(result.status, "SIGNED");
  });

  it("PaRRVA Adapter: submits verification record and retrieves status", async () => {
    const parrvaAdapter = new MockParrvaAdapter();
    assert.equal(MockParrvaAdapter.IS_MOCK, true);
    assert.equal(parrvaAdapter.isOperational(), true);

    const record = await parrvaAdapter.submitForVerification({
      providerId: "prov-1",
      sebiRegistrationNumber: "INH000012345",
      serviceId: "srv-1",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      applicableMethodology: "SEBI Master Circular Methodology v1.0",
    });

    assert.ok(record.verificationReference.startsWith("PARRVA-MOCK-"));
    assert.equal(record.status, ParrvaVerificationStatuses.VERIFIED);
    assert.equal(record.isMock, true);

    const fetched = await parrvaAdapter.getVerificationStatus(record.verificationReference);
    assert.ok(fetched);
    assert.equal(fetched.verificationReference, record.verificationReference);
  });
});
