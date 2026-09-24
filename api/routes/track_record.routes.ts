import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../database/connection.js";
import { RbacEngine } from "../../modules/auth/rbac.js";
import { MethodologyService } from "../../modules/track-record/methodology.service.js";
import { CalculationService } from "../../modules/track-record/calculation.service.js";
import { SnapshotService } from "../../modules/track-record/snapshot.service.js";
import { VerificationService } from "../../modules/track-record/verification.service.js";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { AppError } from "../middleware/error-handler.middleware.js";

export const trackRecordRouter = Router();

const methodologyService = new MethodologyService();
const calculationService = new CalculationService();
const snapshotService = new SnapshotService();
const verificationService = new VerificationService();
const providerService = new ProviderService();

// Validation Schemas
const CreateMethodologySchema = z.object({
  methodologyCode: z.string().min(2),
  version: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  methodologyDefinition: z.object({
    eligiblePopulation: z.enum(["ALL", "CLOSED_ONLY", "TRIGGERED_ONLY"]),
    treatmentOfDrafts: z.enum(["exclude", "include"]),
    treatmentOfCancelled: z.enum(["exclude", "include"]),
    treatmentOfExpired: z.enum(["exclude", "include"]),
    treatmentOfUntriggered: z.enum(["exclude", "loss", "neutral"]),
    treatmentOfOpen: z.enum(["exclude", "include_current_price"]),
    treatmentOfTargetMilestones: z.literal("milestone_counts"),
    treatmentOfStopLoss: z.literal("loss_at_sl_price"),
    precision: z.number().int().min(0).max(4),
  }),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().optional(),
});

const RunCalculationSchema = z.object({
  methodologyId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  serviceId: z.string().uuid().optional(),
});

const CreateSnapshotSchema = z.object({
  calculationId: z.string().uuid(),
  methodologyId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  sourceClassification: z.enum(["PLATFORM_RECORDED", "PROVIDER_SUPPLIED_HISTORICAL"]),
  serviceId: z.string().uuid().optional(),
  result: z.any(), // Embedded calculation result JSON
});

const CreateVerificationSchema = z.object({
  serviceId: z.string().uuid().optional(),
  sourceType: z.enum(["PROVIDER_SUPPLIED_HISTORICAL", "PLATFORM_RECORDED", "EXTERNAL_VERIFIED", "REGULATORY_VERIFIED"]),
  sourceName: z.string().min(2),
  evidenceDocumentReference: z.string().optional(),
  methodologyId: z.string().uuid().optional(),
  validityPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validityPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
});

const ReviewVerificationSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED", "UNDER_REVIEW", "EXPIRED", "UNVERIFIED"]),
  notes: z.string().optional(),
});

// Helper: Get provider for the current user
async function resolveProvider(userId: string) {
  const provider = await providerService.getProviderByUserId(userId);
  if (!provider) {
    throw new AppError("Provider profile not found for this user account", 404, "PROVIDER_PROFILE_NOT_FOUND");
  }
  return provider;
}

// ==========================================
// 1. PUBLIC ENDPOINTS
// ==========================================

trackRecordRouter.get("/methodologies", async (req, res, next) => {
  try {
    const list = await methodologyService.listMethodologies();
    res.status(200).json({ success: true, methodologies: list });
  } catch (err) {
    next(err);
  }
});

trackRecordRouter.get("/methodologies/:id", async (req, res, next) => {
  try {
    const meth = await methodologyService.getMethodology(req.params.id as string);
    if (!meth) {
      throw new AppError("Methodology not found", 404, "METHODOLOGY_NOT_FOUND");
    }
    res.status(200).json({ success: true, methodology: meth });
  } catch (err) {
    next(err);
  }
});

trackRecordRouter.get("/snapshots/public", async (req, res, next) => {
  try {
    const list = await snapshotService.getPublicSnapshots();
    res.status(200).json({ success: true, snapshots: list });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. PROVIDER / INTERNAL ENDPOINTS
// ==========================================

// Create a new methodology (Admin only or Provider for custom)
trackRecordRouter.post(
  "/methodologies",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN, PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parse = CreateMethodologySchema.safeParse(req.body);
      if (!parse.success) {
        throw new AppError(`Invalid request: ${parse.error.issues.map(i => i.message).join(", ")}`, 400, "BAD_REQUEST");
      }

      const created = await methodologyService.createMethodology({
        ...parse.data,
        createdBy: req.user!.id,
      });

      res.status(201).json({ success: true, methodology: created });
    } catch (err) {
      next(err);
    }
  }
);

trackRecordRouter.post(
  "/calculations",
  authMiddleware(true),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parse = RunCalculationSchema.safeParse(req.body);
      if (!parse.success) {
        throw new AppError(`Invalid request: ${parse.error.issues.map(i => i.message).join(", ")}`, 400, "BAD_REQUEST");
      }

      const provider = await resolveProvider(req.user!.id);
      const calc = await calculationService.runCalculation(
        provider.id,
        parse.data.methodologyId,
        parse.data.periodStart,
        parse.data.periodEnd,
        parse.data.serviceId
      );

      res.status(200).json({ success: true, calculationId: calc.calculationId, result: calc.result });
    } catch (err) {
      next(err);
    }
  }
);

trackRecordRouter.get(
  "/calculations/:id",
  authMiddleware(true),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER, PlatformRoles.COMPLIANCE_ADMIN, PlatformRoles.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pool = db.getPool();
      const calcQuery = await pool.query(
        `SELECT id, provider_id AS "providerId", methodology_id AS "methodologyId",
                source_type AS "sourceType", period_start AS "periodStart", period_end AS "periodEnd",
                calculation_parameters AS "calculationParameters", calculation_status AS "calculationStatus",
                calculation_timestamp AS "calculationTimestamp", created_at AS "createdAt"
         FROM track_record_calculations WHERE id = $1`,
        [req.params.id as string]
      );

      const calc = calcQuery.rows[0];
      if (!calc) {
        throw new AppError("Calculation run not found", 404, "CALCULATION_NOT_FOUND");
      }

      // Check access ownership
      const isProviderRole = RbacEngine.hasRole(req.user, [PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER]);
      if (isProviderRole && !RbacEngine.hasRole(req.user, [PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN])) {
        const provider = await resolveProvider(req.user!.id);
        if (calc.providerId !== provider.id) {
          throw new AppError("Forbidden: Cannot view other provider's calculations", 403, "FORBIDDEN");
        }
      }

      res.status(200).json({ success: true, calculation: calc });
    } catch (err) {
      next(err);
    }
  }
);

trackRecordRouter.post(
  "/snapshots",
  authMiddleware(true),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parse = CreateSnapshotSchema.safeParse(req.body);
      if (!parse.success) {
        throw new AppError(`Invalid request: ${parse.error.issues.map(i => i.message).join(", ")}`, 400, "BAD_REQUEST");
      }

      const provider = await resolveProvider(req.user!.id);
      const snapshot = await snapshotService.createSnapshotFromCalculation(
        provider.id,
        parse.data.methodologyId,
        parse.data.calculationId,
        parse.data.periodStart,
        parse.data.periodEnd,
        parse.data.result,
        parse.data.sourceClassification,
        parse.data.serviceId
      );

      res.status(201).json({ success: true, snapshot });
    } catch (err) {
      next(err);
    }
  }
);

trackRecordRouter.get(
  "/snapshots/me",
  authMiddleware(true),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await resolveProvider(req.user!.id);
      const list = await snapshotService.getProviderSnapshots(provider.id);
      res.status(200).json({ success: true, snapshots: list });
    } catch (err) {
      next(err);
    }
  }
);

trackRecordRouter.post(
  "/verifications",
  authMiddleware(true),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parse = CreateVerificationSchema.safeParse(req.body);
      if (!parse.success) {
        throw new AppError(`Invalid request: ${parse.error.issues.map(i => i.message).join(", ")}`, 400, "BAD_REQUEST");
      }

      const provider = await resolveProvider(req.user!.id);

      // Force verificationStatus to 'SUBMITTED' initially. PROVIDERS CANNOT SELF-MARK AS 'VERIFIED'!
      const record = await verificationService.createVerificationRecord({
        ...parse.data,
        providerId: provider.id,
        verificationStatus: "SUBMITTED",
      });

      res.status(201).json({ success: true, verificationRecord: record });
    } catch (err) {
      next(err);
    }
  }
);

trackRecordRouter.get(
  "/verifications/me",
  authMiddleware(true),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await resolveProvider(req.user!.id);
      const list = await verificationService.getProviderVerificationRecords(provider.id);
      res.status(200).json({ success: true, verificationRecords: list });
    } catch (err) {
      next(err);
    }
  }
);

trackRecordRouter.post(
  "/verifications/:id/trigger-parrva",
  authMiddleware(true),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await resolveProvider(req.user!.id);
      const record = await verificationService.getVerificationRecord(req.params.id as string);

      if (!record) {
        throw new AppError("Verification record not found", 404, "NOT_FOUND");
      }

      if (record.providerId !== provider.id) {
        throw new AppError("Forbidden: Cannot verify other provider's record", 403, "FORBIDDEN");
      }

      // Trigger standard external PaRRVA validation simulation
      const sebiRegNumber = provider.sebiRegistrationNumber || "IN-MOCK-12345678";
      const updated = await verificationService.triggerExternalParrvaVerification(req.params.id as string, sebiRegNumber);

      res.status(200).json({ success: true, verificationRecord: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 3. ADMIN / COMPLIANCE ENDPOINTS
// ==========================================

trackRecordRouter.get(
  "/verifications",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pool = db.getPool();
      const resQuery = await pool.query(
        `SELECT id, provider_id AS "providerId", service_id AS "serviceId", source_type AS "sourceType",
                source_name AS "sourceName", verification_status AS "verificationStatus",
                verifier_name AS "verifierName", reference_identifier AS "referenceIdentifier",
                evidence_document_reference AS "evidenceDocumentReference", methodology_id AS "methodologyId",
                verified_at AS "verifiedAt", validity_period_start AS "validityPeriodStart",
                validity_period_end AS "validityPeriodEnd", notes, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM past_performance_verification_records ORDER BY created_at DESC`
      );

      res.status(200).json({ success: true, verificationRecords: resQuery.rows });
    } catch (err) {
      next(err);
    }
  }
);

trackRecordRouter.post(
  "/verifications/:id/review",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parse = ReviewVerificationSchema.safeParse(req.body);
      if (!parse.success) {
        throw new AppError(`Invalid request: ${parse.error.issues.map(i => i.message).join(", ")}`, 400, "BAD_REQUEST");
      }

      const updated = await verificationService.updateVerificationStatus(
        req.params.id as string,
        parse.data.status,
        req.user!.id,
        parse.data.notes
      );

      res.status(200).json({ success: true, verificationRecord: updated });
    } catch (err) {
      next(err);
    }
  }
);
