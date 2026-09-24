/**
 * stockiq - Service Domain Boundary Contracts
 *
 * Implements immutable service versioning, service catalog, and regulatory disclosure structures.
 */

export const ServiceBillingFrequencies = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  HALF_YEARLY: "HALF_YEARLY",
  ANNUALLY: "ANNUALLY",
  ONE_TIME: "ONE_TIME",
} as const;

export type ServiceBillingFrequency =
  (typeof ServiceBillingFrequencies)[keyof typeof ServiceBillingFrequencies];

export const ServiceStatuses = {
  DRAFT: "DRAFT",
  PENDING_REVIEW: "PENDING_REVIEW",
  PUBLISHED: "PUBLISHED",
  PAUSED: "PAUSED",
  ARCHIVED: "ARCHIVED",
  REJECTED: "REJECTED",
} as const;

export type ServiceStatus =
  (typeof ServiceStatuses)[keyof typeof ServiceStatuses];

export interface ServiceDisclosureData {
  providerType: string;
  serviceCategory: string;
  marketSegment: string;
  riskDisclosureText: string;
  methodologyReference?: string;
  conflictsDisclosure: string;
  regulatoryDisclosure: string;
  performanceDisclaimer: string;
}

export interface ServiceDefinition {
  id: string;
  providerId: string;
  serviceName: string;
  serviceCategory: string;
  shortDescription: string;
  detailedDescription: string;
  serviceType: string;
  marketSegment: string;
  eligibilityInfo: string;
  pricingReference: string;
  feeInPaise: number;
  billingDuration: ServiceBillingFrequency;
  status: ServiceStatus;
  currentPublishedVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceVersionData {
  id: string;
  serviceId: string;
  versionNumber: number;
  title: string;
  description: string;
  disclosures: ServiceDisclosureData;
  pricingReference: string;
  termsReferenceText?: string;
  status: ServiceStatus;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
}

export interface PublicProviderProfile {
  id: string;
  providerId: string;
  displayName: string;
  legalName: string;
  providerType: "RESEARCH_ANALYST" | "INVESTMENT_ADVISER";
  sebiRegistrationNumber: string;
  verificationStatus: string;
  stockiqVerificationNotice: string;
  sebiDisclaimer: string;
  entityType: "INDIVIDUAL" | "NON_INDIVIDUAL";
  jurisdiction: string;
  registeredOfficeAddress: string;
  complianceOfficerName?: string;
  complianceOfficerEmail?: string;
  profileSummary?: string;
  permittedBusinessInfo?: string;
  verificationDate?: string;
  publishedServicesCount: number;
}

export interface ServiceCatalogItem extends ServiceDefinition {
  providerDisplayName: string;
  providerType: string;
  sebiRegistrationNumber: string;
  disclosures?: ServiceDisclosureData;
}

export interface CatalogSearchFilters {
  providerType?: string;
  serviceCategory?: string;
  marketSegment?: string;
  providerClassification?: string;
  location?: string;
  keyword?: string;
  status?: ServiceStatus;
  page?: number;
  limit?: number;
}
