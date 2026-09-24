/**
 * stockiq - Past Performance Verification (PaRRVA) Adapter Contract & Mock Implementation
 *
 * Implements the PAST_PERFORMANCE_VERIFICATION abstraction aligned with
 * SEBI's PaRRVA framework.
 *
 * NOTE: Does NOT invent an official PaRRVA API. Provides a clean contract
 * so official integration can be plugged in when specifications are operationalized.
 */

export const ParrvaVerificationStatuses = {
  NOT_APPLICABLE: "NOT_APPLICABLE",
  NOT_SUBMITTED: "NOT_SUBMITTED",
  SUBMITTED: "SUBMITTED",
  UNDER_VERIFICATION: "UNDER_VERIFICATION",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export type ParrvaVerificationStatus =
  (typeof ParrvaVerificationStatuses)[keyof typeof ParrvaVerificationStatuses];

export interface ParrvaSubmissionParams {
  providerId: string;
  sebiRegistrationNumber: string;
  serviceId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  applicableMethodology: string;
  documentReference?: string;
}

export interface ParrvaRecord {
  verificationReference: string;
  verificationProvider: string; // e.g. 'PaRRVA'
  serviceId: string;
  providerId: string;
  status: ParrvaVerificationStatus;
  periodStart: string;
  periodEnd: string;
  verificationDate?: string;
  source: string;
  effectiveDate: string;
  expiryDate?: string;
  methodologyDescription: string;
  isMock: boolean;
}

export interface ParrvaAdapter {
  isOperational(): boolean;
  submitForVerification(params: ParrvaSubmissionParams): Promise<ParrvaRecord>;
  getVerificationStatus(verificationReference: string): Promise<ParrvaRecord | null>;
}

/**
 * DEVELOPMENT/TEST ONLY: Mock PaRRVA Adapter
 *
 * Simulates external performance verification lifecycle for test environments.
 * NOT AN OFFICIAL SEBI/PaRRVA INTEGRATION.
 */
export class MockParrvaAdapter implements ParrvaAdapter {
  public static readonly IS_MOCK = true;
  private records = new Map<string, ParrvaRecord>();

  isOperational(): boolean {
    return true;
  }

  async submitForVerification(params: ParrvaSubmissionParams): Promise<ParrvaRecord> {
    const reference = `PARRVA-MOCK-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const record: ParrvaRecord = {
      verificationReference: reference,
      verificationProvider: "PaRRVA (MOCK ADAPTER - DEV ONLY)",
      serviceId: params.serviceId,
      providerId: params.providerId,
      status: ParrvaVerificationStatuses.VERIFIED,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      verificationDate: new Date().toISOString().split("T")[0],
      source: "MOCK_PARRVA_RECORD",
      effectiveDate: new Date().toISOString().split("T")[0],
      methodologyDescription: params.applicableMethodology,
      isMock: true,
    };

    this.records.set(reference, record);
    return record;
  }

  async getVerificationStatus(verificationReference: string): Promise<ParrvaRecord | null> {
    return this.records.get(verificationReference) || null;
  }
}
