import { Router, Request, Response, NextFunction } from "express";
import { ServiceManagementService } from "../../modules/services/management.service.ts";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { z } from "zod";

export const servicesRouter = Router();
const providerService = new ProviderService();
const managementService = new ServiceManagementService(providerService);

const CreateServiceSchema = z.object({
  serviceName: z.string().min(2, "Service name is required"),
  serviceCategory: z.string().min(2, "Service category is required"),
  shortDescription: z.string().min(5, "Short description is required"),
  detailedDescription: z.string().min(10, "Detailed description is required"),
  serviceType: z.string().min(2, "Service type is required"),
  marketSegment: z.string().min(2, "Market segment is required"),
  eligibilityInfo: z.string().optional(),
  pricingReference: z.string().min(1, "Pricing reference is required"),
  feeInPaise: z.number().nonnegative().optional(),
  billingDuration: z.string().optional(),
  disclosures: z
    .object({
      riskDisclosureText: z.string().optional(),
      methodologyReference: z.string().optional(),
      conflictsDisclosure: z.string().optional(),
      regulatoryDisclosure: z.string().optional(),
      performanceDisclaimer: z.string().optional(),
    })
    .optional(),
  termsReferenceText: z.string().optional(),
});

/**
 * POST /api/v1/providers/me/services
 * Create a new service draft.
 */
servicesRouter.post(
  "/me/services",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parse = CreateServiceSchema.safeParse(req.body);
      if (!parse.success) {
        throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
      }

      const provider = await providerService.getProviderByUserId(req.user!.id);
      if (!provider) {
        throw new AppError("Provider profile not registered for this account", 404, "NOT_FOUND");
      }

      const result = await managementService.createServiceDraft(provider.id, req.user!.id, parse.data);

      res.status(201).json({
        success: true,
        service: result.service,
        version: result.version,
        message: "Service draft created successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/providers/me/services
 * List all services belonging to current authenticated provider.
 */
servicesRouter.get(
  "/me/services",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await providerService.getProviderByUserId(req.user!.id);
      if (!provider) {
        throw new AppError("Provider profile not registered for this account", 404, "NOT_FOUND");
      }

      const services = await managementService.getProviderServices(provider.id);

      res.status(200).json({
        services,
        total: services.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/providers/me/services/:id
 * Retrieve detail and versions for a specific provider service.
 */
servicesRouter.get(
  "/me/services/:id",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await providerService.getProviderByUserId(req.user!.id);
      if (!provider) {
        throw new AppError("Provider profile not registered for this account", 404, "NOT_FOUND");
      }

      const serviceId = req.params.id as string;
      const service = await managementService.getServiceById(serviceId);
      if (!service || service.providerId !== provider.id) {
        throw new AppError("Service not found", 404, "NOT_FOUND");
      }

      const versions = await managementService.getServiceVersions(service.id);

      res.status(200).json({
        service,
        versions,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/v1/providers/me/services/:id
 * Edit editable fields on a DRAFT service.
 */
servicesRouter.put(
  "/me/services/:id",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await providerService.getProviderByUserId(req.user!.id);
      if (!provider) {
        throw new AppError("Provider profile not registered for this account", 404, "NOT_FOUND");
      }

      const serviceId = req.params.id as string;
      const updated = await managementService.updateServiceDraft(provider.id, req.user!.id, serviceId, req.body);

      res.status(200).json({
        success: true,
        service: updated,
        message: "Service draft updated successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/providers/me/services/:id/submit
 * Submit DRAFT service for compliance review.
 */
servicesRouter.post(
  "/me/services/:id/submit",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await providerService.getProviderByUserId(req.user!.id);
      if (!provider) {
        throw new AppError("Provider profile not registered for this account", 404, "NOT_FOUND");
      }

      const serviceId = req.params.id as string;
      const updated = await managementService.submitServiceForReview(provider.id, req.user!.id, serviceId);

      res.status(200).json({
        success: true,
        service: updated,
        message: "Service submitted for compliance review successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/providers/me/services/:id/versions
 * Create new service version blueprint.
 */
servicesRouter.post(
  "/me/services/:id/versions",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parse = CreateServiceSchema.safeParse(req.body);
      if (!parse.success) {
        throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
      }

      const provider = await providerService.getProviderByUserId(req.user!.id);
      if (!provider) {
        throw new AppError("Provider profile not registered for this account", 404, "NOT_FOUND");
      }

      const serviceId = req.params.id as string;
      const version = await managementService.createNewServiceVersion(provider.id, req.user!.id, serviceId, parse.data);

      res.status(201).json({
        success: true,
        version,
        message: "New service version blueprint created successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
