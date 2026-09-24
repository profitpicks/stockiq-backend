import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { ServiceManagementService } from "../../modules/services/management.service.ts";
import { LedgerService } from "../../modules/recommendations/ledger.service.ts";
import { AuditService } from "../../modules/audit/audit.service.js";
import { CredentialsService } from "../../modules/integrations/credentials.service.ts";
import {
  webhookRateLimiterMiddleware,
  webhookAuthMiddleware,
} from "../../modules/integrations/webhook.middleware.ts";

export const integrationsRouter = Router();

const credentialsService = CredentialsService.getInstance();
const providerService = new ProviderService();
const serviceManagementService = new ServiceManagementService(providerService);
const ledgerService = new LedgerService(providerService);
const auditService = AuditService.getInstance();

// Zod validation schemas
const createApiKeySchema = z.object({
  label: z.string().min(2).max(100).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const webhookRecommendationSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  rawMessage: z.string().min(1, "rawMessage is required").max(2000, "rawMessage exceeds max length of 2000 characters"),
});

/**
 * Helper to ensure user is an authorized Provider (RA/IA).
 */
async function getAuthorizedProvider(req: Request) {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  const provider = await providerService.getProviderByUserId(req.user.id);
  if (!provider) {
    throw new AppError("Only registered providers can manage integration credentials", 403, "FORBIDDEN");
  }
  return provider;
}

// ============================================================================
// PROVIDER INTEGRATION KEY MANAGEMENT ENDPOINTS (JWT / Session Auth)
// ============================================================================

/**
 * POST /api/v1/integrations/api-keys
 * Generates a new API key for the authenticated provider.
 * Plaintext secret key is returned ONLY ONCE in the response.
 */
integrationsRouter.post(
  "/api-keys",
  authMiddleware(),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await getAuthorizedProvider(req);
      const parsed = createApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("Invalid API key parameters", 400, "VALIDATION_ERROR", parsed.error.format());
      }

      const result = await credentialsService.generateApiKey(provider.id, req.user!.id, {
        label: parsed.data.label,
        expiresInDays: parsed.data.expiresInDays,
      });

      res.status(201).json({
        success: true,
        data: result,
        notice: "Store your secretKey securely. It will NEVER be displayed again.",
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/integrations/api-keys
 * Lists integration key metadata for the authenticated provider.
 * Plaintext secrets and hashes are NEVER returned.
 */
integrationsRouter.get(
  "/api-keys",
  authMiddleware(),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await getAuthorizedProvider(req);
      const keys = await credentialsService.listApiKeys(provider.id);

      res.status(200).json({
        success: true,
        data: keys,
        total: keys.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/integrations/api-keys/:id/rotate
 * Rotates an existing API key. Revokes old key and issues new key.
 */
integrationsRouter.post(
  "/api-keys/:id/rotate",
  authMiddleware(),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await getAuthorizedProvider(req);
      const credentialId = String(req.params.id);

      const result = await credentialsService.rotateApiKey(provider.id, req.user!.id, credentialId);

      res.status(200).json({
        success: true,
        data: result,
        notice: "Old API key has been revoked. Store your new secretKey securely. It will NEVER be displayed again.",
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/integrations/api-keys/:id/revoke
 * Revokes an active API key.
 */
integrationsRouter.post(
  "/api-keys/:id/revoke",
  authMiddleware(),
  requireRoles(PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await getAuthorizedProvider(req);
      const credentialId = String(req.params.id);

      await credentialsService.revokeApiKey(provider.id, req.user!.id, credentialId);

      res.status(200).json({
        success: true,
        message: "API key revoked successfully",
        id: credentialId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// PROVIDER BOT / WEBHOOK API ENDPOINT (API Key Auth + Strict Rate Limiting)
// ============================================================================

/**
 * POST /api/v1/integrations/bot-webhook/recommendations
 * Secure Webhook Gateway for external trading algorithms and provider research bots.
 */
integrationsRouter.post(
  "/bot-webhook/recommendations",
  webhookRateLimiterMiddleware(10, 60000), // Max 10 requests per minute
  webhookAuthMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const providerId = req.integration!.providerId;
      const userId = req.user!.id;

      // 1. Validate Request Body
      const parsed = webhookRecommendationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("Invalid webhook recommendation payload", 400, "VALIDATION_ERROR", parsed.error.format());
      }

      const { serviceId, rawMessage } = parsed.data;

      // 2. Check Idempotency Key (Header)
      const idempotencyKey =
        (req.headers["idempotency-key"] as string) ||
        (req.headers["x-idempotency-key"] as string) ||
        undefined;

      if (idempotencyKey) {
        const existingRecord = await credentialsService.getIdempotentRecord(providerId, idempotencyKey);
        if (existingRecord) {
          return res.status(existingRecord.responseStatus).json(existingRecord.responsePayload);
        }
      }

      // 3. Resolve & Validate Service Ownership
      const service = await serviceManagementService.getServiceById(serviceId);
      if (!service) {
        throw new AppError("Service not found", 404, "NOT_FOUND");
      }

      if (service.providerId !== providerId) {
        throw new AppError("Service does not belong to the authenticated provider", 403, "FORBIDDEN");
      }

      // 4. Validate Service Status
      const allowedStatuses = ["PUBLISHED", "ACTIVE"];
      if (!allowedStatuses.includes(service.status.toUpperCase())) {
        throw new AppError(
          `Service is not in an active or published state (current status: ${service.status})`,
          400,
          "INVALID_SERVICE_STATUS"
        );
      }

      // 5. Reuse Existing Recommendation Parser
      const parseDraft = ledgerService.parseRawText(rawMessage);

      // 6. Evaluate Parser Confidence & Validity
      const hasSymbol = parseDraft.symbol && parseDraft.symbol !== "UNKNOWN";
      const hasEntryPrice = parseDraft.entryPrice !== undefined && parseDraft.entryPrice > 0;
      const hasTargets = parseDraft.targets && parseDraft.targets.length > 0;
      const hasStopLoss = parseDraft.stopLossPrice !== undefined && parseDraft.stopLossPrice > 0;

      const isHighConfidenceValid = Boolean(hasSymbol && hasEntryPrice && hasTargets && hasStopLoss);

      let responsePayload: any;

      if (isHighConfidenceValid) {
        // High confidence: Create recommendation draft and publish to immutable ledger
        const createdRec = await ledgerService.createDraft(userId, {
          serviceId: service.id,
          originalMessage: rawMessage,
          symbol: parseDraft.symbol!,
          direction: parseDraft.direction!,
          instrumentType: parseDraft.instrumentType || "EQUITY",
          segment: parseDraft.segment || "CASH",
          entryPrice: parseDraft.entryPrice!,
          targets: parseDraft.targets!,
          stopLossPrice: parseDraft.stopLossPrice!,
          disclosures: [
            `Published via Secure Provider Bot API Gateway (Credential ID: ${req.integration!.credentialId})`,
          ],
        });

        // Transition from DRAFT to PUBLISHED
        const publishedRec = await ledgerService.publish(userId, createdRec.id);

        responsePayload = {
          success: true,
          recommendationId: publishedRec.id,
          serviceId: service.id,
          status: "PUBLISHED",
          symbol: publishedRec.symbol,
          direction: publishedRec.direction,
          entryPrice: publishedRec.entryPrice,
          targets: publishedRec.targets.map((t) => ({ targetPrice: t.targetPrice, label: t.label })),
          stopLossPrice: publishedRec.stopLosses[0]?.stopLossPrice,
          eventHash: publishedRec.events?.[publishedRec.events.length - 1]?.eventHash || null,
          createdAt: publishedRec.createdAt,
        };
      } else {
        // Ambiguous / Incomplete parse: Create DRAFT recommendation for provider confirmation
        const createdRec = await ledgerService.createDraft(userId, {
          serviceId: service.id,
          originalMessage: rawMessage,
          symbol: parseDraft.symbol || "PARSED_DRAFT",
          direction: parseDraft.direction || ("BUY" as any),
          instrumentType: parseDraft.instrumentType || "EQUITY",
          segment: parseDraft.segment || "CASH",
          entryPrice: parseDraft.entryPrice || 0,
          targets: parseDraft.targets || [],
          stopLossPrice: parseDraft.stopLossPrice || 0,
          disclosures: [
            `Parsed as DRAFT via Webhook API Gateway. Requires provider confirmation before publication.`,
          ],
        });

        responsePayload = {
          success: true,
          recommendationId: createdRec.id,
          serviceId: service.id,
          status: "DRAFT",
          requiresProviderReview: true,
          message: "Recommendation parsed with ambiguity or missing parameters. Saved as DRAFT for provider review in Stockiq.",
          parsedFields: parseDraft.parsedFields,
          createdAt: createdRec.createdAt,
        };
      }

      // 7. Store Idempotency Record if key was provided
      if (idempotencyKey) {
        await credentialsService.saveIdempotentRecord({
          id: `idemp-${crypto.randomUUID()}`,
          providerId,
          serviceId: service.id,
          idempotencyKey,
          responseStatus: 201,
          responsePayload,
          createdAt: new Date().toISOString(),
        });
      }

      // 8. Record Business Event
      auditService.logBusinessEvent(
        `RECOMMENDATION-${responsePayload.recommendationId}`,
        "RECOMMENDATION",
        "WEBHOOK_RECOMMENDATION_RECEIVED",
        "PROVIDER_WEBHOOK_GATEWAY",
        userId,
        {
          serviceId: service.id,
          providerId,
          credentialId: req.integration!.credentialId,
          status: responsePayload.status,
          rawMessage,
        }
      );

      res.status(201).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);
