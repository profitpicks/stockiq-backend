import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { subscriptionsService } from "../../modules/subscriptions/subscriptions.service.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { ProviderService } from "../../modules/providers/provider.service.js";
import { ServiceManagementService } from "../../modules/services/management.service.js";

const providerService = new ProviderService();
const serviceManagementService = new ServiceManagementService();

export const subscriptionsRouter = Router();

// Validation Schemas
const CreateSubscriptionSchema = z.object({
  serviceId: z.string().uuid("Invalid serviceId format"),
  paymentOrderId: z.string().uuid("Invalid paymentOrderId format").optional(),
  agreementSignatureId: z.string().uuid("Invalid agreementSignatureId format").optional(),
  autoRenew: z.boolean().optional().default(false),
  idempotencyKey: z.string().max(100).optional(),
});

const ActivateSubscriptionSchema = z.object({
  paymentOrderId: z.string().uuid("Invalid paymentOrderId format").optional(),
  agreementSignatureId: z.string().uuid("Invalid agreementSignatureId format").optional(),
});

const CancelSubscriptionSchema = z.object({
  reason: z.string().min(5, "Reason must be at least 5 characters long"),
});

const SuspendSubscriptionSchema = z.object({
  reason: z.string().min(5, "Reason must be at least 5 characters long"),
});

/**
 * POST /api/v1/subscriptions
 * Initiate a subscription for an advisory service.
 * Investor only.
 */
subscriptionsRouter.post(
  "/",
  authMiddleware,
  requireRoles(
    PlatformRoles.INVESTOR_RETAIL,
    PlatformRoles.HNI,
    PlatformRoles.ACCREDITED_INVESTOR,
    PlatformRoles.SUPER_ADMIN
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new AppError("Invalid subscription creation payload", 400, "VALIDATION_ERROR", parsed.error.format())
        );
      }

      const user = req.user!;
      const idempotencyKey =
        parsed.data.idempotencyKey ||
        (req.headers["x-idempotency-key"] as string | undefined);

      const subscription = await subscriptionsService.createSubscription({
        userId: user.id,
        serviceId: parsed.data.serviceId,
        paymentOrderId: parsed.data.paymentOrderId,
        agreementSignatureId: parsed.data.agreementSignatureId,
        autoRenew: parsed.data.autoRenew,
        idempotencyKey,
      });

      res.status(201).json({
        success: true,
        data: subscription,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/subscriptions/me
 * Retrieve the current investor's subscriptions.
 */
subscriptionsRouter.get(
  "/me",
  authMiddleware,
  requireRoles(
    PlatformRoles.INVESTOR_RETAIL,
    PlatformRoles.HNI,
    PlatformRoles.ACCREDITED_INVESTOR,
    PlatformRoles.SUPER_ADMIN
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const subscriptions = await subscriptionsService.getSubscriptionsForUser(user.id);
      res.status(200).json({
        success: true,
        data: subscriptions,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/subscriptions/:id
 * Retrieve a specific subscription by ID with authorization check.
 */
subscriptionsRouter.get(
  "/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscriptionId = String(req.params.id);
      const subscription = await subscriptionsService.getSubscriptionById(subscriptionId);
      if (!subscription) {
        return next(new AppError("Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND"));
      }

      const user = req.user!;
      const isOwner = subscription.userId === user.id;
      const isProvider = user.roles.some((r) =>
        [PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER].includes(r as any)
      );
      const isAdmin = user.roles.some((r) =>
        [
          PlatformRoles.SUPER_ADMIN,
          PlatformRoles.COMPLIANCE_ADMIN,
          PlatformRoles.FINANCE_ADMIN,
          PlatformRoles.SUPPORT_ADMIN,
        ].includes(r as any)
      );

      let isAuthorized = isOwner || isAdmin;
      if (!isAuthorized && isProvider) {
        const providerProfile = await providerService.getProviderByUserId(user.id);
        if (providerProfile && subscription.providerId === providerProfile.id) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return next(new AppError("Not authorized to view this subscription", 403, "FORBIDDEN"));
      }

      res.status(200).json({
        success: true,
        data: subscription,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/subscriptions/:id/activate
 * Controlled activation of subscription following payment, agreement, and suitability checks.
 */
subscriptionsRouter.post(
  "/:id/activate",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ActivateSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new AppError("Invalid subscription activation payload", 400, "VALIDATION_ERROR", parsed.error.format())
        );
      }

      const subscriptionId = String(req.params.id);
      const user = req.user!;

      const activated = await subscriptionsService.activateSubscription({
        subscriptionId,
        actorId: user.id,
        actorRole: user.roles[0] || "INVESTOR",
        paymentOrderId: parsed.data.paymentOrderId,
        agreementSignatureId: parsed.data.agreementSignatureId,
      });

      res.status(200).json({
        success: true,
        data: activated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/subscriptions/:id/cancel
 * Cancel a subscription.
 */
subscriptionsRouter.post(
  "/:id/cancel",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CancelSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new AppError("Invalid cancellation payload", 400, "VALIDATION_ERROR", parsed.error.format())
        );
      }

      const subscriptionId = String(req.params.id);
      const user = req.user!;

      const existing = await subscriptionsService.getSubscriptionById(subscriptionId);
      if (!existing) {
        return next(new AppError("Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND"));
      }

      const isOwner = existing.userId === user.id;
      const isAdmin = user.roles.some((r) =>
        [PlatformRoles.SUPER_ADMIN, PlatformRoles.SUPPORT_ADMIN].includes(r as any)
      );

      if (!isOwner && !isAdmin) {
        return next(new AppError("Not authorized to cancel this subscription", 403, "FORBIDDEN"));
      }

      const cancelled = await subscriptionsService.cancelSubscription({
        subscriptionId,
        userId: user.id,
        actorRole: user.roles[0] || "INVESTOR",
        reason: parsed.data.reason,
      });

      res.status(200).json({
        success: true,
        data: cancelled,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/subscriptions/:id/suspend
 * Admin or Compliance suspension of a subscription.
 */
subscriptionsRouter.post(
  "/:id/suspend",
  authMiddleware,
  requireRoles(
    PlatformRoles.SUPER_ADMIN,
    PlatformRoles.COMPLIANCE_ADMIN,
    PlatformRoles.FINANCE_ADMIN
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SuspendSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          new AppError("Invalid suspension payload", 400, "VALIDATION_ERROR", parsed.error.format())
        );
      }

      const subscriptionId = String(req.params.id);
      const user = req.user!;

      const suspended = await subscriptionsService.suspendSubscription({
        subscriptionId,
        actorId: user.id,
        actorRole: user.roles[0] || "ADMIN",
        reason: parsed.data.reason,
      });

      res.status(200).json({
        success: true,
        data: suspended,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/subscriptions/:id/events
 * Retrieve immutable audit events for a subscription.
 */
subscriptionsRouter.get(
  "/:id/events",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscriptionId = String(req.params.id);
      const subscription = await subscriptionsService.getSubscriptionById(subscriptionId);
      if (!subscription) {
        return next(new AppError("Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND"));
      }

      const user = req.user!;
      const isOwner = subscription.userId === user.id;
      const isProvider = user.roles.some((r) =>
        [PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER].includes(r as any)
      );
      const isAdmin = user.roles.some((r) =>
        [
          PlatformRoles.SUPER_ADMIN,
          PlatformRoles.COMPLIANCE_ADMIN,
          PlatformRoles.FINANCE_ADMIN,
          PlatformRoles.SUPPORT_ADMIN,
        ].includes(r as any)
      );

      let isAuthorized = isOwner || isAdmin;
      if (!isAuthorized && isProvider) {
        const providerProfile = await providerService.getProviderByUserId(user.id);
        if (providerProfile && subscription.providerId === providerProfile.id) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return next(new AppError("Not authorized to view subscription audit events", 403, "FORBIDDEN"));
      }

      const events = await subscriptionsService.getSubscriptionEvents(subscriptionId);
      res.status(200).json({
        success: true,
        data: events,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/subscriptions/services/:serviceId/access
 * Entitlement policy check: CAN_ACCESS_SERVICE_CHANNEL
 * Verifies active subscription, unexpired validity, executed agreement, and suitability compliance.
 */
subscriptionsRouter.get(
  "/services/:serviceId/access",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const serviceId = String(req.params.serviceId);

      const result = await subscriptionsService.canAccessServiceChannel(user.id, serviceId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/subscriptions/services/:serviceId/eligibility
 * Pre-purchase eligibility check:
 * Authoritatively verifies service status, duplication, suitability, agreement status, and pricing.
 */
subscriptionsRouter.get(
  "/services/:serviceId/eligibility",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const serviceId = String(req.params.serviceId);

      const eligibility = await subscriptionsService.checkPrePurchaseEligibility(user.id, serviceId);
      res.status(200).json({
        success: true,
        data: eligibility,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/subscriptions/services/:serviceId/subscribers
 * Provider / Admin view: List subscribers for a given service.
 */
subscriptionsRouter.get(
  "/services/:serviceId/subscribers",
  authMiddleware,
  requireRoles(
    PlatformRoles.RESEARCH_ANALYST,
    PlatformRoles.INVESTMENT_ADVISER,
    PlatformRoles.SUPER_ADMIN,
    PlatformRoles.COMPLIANCE_ADMIN,
    PlatformRoles.FINANCE_ADMIN
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const serviceId = String(req.params.serviceId);
      const user = req.user!;

      // 1. Service ownership check
      const service = await serviceManagementService.getServiceById(serviceId);
      if (!service) {
        return next(new AppError("Service not found", 404, "SERVICE_NOT_FOUND"));
      }

      const isAdmin = user.roles.some((r) =>
        [
          PlatformRoles.SUPER_ADMIN,
          PlatformRoles.COMPLIANCE_ADMIN,
          PlatformRoles.FINANCE_ADMIN,
        ].includes(r as any)
      );

      if (!isAdmin) {
        const providerProfile = await providerService.getProviderByUserId(user.id);
        if (!providerProfile || service.providerId !== providerProfile.id) {
          return next(new AppError("Not authorized to view subscribers for this service", 403, "FORBIDDEN"));
        }
      }

      // 2. Query and filter subscribers
      let subscribers = await subscriptionsService.getSubscribersForService(serviceId);

      const { status, search, startDate, endDate } = req.query;
      if (status) {
        subscribers = subscribers.filter((s) => s.status === String(status));
      }
      if (search) {
        const queryStr = String(search).toLowerCase();
        subscribers = subscribers.filter(
          (s) =>
            s.id.toLowerCase().includes(queryStr) ||
            s.userId.toLowerCase().includes(queryStr)
        );
      }
      if (startDate) {
        const start = new Date(String(startDate));
        subscribers = subscribers.filter((s) => s.startDate && new Date(s.startDate) >= start);
      }
      if (endDate) {
        const end = new Date(String(endDate));
        subscribers = subscribers.filter((s) => s.endDate && new Date(s.endDate) <= end);
      }

      res.status(200).json({
        success: true,
        data: subscribers,
      });
    } catch (err) {
      next(err);
    }
  }
);
