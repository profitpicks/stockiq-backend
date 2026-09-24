import crypto from "crypto";
import { db } from "../../database/connection.js";
import { AppError } from "../../api/middleware/error-handler.middleware.js";
import { AuditService } from "../audit/audit.service.js";
import {
  IntegrationCredential,
  IntegrationCredentialStatuses,
  CreateApiKeyParams,
  CreateApiKeyResult,
  IdempotencyRecord,
} from "./types.ts";

export class CredentialsService {
  private static instance: CredentialsService;
  private auditService: AuditService;

  // In-memory fallback stores
  public static memoryCredentials = new Map<string, IntegrationCredential>();
  public static memoryIdempotencyRecords = new Map<string, IdempotencyRecord>();

  constructor(auditService = AuditService.getInstance()) {
    this.auditService = auditService;
  }

  public static getInstance(): CredentialsService {
    if (!CredentialsService.instance) {
      CredentialsService.instance = new CredentialsService();
    }
    return CredentialsService.instance;
  }

  /**
   * Generates a cryptographically secure API Key for an authorized provider.
   * Plaintext secret key is returned ONLY ONCE in the result.
   */
  public async generateApiKey(
    providerId: string,
    userId: string,
    params: CreateApiKeyParams
  ): Promise<CreateApiKeyResult> {
    const credentialId = `cred-${crypto.randomUUID()}`;
    const rawBytes = crypto.randomBytes(24).toString("hex");
    const secretKey = `stockiq_live_${rawBytes}`;
    const keyPrefix = secretKey.substring(0, 18);
    const secretHash = crypto.createHash("sha256").update(secretKey).digest("hex");
    const name = (params.label || "Default Trading Bot Integration").trim();

    let expiresAt: string | null = null;
    if (params.expiresInDays && params.expiresInDays > 0) {
      expiresAt = new Date(Date.now() + params.expiresInDays * 86400000).toISOString();
    }

    const nowIso = new Date().toISOString();

    const credentialRecord: IntegrationCredential = {
      id: credentialId,
      providerId,
      name,
      keyPrefix,
      secretHash,
      status: IntegrationCredentialStatuses.ACTIVE,
      createdAt: nowIso,
      lastUsedAt: null,
      revokedAt: null,
      expiresAt,
      metadata: { createdByUserId: userId },
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO provider_integration_credentials (
          id, provider_id, name, key_prefix, secret_hash, status, created_at, expires_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          credentialRecord.id,
          credentialRecord.providerId,
          credentialRecord.name,
          credentialRecord.keyPrefix,
          credentialRecord.secretHash,
          credentialRecord.status,
          credentialRecord.createdAt,
          credentialRecord.expiresAt,
          JSON.stringify(credentialRecord.metadata),
        ]
      );
    } catch {
      // Memory fallback
    }

    CredentialsService.memoryCredentials.set(credentialRecord.id, credentialRecord);

    // Security Audit Log (Never log plaintext secret)
    this.auditService.logSecurityAction(
      userId,
      "PROVIDER",
      "API_KEY_GENERATED",
      "INTEGRATION_CREDENTIAL",
      credentialId,
      { label: name, keyPrefix, providerId, expiresAt }
    );

    return {
      id: credentialId,
      providerId,
      label: name,
      keyPrefix,
      secretKey, // Plaintext returned ONLY ONCE!
      status: IntegrationCredentialStatuses.ACTIVE,
      createdAt: nowIso,
      expiresAt,
    };
  }

  /**
   * Lists API Key metadata for a provider.
   * Plaintext secret is NEVER returned.
   */
  public async listApiKeys(providerId: string): Promise<Omit<IntegrationCredential, "secretHash">[]> {
    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT id, provider_id AS "providerId", name, key_prefix AS "keyPrefix", status,
                created_at AS "createdAt", last_used_at AS "lastUsedAt",
                revoked_at AS "revokedAt", expires_at AS "expiresAt", metadata
         FROM provider_integration_credentials
         WHERE provider_id = $1
         ORDER BY created_at DESC`,
        [providerId]
      );

      if (res.rows.length > 0) {
        return res.rows.map((r) => ({
          ...r,
          metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata || {},
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          lastUsedAt: r.lastUsedAt ? (r.lastUsedAt instanceof Date ? r.lastUsedAt.toISOString() : String(r.lastUsedAt)) : null,
          revokedAt: r.revokedAt ? (r.revokedAt instanceof Date ? r.revokedAt.toISOString() : String(r.revokedAt)) : null,
          expiresAt: r.expiresAt ? (r.expiresAt instanceof Date ? r.expiresAt.toISOString() : String(r.expiresAt)) : null,
        }));
      }
    } catch {
      // Memory fallback
    }

    const memoryList: Omit<IntegrationCredential, "secretHash">[] = [];
    for (const cred of CredentialsService.memoryCredentials.values()) {
      if (cred.providerId === providerId) {
        const { secretHash, ...meta } = cred;
        memoryList.push(meta);
      }
    }
    return memoryList;
  }

  /**
   * Rotates an API Key: Revokes the old credential and issues a new one.
   */
  public async rotateApiKey(
    providerId: string,
    userId: string,
    credentialId: string
  ): Promise<CreateApiKeyResult> {
    const existing = await this.getCredentialById(credentialId);
    if (!existing || existing.providerId !== providerId) {
      throw new AppError("Integration credential not found or unauthorized", 404, "NOT_FOUND");
    }

    // Revoke old key
    await this.revokeApiKey(providerId, userId, credentialId);

    // Issue new key
    return this.generateApiKey(providerId, userId, { label: `${existing.name} (Rotated)` });
  }

  /**
   * Revokes an active API Key credential.
   */
  public async revokeApiKey(
    providerId: string,
    userId: string,
    credentialId: string
  ): Promise<void> {
    const existing = await this.getCredentialById(credentialId);
    if (!existing || existing.providerId !== providerId) {
      throw new AppError("Integration credential not found or unauthorized", 404, "NOT_FOUND");
    }

    if (existing.status === IntegrationCredentialStatuses.REVOKED) {
      return; // Already revoked
    }

    const nowIso = new Date().toISOString();
    existing.status = IntegrationCredentialStatuses.REVOKED;
    existing.revokedAt = nowIso;

    try {
      const pool = db.getPool();
      await pool.query(
        `UPDATE provider_integration_credentials
         SET status = $1, revoked_at = $2
         WHERE id = $3 AND provider_id = $4`,
        [IntegrationCredentialStatuses.REVOKED, nowIso, credentialId, providerId]
      );
    } catch {
      // Memory fallback
    }

    CredentialsService.memoryCredentials.set(credentialId, existing);

    this.auditService.logSecurityAction(
      userId,
      "PROVIDER",
      "API_KEY_REVOKED",
      "INTEGRATION_CREDENTIAL",
      credentialId,
      { providerId, keyPrefix: existing.keyPrefix }
    );
  }

  /**
   * Validates a raw secret API key from incoming webhook request.
   */
  public async validateApiKey(rawSecretKey: string): Promise<IntegrationCredential | null> {
    if (!rawSecretKey || typeof rawSecretKey !== "string" || !rawSecretKey.startsWith("stockiq_live_")) {
      return null;
    }

    const secretHash = crypto.createHash("sha256").update(rawSecretKey.trim()).digest("hex");

    let credential: IntegrationCredential | null = null;

    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT id, provider_id AS "providerId", name, key_prefix AS "keyPrefix", secret_hash AS "secretHash",
                status, created_at AS "createdAt", last_used_at AS "lastUsedAt",
                revoked_at AS "revokedAt", expires_at AS "expiresAt", metadata
         FROM provider_integration_credentials
         WHERE secret_hash = $1`,
        [secretHash]
      );

      if (res.rows.length > 0) {
        const r = res.rows[0];
        credential = {
          ...r,
          metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata || {},
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          lastUsedAt: r.lastUsedAt ? (r.lastUsedAt instanceof Date ? r.lastUsedAt.toISOString() : String(r.lastUsedAt)) : null,
          revokedAt: r.revokedAt ? (r.revokedAt instanceof Date ? r.revokedAt.toISOString() : String(r.revokedAt)) : null,
          expiresAt: r.expiresAt ? (r.expiresAt instanceof Date ? r.expiresAt.toISOString() : String(r.expiresAt)) : null,
        };
      }
    } catch {
      // Memory fallback
    }

    if (!credential) {
      for (const cred of CredentialsService.memoryCredentials.values()) {
        if (cred.secretHash === secretHash) {
          credential = cred;
          break;
        }
      }
    }

    if (!credential) return null;

    // Check status
    if (credential.status !== IntegrationCredentialStatuses.ACTIVE) {
      return null;
    }

    // Check expiration
    if (credential.expiresAt) {
      const expiresTime = new Date(credential.expiresAt).getTime();
      if (Date.now() > expiresTime) {
        return null;
      }
    }

    // Update last_used_at safely
    const nowIso = new Date().toISOString();
    credential.lastUsedAt = nowIso;
    CredentialsService.memoryCredentials.set(credential.id, credential);

    try {
      const pool = db.getPool();
      pool.query(
        `UPDATE provider_integration_credentials SET last_used_at = $1 WHERE id = $2`,
        [nowIso, credential.id]
      ).catch(() => {});
    } catch {
      // Non-blocking update
    }

    return credential;
  }

  /**
   * Retrieves a credential by ID.
   */
  public async getCredentialById(credentialId: string): Promise<IntegrationCredential | null> {
    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT id, provider_id AS "providerId", name, key_prefix AS "keyPrefix", secret_hash AS "secretHash",
                status, created_at AS "createdAt", last_used_at AS "lastUsedAt",
                revoked_at AS "revokedAt", expires_at AS "expiresAt", metadata
         FROM provider_integration_credentials WHERE id = $1`,
        [credentialId]
      );
      if (res.rows.length > 0) {
        const r = res.rows[0];
        return {
          ...r,
          metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata || {},
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        };
      }
    } catch {
      // Memory fallback
    }
    return CredentialsService.memoryCredentials.get(credentialId) || null;
  }

  /**
   * Idempotency check: Look up existing response for (providerId, idempotencyKey).
   */
  public async getIdempotentRecord(
    providerId: string,
    idempotencyKey: string
  ): Promise<IdempotencyRecord | null> {
    const memKey = `${providerId}:${idempotencyKey}`;
    const memRecord = CredentialsService.memoryIdempotencyRecords.get(memKey);
    if (memRecord) return memRecord;

    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT id, provider_id AS "providerId", service_id AS "serviceId",
                idempotency_key AS "idempotencyKey", response_status AS "responseStatus",
                response_payload AS "responsePayload", created_at AS "createdAt"
         FROM integration_idempotency_records
         WHERE provider_id = $1 AND idempotency_key = $2`,
        [providerId, idempotencyKey]
      );

      if (res.rows.length > 0) {
        const r = res.rows[0];
        const record: IdempotencyRecord = {
          ...r,
          responsePayload: typeof r.responsePayload === "string" ? JSON.parse(r.responsePayload) : r.responsePayload,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        };
        CredentialsService.memoryIdempotencyRecords.set(memKey, record);
        return record;
      }
    } catch {
      // Memory fallback
    }

    return null;
  }

  /**
   * Saves an idempotency record for duplicate protection.
   */
  public async saveIdempotentRecord(record: IdempotencyRecord): Promise<void> {
    const memKey = `${record.providerId}:${record.idempotencyKey}`;
    CredentialsService.memoryIdempotencyRecords.set(memKey, record);

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO integration_idempotency_records (
          id, provider_id, service_id, idempotency_key, response_status, response_payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (provider_id, idempotency_key) DO NOTHING`,
        [
          record.id,
          record.providerId,
          record.serviceId,
          record.idempotencyKey,
          record.responseStatus,
          JSON.stringify(record.responsePayload),
          record.createdAt,
        ]
      );
    } catch {
      // Memory fallback
    }
  }
}
