import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { notificationService } from "../../modules/notifications/notifications.service.js";
import { NotificationTypes } from "../../modules/notifications/types.js";

describe("Unit: Backend Notifications & Activity Center", () => {
  const userA = "usr_test_provider_a";
  const userB = "usr_test_provider_b";

  it("should initialize with empty notification list and 0 unread count", async () => {
    const listA = await notificationService.getNotifications(userA);
    const countA = await notificationService.getUnreadCount(userA);

    assert.equal(listA.length, 0, "A new provider must start with 0 notifications");
    assert.equal(countA, 0, "A new provider must have 0 unread count");
  });

  it("should create notifications and isolate them by provider", async () => {
    const notifA = await notificationService.createNotification({
      recipientId: userA,
      notificationType: NotificationTypes.VERIFICATION_APPROVED,
      title: "SEBI Profile Verified",
      message: "Your SEBI registration has been successfully verified by Stockiq review officers.",
      relatedEntityType: "VERIFICATION",
      relatedEntityId: "case-001",
    });

    const notifB = await notificationService.createNotification({
      recipientId: userB,
      notificationType: NotificationTypes.COMPLIANCE_WARNING,
      title: "Quarterly Audit Warning",
      message: "Please file your periodic disclosure report by end of month.",
      relatedEntityType: "COMPLIANCE",
      relatedEntityId: "warning-002",
    });

    assert.equal(notifA.recipientId, userA);
    assert.equal(notifB.recipientId, userB);

    const listA = await notificationService.getNotifications(userA);
    const listB = await notificationService.getNotifications(userB);

    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, notifA.id);
    assert.equal(listA[0].isRead, false);

    assert.equal(listB.length, 1);
    assert.equal(listB[0].id, notifB.id);
    assert.equal(listB[0].isRead, false);
  });

  it("should retrieve accurate unread counts from the service", async () => {
    const countA = await notificationService.getUnreadCount(userA);
    assert.equal(countA, 1);
  });

  it("should mark a single notification as read and ensure idempotency", async () => {
    const list = await notificationService.getNotifications(userA);
    const notifId = list[0].id;

    // First mark as read
    const updated = await notificationService.markAsRead(notifId, userA);
    assert.ok(updated);
    assert.equal(updated!.isRead, true);
    assert.ok(updated!.readAt);

    const countAfter = await notificationService.getUnreadCount(userA);
    assert.equal(countAfter, 0);

    // Repeated mark as read (Idempotency)
    const updatedAgain = await notificationService.markAsRead(notifId, userA);
    assert.ok(updatedAgain);
    assert.equal(updatedAgain!.isRead, true, "Read status must remain true");
  });

  it("should mark all notifications as read successfully", async () => {
    // Create two more notifications for userA
    await notificationService.createNotification({
      recipientId: userA,
      notificationType: NotificationTypes.SERVICE_APPROVED,
      title: "Service Approved",
      message: "Service 'Premium Nifty Options' is approved.",
    });

    await notificationService.createNotification({
      recipientId: userA,
      notificationType: NotificationTypes.SUBSCRIBER_NEW,
      title: "New Subscription",
      message: "A new client has subscribed to your service.",
    });

    const countBefore = await notificationService.getUnreadCount(userA);
    assert.equal(countBefore, 2);

    await notificationService.markAllAsRead(userA);

    const countAfter = await notificationService.getUnreadCount(userA);
    assert.equal(countAfter, 0);
  });

  it("should gracefully handle non-existent notifications without throwing errors", async () => {
    const res = await notificationService.markAsRead("ffffffff-ffff-ffff-ffff-ffffffffffff", userA);
    assert.equal(res, null);
  });
});
