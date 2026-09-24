import { db } from "../../database/connection.js";
import {
  PublicProviderProfile,
  ServiceCatalogItem,
  ServiceVersionData,
  CatalogSearchFilters,
  ServiceDisclosureData,
} from "./types.ts";

export class CatalogService {
  public static memoryPublicProfiles = new Map<string, PublicProviderProfile>();
  public static memoryServices = new Map<string, ServiceCatalogItem>();
  public static memoryServiceVersions = new Map<string, ServiceVersionData[]>();

  public static readonly SEBI_DISCLAIMER =
    "stockiq does not guarantee provider performance, verify returns, or imply SEBI endorsement. All information is provided for discovery and regulatory disclosure purposes only.";

  /**
   * Retrieves verified public providers for discovery directory.
   * Strictly excludes private documents, storage references, officer notes, and contact credentials.
   */
  public async getPublicProviders(filters: CatalogSearchFilters = {}): Promise<PublicProviderProfile[]> {
    try {
      const pool = db.getPool();
      let query = `
        SELECT p.id AS "providerId",
               p.legal_name AS "legalName",
               p.trade_name AS "tradeName",
               p.provider_type AS "providerType",
               p.entity_type AS "entityType",
               p.sebi_registration_number AS "sebiRegistrationNumber",
               p.status AS "verificationStatus",
               p.registered_office_address AS "registeredOfficeAddress",
               p.compliance_officer_name AS "complianceOfficerName",
               p.compliance_officer_email AS "complianceOfficerEmail",
               p.valid_from AS "validFrom",
               pp.profile_summary AS "profileSummary",
               pp.permitted_business_info AS "permittedBusinessInfo",
               pp.jurisdiction AS "jurisdiction",
               (SELECT COUNT(*)::int FROM services s WHERE s.provider_id = p.id AND s.status = 'PUBLISHED') AS "publishedServicesCount"
        FROM provider_profiles p
        LEFT JOIN provider_public_profiles pp ON pp.provider_id = p.id
        WHERE p.status IN ('VERIFIED', 'APPROVED')
      `;
      const values: unknown[] = [];

      if (filters.providerType) {
        values.push(filters.providerType);
        query += ` AND p.provider_type = $${values.length}`;
      }
      if (filters.providerClassification) {
        values.push(filters.providerClassification);
        query += ` AND p.entity_type = $${values.length}`;
      }
      if (filters.location) {
        values.push(`%${filters.location}%`);
        query += ` AND p.registered_office_address ILIKE $${values.length}`;
      }
      if (filters.keyword) {
        values.push(`%${filters.keyword}%`);
        query += ` AND (p.legal_name ILIKE $${values.length} OR p.trade_name ILIKE $${values.length} OR pp.profile_summary ILIKE $${values.length})`;
      }

      query += ` ORDER BY p.legal_name ASC`;

      const { rows } = await pool.query(query, values);
      if (rows.length > 0) {
        return rows.map((r) => this.formatPublicProfileRow(r));
      }
      return this.getMemoryPublicProviders(filters);
    } catch {
      return this.getMemoryPublicProviders(filters);
    }
  }

  /**
   * Retrieves single public provider profile with clear distinction between registration, verification, and disclosures.
   */
  public async getPublicProviderProfile(providerId: string): Promise<PublicProviderProfile | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT p.id AS "providerId",
                p.legal_name AS "legalName",
                p.trade_name AS "tradeName",
                p.provider_type AS "providerType",
                p.entity_type AS "entityType",
                p.sebi_registration_number AS "sebiRegistrationNumber",
                p.status AS "verificationStatus",
                p.registered_office_address AS "registeredOfficeAddress",
                p.compliance_officer_name AS "complianceOfficerName",
                p.compliance_officer_email AS "complianceOfficerEmail",
                p.valid_from AS "validFrom",
                pp.profile_summary AS "profileSummary",
                pp.permitted_business_info AS "permittedBusinessInfo",
                pp.jurisdiction AS "jurisdiction",
                (SELECT COUNT(*)::int FROM services s WHERE s.provider_id = p.id AND s.status = 'PUBLISHED') AS "publishedServicesCount"
         FROM provider_profiles p
         LEFT JOIN provider_public_profiles pp ON pp.provider_id = p.id
         WHERE p.id = $1`,
        [providerId]
      );

      if (rows.length > 0) {
        const row = rows[0];
        if (!["VERIFIED", "APPROVED"].includes(row.verificationStatus)) {
          // Unverified or pending providers return neutral status profile
          return {
            id: row.providerId,
            providerId: row.providerId,
            displayName: row.tradeName || row.legalName,
            legalName: row.legalName,
            providerType: row.providerType,
            sebiRegistrationNumber: row.sebiRegistrationNumber,
            verificationStatus: "Verification status: pending/manual review",
            stockiqVerificationNotice: "Provider registration is currently undergoing compliance review.",
            sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
            entityType: row.entityType,
            jurisdiction: row.jurisdiction || "India",
            registeredOfficeAddress: row.registeredOfficeAddress,
            publishedServicesCount: 0,
          };
        }
        return this.formatPublicProfileRow(row);
      }

      for (const prof of CatalogService.memoryPublicProfiles.values()) {
        if (prof.providerId === providerId) return prof;
      }
      return this.getFallbackProviderProfile(providerId);
    } catch {
      for (const prof of CatalogService.memoryPublicProfiles.values()) {
        if (prof.providerId === providerId) return prof;
      }
      return this.getFallbackProviderProfile(providerId);
    }
  }

  private async getFallbackProviderProfile(providerId: string): Promise<PublicProviderProfile | null> {
    const { ProviderService } = await import("../providers/provider.service.ts");
    const providerService = new ProviderService();
    const provider = await providerService.getProviderById(providerId);
    if (!provider) return null;

    const isVerified = ["VERIFIED", "APPROVED"].includes(provider.status);
    return {
      id: provider.id,
      providerId: provider.id,
      displayName: provider.tradeName || provider.legalName,
      legalName: provider.legalName,
      providerType: provider.providerType,
      sebiRegistrationNumber: provider.sebiRegistrationNumber,
      verificationStatus: isVerified ? "Verified by stockiq Compliance Engine" : "Verification status: pending/manual review",
      stockiqVerificationNotice: isVerified
        ? "SEBI Registration Number verified based on official documentation and credentialing audit."
        : "Provider registration is currently undergoing compliance review.",
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      entityType: provider.entityType,
      jurisdiction: "India",
      registeredOfficeAddress: provider.registeredOfficeAddress,
      complianceOfficerName: provider.complianceOfficerName || undefined,
      complianceOfficerEmail: provider.complianceOfficerEmail || undefined,
      publishedServicesCount: 0,
    };
  }

  /**
   * Neutral public search and discovery for published services.
   * Completely excludes recommendation scoring, rankings, or popularity metrics.
   */
  public async getPublicServices(filters: CatalogSearchFilters = {}): Promise<ServiceCatalogItem[]> {
    try {
      const pool = db.getPool();
      let query = `
        SELECT s.id,
               s.provider_id AS "providerId",
               s.service_name AS "serviceName",
               s.service_category AS "serviceCategory",
               s.short_description AS "shortDescription",
               s.detailed_description AS "detailedDescription",
               s.service_type AS "serviceType",
               s.market_segment AS "marketSegment",
               s.eligibility_info AS "eligibilityInfo",
               s.pricing_reference AS "pricingReference",
               s.fee_in_paise AS "feeInPaise",
               s.billing_duration AS "billingDuration",
               s.status,
               s.current_published_version AS "currentPublishedVersion",
               s.created_at AS "createdAt",
               s.updated_at AS "updatedAt",
               p.legal_name AS "legalName",
               p.trade_name AS "tradeName",
               p.provider_type AS "providerType",
               p.sebi_registration_number AS "sebiRegistrationNumber",
               sd.risk_disclosure_text AS "riskDisclosureText",
               sd.methodology_reference AS "methodologyReference",
               sd.conflicts_disclosure AS "conflictsDisclosure",
               sd.regulatory_disclosure AS "regulatoryDisclosure",
               sd.performance_disclaimer AS "performanceDisclaimer"
        FROM services s
        JOIN provider_profiles p ON p.id = s.provider_id
        LEFT JOIN service_disclosures sd ON sd.service_id = s.id
        WHERE s.status = 'PUBLISHED'
      `;
      const values: unknown[] = [];

      if (filters.providerType) {
        values.push(filters.providerType);
        query += ` AND p.provider_type = $${values.length}`;
      }
      if (filters.serviceCategory) {
        values.push(filters.serviceCategory);
        query += ` AND s.service_category = $${values.length}`;
      }
      if (filters.marketSegment) {
        values.push(filters.marketSegment);
        query += ` AND s.market_segment = $${values.length}`;
      }
      if (filters.providerClassification) {
        values.push(filters.providerClassification);
        query += ` AND p.entity_type = $${values.length}`;
      }
      if (filters.location) {
        values.push(`%${filters.location}%`);
        query += ` AND p.registered_office_address ILIKE $${values.length}`;
      }
      if (filters.keyword) {
        values.push(`%${filters.keyword}%`);
        query += ` AND (s.service_name ILIKE $${values.length} OR s.short_description ILIKE $${values.length} OR s.detailed_description ILIKE $${values.length})`;
      }

      query += ` ORDER BY s.created_at DESC`;

      const { rows } = await pool.query(query, values);
      if (rows.length > 0) {
        return rows.map((r) => this.formatServiceCatalogItemRow(r));
      }
      return this.getMemoryPublicServices(filters);
    } catch {
      return this.getMemoryPublicServices(filters);
    }
  }

  /**
   * Retrieves detail for a specific published service.
   */
  public async getPublicServiceDetail(serviceId: string): Promise<ServiceCatalogItem | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT s.id,
                s.provider_id AS "providerId",
                s.service_name AS "serviceName",
                s.service_category AS "serviceCategory",
                s.short_description AS "shortDescription",
                s.detailed_description AS "detailedDescription",
                s.service_type AS "serviceType",
                s.market_segment AS "marketSegment",
                s.eligibility_info AS "eligibilityInfo",
                s.pricing_reference AS "pricingReference",
                s.fee_in_paise AS "feeInPaise",
                s.billing_duration AS "billingDuration",
                s.status,
                s.current_published_version AS "currentPublishedVersion",
                s.created_at AS "createdAt",
                s.updated_at AS "updatedAt",
                p.legal_name AS "legalName",
                p.trade_name AS "tradeName",
                p.provider_type AS "providerType",
                p.sebi_registration_number AS "sebiRegistrationNumber",
                sd.risk_disclosure_text AS "riskDisclosureText",
                sd.methodology_reference AS "methodologyReference",
                sd.conflicts_disclosure AS "conflictsDisclosure",
                sd.regulatory_disclosure AS "regulatoryDisclosure",
                sd.performance_disclaimer AS "performanceDisclaimer"
         FROM services s
         JOIN provider_profiles p ON p.id = s.provider_id
         LEFT JOIN service_disclosures sd ON sd.service_id = s.id
         WHERE s.id = $1 AND s.status = 'PUBLISHED'`,
        [serviceId]
      );

      if (rows.length > 0) {
        return this.formatServiceCatalogItemRow(rows[0]);
      }
      const item = CatalogService.memoryServices.get(serviceId);
      return item && item.status === "PUBLISHED" ? item : null;
    } catch {
      const item = CatalogService.memoryServices.get(serviceId);
      return item && item.status === "PUBLISHED" ? item : null;
    }
  }

  /**
   * Retrieves a specific historical version of a published service.
   */
  public async getPublicServiceVersionDetail(
    serviceId: string,
    versionNumber: number
  ): Promise<ServiceVersionData | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id,
                service_id AS "serviceId",
                version_number AS "versionNumber",
                title,
                description,
                disclosures,
                pricing_reference AS "pricingReference",
                terms_reference_text AS "termsReferenceText",
                status,
                created_by AS "createdBy",
                created_at AS "createdAt",
                published_at AS "publishedAt"
         FROM service_versions
         WHERE service_id = $1 AND version_number = $2 AND status = 'PUBLISHED'`,
        [serviceId, versionNumber]
      );

      if (rows.length > 0) {
        const row = rows[0];
        return {
          ...row,
          disclosures: typeof row.disclosures === "string" ? JSON.parse(row.disclosures) : row.disclosures,
        };
      }

      const versions = CatalogService.memoryServiceVersions.get(serviceId) || [];
      return versions.find((v) => v.versionNumber === versionNumber && v.status === "PUBLISHED") || null;
    } catch {
      const versions = CatalogService.memoryServiceVersions.get(serviceId) || [];
      return versions.find((v) => v.versionNumber === versionNumber && v.status === "PUBLISHED") || null;
    }
  }

  private formatPublicProfileRow(r: any): PublicProviderProfile {
    return {
      id: r.providerId,
      providerId: r.providerId,
      displayName: r.tradeName || r.legalName,
      legalName: r.legalName,
      providerType: r.providerType,
      sebiRegistrationNumber: r.sebiRegistrationNumber,
      verificationStatus: "Verified by stockiq Compliance Engine",
      stockiqVerificationNotice:
        "SEBI Registration Number verified based on official documentation and credentialing audit.",
      sebiDisclaimer: CatalogService.SEBI_DISCLAIMER,
      entityType: r.entityType,
      jurisdiction: r.jurisdiction || "India",
      registeredOfficeAddress: r.registeredOfficeAddress,
      complianceOfficerName: r.complianceOfficerName || undefined,
      complianceOfficerEmail: r.complianceOfficerEmail || undefined,
      profileSummary: r.profileSummary || undefined,
      permittedBusinessInfo: r.permittedBusinessInfo || undefined,
      verificationDate: r.validFrom ? new Date(r.validFrom).toISOString() : undefined,
      publishedServicesCount: parseInt(r.publishedServicesCount || "0", 10),
    };
  }

  private formatServiceCatalogItemRow(r: any): ServiceCatalogItem {
    const disclosures: ServiceDisclosureData = {
      providerType: r.providerType,
      serviceCategory: r.serviceCategory,
      marketSegment: r.marketSegment,
      riskDisclosureText:
        r.riskDisclosureText ||
        "Investment in securities market are subject to market risks. Read all the related documents carefully before investing.",
      methodologyReference: r.methodologyReference || undefined,
      conflictsDisclosure:
        r.conflictsDisclosure || "No material conflicts of interest exist except as disclosed in service terms.",
      regulatoryDisclosure:
        r.regulatoryDisclosure ||
        `Registration granted by SEBI (${r.sebiRegistrationNumber}) does not guarantee performance or assurance of returns.`,
      performanceDisclaimer:
        r.performanceDisclaimer || "Past performance is not indicative of future returns.",
    };

    return {
      id: r.id,
      providerId: r.providerId,
      providerDisplayName: r.tradeName || r.legalName,
      providerType: r.providerType,
      sebiRegistrationNumber: r.sebiRegistrationNumber,
      serviceName: r.serviceName,
      serviceCategory: r.serviceCategory,
      shortDescription: r.shortDescription,
      detailedDescription: r.detailedDescription,
      serviceType: r.serviceType,
      marketSegment: r.marketSegment,
      eligibilityInfo: r.eligibilityInfo || "RETAIL_INVESTORS",
      pricingReference: r.pricingReference,
      feeInPaise: parseInt(r.feeInPaise || "0", 10),
      billingDuration: r.billingDuration || "MONTHLY",
      status: r.status,
      currentPublishedVersion: r.currentPublishedVersion || 1,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
      disclosures,
    };
  }

  private getMemoryPublicProviders(filters: CatalogSearchFilters): PublicProviderProfile[] {
    let list = Array.from(CatalogService.memoryPublicProfiles.values());
    if (filters.providerType) {
      list = list.filter((p) => p.providerType === filters.providerType);
    }
    if (filters.providerClassification) {
      list = list.filter((p) => p.entityType === filters.providerClassification);
    }
    if (filters.location) {
      list = list.filter((p) => p.registeredOfficeAddress.toLowerCase().includes(filters.location!.toLowerCase()));
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      list = list.filter(
        (p) =>
          p.displayName.toLowerCase().includes(kw) ||
          p.legalName.toLowerCase().includes(kw) ||
          (p.profileSummary && p.profileSummary.toLowerCase().includes(kw))
      );
    }
    return list;
  }

  private getMemoryPublicServices(filters: CatalogSearchFilters): ServiceCatalogItem[] {
    let list = Array.from(CatalogService.memoryServices.values()).filter((s) => s.status === "PUBLISHED");
    if (filters.providerType) {
      list = list.filter((s) => s.providerType === filters.providerType);
    }
    if (filters.serviceCategory) {
      list = list.filter((s) => s.serviceCategory === filters.serviceCategory);
    }
    if (filters.marketSegment) {
      list = list.filter((s) => s.marketSegment === filters.marketSegment);
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      list = list.filter(
        (s) =>
          s.serviceName.toLowerCase().includes(kw) ||
          s.shortDescription.toLowerCase().includes(kw) ||
          s.detailedDescription.toLowerCase().includes(kw)
      );
    }
    return list;
  }
}
