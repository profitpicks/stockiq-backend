import { Request, Response, NextFunction } from "express";
import { config } from "../../config/index.js";
import { AppError } from "./error-handler.middleware.js";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const clientBuckets = new Map<string, RateLimitBucket>();

export function rateLimiterMiddleware(
  maxRequests: number = config.rateLimitMaxRequests,
  windowMs: number = config.rateLimitWindowMs
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // In production, use client IP or authenticated User ID
    const clientId = (req.headers["x-forwarded-for"] as string) || req.ip || "unknown-client";
    const now = Date.now();

    let bucket = clientBuckets.get(clientId);

    if (!bucket || now > bucket.resetAt) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      clientBuckets.set(clientId, bucket);
    } else {
      bucket.count += 1;
    }

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - bucket.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > maxRequests) {
      throw new AppError(
        "Too many requests. Please retry after rate limit window reset.",
        429,
        "RATE_LIMIT_EXCEEDED",
        { retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
      );
    }

    next();
  };
}
