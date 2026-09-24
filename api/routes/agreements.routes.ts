import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { agreementsService, AgreementType, SignatureMethod } from "../../modules/agreements/agreements.service.js";
import { AppError } from "../middleware/error-handler.middleware.js";

export const agreementsRouter = Router();

/**
 * POST /api/v1/agreements/template
 * Registers a new versioned agreement template (Admins/Compliance only)
 */
agreementsRouter.post(
  "/template",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agreementType, version, title, content } = req.body;

      if (!agreementType || !version || !title || !content) {
        throw new AppError("agreementType, version, title, and content are required", 400, "BAD_REQUEST");
      }

      const template = await agreementsService.createTemplate({
        agreementType,
        version,
        title,
        content,
        createdBy: req.user!.id,
      });

      res.status(201).json({ status: "SUCCESS", template });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/agreements/template/latest
 * Retrieves the latest active template for a given type
 */
agreementsRouter.get(
  "/template/latest",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = req.query.type as AgreementType;

      if (!type) {
        throw new AppError("Query parameter 'type' is required", 400, "BAD_REQUEST");
      }

      const template = await agreementsService.getLatestTemplate(type);
      if (!template) {
        throw new AppError(`No active template found for type: ${type}`, 404, "NOT_FOUND");
      }

      res.json({ status: "SUCCESS", template });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/agreements/sign
 * Record an agreement signature or consent action
 */
agreementsRouter.post(
  "/sign",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { templateId, signatureMethod } = req.body;

      if (!templateId || !signatureMethod) {
        throw new AppError("templateId and signatureMethod are required", 400, "BAD_REQUEST");
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const signature = await agreementsService.signAgreement({
        userId,
        templateId,
        signatureMethod: signatureMethod as SignatureMethod,
        ipAddress,
        userAgent,
      });

      res.status(201).json({ status: "SUCCESS", signature });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/agreements/signatures
 * Retrieves signature records for the authenticated user
 */
agreementsRouter.get(
  "/signatures",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const signatures = await agreementsService.getSignaturesForUser(userId);
      res.json({ status: "SUCCESS", signatures });
    } catch (err) {
      next(err);
    }
  }
);
