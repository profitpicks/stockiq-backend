import { Router, Request, Response, NextFunction } from "express";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { VerificationService } from "../../modules/providers/verification.service.ts";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { z } from "zod";

export const providerRouter = Router();
const providerService = new ProviderService();
const verificationService = new VerificationService(providerService);

const RegisterProviderSchema = z.object({
  providerType: z.enum(["RESEARCH_ANALYST", "INVESTMENT_ADVISER"]),
  entityType: z.enum(["INDIVIDUAL", "NON_INDIVIDUAL"]),
  legalName: z.string().min(2, "Legal name is required"),
  tradeName: z.string().optional(),
  sebiRegistrationNumber: z.string().min(5, "SEBI Registration Number is required"),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validFrom must be YYYY-MM-DD"),
  validTill: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validTill must be YYYY-MM-DD").optional(),
  isPerpetual: z.boolean().default(false),
  complianceOfficerName: z.string().optional(),
  complianceOfficerEmail: z.string().email("Invalid compliance officer email").optional().or(z.literal("")),
  registeredOfficeAddress: z.string().min(5, "Registered office address is required"),
  isNismCertified: z.boolean().default(false),
  panNumber: z.string().min(10).max(10).optional(),
});

const DeclarationSchema = z.object({
  declarationType: z.string().min(3, "Declaration type is required"),
  isDeclared: z.boolean(),
});

const DocumentMetadataSchema = z.object({
  documentType: z.string().min(3, "Document type is required"),
  fileName: z.string().min(1, "File name is required"),
  fileHash: z.string().length(64, "SHA-256 hash must be 64 hexadecimal characters"),
  mimeType: z.string().min(3, "MIME type is required"),
});

/**
 * POST /api/v1/providers/register
 * Initial registration of an RA or IA provider profile.
 */
providerRouter.post("/register", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = RegisterProviderSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const existing = await providerService.getProviderByUserId(req.user!.id);
    if (existing) {
      throw new AppError("Provider profile already exists for this account", 409, "ALREADY_EXISTS");
    }

    const registration = await providerService.registerProvider({
      userId: req.user!.id,
      ...parse.data,
      complianceOfficerEmail: parse.data.complianceOfficerEmail || undefined,
    });

    res.status(201).json({
      success: true,
      provider: registration,
      message: "Provider profile draft registered successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/providers/me
 * Retrieves current provider profile details.
 */
providerRouter.get("/me", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = await providerService.getProviderByUserId(req.user!.id);
    if (!provider) {
      throw new AppError("No provider profile found for this user", 404, "NOT_FOUND");
    }

    const declarations = await providerService.getDeclarations(provider.id);
    const documents = await providerService.getDocuments(provider.id);
    const vCase = await verificationService.getCaseByProviderId(provider.id);

    res.status(200).json({
      provider,
      declarations,
      documents,
      verificationCase: vCase,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/providers/me
 * Updates editable fields on draft provider profile.
 */
providerRouter.patch("/me", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await providerService.updateProviderProfile(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      provider: updated,
      message: "Provider profile updated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/providers/me/regulatory-profile
 * Creates/updates regulatory profile metadata.
 */
providerRouter.post("/me/regulatory-profile", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await providerService.updateProviderProfile(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      provider: updated,
      message: "Regulatory profile updated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/providers/me/declarations
 * Submits compliance declaration.
 */
providerRouter.post("/me/declarations", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = DeclarationSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const provider = await providerService.getProviderByUserId(req.user!.id);
    if (!provider) {
      throw new AppError("No provider profile found for this user", 404, "NOT_FOUND");
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const declaration = await providerService.addDeclaration(provider.id, {
      ...parse.data,
      ipAddress,
    });

    res.status(201).json({
      success: true,
      declaration,
      message: "Compliance declaration recorded successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/providers/me/documents
 * Registers document metadata with SHA-256 hash.
 */
providerRouter.post("/me/documents", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = DocumentMetadataSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const provider = await providerService.getProviderByUserId(req.user!.id);
    if (!provider) {
      throw new AppError("No provider profile found for this user", 404, "NOT_FOUND");
    }

    const doc = await providerService.addDocument(provider.id, parse.data);

    res.status(201).json({
      success: true,
      document: doc,
      message: "Document metadata registered successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/providers/me/submit
 * Submits provider profile for Verification Officer review.
 */
providerRouter.post("/me/submit", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await providerService.submitProviderProfile(req.user!.id);
    res.status(200).json({
      success: true,
      provider: result.provider,
      verificationCase: result.verificationCase,
      message: "Provider registration profile submitted for Verification Officer review",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/providers/me/verification-status
 * Checks status of verification case.
 */
providerRouter.get("/me/verification-status", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = await providerService.getProviderByUserId(req.user!.id);
    if (!provider) {
      throw new AppError("No provider profile found for this user", 404, "NOT_FOUND");
    }

    const vCase = await verificationService.getCaseByProviderId(provider.id);
    if (!vCase) {
      res.status(200).json({
        providerStatus: provider.status,
        verificationCase: null,
        events: [],
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const events = await verificationService.getVerificationEvents(vCase.id);

    res.status(200).json({
      providerStatus: provider.status,
      verificationCase: vCase,
      events,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
