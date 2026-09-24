import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { structuredLogger } from "./logging.middleware.js";

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode = 500, code = "INTERNAL_SERVER_ERROR", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function centralizedErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId;
  const timestamp = new Date().toISOString();

  // Handle known Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details,
        correlationId,
        timestamp,
      },
    });
    return;
  }

  // Handle known AppError instances
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        correlationId,
        timestamp,
      },
    });
    return;
  }

  // Handle unexpected errors
  const standardError = err instanceof Error ? err : new Error(String(err));
  structuredLogger({
    timestamp,
    level: "ERROR",
    message: `Unhandled exception: ${standardError.message}`,
    correlationId,
    requestId: req.requestId,
    meta: { stack: standardError.stack },
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please contact support with the correlation ID.",
      correlationId,
      timestamp,
    },
  });
}
