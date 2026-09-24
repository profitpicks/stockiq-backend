import { Router, Request, Response, NextFunction } from "express";
import { notificationService } from "../../modules/notifications/notifications.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { z } from "zod";

export const notificationsRouter = Router();

const UpdateReadSchema = z.object({
  id: z.string().uuid("Invalid notification ID"),
});

/**
 * GET /api/v1/notifications
 * Lists all notifications for the authenticated user.
 */
notificationsRouter.get("/", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await notificationService.getNotifications(req.user!.id);
    res.status(200).json({
      success: true,
      notifications: list,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/notifications/unread-count
 * Retrieves count of unread notifications for the authenticated user.
 */
notificationsRouter.get("/unread-count", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.id);
    res.status(200).json({
      success: true,
      count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a specific notification as read. Uses server-authoritative recipient validation.
 */
notificationsRouter.patch("/:id/read", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const notification = await notificationService.markAsRead(id, req.user!.id);
    if (!notification) {
      throw new AppError("Notification not found or access denied", 404, "NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      notification,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/notifications/mark-all-read
 * Marks all notifications for the authenticated user as read.
 */
notificationsRouter.post("/mark-all-read", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAllAsRead(req.user!.id);
    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/notifications/activity
 * Retrieves the actual, non-fabricated, operational activity logs.
 */
notificationsRouter.get("/activity", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activity = await notificationService.getActivityItems(req.user!.id);
    res.status(200).json({
      success: true,
      activity,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
