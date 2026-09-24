import crypto from "crypto";
import { db } from "../../database/connection.js";
import {
  ProviderRegistration,
  ProviderType,
  ProviderEntityType,
  ProviderStatus,
  ProviderStatuses,
  ProviderTypes,
  ProviderDeclaration,
  ProviderDocument,
  VerificationCase,
  VerificationCaseStatuses,
} from "./types.ts";

export interface RegisterProviderParams {
  userId: string;
  providerType: ProviderType;
  entityType: ProviderEntityType;
  legalName: string;
  tradeName?: string;
  registrationAuthority?: string;
  sebiRegistrationNumber: string;
  validFrom: string; // YYYY-MM-DD
  validTill?: string;
  isPerpetual?: boolean;
  complianceOfficerName?: string;
  complianceOfficerEmail?: string;
  registeredOfficeAddress: string;
  isNismCertified: boolean;
  panNumber?: string;
}

export interface UpdateProviderParams {
  legalName?: string;
  tradeName?: string;
  complianceOfficerName?: string;
  complianceOfficerEmail?: string;
  registeredOfficeAddress?: string;
  isNismCertified?: boolean;
  validFrom?: string;
  validTill?: string;
  isPerpetual?: boolean;
  panNumber?: string;
}

export interface SubmitDeclarationParams {
  declarationType: string;
  isDeclared: boolean;
  ipAddress?: string;
}

export interface AddDocumentMetadataParams {
  documentType: string;
  fileName: string;
  fileHash: string;
  mimeType: string;
  version?: number;
  storageReference?: string;
  fileSizeBytes?: number;
  uploaderId?: string;
}

export interface RegulatoryFormatRule {
  authority: string;
  providerType: ProviderType;
  pattern: RegExp;
  description: string;
}

export const REGULATORY_FORMAT_RULES: RegulatoryFormatRule[] = [
  {
    authority: "SEBI",
    providerType: ProviderTypes.RESEARCH_ANALYST,
    pattern: /^INH[A-Z0-9]{8,12}$/,
    description: "SEBI Research Analyst registration format (INH + 8-12 alphanumeric characters)",
  },
  {
    authority: "SEBI",
    providerType: ProviderTypes.INVESTMENT_ADVISER,
    pattern: /^INA[A-Z0-9]{8,12}$/,
    description: "SEBI Investment Adviser registration format (INA + 8-12 alphanumeric characters)",
  },
];

export interface RegistrationNumberValidationResult {
  isValidFormat: boolean;
  ruleApplied: boolean;
  needsManualReview: boolean;
  validationStatus: "STANDARD_VALIDATED" | "NON_STANDARD_MANUAL_REVIEW";
  message: string;
}

export class ProviderService {
  private static memoryProviders = new Map<string, ProviderRegistration>();
  private static memoryDeclarations = new Map<string, ProviderDeclaration[]>();
  private static memoryDocuments = new Map<string, ProviderDocument[]>();
  private static memoryCases = new Map<string, VerificationCase>();

  /**
   * Configurable validation check for regulatory registration numbers.
   * NEVER rigidly rejects non-matching formats; instead flags for manual review fallback.
   */
  public static validateSebiRegistrationNumber(
    sebiRegNo: string,
    providerType: ProviderType,
    authority: string = "SEBI"
  ): RegistrationNumberValidationResult {
    const trimmed = sebiRegNo.trim().toUpperCase();
    const rule = REGULATORY_FORMAT_RULES.find(
      (r) => r.authority === authority && r.providerType === providerType
    );

    if (!rule) {
      return {
        isValidFormat: true,
        ruleApplied: false,
        needsManualReview: true,
        validationStatus: "NON_STANDARD_MANUAL_REVIEW",
        message: `No explicit regulatory format rule configured for authority '${authority}' and type '${providerType}'. Submitted for manual verification review.`,
      };
    }

    const matches = rule.pattern.test(trimmed);
    if (matches) {
      return {
        isValidFormat: true,
        ruleApplied: true,
        needsManualReview: false,
        validationStatus: "STANDARD_VALIDATED",
        message: `Registration number format matched configured rule for ${authority} ${providerType}.`,
      };
    }

    // Non-standard format fallback (allows submission for officer review without blocking registration)
    return {
      isValidFormat: false,
      ruleApplied: true,
      needsManualReview: true,
      validationStatus: "NON_STANDARD_MANUAL_REVIEW",
      message: `Registration number '${trimmed}' does not match standard pattern (${rule.description}). Submitted as non-standard for manual verification officer review.`,
    };
  }

  /**
   * Registers a new provider.
   */
  public async registerProvider(params: RegisterProviderParams): Promise<ProviderRegistration> {
    const sebiRegNo = params.sebiRegistrationNumber.trim().toUpperCase();
    const authority = params.registrationAuthority || "SEBI";
    const validation = ProviderService.validateSebiRegistrationNumber(sebiRegNo, params.providerType, authority);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const registration: ProviderRegistration = {
      id,
      userId: params.userId,
      providerType: params.providerType,
      entityType: params.entityType,
      legalName: params.legalName.trim(),
      tradeName: params.tradeName?.trim(),
      registrationAuthority: authority,
      sebiRegistrationNumber: sebiRegNo,
      formatValidationStatus: validation.validationStatus,
      validFrom: params.validFrom,
      validTill: params.validTill,
      isPerpetual: params.isPerpetual ?? false,
      status: ProviderStatuses.DRAFT,
      complianceOfficerName: params.complianceOfficerName?.trim(),
      complianceOfficerEmail: params.complianceOfficerEmail?.trim(),
      registeredOfficeAddress: params.registeredOfficeAddress.trim(),
      isNismCertified: params.isNismCertified,
      panNumber: params.panNumber?.trim().toUpperCase(),
      createdAt: now,
      updatedAt: now,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO provider_profiles 
          (id, user_id, provider_type, entity_type, legal_name, trade_name, 
           sebi_registration_number, valid_from, valid_till, is_perpetual, 
           status, compliance_officer_name, compliance_officer_email, 
           registered_office_address, is_nism_certified, pan_number, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          registration.id,
          registration.userId,
          registration.providerType,
          registration.entityType,
          registration.legalName,
          registration.tradeName || null,
          registration.sebiRegistrationNumber,
          registration.validFrom,
          registration.validTill || null,
          registration.isPerpetual,
          registration.status,
          registration.complianceOfficerName || null,
          registration.complianceOfficerEmail || null,
          registration.registeredOfficeAddress,
          registration.isNismCertified,
          registration.panNumber || null,
          registration.createdAt,
          registration.updatedAt,
        ]
      );
    } catch (err) {
      console.error("[registerProvider Error]:", err);
      ProviderService.memoryProviders.set(params.userId, registration);
    }

    return registration;
  }

  /**
   * Retrieves provider registration profile by provider ID.
   */
  public async getProviderById(providerId: string): Promise<ProviderRegistration | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, user_id AS "userId", provider_type AS "providerType", entity_type AS "entityType",
                legal_name AS "legalName", trade_name AS "tradeName", sebi_registration_number AS "sebiRegistrationNumber",
                valid_from AS "validFrom", valid_till AS "validTill", is_perpetual AS "isPerpetual",
                status, compliance_officer_name AS "complianceOfficerName", compliance_officer_email AS "complianceOfficerEmail",
                registered_office_address AS "registeredOfficeAddress", is_nism_certified AS "isNismCertified",
                pan_number AS "panNumber", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM provider_profiles WHERE id = $1`,
        [providerId]
      );
      if (rows.length > 0) return rows[0];
      for (const p of ProviderService.memoryProviders.values()) {
        if (p.id === providerId) return p;
      }
    } catch {
      for (const p of ProviderService.memoryProviders.values()) {
        if (p.id === providerId) return p;
      }
    }
    return null;
  }

  public static updateMemoryProviderStatus(providerId: string, status: ProviderStatus): void {
    for (const [userId, p] of ProviderService.memoryProviders.entries()) {
      if (p.id === providerId) {
        ProviderService.memoryProviders.set(userId, { ...p, status });
      }
    }
  }

  /**
   * Retrieves provider registration profile for user.
   */
  public async getProviderByUserId(userId: string): Promise<ProviderRegistration | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, user_id AS "userId", provider_type AS "providerType", entity_type AS "entityType",
                legal_name AS "legalName", trade_name AS "tradeName", sebi_registration_number AS "sebiRegistrationNumber",
                valid_from AS "validFrom", valid_till AS "validTill", is_perpetual AS "isPerpetual",
                status, compliance_officer_name AS "complianceOfficerName", compliance_officer_email AS "complianceOfficerEmail",
                registered_office_address AS "registeredOfficeAddress", is_nism_certified AS "isNismCertified",
                pan_number AS "panNumber", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM provider_profiles WHERE user_id = $1`,
        [userId]
      );
      if (rows.length > 0) return rows[0];
      const memory = ProviderService.memoryProviders.get(userId);
      if (memory) return memory;
    } catch {
      const memory = ProviderService.memoryProviders.get(userId);
      if (memory) return memory;
    }
    return null;
  }

  /**
   * Updates regulatory profile fields.
   */
  public async updateProviderProfile(
    userId: string,
    updates: UpdateProviderParams
  ): Promise<ProviderRegistration> {
    const existing = await this.getProviderByUserId(userId);
    if (!existing) {
      throw new Error("Provider profile not found");
    }

    if (existing.status !== ProviderStatuses.DRAFT && existing.status !== ProviderStatuses.UNDER_VERIFICATION) {
      throw new Error(`Cannot modify provider profile when status is ${existing.status}`);
    }

    const updated: ProviderRegistration = {
      ...existing,
      legalName: updates.legalName?.trim() || existing.legalName,
      tradeName: updates.tradeName !== undefined ? updates.tradeName?.trim() : existing.tradeName,
      complianceOfficerName:
        updates.complianceOfficerName !== undefined
          ? updates.complianceOfficerName?.trim()
          : existing.complianceOfficerName,
      complianceOfficerEmail:
        updates.complianceOfficerEmail !== undefined
          ? updates.complianceOfficerEmail?.trim()
          : existing.complianceOfficerEmail,
      registeredOfficeAddress: updates.registeredOfficeAddress?.trim() || existing.registeredOfficeAddress,
      isNismCertified: updates.isNismCertified !== undefined ? updates.isNismCertified : existing.isNismCertified,
      validFrom: updates.validFrom || existing.validFrom,
      validTill: updates.validTill !== undefined ? updates.validTill : existing.validTill,
      isPerpetual: updates.isPerpetual !== undefined ? updates.isPerpetual : existing.isPerpetual,
      panNumber: updates.panNumber !== undefined ? updates.panNumber?.trim().toUpperCase() : existing.panNumber,
      updatedAt: new Date().toISOString(),
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `UPDATE provider_profiles SET 
          legal_name = $1, trade_name = $2, compliance_officer_name = $3, 
          compliance_officer_email = $4, registered_office_address = $5, 
          is_nism_certified = $6, valid_from = $7, valid_till = $8, 
          is_perpetual = $9, pan_number = $10, updated_at = $11
         WHERE id = $12`,
        [
          updated.legalName,
          updated.tradeName || null,
          updated.complianceOfficerName || null,
          updated.complianceOfficerEmail || null,
          updated.registeredOfficeAddress,
          updated.isNismCertified,
          updated.validFrom,
          updated.validTill || null,
          updated.isPerpetual,
          updated.panNumber || null,
          updated.updatedAt,
          updated.id,
        ]
      );
    } catch {
      ProviderService.memoryProviders.set(userId, updated);
    }

    return updated;
  }

  /**
   * Adds compliance declaration.
   */
  public async addDeclaration(
    providerId: string,
    params: SubmitDeclarationParams
  ): Promise<ProviderDeclaration> {
    const declaration: ProviderDeclaration = {
      id: crypto.randomUUID(),
      providerId,
      declarationType: params.declarationType,
      isDeclared: params.isDeclared,
      declaredAt: new Date().toISOString(),
      ipAddress: params.ipAddress,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO provider_declarations (id, provider_id, declaration_type, is_declared, declared_at, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          declaration.id,
          declaration.providerId,
          declaration.declarationType,
          declaration.isDeclared,
          declaration.declaredAt,
          declaration.ipAddress || null,
        ]
      );
    } catch {
      const list = ProviderService.memoryDeclarations.get(providerId) || [];
      list.push(declaration);
      ProviderService.memoryDeclarations.set(providerId, list);
    }

    return declaration;
  }

  /**
   * Retrieves declarations for provider.
   */
  public async getDeclarations(providerId: string): Promise<ProviderDeclaration[]> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, provider_id AS "providerId", declaration_type AS "declarationType", 
                is_declared AS "isDeclared", declared_at AS "declaredAt", ip_address AS "ipAddress"
         FROM provider_declarations WHERE provider_id = $1 ORDER BY declared_at ASC`,
        [providerId]
      );
      if (rows.length > 0) return rows;
      return ProviderService.memoryDeclarations.get(providerId) || [];
    } catch {
      return ProviderService.memoryDeclarations.get(providerId) || [];
    }
  }

  /**
   * Registers document metadata with SHA-256 hash.
   */
  public async addDocument(
    providerId: string,
    params: AddDocumentMetadataParams
  ): Promise<ProviderDocument> {
    const docId = crypto.randomUUID();
    const doc: ProviderDocument = {
      id: docId,
      providerId,
      documentType: params.documentType,
      version: params.version || 1,
      storageReference: params.storageReference || `sec_docs/${providerId}/${docId}.enc`,
      fileName: params.fileName,
      fileHash: params.fileHash,
      mimeType: params.mimeType,
      fileSizeBytes: params.fileSizeBytes || 1024,
      uploadedAt: new Date().toISOString(),
      uploaderId: params.uploaderId,
      reviewStatus: "PENDING",
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO provider_documents (id, provider_id, document_type, file_name, file_hash, mime_type, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [doc.id, doc.providerId, doc.documentType, doc.fileName, doc.fileHash, doc.mimeType, doc.uploadedAt]
      );
    } catch {
      const list = ProviderService.memoryDocuments.get(providerId) || [];
      list.push(doc);
      ProviderService.memoryDocuments.set(providerId, list);
    }

    return doc;
  }

  /**
   * Retrieves documents for provider.
   */
  public async getDocuments(providerId: string): Promise<ProviderDocument[]> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, provider_id AS "providerId", document_type AS "documentType", 
                file_name AS "fileName", file_hash AS "fileHash", mime_type AS "mimeType", uploaded_at AS "uploadedAt"
         FROM provider_documents WHERE provider_id = $1 ORDER BY uploaded_at ASC`,
        [providerId]
      );
      if (rows.length > 0) {
        return rows.map((r) => ({
          ...r,
          version: 1,
          storageReference: `sec_docs/${providerId}/${r.id}.enc`,
          fileSizeBytes: 1024,
          reviewStatus: "PENDING",
        }));
      }
      return ProviderService.memoryDocuments.get(providerId) || [];
    } catch {
      return ProviderService.memoryDocuments.get(providerId) || [];
    }
  }

  /**
   * Submits provider profile for Verification Officer review.
   */
  public async submitProviderProfile(userId: string): Promise<{ provider: ProviderRegistration; verificationCase: VerificationCase }> {
    const provider = await this.getProviderByUserId(userId);
    if (!provider) {
      throw new Error("Provider profile not found");
    }

    if (provider.status !== ProviderStatuses.DRAFT && provider.status !== ProviderStatuses.UNDER_VERIFICATION) {
      throw new Error(`Cannot submit provider profile when status is ${provider.status}`);
    }

    const declarations = await this.getDeclarations(provider.id);
    if (declarations.length === 0) {
      throw new Error("At least one compliance declaration is required prior to submission");
    }

    const documents = await this.getDocuments(provider.id);
    if (documents.length === 0) {
      throw new Error("At least one regulatory registration document metadata record is required prior to submission");
    }

    const updatedProvider: ProviderRegistration = {
      ...provider,
      status: ProviderStatuses.SUBMITTED,
      updatedAt: new Date().toISOString(),
    };

    const vCase: VerificationCase = {
      id: crypto.randomUUID(),
      providerId: provider.id,
      status: VerificationCaseStatuses.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const pool = db.getPool();
      await pool.query(`UPDATE provider_profiles SET status = $1, updated_at = $2 WHERE id = $3`, [
        updatedProvider.status,
        updatedProvider.updatedAt,
        updatedProvider.id,
      ]);

      await pool.query(
        `INSERT INTO verification_cases (id, provider_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [vCase.id, vCase.providerId, vCase.status, vCase.createdAt, vCase.updatedAt]
      );
    } catch {
      ProviderService.memoryProviders.set(userId, updatedProvider);
    }

    ProviderService.memoryCases.set(vCase.id, vCase);

    return { provider: updatedProvider, verificationCase: vCase };
  }

  public static getMemoryCase(caseId: string): VerificationCase | null {
    return ProviderService.memoryCases.get(caseId) || null;
  }

  public static clearMemoryState(): void {
    this.memoryProviders.clear();
    this.memoryDeclarations.clear();
    this.memoryDocuments.clear();
    this.memoryCases.clear();
  }
}
