import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { paymentsService } from "../../modules/payments/payments.service.js";
import { AppError } from "../middleware/error-handler.middleware.js";

export const reconciliationRouter = Router();

reconciliationRouter.post(
  "/",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN, PlatformRoles.FINANCE_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reports } = req.body;

      if (!reports || !Array.isArray(reports)) {
        throw new AppError("reports must be an array of gateway orders", 400, "BAD_REQUEST");
      }

      const results = await paymentsService.reconcile(reports);
      res.status(200).json({ status: "SUCCESS", results });
    } catch (err) {
      next(err);
    }
  }
);
