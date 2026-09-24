/**
 * stockiq - Onboarding Domain Boundary Contracts
 *
 * Implements investor KYC, suitability assessment, and strict classification
 * separating Retail, HNI, and Accredited Investor tiers.
 */

export const InvestorClassifications = {
  RETAIL: "RETAIL",
  HNI: "HNI",
  ACCREDITED_INVESTOR: "ACCREDITED_INVESTOR",
} as const;

export type InvestorClassification =
  (typeof InvestorClassifications)[keyof typeof InvestorClassifications];

export const RiskProfiles = {
  LOW: "LOW",
  MODERATE: "MODERATE",
  HIGH: "HIGH",
  VERY_HIGH: "VERY_HIGH",
} as const;

export type RiskProfile = (typeof RiskProfiles)[keyof typeof RiskProfiles];

export interface InvestorOnboardingRecord {
  userId: string;
  kycVerified: boolean;
  kycReference?: string;
  classification: InvestorClassification;
  accreditationCertificateReference?: string;
  riskProfile: RiskProfile;
  riskAssessmentScore: number;
  questionnaireVersion: string;
  assessedAt: string;
  annualIncomeBracket: string;
  investmentExperienceYears: number;
}
