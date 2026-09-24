import crypto from "crypto";
import { db } from "../../database/connection.js";

export type AgreementType =
  | "CLIENT_AGREEMENT"
  | "RISK_DISCLOSURE"
  | "SERVICE_DISCLOSURE"
  | "PRIVACY_NOTICE"
  | "TERMS_AND_CONDITIONS";

export type SignatureMethod = "CONSENT_CLICK" | "MOCK_ESIGN_CERTIFIED";

export interface AgreementTemplate {
  id: string;
  agreementType: AgreementType;
  version: string;
  title: string;
  content: string;
  contentHash: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AgreementSignatureRecord {
  id: string;
  userId: string;
  templateId: string;
  signatureMethod: SignatureMethod;
  signedAt: string;
  agreementContentHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: "PENDING" | "EXECUTED" | "REVOKED";
  auditEventReference: string | null;
  createdAt: string;
}

export class AgreementsService {
  /**
   * Helper to compute SHA-256 hash of text content.
   */
  public computeHash(content: string): string {
    return crypto.createHash("sha256").update(content, "utf8").digest("hex");
  }

  /**
   * Registers a new versioned agreement template.
   * Ensures that previous templates remain completely untouched.
   */
  public async createTemplate(input: {
    agreementType: AgreementType;
    version: string;
    title: string;
    content: string;
    createdBy?: string;
  }): Promise<AgreementTemplate> {
    const hash = this.computeHash(input.content);
    const pool = db.getPool();

    // Soft update: Deactivate older active templates of this type
    await pool.query(
      "UPDATE agreement_templates SET is_active = false WHERE agreement_type = $1",
      [input.agreementType]
    );

    const { rows } = await pool.query<AgreementTemplate>(
      `INSERT INTO agreement_templates (agreement_type, version, title, content, content_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING 
         id, agreement_type as "agreementType", version, title, content, 
         content_hash as "contentHash", is_active as "isActive", 
         effective_from as "effectiveFrom", effective_until as "effectiveUntil", 
         created_by as "createdBy", created_at as "createdAt"`,
      [input.agreementType, input.version, input.title, input.content, hash]
    );

    const record = rows[0];
    if (!record) {
      throw new Error("Failed to register agreement template");
    }

    return record;
  }

  /**
   * Fetches latest active template of a given type.
   */
  public async getLatestTemplate(type: AgreementType): Promise<AgreementTemplate | null> {
    const pool = db.getPool();
    const { rows } = await pool.query<AgreementTemplate>(
      `SELECT 
         id, agreement_type as "agreementType", version, title, content, 
         content_hash as "contentHash", is_active as "isActive", 
         effective_from as "effectiveFrom", effective_until as "effectiveUntil", 
         created_by as "createdBy", created_at as "createdAt"
       FROM agreement_templates 
       WHERE agreement_type = $1 AND is_active = true 
       LIMIT 1`,
      [type]
    );
    return rows[0] || null;
  }

  /**
   * Sign/Consent to an agreement.
   * Captures the exact template content hash, signature method, IP, user-agent, and status.
   */
  public async signAgreement(input: {
    userId: string;
    templateId: string;
    signatureMethod: SignatureMethod;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AgreementSignatureRecord> {
    const pool = db.getPool();

    // Fetch the template to preserve the exact content hash at execution time
    const { rows: tRows } = await pool.query<AgreementTemplate>(
      `SELECT id, content_hash as "contentHash" FROM agreement_templates WHERE id = $1`,
      [input.templateId]
    );

    const template = tRows[0];
    if (!template) {
      throw new Error("Agreement template not found");
    }

    const auditRef = `AUDIT-${crypto.randomUUID().slice(0, 8)}`;

    const { rows } = await pool.query<AgreementSignatureRecord>(
      `INSERT INTO agreement_signatures (user_id, template_id, signature_method, agreement_content_hash, ip_address, user_agent, audit_event_reference, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'EXECUTED')
       RETURNING 
         id, user_id as "userId", template_id as "templateId", signature_method as "signatureMethod", 
         signed_at as "signedAt", agreement_content_hash as "agreementContentHash", 
         ip_address as "ipAddress", user_agent as "userAgent", status, 
         audit_event_reference as "auditEventReference", created_at as "createdAt"`,
      [
        input.userId,
        input.templateId,
        input.signatureMethod,
        template.contentHash,
        input.ipAddress || null,
        input.userAgent || null,
        auditRef,
      ]
    );

    const signature = rows[0];
    if (!signature) {
      throw new Error("Failed to record agreement signature");
    }

    return signature;
  }

  /**
   * Fetches signature history for a user.
   */
  public async getSignaturesForUser(userId: string): Promise<AgreementSignatureRecord[]> {
    const pool = db.getPool();
    const { rows } = await pool.query<AgreementSignatureRecord>(
      `SELECT 
         id, user_id as "userId", template_id as "templateId", signature_method as "signatureMethod", 
         signed_at as "signedAt", agreement_content_hash as "agreementContentHash", 
         ip_address as "ipAddress", user_agent as "userAgent", status, 
         audit_event_reference as "auditEventReference", created_at as "createdAt"
       FROM agreement_signatures 
       WHERE user_id = $1 
       ORDER BY signed_at DESC`,
      [userId]
    );
    return rows;
  }
}

export const agreementsService = new AgreementsService();
