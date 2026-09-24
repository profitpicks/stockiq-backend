import { db } from "../../database/connection.js";
import { AppError } from "../../api/middleware/error-handler.middleware.js";
import { MockParrvaAdapter } from "../../adapters/parrva/parrva.adapter.js";

export interface PastPerformanceVerificationRecord {
  id: string;
  providerId: string;
  serviceId?: string;
  sourceType: "PROVIDER_SUPPLIED_HISTORICAL" | "PLATFORM_RECORDED" | "EXTERNAL_VERIFIED" | "REGULATORY_VERIFIED";
  sourceName: string;
  verificationStatus: "NOT_SUBMITTED" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED" | "EXPIRED" | "UNVERIFIED";
  verifierName?: string;
  referenceIdentifier?: string;
  evidenceDocumentReference?: string;
  methodologyId?: string;
  verifiedAt?: string;
  validityPeriodStart?: string;
  validityPeriodEnd?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export class VerificationService {
  private parrvaAdapter: MockParrvaAdapter;

  constructor(parrvaAdapter = new MockParrvaAdapter()) {
    this.parrvaAdapter = parrvaAdapter;
  }

  public async createVerificationRecord(
    input: Omit<PastPerformanceVerificationRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<PastPerformanceVerificationRecord> {
    const pool = db.getPool();

    const res = await pool.query(
      `INSERT INTO past_performance_verification_records (
        provider_id, service_id, source_type, source_name, verification_status, verifier_name,
        reference_identifier, evidence_document_reference, methodology_id, verified_at,
        validity_period_start, validity_period_end, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, provider_id AS "providerId", service_id AS "serviceId", source_type AS "sourceType",
                source_name AS "sourceName", verification_status AS "verificationStatus",
                verifier_name AS "verifierName", reference_identifier AS "referenceIdentifier",
                evidence_document_reference AS "evidenceDocumentReference", methodology_id AS "methodologyId",
                verified_at AS "verifiedAt", validity_period_start AS "validityPeriodStart",
                validity_period_end AS "validityPeriodEnd", notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        input.providerId,
        input.serviceId || null,
        input.sourceType,
        input.sourceName,
        input.verificationStatus,
        input.verifierName || null,
        input.referenceIdentifier || null,
        input.evidenceDocumentReference || null,
        input.methodologyId || null,
        input.verifiedAt || null,
        input.validityPeriodStart || null,
        input.validityPeriodEnd || null,
        input.notes || null,
      ]
    );

    return res.rows[0];
  }

  public async getVerificationRecord(id: string): Promise<PastPerformanceVerificationRecord | null> {
    const pool = db.getPool();
    const res = await pool.query(
      `SELECT id, provider_id AS "providerId", service_id AS "serviceId", source_type AS "sourceType",
              source_name AS "sourceName", verification_status AS "verificationStatus",
              verifier_name AS "verifierName", reference_identifier AS "referenceIdentifier",
              evidence_document_reference AS "evidenceDocumentReference", methodology_id AS "methodologyId",
              verified_at AS "verifiedAt", validity_period_start AS "validityPeriodStart",
              validity_period_end AS "validityPeriodEnd", notes, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM past_performance_verification_records WHERE id = $1`,
      [id]
    );

    return res.rows[0] || null;
  }

  public async updateVerificationStatus(
    id: string,
    status: PastPerformanceVerificationRecord["verificationStatus"],
    adminUserId: string,
    notes?: string
  ): Promise<PastPerformanceVerificationRecord> {
    const pool = db.getPool();

    const current = await this.getVerificationRecord(id);
    if (!current) {
      throw new AppError("Verification record not found", 404, "VERIFICATION_RECORD_NOT_FOUND");
    }

    const res = await pool.query(
      `UPDATE past_performance_verification_records
       SET verification_status = $1,
           notes = COALESCE($2, notes),
           updated_at = (NOW() AT TIME ZONE 'UTC')
       WHERE id = $3
       RETURNING id, provider_id AS "providerId", service_id AS "serviceId", source_type AS "sourceType",
                 source_name AS "sourceName", verification_status AS "verificationStatus",
                 verifier_name AS "verifierName", reference_identifier AS "referenceIdentifier",
                 evidence_document_reference AS "evidenceDocumentReference", methodology_id AS "methodologyId",
                 verified_at AS "verifiedAt", validity_period_start AS "validityPeriodStart",
                 validity_period_end AS "validityPeriodEnd", notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [status, notes || null, id]
    );

    return res.rows[0];
  }

  /**
   * Submit to external mock PaRRVA adapter to simulate third-party verification flow.
   */
  public async triggerExternalParrvaVerification(id: string, sebiRegNumber: string): Promise<PastPerformanceVerificationRecord> {
    const pool = db.getPool();

    const record = await this.getVerificationRecord(id);
    if (!record) {
      throw new AppError("Verification record not found", 404, "VERIFICATION_RECORD_NOT_FOUND");
    }

    // Call PaRRVA adapter abstraction
    const adapterRes = await this.parrvaAdapter.submitForVerification({
      providerId: record.providerId,
      sebiRegistrationNumber: sebiRegNumber,
      serviceId: record.serviceId || "",
      periodStart: record.validityPeriodStart || new Date().toISOString().split("T")[0],
      periodEnd: record.validityPeriodEnd || new Date().toISOString().split("T")[0],
      applicableMethodology: "MOCK_METHODOLOGY_SEBI_GUIDELINES",
    });

    // Update DB with reference identifier, verified timestamp, etc.
    const res = await pool.query(
      `UPDATE past_performance_verification_records
       SET verification_status = 'VERIFIED',
           verifier_name = $1,
           reference_identifier = $2,
           verified_at = (NOW() AT TIME ZONE 'UTC'),
           notes = $3,
           updated_at = (NOW() AT TIME ZONE 'UTC')
       WHERE id = $4
       RETURNING id, provider_id AS "providerId", service_id AS "serviceId", source_type AS "sourceType",
                 source_name AS "sourceName", verification_status AS "verificationStatus",
                 verifier_name AS "verifierName", reference_identifier AS "referenceIdentifier",
                 evidence_document_reference AS "evidenceDocumentReference", methodology_id AS "methodologyId",
                 verified_at AS "verifiedAt", validity_period_start AS "validityPeriodStart",
                 validity_period_end AS "validityPeriodEnd", notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        adapterRes.verificationProvider, // e.g. "PaRRVA (MOCK ADAPTER - DEV ONLY)"
        adapterRes.verificationReference,
        `External verification process completed. Is Mock: ${adapterRes.isMock}.`,
        id,
      ]
    );

    return res.rows[0];
  }

  public async getProviderVerificationRecords(providerId: string): Promise<PastPerformanceVerificationRecord[]> {
    const pool = db.getPool();
    const res = await pool.query(
      `SELECT id, provider_id AS "providerId", service_id AS "serviceId", source_type AS "sourceType",
              source_name AS "sourceName", verification_status AS "verificationStatus",
              verifier_name AS "verifierName", reference_identifier AS "referenceIdentifier",
              evidence_document_reference AS "evidenceDocumentReference", methodology_id AS "methodologyId",
              verified_at AS "verifiedAt", validity_period_start AS "validityPeriodStart",
              validity_period_end AS "validityPeriodEnd", notes, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM past_performance_verification_records WHERE provider_id = $1 ORDER BY created_at DESC`,
      [providerId]
    );

    return res.rows;
  }
}
