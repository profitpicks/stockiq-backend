import { Request, Response, NextFunction } from "express";
import { AppError } from "../../api/middleware/error-handler.middleware.js";
import { ProviderService } from "../providers/provider.service.ts";
import { CredentialsService } from "./credentials.service.ts";
import { AuditService } from "../audit/audit.service.js";

declare global {
  namespace Express {
    interface Request {
      integration?: {
        credentialId: string;
        providerId: string;
        name: string;
      };
    }
  }
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const webhookRateBuckets = new Map<string, RateLimitBucket>();

/**
  Rate Limiter Middleware specifically for Provider Bot Webhook.
  Enforces maximum 10 requests per 60 seconds (1 minute) per IP / API key prefix.
 */
export function webhookRateLimiterMiddleware(maxRequests = 10, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawApiKey = (req.headers["x-api-key"] as string) || "";
    const keyPrefix = rawApiKey ? rawApiKey.substring(0, 18) : "";
    const clientIp = (req.headers["x-forwarded-for"] as string) || req.ip || "unknown-ip";
    
    // Bucket key combines client IP and API key prefix
    const bucketKey = `webhook:${keyPrefix || clientIp}`;
    const now = Date.now();

    let bucket = webhookRateBuckets.get(bucketKey);

    if (!bucket || now > bucket.resetAt) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      webhookRateBuckets.set(bucketKey, bucket);
    } else {
      bucket.count += 1;
    }

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - bucket.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > maxRequests) {
      throw new AppError(
        "Rate limit exceeded. Maximum 10 requests per minute permitted for webhook recommendations.",
        429,
        "TOO_MANY_REQUESTS",
        { retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
      );
    }

    next();
  };
}

/**
 * Webhook Authentication Middleware.
 * Resolves provider identity server-side from x-api-key header.
 */
export async function webhookAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawApiKey = req.headers["x-api-key"] as string | undefined;

    if (!rawApiKey || typeof rawApiKey !== "string" || !rawApiKey.trim()) {
      throw new AppError("API key is required in x-api-key header", 401, "UNAUTHORIZED");
    }

    const credentialsService = CredentialsService.getInstance();
    const cred = await credentialsService.validateApiKey(rawApiKey.trim());

    if (!cred) {
      throw new AppError("API key is invalid, revoked, or expired", 401, "UNAUTHORIZED");
    }

    const providerService = new ProviderService();
    const provider = await providerService.getProviderById(cred.providerId);

    if (!provider) {
      throw new AppError("Associated provider profile not found", 403, "FORBIDDEN");
    }

    // Attach authenticated provider context to Express request
    req.user = {
      id: provider.userId,
      email: provider.complianceOfficerEmail || `${provider.id}@stockiq.local`,
      mobile: "+919000000000",
      roles: [provider.providerType as any],
      permissions: [],
    };

    req.integration = {
      credentialId: cred.id,
      providerId: cred.providerId,
      name: cred.name,
    };

    // Log security audit event for webhook auth
    AuditService.getInstance().logSecurityAction(
      provider.userId,
      provider.providerType,
      "WEBHOOK_AUTHENTICATED",
      "INTEGRATION_CREDENTIAL",
      cred.id,
      { providerId: cred.providerId, endpoint: req.originalUrl || req.url }
    );

    next();
  } catch (err) {
    next(err);
  }
}
