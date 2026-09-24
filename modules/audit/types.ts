/**
 * stockiq - Audit Domain Boundary Contracts
 *
 * Implements the Dual-Ledger audit architecture:
 * 1. Operational Security Audit Ledger
 * 2. Immutable Append-Only Business Event Ledger with SHA-256 hash chaining
 */

export interface SecurityAuditRecord {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  oldState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string; // ISO UTC
}

export interface BusinessEventRecord {
  id: string;
  streamId: string; // e.g. "REC-2026-000001"
  streamType: "RECOMMENDATION" | "SUBSCRIPTION" | "AGREEMENT" | "SERVICE";
  eventType: string;
  eventOrigin: "PROVIDER_REPORTED_EVENT" | "PLATFORM_VERIFIED_EVENT" | "EXTERNAL_VERIFIED_EVENT" | "SYSTEM_EVENT";
  authorId?: string;
  payload: Record<string, unknown>;
  previousEventHash: string;
  eventHash: string; // SHA-256(previousEventHash + JSON(payload) + timestamp)
  timestamp: string; // ISO UTC
}
