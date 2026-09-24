import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { SubscriptionsService } from "../../modules/subscriptions/subscriptions.service.js";
import {
  SubscriptionStatuses,
  ServiceAccessCheckResult,
} from "../../modules/subscriptions/types.js";
import { SuitabilityService } from "../../modules/onboarding/suitability.service.js";
import { AgreementsService } from "../../modules/agreements/agreements.service.js";

describe("Unit: Subscription Domain & Channel Entitlement Engine", () => {
  const service = new SubscriptionsService();

  const mockUserId = crypto.randomUUID();
  const mockServiceId = crypto.randomUUID();
  const mockPaymentOrderId = crypto.randomUUID();
  const mockAgreementSigId = crypto.randomUUID();

  it("should define all 8 required subscription lifecycle statuses", () => {
    const requiredStatuses = [
      "PENDING",
      "ACTIVE",
      "EXPIRING",
      "EXPIRED",
      "CANCELLED",
      "SUSPENDED",
      "REFUND_PENDING",
      "REFUNDED",
    ];

    for (const status of requiredStatuses) {
      assert.ok(status in SubscriptionStatuses, `Status ${status} must exist in SubscriptionStatuses`);
    }
  });

  it("should calculate end date accurately for different billing durations", () => {
    const baseDate = new Date("2026-01-01T00:00:00.000Z");

    const weeklyEnd = service.calculateEndDate(baseDate, "WEEKLY");
    assert.equal(weeklyEnd.getDate(), 8);

    const monthlyEnd = service.calculateEndDate(baseDate, "MONTHLY");
    assert.equal(monthlyEnd.getMonth(), 1); // February

    const quarterlyEnd = service.calculateEndDate(baseDate, "QUARTERLY");
    assert.equal(quarterlyEnd.getMonth(), 3); // April

    const halfYearlyEnd = service.calculateEndDate(baseDate, "HALF_YEARLY");
    assert.equal(halfYearlyEnd.getMonth(), 6); // July

    const annualEnd = service.calculateEndDate(baseDate, "ANNUAL");
    assert.equal(annualEnd.getFullYear(), 2027);
  });

  it("should create subscription in PENDING status", async () => {
    const sub = await service.createSubscription({
      userId: mockUserId,
      serviceId: mockServiceId,
      paymentOrderId: mockPaymentOrderId,
      agreementSignatureId: mockAgreementSigId,
      autoRenew: true,
      idempotencyKey: "test-key-1",
    });

    assert.ok(sub.id);
    assert.equal(sub.userId, mockUserId);
    assert.equal(sub.serviceId, mockServiceId);
    assert.equal(sub.status, "PENDING");
    assert.equal(sub.autoRenew, true);
    assert.equal(sub.startDate, null);
    assert.equal(sub.endDate, null);
  });

  it("should enforce idempotency when creating subscriptions with same key", async () => {
    const key = `idem-key-${crypto.randomUUID()}`;
    const sub1 = await service.createSubscription({
      userId: mockUserId,
      serviceId: mockServiceId,
      idempotencyKey: key,
    });

    const sub2 = await service.createSubscription({
      userId: mockUserId,
      serviceId: mockServiceId,
      idempotencyKey: key,
    });

    assert.equal(sub1.id, sub2.id);
  });

  it("should record immutable subscription events on state changes", async () => {
    const testSubId = crypto.randomUUID();
    const event = await service.recordSubscriptionEvent({
      subscriptionId: testSubId,
      eventType: "TEST_EVENT",
      fromStatus: "PENDING",
      toStatus: "ACTIVE",
      actorId: mockUserId,
      actorRole: "INVESTOR",
      reason: "Test state transition",
      metadata: { foo: "bar" },
    });

    assert.ok(event.id);
    assert.equal(event.subscriptionId, testSubId);
    assert.equal(event.fromStatus, "PENDING");
    assert.equal(event.toStatus, "ACTIVE");

    const events = await service.getSubscriptionEvents(testSubId);
    assert.ok(events.length >= 1);
    assert.equal(events[0].eventType, "TEST_EVENT");
  });

  it("should enforce the CAN_ACCESS_SERVICE_CHANNEL policy rule", async () => {
    // 1. Without subscription: Access denied
    const unknownUserId = crypto.randomUUID();
    const check1 = await service.canAccessServiceChannel(unknownUserId, mockServiceId);
    assert.equal(check1.allowed, false);
    assert.ok(check1.reason?.includes("No subscription record"));

    // 2. Pending subscription: Access denied
    const pendingSub = await service.createSubscription({
      userId: unknownUserId,
      serviceId: mockServiceId,
    });
    const check2 = await service.canAccessServiceChannel(unknownUserId, mockServiceId);
    assert.equal(check2.allowed, false);
    assert.ok(check2.reason?.includes("not active"));

    // 3. Active subscription: Access granted
    const activatedSub = await service.activateSubscription({
      subscriptionId: pendingSub.id,
      paymentOrderId: mockPaymentOrderId,
      agreementSignatureId: mockAgreementSigId,
    });
    assert.equal(activatedSub.status, "ACTIVE");
    assert.ok(activatedSub.startDate);
    assert.ok(activatedSub.endDate);

    const check3 = await service.canAccessServiceChannel(unknownUserId, mockServiceId);
    assert.equal(check3.allowed, true);
    assert.equal(check3.agreementExecuted, true);
    assert.equal(check3.suitabilityMatched, true);
  });

  it("should handle subscription cancellation cleanly", async () => {
    const cancelUser = crypto.randomUUID();
    const sub = await service.createSubscription({
      userId: cancelUser,
      serviceId: mockServiceId,
    });

    await service.activateSubscription({
      subscriptionId: sub.id,
      paymentOrderId: mockPaymentOrderId,
      agreementSignatureId: mockAgreementSigId,
    });

    const cancelled = await service.cancelSubscription({
      subscriptionId: sub.id,
      userId: cancelUser,
      reason: "No longer needed",
    });

    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.cancellationReason, "No longer needed");
    assert.ok(cancelled.cancelledAt);

    // After cancellation, channel access must be immediately revoked
    const check = await service.canAccessServiceChannel(cancelUser, mockServiceId);
    assert.equal(check.allowed, false);
    assert.equal(check.subscriptionStatus, "CANCELLED");
  });

  it("should handle subscription suspension and audit logging", async () => {
    const suspendUser = crypto.randomUUID();
    const sub = await service.createSubscription({
      userId: suspendUser,
      serviceId: mockServiceId,
    });

    await service.activateSubscription({
      subscriptionId: sub.id,
      paymentOrderId: mockPaymentOrderId,
      agreementSignatureId: mockAgreementSigId,
    });

    const suspended = await service.suspendSubscription({
      subscriptionId: sub.id,
      actorId: crypto.randomUUID(),
      actorRole: "COMPLIANCE_ADMIN",
      reason: "Compliance review flag",
    });

    assert.equal(suspended.status, "SUSPENDED");
    assert.equal(suspended.suspensionReason, "Compliance review flag");
    assert.ok(suspended.suspendedAt);

    // Channel access must be immediately blocked
    const check = await service.canAccessServiceChannel(suspendUser, mockServiceId);
    assert.equal(check.allowed, false);
    assert.equal(check.subscriptionStatus, "SUSPENDED");
  });
});
