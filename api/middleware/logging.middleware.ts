import { Request, Response, NextFunction } from "express";

export interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
  correlationId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

export function structuredLogger(entry: LogEntry): void {
  // Output JSON stringified log entry for standard cloud logging aggregators
  console.log(JSON.stringify(entry));
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    structuredLogger({
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO",
      message: `${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${durationMs}ms`,
      correlationId: req.correlationId,
      requestId: req.requestId,
      path: req.originalUrl || req.url,
      method: req.method,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}
