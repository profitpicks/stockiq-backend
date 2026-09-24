import { SecurityAuditRecord, BusinessEventRecord } from "./types.js";
import crypto from "crypto";

export class AuditService {
  private static instance: AuditService;
  private securityLogs: SecurityAuditRecord[] = [];
  private businessEvents: BusinessEventRecord[] = [];

  private constructor() {
    this.seedInitialAuditLogs();
  }

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  private seedInitialAuditLogs(): void {
    if (this.securityLogs.length > 0) return;

    this.securityLogs.push(
      {
        id: "sec-log-001",
        actorId: "usr-admin-001",
        actorRole: "SUPER_ADMIN",
        action: "USER_ROLE_ASSIGNED",
        entity: "USER",
        entityId: "usr-prov-101",
        newState: { assignedRole: "RESEARCH_ANALYST" },
        ipAddress: "127.0.0.1",
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString()
      },
      {
        id: "sec-log-002",
        actorId: "usr-vo-001",
        actorRole: "VERIFICATION_OFFICER",
        action: "PROVIDER_VERIFICATION_APPROVED",
        entity: "PROVIDER",
        entityId: "prov-sebi-ra-123",
        newState: { status: "APPROVED", registrationNumber: "INH123456789" },
        ipAddress: "127.0.0.1",
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString()
      }
    );

    const genesisHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const payload = { serviceId: "srv-001", providerId: "prov-sebi-ra-123", status: "PUBLISHED" };
    const timestamp = new Date(Date.now() - 3600000 * 6).toISOString();
    const eventHash = crypto
      .createHash("sha256")
      .update(genesisHash + JSON.stringify(payload) + timestamp)
      .digest("hex");

    this.businessEvents.push({
      id: "biz-evt-001",
      streamId: "SERVICE-srv-001",
      streamType: "SERVICE",
      eventType: "SERVICE_PUBLISHED",
      eventOrigin: "PLATFORM_VERIFIED_EVENT",
      authorId: "usr-admin-001",
      payload,
      previousEventHash: genesisHash,
      eventHash,
      timestamp
    });
  }

  private sanitizeState(state?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!state) return undefined;
    const sanitized: Record<string, unknown> = {};
    const SENSITIVE_KEYS = ["password", "otp", "token", "secret", "pan", "aadhaar", "authorization", "creditcard", "cvv", "privatekey"];

    for (const [key, value] of Object.entries(state)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
        sanitized[key] = "[MASKED]";
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeState(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  public logSecurityAction(
    actorId: string,
    actorRole: string,
    action: string,
    entity: string,
    entityId: string,
    newState?: Record<string, unknown>,
    oldState?: Record<string, unknown>,
    ipAddress?: string
  ): SecurityAuditRecord {
    const record: SecurityAuditRecord = {
      id: `sec-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actorId,
      actorRole,
      action,
      entity,
      entityId,
      oldState: this.sanitizeState(oldState),
      newState: this.sanitizeState(newState),
      ipAddress: ipAddress || "127.0.0.1",
      timestamp: new Date().toISOString()
    };
    this.securityLogs.unshift(record);
    return record;
  }

  public logBusinessEvent(
    streamId: string,
    streamType: "RECOMMENDATION" | "SUBSCRIPTION" | "AGREEMENT" | "SERVICE",
    eventType: string,
    eventOrigin: "PROVIDER_REPORTED_EVENT" | "PLATFORM_VERIFIED_EVENT" | "EXTERNAL_VERIFIED_EVENT" | "SYSTEM_EVENT",
    payload: Record<string, unknown>,
    authorId?: string
  ): BusinessEventRecord {
    const previousEventHash =
      this.businessEvents.length > 0
        ? this.businessEvents[0].eventHash
        : "0000000000000000000000000000000000000000000000000000000000000000";

    const timestamp = new Date().toISOString();
    const sanitizedPayload = this.sanitizeState(payload) || {};

    const eventHash = crypto
      .createHash("sha256")
      .update(previousEventHash + JSON.stringify(sanitizedPayload) + timestamp)
      .digest("hex");

    const record: BusinessEventRecord = {
      id: `biz-evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      streamId,
      streamType,
      eventType,
      eventOrigin,
      authorId,
      payload: sanitizedPayload,
      previousEventHash,
      eventHash,
      timestamp,
    };

    this.businessEvents.unshift(record);
    return record;
  }

  public getSecurityLogs(
    actorRole?: string,
    entity?: string,
    limit = 50
  ): SecurityAuditRecord[] {
    let list = [...this.securityLogs];
    if (actorRole) {
      list = list.filter((l) => l.actorRole.toUpperCase() === actorRole.toUpperCase());
    }
    if (entity) {
      list = list.filter((l) => l.entity.toUpperCase() === entity.toUpperCase());
    }
    return list.slice(0, limit);
  }

  public getBusinessEvents(streamId?: string, limit = 50): BusinessEventRecord[] {
    let list = [...this.businessEvents];
    if (streamId) {
      list = list.filter((e) => e.streamId === streamId);
    }
    return list.slice(0, limit);
  }
}
