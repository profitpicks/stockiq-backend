/**
 * stockiq - Agreement Domain Boundary Contracts
 *
 * Implements client service agreement execution, versioning, and eSign consent tracking.
 */

export const AgreementStatuses = {
  PENDING_SIGNATURE: "PENDING_SIGNATURE",
  EXECUTED: "EXECUTED",
  TERMINATED: "TERMINATED",
  EXPIRED: "EXPIRED",
} as const;

export type AgreementStatus = (typeof AgreementStatuses)[keyof typeof AgreementStatuses];

export interface ClientServiceAgreement {
  id: string;
  userId: string;
  providerId: string;
  serviceId: string;
  templateVersion: string;
  agreementHash: string; // SHA-256 of agreement terms text
  status: AgreementStatus;
  eSignReferenceId?: string;
  executedAt?: string;
  termsAndConditionsUrl: string;
  feeSchedulePaise: number;
}
