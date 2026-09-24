import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { VerificationService } from "../../modules/providers/verification.service.ts";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { z } from "zod";

export const verificationRouter = Router();
const providerService = new ProviderService();
const verificationService = new VerificationService(providerService);

const ReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REQUEST_MORE_INFO"]),
  notes: z.string().optional(),
});

// Guard all verification routes with Administrative Verification Roles
verificationRouter.use(
  authMiddleware(true),
  requireRoles(PlatformRoles.VERIFICATION_OFFICER, PlatformRoles.COMPLIANCE_ADMIN, PlatformRoles.SUPER_ADMIN)
);

/**
 * GET /api/v1/verification/cases
 * Lists verification cases queue for Verification Officers.
 */
verificationRouter.get("/cases", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statusParam = req.query.status as any;
    const cases = await verificationService.getVerificationCases(statusParam);
    res.status(200).json({
      cases,
      total: cases.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/verification/cases/:caseId
 * Retrieves detailed case file including provider registration, declarations, and documents.
 */
verificationRouter.get("/cases/:caseId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseId = req.params.caseId as string;
    const vCase = await verificationService.getCaseById(caseId);
    if (!vCase) {
      throw new AppError("Verification case not found", 404, "NOT_FOUND");
    }

    const events = await verificationService.getVerificationEvents(caseId);

    res.status(200).json({
      verificationCase: vCase,
      events,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/verification/cases/:caseId/assign
 * Assigns case to the requesting Verification Officer or specified officer.
 */
verificationRouter.post("/cases/:caseId/assign", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseId = req.params.caseId as string;
    let officerId = req.body.officerId || req.user!.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(officerId)) {
      const hash = crypto.createHash("md5").update(officerId).digest("hex");
      officerId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    }

    const updated = await verificationService.assignCase(caseId, officerId);

    res.status(200).json({
      success: true,
      verificationCase: updated,
      message: `Verification case successfully assigned to officer ${officerId}`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/verification/cases/:caseId/review
 * Submits officer decision (APPROVE, REJECT, REQUEST_MORE_INFO).
 */
verificationRouter.post("/cases/:caseId/review", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseId = req.params.caseId as string;
    const parse = ReviewSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const result = await verificationService.reviewCase({
      caseId,
      officerId: req.user!.id,
      action: parse.data.action,
      notes: parse.data.notes,
      ipAddress,
    });

    res.status(200).json({
      success: true,
      verificationCase: result.case,
      verificationEvent: result.event,
      message: `Case review outcome '${parse.data.action}' processed successfully.`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/verification/services/:id/review
 * Compliance review for provider published services.
 */
verificationRouter.post("/services/:id/review", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const action = req.body.action as "APPROVE" | "REJECT";
    if (!["APPROVE", "REJECT"].includes(action)) {
      throw new AppError("Invalid action. Must be APPROVE or REJECT", 400, "BAD_REQUEST");
    }

    const { ServiceManagementService } = await import("../../modules/services/management.service.ts");
    const serviceManagement = new ServiceManagementService();

    const service = await serviceManagement.reviewService(req.user!.id, id, action, req.body.notes);

    res.status(200).json({
      success: true,
      service,
      message: `Service review action '${action}' processed successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
