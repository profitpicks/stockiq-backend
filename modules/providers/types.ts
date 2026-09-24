/**
 * stockiq - Provider Domain Boundary Contracts
 *
 * Distinguishes between RA (Research Analyst) and IA (Investment Adviser),
 * and individual vs non-individual (corporate/LLP) registrations under SEBI regulations.
 */

export const ProviderTypes = {
  RESEARCH_ANALYST: "RESEARCH_ANALYST", // RA
  INVESTMENT_ADVISER: "INVESTMENT_ADVISER", // IA
} as const;

export type ProviderType = (typeof ProviderTypes)[keyof typeof ProviderTypes];

export const ProviderEntityTypes = {
  INDIVIDUAL: "INDIVIDUAL",
  NON_INDIVIDUAL: "NON_INDIVIDUAL", // Corporate, LLP, Partnership
} as const;

export type ProviderEntityType = (typeof ProviderEntityTypes)[keyof typeof ProviderEntityTypes];

export const ProviderStatuses = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  UNDER_VERIFICATION: "UNDER_VERIFICATION",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;

export type ProviderStatus = (typeof ProviderStatuses)[keyof typeof ProviderStatuses];

export interface ProviderRegistration {
  id: string;
  userId: string;
  providerType: ProviderType;
  entityType: ProviderEntityType;
  legalName: string;
  tradeName?: string;
  registrationAuthority?: string; // Default: "SEBI"
  sebiRegistrationNumber: string; // Supplied registration number
  formatValidationStatus?: "STANDARD_VALIDATED" | "NON_STANDARD_MANUAL_REVIEW";
  validFrom: string; // YYYY-MM-DD
  validTill?: string; // YYYY-MM-DD
  isPerpetual?: boolean;
  status: ProviderStatus;
  complianceOfficerName?: string;
  complianceOfficerEmail?: string;
  registeredOfficeAddress: string;
  isNismCertified: boolean;
  panNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderDeclaration {
  id: string;
  providerId: string;
  declarationType: string;
  isDeclared: boolean;
  declaredAt: string;
  ipAddress?: string;
}

export interface ProviderDocument {
  id: string;
  providerId: string;
  documentType: string;
  version: number;
  storageReference: string; // Private storage reference path (No public URLs)
  fileName: string;
  fileHash: string; // Cryptographic SHA-256 digest
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: string;
  uploaderId?: string;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
}

export const VerificationCaseStatuses = {
  PENDING: "PENDING",
  IN_REVIEW: "IN_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  MORE_INFO_REQUIRED: "MORE_INFO_REQUIRED",
  SUSPENDED: "SUSPENDED",
} as const;

export type VerificationCaseStatus = (typeof VerificationCaseStatuses)[keyof typeof VerificationCaseStatuses];

export interface VerificationCase {
  id: string;
  providerId: string;
  assignedOfficerId?: string;
  status: VerificationCaseStatus;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationEvent {
  id: string;
  verificationCaseId: string;
  providerId?: string;
  actorId: string;
  action: string;
  previousState?: string;
  newState?: string;
  notes?: string;
  correlationId?: string;
  createdAt: string;
}

