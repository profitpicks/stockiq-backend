import { Router, Request, Response } from "express";
import { db } from "../../database/connection.js";
import { defaultAdapters } from "../../adapters/index.js";
import { config } from "../../config/index.js";

export const healthRouter = Router();

/**
 * Liveness Probe: Verifies the HTTP process is responsive.
 */
healthRouter.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "HEALTHY",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: config.appName,
    version: "0.1.0",
    environment: config.nodeEnv,
  });
});

/**
 * Readiness Probe: Verifies system dependencies (database config, adapters).
 */
healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const dbHealth = await db.checkHealth();

  const readiness = {
    status: dbHealth.healthy ? "READY" : "DEGRADED",
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        configured: Boolean(config.database.host),
        reachable: dbHealth.healthy,
        latencyMs: dbHealth.latencyMs,
        error: dbHealth.error,
      },
      adapters: {
        otp: { mode: config.adapters.otpMode, ready: true },
        payment: { mode: config.adapters.paymentMode, ready: true },
        marketData: {
          mode: config.adapters.marketDataMode,
          ready: defaultAdapters.marketData.isConfigured(),
        },
        esign: { mode: config.adapters.esignMode, ready: true },
        parrva: {
          mode: config.adapters.parrvaMode,
          ready: defaultAdapters.parrva.isOperational(),
        },
      },
    },
  };

  // Readiness returns 200 in development/mock mode, or 503 if critical checks fail in production
  const statusCode = config.nodeEnv === "production" && !dbHealth.healthy ? 503 : 200;
  res.status(statusCode).json(readiness);
});
