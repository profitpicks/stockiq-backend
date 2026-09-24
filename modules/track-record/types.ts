/**
 * stockiq - Track Record Domain Boundary Contracts
 *
 * Implements methodology versioning and verification provenance tiers:
 * A. Provider-reported outcome
 * B. Outcome verified using approved market-data source
 * C. External/PaRRVA verified outcome
 */

export const VerificationTiers = {
  PROVIDER_REPORTED: "PROVIDER_REPORTED",
  MARKET_DATA_VERIFIED: "MARKET_DATA_VERIFIED",
  EXTERNAL_VERIFIED: "EXTERNAL_VERIFIED",
} as const;

export type VerificationTier = (typeof VerificationTiers)[keyof typeof VerificationTiers];

export interface TrackRecordMetric {
  serviceId: string;
  providerId: string;
  methodologyVersion: string; // e.g. "v1.0"
  periodStart: string;
  periodEnd: string;
  totalRecommendations: number;
  openRecommendations: number;
  closedRecommendations: number;
  targetHitCount: number;
  stopLossHitCount: number;
  averageHoldingPeriodDays: number;
  verificationTier: VerificationTier;
  parrvaReference?: string;
  calculatedAt: string;
}
