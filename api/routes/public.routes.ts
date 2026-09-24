import { Router, Request, Response, NextFunction } from "express";
import { CatalogService } from "../../modules/services/catalog.service.ts";
import { AppError } from "../middleware/error-handler.middleware.js";

export const publicRouter = Router();
const catalogService = new CatalogService();

/**
 * GET /api/v1/public/directory
 * Public provider directory for eligible verified RAs and IAs.
 */
publicRouter.get("/directory", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      providerType: req.query.providerType as string,
      providerClassification: req.query.providerClassification as string,
      location: req.query.location as string,
      keyword: req.query.keyword as string,
    };

    const providers = await catalogService.getPublicProviders(filters);

    res.status(200).json({
      providers,
      total: providers.length,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Alias: GET /api/v1/public/providers
 */
publicRouter.get("/providers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      providerType: req.query.providerType as string,
      providerClassification: req.query.providerClassification as string,
      location: req.query.location as string,
      keyword: req.query.keyword as string,
    };

    const providers = await catalogService.getPublicProviders(filters);

    res.status(200).json({
      providers,
      total: providers.length,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/directory/:id
 * GET /api/v1/public/providers/:id
 * Public provider profile detailing registration, stockiq verification status, and public disclosures.
 */
publicRouter.get("/directory/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await catalogService.getPublicProviderProfile(req.params.id as string);
    if (!profile) {
      throw new AppError("Provider profile not found", 404, "NOT_FOUND");
    }

    res.status(200).json({
      provider: profile,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/providers/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await catalogService.getPublicProviderProfile(req.params.id as string);
    if (!profile) {
      throw new AppError("Provider profile not found", 404, "NOT_FOUND");
    }

    res.status(200).json({
      provider: profile,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/providers/:id/services
 * Published services offered by a specific provider.
 */
publicRouter.get("/providers/:id/services", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerId = req.params.id as string;
    const services = await catalogService.getPublicServices({
      keyword: req.query.keyword as string,
    });
    const providerServices = services.filter((s) => s.providerId === providerId);

    res.status(200).json({
      providerId,
      services: providerServices,
      total: providerServices.length,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/services
 * GET /api/v1/public/catalog/search
 * Factual, neutral public search and discovery catalog for published services.
 */
publicRouter.get("/services", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      providerType: req.query.providerType as string,
      serviceCategory: req.query.serviceCategory as string,
      marketSegment: req.query.marketSegment as string,
      providerClassification: req.query.providerClassification as string,
      location: req.query.location as string,
      keyword: req.query.keyword as string,
    };

    const services = await catalogService.getPublicServices(filters);

    res.status(200).json({
      services,
      total: services.length,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/catalog/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      providerType: req.query.providerType as string,
      serviceCategory: req.query.serviceCategory as string,
      marketSegment: req.query.marketSegment as string,
      providerClassification: req.query.providerClassification as string,
      location: req.query.location as string,
      keyword: req.query.keyword as string,
    };

    const services = await catalogService.getPublicServices(filters);

    res.status(200).json({
      services,
      total: services.length,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/services/:id
 * Public detail for a specific published service.
 */
publicRouter.get("/services/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = await catalogService.getPublicServiceDetail(req.params.id as string);
    if (!service) {
      throw new AppError("Published service not found", 404, "NOT_FOUND");
    }

    res.status(200).json({
      service,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/services/:id/versions/:version
 * Historical version detail for a published service blueprint.
 */
publicRouter.get("/services/:id/versions/:version", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const serviceId = req.params.id as string;
    const versionNum = parseInt(req.params.version as string, 10);
    if (isNaN(versionNum)) {
      throw new AppError("Invalid version number", 400, "BAD_REQUEST");
    }

    const versionData = await catalogService.getPublicServiceVersionDetail(serviceId, versionNum);
    if (!versionData) {
      throw new AppError("Service version blueprint not found or not published", 404, "NOT_FOUND");
    }

    res.status(200).json({
      version: versionData,
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
