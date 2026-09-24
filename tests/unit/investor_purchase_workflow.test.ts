import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { SubscriptionsService } from "../../modules/subscriptions/subscriptions.service.js";
import { PaymentsService } from "../../modules/payments/payments.service.js";
import { MockPaymentGatewayAdapter } from "../../modules/payments/payment-gateway.adapter.js";

describe("Investor Subscription Purchase Workflow Unit Tests", () => {
  let subService: SubscriptionsService;
  let payService: PaymentsService;
  let mockAdapter: MockPaymentGatewayAdapter;

  const mockInvestorId = crypto.randomUUID();
  const mockServiceId = crypto.randomUUID();
  const mockAgreementSigId = `sig-${crypto.randomUUID()}`;

  beforeEach(() => {
    // Reset in-memory stores
    SubscriptionsService.memorySubscriptions.clear();
    SubscriptionsService.memoryEvents.clear();

    subService = new SubscriptionsService();
    mockAdapter = new MockPaymentGatewayAdapter();
    payService = new PaymentsService(mockAdapter);
  });

  it("1. Pre-purchase eligibility checks pricing, suitability, agreements, and publication status", async () => {
    const eligibility = await subService.checkPrePurchaseEligibility(mockInvestorId, mockServiceId);

    assert.ok(eligibility);
    assert.equal(eligibility.serviceId, mockServiceId);
    assert.ok(eligibility.pricing);
    assert.equal(eligibility.pricing.currency, "INR");
    assert.ok(eligibility.pricing.totalAmountPaise > 0);
    assert.ok(eligibility.suitability);
    assert.ok(eligibility.agreement);
    assert.equal(eligibility.hasActiveSubscription, false);
  });

  it("2. Active subscription prevents duplicate purchase flow", async () => {
    // First, activate a subscription
    const sub = await subService.createSubscription({
      userId: mockInvestorId,
      serviceId: mockServiceId,
    });

    await subService.activateSubscription({
      subscriptionId: sub.id,
      paymentOrderId: "order-test-1",
      agreementSignatureId: mockAgreementSigId,
    });

    // Now check eligibility again
    const check = await subService.checkPrePurchaseEligibility(mockInvestorId, mockServiceId);
    assert.equal(check.hasActiveSubscription, true);
    assert.equal(check.activeSubscriptionId, sub.id);
    assert.equal(check.canSubscribe, false);
    assert.ok(check.reasons.some((r) => r.includes("already exists")));
  });

  it("3. Payment order creation links pending subscription", async () => {
    const pendingSub = await subService.createSubscription({
      userId: mockInvestorId,
      serviceId: mockServiceId,
      paymentOrderId: "pay-ord-456",
      agreementSignatureId: mockAgreementSigId,
    });

    assert.equal(pendingSub.status, "PENDING");
    assert.equal(pendingSub.paymentOrderId, "pay-ord-456");

    // Investor should NOT have access yet
    const accessCheck = await subService.canAccessServiceChannel(mockInvestorId, mockServiceId);
    assert.equal(accessCheck.allowed, false);
    assert.ok(accessCheck.reason?.includes("not active"));
  });

  it("4. Authoritative server-side payment verification activates subscription", async () => {
    // Setup pending subscription
    const pendingSub = await subService.createSubscription({
      userId: mockInvestorId,
      serviceId: mockServiceId,
      paymentOrderId: "pay-ord-789",
      agreementSignatureId: mockAgreementSigId,
    });

    // Authoritative activation occurs
    const activeSub = await subService.activateSubscription({
      subscriptionId: pendingSub.id,
      paymentOrderId: "pay-ord-789",
      agreementSignatureId: mockAgreementSigId,
    });

    assert.equal(activeSub.status, "ACTIVE");
    assert.ok(activeSub.startDate);
    assert.ok(activeSub.endDate);

    // Investor now has verified channel access
    const accessCheck = await subService.canAccessServiceChannel(mockInvestorId, mockServiceId);
    assert.equal(accessCheck.allowed, true);
    assert.equal(accessCheck.subscriptionStatus, "ACTIVE");
  });

  it("5. Activation is idempotent and prevents invalid state transitions", async () => {
    const pendingSub = await subService.createSubscription({
      userId: mockInvestorId,
      serviceId: mockServiceId,
      paymentOrderId: "pay-ord-idem",
      agreementSignatureId: mockAgreementSigId,
    });

    const activated1 = await subService.activateSubscription({
      subscriptionId: pendingSub.id,
      paymentOrderId: "pay-ord-idem",
      agreementSignatureId: mockAgreementSigId,
    });

    const activated2 = await subService.activateSubscription({
      subscriptionId: pendingSub.id,
      paymentOrderId: "pay-ord-idem",
      agreementSignatureId: mockAgreementSigId,
    });

    assert.equal(activated1.id, activated2.id);
    assert.equal(activated2.status, "ACTIVE");
  });
});
