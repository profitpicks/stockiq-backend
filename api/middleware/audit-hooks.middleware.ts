import { Request, Response, NextFunction } from "express";
import { structuredLogger } from "./logging.middleware.js";

export interface AuditEventHookParams {
  action: string;
  entity: string;
  entityId: string;
  oldState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}

export class AuditLoggerService {
  public static async recordEvent(req: Request, params: AuditEventHookParams): Promise<void> {
    const actorId = req.user?.id || "ANONYMOUS";
    const actorRole = req.user?.roles?.[0] || "GUEST";
    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || "unknown-ip";
    const userAgent = req.headers["user-agent"] || "unknown-agent";

    // Structured Audit Log
    structuredLogger({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `[SECURITY AUDIT] Action: ${params.action} on Entity: ${params.entity}:${params.entityId}`,
      correlationId: req.correlationId,
      requestId: req.requestId,
      meta: {
        actorId,
        actorRole,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        ipAddress,
        userAgent,
        oldState: params.oldState,
        newState: params.newState,
      },
    });

    // Note: In a live database environment, this will also execute an INSERT into audit_logs table
  }

  public static async recordDataAccess(
    req: Request,
    accessedEntity: string,
    entityId: string,
    reason: string
  ): Promise<void> {
    const viewerId = req.user?.id || "ANONYMOUS";
    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || "unknown-ip";

    structuredLogger({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `[DATA ACCESS AUDIT] Viewer: ${viewerId} accessed ${accessedEntity}:${entityId}`,
      correlationId: req.correlationId,
      meta: {
        viewerId,
        accessedEntity,
        entityId,
        reason,
        ipAddress,
      },
    });
  }
}
