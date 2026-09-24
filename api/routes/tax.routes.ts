import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { taxService } from "../../modules/payments/tax.service.js";
import { AppError } from "../middleware/error-handler.middleware.js";

export const taxRouter = Router();

taxRouter.post(
  "/rules",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jurisdiction, serviceCategory, cgstRate, sgstRate, igstRate, version, isActive } = req.body;

      if (
        !jurisdiction ||
        !serviceCategory ||
        cgstRate === undefined ||
        sgstRate === undefined ||
        igstRate === undefined ||
        !version
      ) {
        throw new AppError(
          "jurisdiction, serviceCategory, cgstRate, sgstRate, igstRate, and version are required",
          400,
          "BAD_REQUEST"
        );
      }

      const rule = await taxService.createRule({
        jurisdiction,
        serviceCategory,
        cgstRate,
        sgstRate,
        igstRate,
        version,
        isActive,
      });

      res.status(201).json({ status: "SUCCESS", rule });
    } catch (err) {
      next(err);
    }
  }
);

taxRouter.get(
  "/rules",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rules = await taxService.listRules();
      res.status(200).json({ status: "SUCCESS", rules });
    } catch (err) {
      next(err);
    }
  }
);
