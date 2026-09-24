import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { paymentsService } from "../../modules/payments/payments.service.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { ProviderService } from "../../modules/providers/provider.service.js";

const providerService = new ProviderService();

export const paymentsRouter = Router();

const getActiveRole = (roles: string[]): string => {
  const priority = ["SUPER_ADMIN", "COMPLIANCE_ADMIN", "FINANCE_ADMIN", "INVESTMENT_ADVISER", "RESEARCH_ANALYST"];
  for (const r of priority) {
    if (roles.includes(r)) return r;
  }
  return roles[0] || "INVESTOR_RETAIL";
};

paymentsRouter.post(
  "/order",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { serviceId, jurisdiction } = req.body;
      const userId = req.user!.id;

      if (!serviceId) {
        throw new AppError("serviceId is required", 400, "BAD_REQUEST");
      }

      const order = await paymentsService.createOrder({ userId, serviceId, jurisdiction });
      res.status(201).json({ status: "SUCCESS", order });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post(
  "/verify",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gatewayOrderId, gatewayPaymentId, gatewaySignature } = req.body;
      const actorId = req.user!.id;

      if (!gatewayOrderId || !gatewayPaymentId || !gatewaySignature) {
        throw new AppError("gatewayOrderId, gatewayPaymentId, and gatewaySignature are required", 400, "BAD_REQUEST");
      }

      const order = await paymentsService.verifyPaymentSignature({
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature,
        actorId,
      });

      res.status(200).json({ status: "SUCCESS", order });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post(
  "/refund",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN, PlatformRoles.FINANCE_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId, amountPaise, reason } = req.body;
      const actorId = req.user!.id;
      const actorRole = getActiveRole(req.user!.roles);

      if (!orderId || !amountPaise) {
        throw new AppError("orderId and amountPaise are required", 400, "BAD_REQUEST");
      }

      await paymentsService.refund({
        orderId,
        amountPaise,
        reason,
        actorId,
        actorRole,
      });

      res.status(200).json({ status: "SUCCESS", message: "Refund successfully processed" });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post(
  "/webhook",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      await paymentsService.handleWebhook(req.headers, rawBody);
      res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.get(
  "/orders",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const role = getActiveRole(req.user!.roles);

      let orders;
      if (
        role === PlatformRoles.SUPER_ADMIN ||
        role === PlatformRoles.COMPLIANCE_ADMIN ||
        role === PlatformRoles.FINANCE_ADMIN
      ) {
        orders = await paymentsService.listOrders({});
      } else if (role === PlatformRoles.RESEARCH_ANALYST || role === PlatformRoles.INVESTMENT_ADVISER) {
        const providerProfile = await providerService.getProviderByUserId(actorId);
        const providerId = providerProfile ? providerProfile.id : "none";
        orders = await paymentsService.listOrders({ providerId });
      } else {
        orders = await paymentsService.listOrders({ userId: actorId });
      }

      const { serviceId, status, startDate, endDate, search } = req.query;
      if (serviceId) {
        orders = orders.filter((o) => o.serviceId === String(serviceId));
      }
      if (status) {
        orders = orders.filter((o) => o.status === String(status));
      }
      if (startDate) {
        const start = new Date(String(startDate));
        orders = orders.filter((o) => new Date(o.createdAt) >= start);
      }
      if (endDate) {
        const end = new Date(String(endDate));
        orders = orders.filter((o) => new Date(o.createdAt) <= end);
      }
      if (search) {
        const queryStr = String(search).toLowerCase();
        orders = orders.filter(
          (o) =>
            o.id.toLowerCase().includes(queryStr) ||
            (o.gatewayOrderId && o.gatewayOrderId.toLowerCase().includes(queryStr)) ||
            o.userId.toLowerCase().includes(queryStr)
        );
      }

      res.status(200).json({ status: "SUCCESS", orders });
    } catch (err) {
      next(err);
    }
  }
);
