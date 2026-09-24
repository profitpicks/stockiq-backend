/**
 * stockiq - Notifications and Activity Service
 */

import { db } from "../../database/connection.js";
import { Notification, NotificationType, ActivityItem } from "./types.js";
import { v4 as uuidv4 } from "uuid";
import { ProviderService } from "../providers/provider.service.ts";
import { ServiceManagementService } from "../services/management.service.ts";
import { LedgerService } from "../recommendations/ledger.service.ts";

export class NotificationService {
  private static memoryNotifications = new Map<string, Notification[]>(); // recipientId -> notifications

  /**
   * Helper to insert a notification with dynamic fallback support
   */
  public async createNotification(params: {
    recipientId: string;
    notificationType: NotificationType;
    title: string;
    message: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }): Promise<Notification> {
    const now = new Date().toISOString();
    const notification: Notification = {
      id: uuidv4(),
      recipientId: params.recipientId,
      notificationType: params.notificationType,
      title: params.title,
      message: params.message,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      isRead: false,
      createdAt: now,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO notifications 
          (id, recipient_id, notification_type, title, message, related_entity_type, related_entity_id, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          notification.id,
          notification.recipientId,
          notification.notificationType,
          notification.title,
          notification.message,
          notification.relatedEntityType || null,
          notification.relatedEntityId || null,
          notification.isRead,
          notification.createdAt,
        ]
      );
    } catch (err) {
      console.error("[createNotification Error]: Fallback to in-memory", err);
    }

    // Always keep in-memory up to date
    const userNotifications = NotificationService.memoryNotifications.get(notification.recipientId) || [];
    userNotifications.push(notification);
    NotificationService.memoryNotifications.set(notification.recipientId, userNotifications);

    return notification;
  }

  /**
   * Lists all notifications for a given user
   */
  public async getNotifications(recipientId: string): Promise<Notification[]> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, recipient_id AS "recipientId", notification_type AS "notificationType", 
                title, message, related_entity_type AS "relatedEntityType", 
                related_entity_id AS "relatedEntityId", is_read AS "isRead", 
                created_at AS "createdAt", read_at AS "readAt"
         FROM notifications 
         WHERE recipient_id = $1 
         ORDER BY created_at DESC`,
        [recipientId]
      );
      if (rows.length > 0) {
        return rows;
      }
    } catch (err) {
      console.error("[getNotifications Error]: Fallback to in-memory", err);
    }

    const memoryList = NotificationService.memoryNotifications.get(recipientId) || [];
    return [...memoryList].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Retrieves unread notifications count
   */
  public async getUnreadCount(recipientId: string): Promise<number> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT COUNT(*) as count FROM notifications WHERE recipient_id = $1 AND is_read = false`,
        [recipientId]
      );
      return parseInt(rows[0].count, 10);
    } catch (err) {
      console.error("[getUnreadCount Error]: Fallback to in-memory", err);
    }

    const memoryList = NotificationService.memoryNotifications.get(recipientId) || [];
    return memoryList.filter((n) => !n.isRead).length;
  }

  /**
   * Marks a specific notification as read (idempotent)
   */
  public async markAsRead(id: string, recipientId: string): Promise<Notification | null> {
    const now = new Date().toISOString();
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `UPDATE notifications 
         SET is_read = true, read_at = $1 
         WHERE id = $2 AND recipient_id = $3
         RETURNING id, recipient_id AS "recipientId", notification_type AS "notificationType", 
                   title, message, related_entity_type AS "relatedEntityType", 
                   related_entity_id AS "relatedEntityId", is_read AS "isRead", 
                   created_at AS "createdAt", read_at AS "readAt"`,
        [now, id, recipientId]
      );
      if (rows.length > 0) {
        // Sync memory list
        const list = NotificationService.memoryNotifications.get(recipientId) || [];
        const idx = list.findIndex((n) => n.id === id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], isRead: true, readAt: now };
        }
        return rows[0];
      }
    } catch (err) {
      console.error("[markAsRead Error]: Fallback to in-memory", err);
    }

    const list = NotificationService.memoryNotifications.get(recipientId) || [];
    const idx = list.findIndex((n) => n.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], isRead: true, readAt: now };
      NotificationService.memoryNotifications.set(recipientId, list);
      return list[idx];
    }
    return null;
  }

  /**
   * Marks all notifications for a given user as read
   */
  public async markAllAsRead(recipientId: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      const pool = db.getPool();
      await pool.query(
        `UPDATE notifications SET is_read = true, read_at = $1 WHERE recipient_id = $2 AND is_read = false`,
        [now, recipientId]
      );
    } catch (err) {
      console.error("[markAllAsRead Error]: Fallback to in-memory", err);
    }

    const list = NotificationService.memoryNotifications.get(recipientId) || [];
    const updatedList = list.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: now }));
    NotificationService.memoryNotifications.set(recipientId, updatedList);
  }

  /**
   * Retrieves real, non-fabricated, operational activity logs from actual database/workspace records
   */
  public async getActivityItems(userId: string): Promise<ActivityItem[]> {
    const activities: ActivityItem[] = [];
    const providerService = new ProviderService();
    const serviceService = new ServiceManagementService(providerService);
    const ledgerService = new LedgerService(providerService);

    try {
      const provider = await providerService.getProviderByUserId(userId);
      if (provider) {
        // 1. Dossier / Verification State Activity
        if (provider.status !== "DRAFT") {
          activities.push({
            id: `act-verification-${provider.id}`,
            description: `Dossier submitted for SEBI verification (ID: ${provider.sebiRegistrationNumber}).`,
            module: "VERIFICATION",
            timestamp: provider.updatedAt || provider.createdAt,
            statusBadge: provider.status,
          });
        } else {
          activities.push({
            id: `act-draft-${provider.id}`,
            description: "Dossier registration initiated as Draft.",
            module: "VERIFICATION",
            timestamp: provider.createdAt,
            statusBadge: "DRAFT",
          });
        }

        // 2. Compliance Declarations Activity
        const declarations = await providerService.getDeclarations(provider.id);
        for (const dec of declarations) {
          if (dec.isDeclared) {
            activities.push({
              id: `act-dec-${dec.id}`,
              description: `Signed compliance declaration: ${dec.declarationType.replace(/_/g, " ")}.`,
              module: "COMPLIANCE",
              timestamp: dec.declaredAt,
              statusBadge: "SIGNED",
            });
          }
        }

        // 3. Compliance Documents Activity
        const documents = await providerService.getDocuments(provider.id);
        for (const doc of documents) {
          activities.push({
            id: `act-doc-${doc.id}`,
            description: `Registered cryptographic document receipt for: ${doc.documentType.replace(/_/g, " ")}.`,
            module: "COMPLIANCE",
            timestamp: doc.uploadedAt || provider.updatedAt,
            statusBadge: doc.reviewStatus,
          });
        }

        // 4. Registered Services Activity
        const services = await serviceService.getProviderServices(provider.id);
        for (const s of services) {
          activities.push({
            id: `act-srv-${s.id}`,
            description: `Service definition registered: '${s.serviceName}'.`,
            module: "SERVICES",
            timestamp: s.updatedAt || s.createdAt || provider.createdAt,
            statusBadge: s.status,
          });
        }

        // 5. Published Recommendations Activity
        const recs = await ledgerService.getProviderRecommendations(userId);
        for (const r of recs) {
          activities.push({
            id: `act-rec-${r.id}`,
            description: `Published recommendation: ${r.symbol} (${r.direction}) at entry ₹${r.entryPrice}.`,
            module: "RECOMMENDATIONS",
            timestamp: r.createdAt || provider.createdAt,
            statusBadge: r.currentStatus,
          });
        }
      }
    } catch (err) {
      console.error("[getActivityItems Error]:", err);
    }

    // Sort chronologically (newest first)
    return activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
}
export const notificationService = new NotificationService();
