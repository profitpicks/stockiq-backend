/**
 * stockiq - Compliance Domain Boundary Contracts
 *
 * Implements regulatory compliance rules, mandatory disclosure standards, and legal hold registries.
 */

export interface RegulatoryReference {
  circularNumber: string;
  issuedDate: string; // YYYY-MM-DD
  title: string;
  subject: "RA_FRAMEWORK" | "IA_FRAMEWORK" | "PARRVA" | "ADVERTISING_CODE" | "GRIEVANCE_REDRESSAL";
  effectiveDate: string;
  isMandatory: boolean;
}

export interface MandatoryDisclaimer {
  code: string;
  text: string;
  applicableRole: "RA" | "IA" | "PLATFORM";
  version: string;
  isStatutory: boolean;
}

export interface LegalHold {
  id: string;
  entityType: "USER" | "PROVIDER" | "SERVICE" | "RECOMMENDATION";
  entityId: string;
  reason: string;
  issuedByAdminId: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}
