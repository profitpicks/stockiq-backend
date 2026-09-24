import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AuditService } from "../../modules/audit/audit.service.js";
import { NotificationService } from "../../modules/notifications/notifications.service.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { RbacEngine } from "../../modules/auth/rbac.js";

describe("Unit: Milestone 16 - Cross-Cutting Infrastructure & Event Integration", () => {
  const auditService = AuditService.getInstance();
  const notificationService = new NotificationService();

  test("Audit: Security logs sanitize sensitive fields automatically", () => {
    const log = auditService.logSecurityAction(
      "usr-test-1",
      PlatformRoles.SUPER_ADMIN,
      "USER_PASSWORD_CHANGE",
      "USER",
      "usr-target-1",
      {
        password: "SuperSecretPassword123!",
        otp: "123456",
        token: "jwt_token_abcdef",
        pan: "ABCDE1234F",
        publicNote: "Password updated by admin"
      },
      undefined,
      "127.0.0.1"
    );

    assert.equal(log.newState?.password, "[MASKED]");
    assert.equal(log.newState?.otp, "[MASKED]");
    assert.equal(log.newState?.token, "[MASKED]");
    assert.equal(log.newState?.pan, "[MASKED]");
    assert.equal(log.newState?.publicNote, "Password updated by admin");
  });

  test("Audit: Business event ledger creates SHA-256 hash chain across events", () => {
    const event1 = auditService.logBusinessEvent(
      "REC-001",
      "RECOMMENDATION",
      "RECOMMENDATION_PUBLISHED",
      "PLATFORM_VERIFIED_EVENT",
      { symbol: "RELIANCE", action: "BUY", target: 2900 },
      "prov-ra-1"
    );

    const event2 = auditService.logBusinessEvent(
      "REC-001",
      "RECOMMENDATION",
      "RECOMMENDATION_TARGET_HIT",
      "PLATFORM_VERIFIED_EVENT",
      { symbol: "RELIANCE", status: "TARGET_HIT", priceAchieved: 2910 },
      "prov-ra-1"
    );

    assert.ok(event1.eventHash.length === 64); // SHA-256 hex length
    assert.ok(event2.eventHash.length === 64);
    assert.equal(event2.previousEventHash, event1.eventHash);
  });

  test("Notification: Recipient isolation strictly prevents IDOR", async () => {
    const recipientA = "usr-recipient-a-101";
    const recipientB = "usr-recipient-b-202";

    const notifA = await notificationService.createNotification({
      recipientId: recipientA,
      notificationType: "SYSTEM_ALERT",
      title: "Subscription Renewal",
      message: "Your subscription to Alpha Call Service has been renewed.",
    });

    const listB = await notificationService.getNotifications(recipientB);
    assert.equal(listB.some((n) => n.id === notifA.id), false);

    // Recipient B attempting to mark Recipient A's notification as read is denied
    const markReadResult = await notificationService.markAsRead(notifA.id, recipientB);
    assert.equal(markReadResult, null);

    // Unread count for Recipient B remains 0
    const unreadB = await notificationService.getUnreadCount(recipientB);
    assert.equal(unreadB, 0);

    // Recipient A successfully marks read
    const markReadA = await notificationService.markAsRead(notifA.id, recipientA);
    assert.notEqual(markReadA, null);
    assert.equal(markReadA?.isRead, true);
  });

  test("Cross-Event: Simultaneous Audit + Notification emission for critical events", async () => {
    const providerUserId = "usr-prov-999";
    const providerId = "prov-sebi-ra-999";

    // 1. Audit Log Creation
    const auditLog = auditService.logSecurityAction(
      "usr-admin-1",
      PlatformRoles.VERIFICATION_OFFICER,
      "PROVIDER_VERIFICATION_APPROVED",
      "PROVIDER",
      providerId,
      { status: "APPROVED", registrationNumber: "INH000000999" }
    );

    // 2. Notification Creation
    const notif = await notificationService.createNotification({
      recipientId: providerUserId,
      notificationType: "VERIFICATION_UPDATE",
      title: "SEBI Provider Verification Approved",
      message: "Your dossier registration INH000000999 has been approved.",
      relatedEntityType: "PROVIDER",
      relatedEntityId: providerId,
    });

    assert.equal(auditLog.entityId, providerId);
    assert.equal(notif.recipientId, providerUserId);
    assert.equal(notif.isRead, false);
  });
});
