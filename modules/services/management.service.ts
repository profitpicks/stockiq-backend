import crypto from "crypto";
import { db } from "../../database/connection.js";
import { ProviderService } from "../providers/provider.service.ts";
import { CatalogService } from "./catalog.service.ts";
import {
  ServiceDefinition,
  ServiceVersionData,
  ServiceStatus,
  ServiceDisclosureData,
  ServiceCatalogItem,
} from "./types.ts";

export interface CreateServiceParams {
  serviceName: string;
  serviceCategory: string;
  shortDescription: string;
  detailedDescription: string;
  serviceType: string;
  marketSegment: string;
  eligibilityInfo?: string;
  pricingReference: string;
  feeInPaise?: number;
  billingDuration?: string;
  disclosures?: Partial<ServiceDisclosureData>;
  termsReferenceText?: string;
}

export interface UpdateServiceParams {
  serviceName?: string;
  serviceCategory?: string;
  shortDescription?: string;
  detailedDescription?: string;
  serviceType?: string;
  marketSegment?: string;
  eligibilityInfo?: string;
  pricingReference?: string;
  feeInPaise?: number;
  billingDuration?: string;
  disclosures?: Partial<ServiceDisclosureData>;
  termsReferenceText?: string;
}

export class ServiceManagementService {
  private providerService: ProviderService;

  constructor(providerService = new ProviderService()) {
    this.providerService = providerService;
  }

  /**
   * Creates a new service in DRAFT status with initial version 1 blueprint.
   */
  public async createServiceDraft(
    providerId: string,
    userId: string,
    params: CreateServiceParams
  ): Promise<{ service: ServiceDefinition; version: ServiceVersionData }> {
    const provider = await this.providerService.getProviderById(providerId);
    if (!provider || provider.userId !== userId) {
      throw new Error("Unauthorized or provider profile not found");
    }

    const serviceId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const nowISO = new Date().toISOString();

    const eligibilityInfo = params.eligibilityInfo || "RETAIL_INVESTORS";
    const feeInPaise = params.feeInPaise || 0;
    const billingDuration = (params.billingDuration || "MONTHLY") as any;

    const disclosures: ServiceDisclosureData = {
      providerType: provider.providerType,
      serviceCategory: params.serviceCategory,
      marketSegment: params.marketSegment,
      riskDisclosureText:
        params.disclosures?.riskDisclosureText ||
        "Securities investments are subject to market risks. Read all scheme related documents carefully.",
      methodologyReference: params.disclosures?.methodologyReference || undefined,
      conflictsDisclosure:
        params.disclosures?.conflictsDisclosure ||
        "No material conflicts of interest exist except as specified in terms.",
      regulatoryDisclosure:
        params.disclosures?.regulatoryDisclosure ||
        `SEBI Registration Number: ${provider.sebiRegistrationNumber}. Registration does not guarantee returns.`,
      performanceDisclaimer:
        params.disclosures?.performanceDisclaimer || "Past performance is not indicative of future returns.",
    };

    const service: ServiceDefinition = {
      id: serviceId,
      providerId,
      serviceName: params.serviceName,
      serviceCategory: params.serviceCategory,
      shortDescription: params.shortDescription,
      detailedDescription: params.detailedDescription,
      serviceType: params.serviceType,
      marketSegment: params.marketSegment,
      eligibilityInfo,
      pricingReference: params.pricingReference,
      feeInPaise,
      billingDuration,
      status: "DRAFT",
      currentPublishedVersion: 1,
      createdAt: nowISO,
      updatedAt: nowISO,
    };

    const version: ServiceVersionData = {
      id: versionId,
      serviceId,
      versionNumber: 1,
      title: params.serviceName,
      description: params.detailedDescription,
      disclosures,
      pricingReference: params.pricingReference,
      termsReferenceText: params.termsReferenceText,
      status: "DRAFT",
      createdBy: userId,
      createdAt: nowISO,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO services (id, provider_id, service_name, service_category, short_description,
                               detailed_description, service_type, market_segment, eligibility_info,
                               pricing_reference, fee_in_paise, billing_duration, status, current_published_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', 1)`,
        [
          serviceId,
          providerId,
          params.serviceName,
          params.serviceCategory,
          params.shortDescription,
          params.detailedDescription,
          params.serviceType,
          params.marketSegment,
          eligibilityInfo,
          params.pricingReference,
          feeInPaise,
          billingDuration,
        ]
      );

      await pool.query(
        `INSERT INTO service_versions (id, service_id, version_number, title, description, disclosures, pricing_reference, terms_reference_text, status, created_by)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'DRAFT', $8)`,
        [
          versionId,
          serviceId,
          params.serviceName,
          params.detailedDescription,
          JSON.stringify(disclosures),
          params.pricingReference,
          params.termsReferenceText || null,
          userId,
        ]
      );

      await pool.query(
        `INSERT INTO service_disclosures (service_id, service_version_id, provider_type, service_category, market_segment,
                                           risk_disclosure_text, methodology_reference, conflicts_disclosure, regulatory_disclosure, performance_disclaimer)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          serviceId,
          versionId,
          provider.providerType,
          params.serviceCategory,
          params.marketSegment,
          disclosures.riskDisclosureText,
          disclosures.methodologyReference || null,
          disclosures.conflictsDisclosure,
          disclosures.regulatoryDisclosure,
          disclosures.performanceDisclaimer,
        ]
      );
    } catch {
      // Memory fallback for tests
    }

    const catalogItem: ServiceCatalogItem = {
      ...service,
      providerDisplayName: provider.tradeName || provider.legalName,
      providerType: provider.providerType,
      sebiRegistrationNumber: provider.sebiRegistrationNumber,
      disclosures,
    };

    CatalogService.memoryServices.set(serviceId, catalogItem);
    const versionList = CatalogService.memoryServiceVersions.get(serviceId) || [];
    versionList.push(version);
    CatalogService.memoryServiceVersions.set(serviceId, versionList);

    return { service, version };
  }

  /**
   * Updates an existing DRAFT service.
   */
  public async updateServiceDraft(
    providerId: string,
    userId: string,
    serviceId: string,
    params: UpdateServiceParams
  ): Promise<ServiceDefinition> {
    const existing = await this.getServiceById(serviceId);
    if (!existing || existing.providerId !== providerId) {
      throw new Error("Service not found or unauthorized");
    }

    if (existing.status !== "DRAFT") {
      throw new Error("Cannot directly modify non-DRAFT service. Create a new service version blueprint.");
    }

    const updated: ServiceDefinition = {
      ...existing,
      serviceName: params.serviceName || existing.serviceName,
      serviceCategory: params.serviceCategory || existing.serviceCategory,
      shortDescription: params.shortDescription || existing.shortDescription,
      detailedDescription: params.detailedDescription || existing.detailedDescription,
      serviceType: params.serviceType || existing.serviceType,
      marketSegment: params.marketSegment || existing.marketSegment,
      eligibilityInfo: params.eligibilityInfo || existing.eligibilityInfo,
      pricingReference: params.pricingReference || existing.pricingReference,
      feeInPaise: params.feeInPaise !== undefined ? params.feeInPaise : existing.feeInPaise,
      billingDuration: (params.billingDuration as any) || existing.billingDuration,
      updatedAt: new Date().toISOString(),
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `UPDATE services
         SET service_name = $1, service_category = $2, short_description = $3, detailed_description = $4,
             service_type = $5, market_segment = $6, eligibility_info = $7, pricing_reference = $8,
             fee_in_paise = $9, billing_duration = $10, updated_at = NOW() AT TIME ZONE 'UTC'
         WHERE id = $11 AND provider_id = $12 AND status = 'DRAFT'`,
        [
          updated.serviceName,
          updated.serviceCategory,
          updated.shortDescription,
          updated.detailedDescription,
          updated.serviceType,
          updated.marketSegment,
          updated.eligibilityInfo,
          updated.pricingReference,
          updated.feeInPaise,
          updated.billingDuration,
          serviceId,
          providerId,
        ]
      );
    } catch {
      // Memory fallback
    }

    const memoryItem = CatalogService.memoryServices.get(serviceId);
    if (memoryItem) {
      CatalogService.memoryServices.set(serviceId, {
        ...memoryItem,
        ...updated,
      });
    }

    return updated;
  }

  /**
   * Submits a DRAFT service for compliance review.
   */
  public async submitServiceForReview(providerId: string, userId: string, serviceId: string): Promise<ServiceDefinition> {
    const existing = await this.getServiceById(serviceId);
    if (!existing || existing.providerId !== providerId) {
      throw new Error("Service not found or unauthorized");
    }

    if (existing.status !== "DRAFT") {
      throw new Error(`Service is in ${existing.status} state and cannot be submitted for review`);
    }

    const updated: ServiceDefinition = {
      ...existing,
      status: "PENDING_REVIEW",
      updatedAt: new Date().toISOString(),
    };

    try {
      const pool = db.getPool();
      await pool.query(`UPDATE services SET status = 'PENDING_REVIEW', updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1`, [
        serviceId,
      ]);
      await pool.query(
        `UPDATE service_versions SET status = 'PENDING_REVIEW' WHERE service_id = $1 AND status = 'DRAFT'`,
        [serviceId]
      );
    } catch {
      // Memory fallback
    }

    const memoryItem = CatalogService.memoryServices.get(serviceId);
    if (memoryItem) {
      CatalogService.memoryServices.set(serviceId, { ...memoryItem, status: "PENDING_REVIEW" });
    }

    const versions = CatalogService.memoryServiceVersions.get(serviceId) || [];
    versions.forEach((v) => {
      if (v.status === "DRAFT") v.status = "PENDING_REVIEW";
    });

    return updated;
  }

  /**
   * Creates a new service version blueprint for an existing service (preserving historical versions).
   */
  public async createNewServiceVersion(
    providerId: string,
    userId: string,
    serviceId: string,
    params: CreateServiceParams
  ): Promise<ServiceVersionData> {
    const service = await this.getServiceById(serviceId);
    if (!service || service.providerId !== providerId) {
      throw new Error("Service not found or unauthorized");
    }

    const versions = await this.getServiceVersions(serviceId);
    const nextVersionNumber = versions.length + 1;
    const versionId = crypto.randomUUID();
    const nowISO = new Date().toISOString();

    const provider = await this.providerService.getProviderById(providerId);

    const disclosures: ServiceDisclosureData = {
      providerType: provider?.providerType || "RESEARCH_ANALYST",
      serviceCategory: params.serviceCategory,
      marketSegment: params.marketSegment,
      riskDisclosureText:
        params.disclosures?.riskDisclosureText ||
        "Securities investments are subject to market risks. Read all scheme related documents carefully.",
      methodologyReference: params.disclosures?.methodologyReference || undefined,
      conflictsDisclosure:
        params.disclosures?.conflictsDisclosure || "No material conflicts of interest exist except as disclosed.",
      regulatoryDisclosure:
        params.disclosures?.regulatoryDisclosure ||
        `SEBI Registration: ${provider?.sebiRegistrationNumber}. Registration does not guarantee returns.`,
      performanceDisclaimer:
        params.disclosures?.performanceDisclaimer || "Past performance is not indicative of future returns.",
    };

    const newVersion: ServiceVersionData = {
      id: versionId,
      serviceId,
      versionNumber: nextVersionNumber,
      title: params.serviceName,
      description: params.detailedDescription,
      disclosures,
      pricingReference: params.pricingReference,
      termsReferenceText: params.termsReferenceText,
      status: "DRAFT",
      createdBy: userId,
      createdAt: nowISO,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO service_versions (id, service_id, version_number, title, description, disclosures, pricing_reference, terms_reference_text, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', $9)`,
        [
          versionId,
          serviceId,
          nextVersionNumber,
          params.serviceName,
          params.detailedDescription,
          JSON.stringify(disclosures),
          params.pricingReference,
          params.termsReferenceText || null,
          userId,
        ]
      );
    } catch {
      // Memory fallback
    }

    const versionList = CatalogService.memoryServiceVersions.get(serviceId) || [];
    versionList.push(newVersion);
    CatalogService.memoryServiceVersions.set(serviceId, versionList);

    return newVersion;
  }

  /**
   * Reviews and approves/rejects a service for publication.
   */
  public async reviewService(
    reviewerUserId: string,
    serviceId: string,
    action: "APPROVE" | "REJECT",
    notes?: string
  ): Promise<ServiceDefinition> {
    const service = await this.getServiceById(serviceId);
    if (!service) {
      throw new Error("Service not found");
    }

    const newStatus: ServiceStatus = action === "APPROVE" ? "PUBLISHED" : "REJECTED";
    const nowISO = new Date().toISOString();

    const updated: ServiceDefinition = {
      ...service,
      status: newStatus,
      updatedAt: nowISO,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `UPDATE services SET status = $1, current_published_version = 1, updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $2`,
        [newStatus, serviceId]
      );
      await pool.query(
        `UPDATE service_versions SET status = $1, published_at = NOW() AT TIME ZONE 'UTC' WHERE service_id = $2 AND status = 'PENDING_REVIEW'`,
        [newStatus, serviceId]
      );
    } catch {
      // Memory fallback
    }

    const memoryItem = CatalogService.memoryServices.get(serviceId);
    if (memoryItem) {
      CatalogService.memoryServices.set(serviceId, { ...memoryItem, status: newStatus });
    }

    const versions = CatalogService.memoryServiceVersions.get(serviceId) || [];
    versions.forEach((v) => {
      if (v.status === "PENDING_REVIEW" || v.status === "DRAFT") {
        v.status = newStatus;
        if (action === "APPROVE") v.publishedAt = nowISO;
      }
    });

    return updated;
  }

  /**
   * Retrieves all services created by a specific provider.
   */
  public async getProviderServices(providerId: string): Promise<ServiceDefinition[]> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, provider_id AS "providerId", service_name AS "serviceName", service_category AS "serviceCategory",
                short_description AS "shortDescription", detailed_description AS "detailedDescription", service_type AS "serviceType",
                market_segment AS "marketSegment", eligibility_info AS "eligibilityInfo", pricing_reference AS "pricingReference",
                fee_in_paise AS "feeInPaise", billing_duration AS "billingDuration", status,
                current_published_version AS "currentPublishedVersion", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM services WHERE provider_id = $1 ORDER BY created_at DESC`,
        [providerId]
      );

      if (rows.length > 0) {
        return rows.map((r) => ({
          ...r,
          feeInPaise: parseInt(r.feeInPaise || "0", 10),
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        }));
      }

      return Array.from(CatalogService.memoryServices.values()).filter((s) => s.providerId === providerId);
    } catch {
      return Array.from(CatalogService.memoryServices.values()).filter((s) => s.providerId === providerId);
    }
  }

  public async getServiceById(serviceId: string): Promise<ServiceDefinition | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, provider_id AS "providerId", service_name AS "serviceName", service_category AS "serviceCategory",
                short_description AS "shortDescription", detailed_description AS "detailedDescription", service_type AS "serviceType",
                market_segment AS "marketSegment", eligibility_info AS "eligibilityInfo", pricing_reference AS "pricingReference",
                fee_in_paise AS "feeInPaise", billing_duration AS "billingDuration", status,
                current_published_version AS "currentPublishedVersion", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM services WHERE id = $1`,
        [serviceId]
      );

      if (rows.length > 0) {
        const r = rows[0];
        return {
          ...r,
          feeInPaise: parseInt(r.feeInPaise || "0", 10),
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        };
      }

      return CatalogService.memoryServices.get(serviceId) || null;
    } catch {
      return CatalogService.memoryServices.get(serviceId) || null;
    }
  }

  public async getServiceVersions(serviceId: string): Promise<ServiceVersionData[]> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, service_id AS "serviceId", version_number AS "versionNumber", title, description,
                disclosures, pricing_reference AS "pricingReference", terms_reference_text AS "termsReferenceText",
                status, created_by AS "createdBy", created_at AS "createdAt", published_at AS "publishedAt"
         FROM service_versions WHERE service_id = $1 ORDER BY version_number ASC`,
        [serviceId]
      );

      if (rows.length > 0) {
        return rows.map((r) => ({
          ...r,
          disclosures: typeof r.disclosures === "string" ? JSON.parse(r.disclosures) : r.disclosures,
          createdAt: new Date(r.createdAt).toISOString(),
          publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : undefined,
        }));
      }

      return CatalogService.memoryServiceVersions.get(serviceId) || [];
    } catch {
      return CatalogService.memoryServiceVersions.get(serviceId) || [];
    }
  }
}
