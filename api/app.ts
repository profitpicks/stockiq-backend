import express, { Express } from "express";
import { correlationIdMiddleware } from "./middleware/correlation-id.middleware.js";
import { requestLoggingMiddleware } from "./middleware/logging.middleware.js";
import { centralizedErrorHandler, AppError } from "./middleware/error-handler.middleware.js";
import { rateLimiterMiddleware } from "./middleware/rate-limiter.middleware.js";
import { healthRouter } from "./routes/health.routes.js";
import { v1Router } from "./routes/v1.routes.js";

export function createApp(): Express {
  const app = express();

  // Basic security and parsing
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Request correlation & logging
  app.use(correlationIdMiddleware);
  app.use(requestLoggingMiddleware);

  // Global rate limiter
  app.use(rateLimiterMiddleware());

  // Mount Health Routes (Root level /health and /ready)
  app.use("/", healthRouter);

  // Mount API v1 Routes (/api/v1)
  app.use("/api/v1", v1Router);

  // 404 Not Found Handler
  app.use((req, _res, next) => {
    next(new AppError(`Resource not found: ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
  });

  // Centralized Error Handling
  app.use(centralizedErrorHandler);

  return app;
}

export const app = createApp();
