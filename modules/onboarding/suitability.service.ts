import { db } from "../../database/connection.js";
import { InvestorClassification } from "./types.js";
import { RiskProfile } from "./types.js";

export type SuitabilityStatus = "ELIGIBLE" | "NOT_ELIGIBLE" | "REVIEW_REQUIRED";

export interface SuitabilityEvaluationResult {
  status: SuitabilityStatus;
  reason: string;
  evaluatedAt: string;
  ruleVersion: string;
}

export class SuitabilityService {
  /**
   * Deterministically evaluates suitability based on investor classification, risk profile, and service parameters.
   * Employs configurable rules versioned as 'suitability-rules-v1'.
   */
  public async evaluateSuitability(
    investorClassification: InvestorClassification,
    riskProfile: RiskProfile,
    serviceId: string
  ): Promise<SuitabilityEvaluationResult> {
    const pool = db.getPool();

    // Fetch service metadata from existing master catalog
    const { rows } = await pool.query<{
      id: string;
      serviceName: string;
      serviceCategory: string;
      eligibilityInfo: string;
    }>(
      `SELECT id, service_name as "serviceName", service_category as "serviceCategory", eligibility_info as "eligibilityInfo" 
       FROM services WHERE id = $1`,
      [serviceId]
    );

    const service = rows[0];
    if (!service) {
      return {
        status: "NOT_ELIGIBLE",
        reason: "Service not found in catalog",
        evaluatedAt: new Date().toISOString(),
        ruleVersion: "suitability-rules-v1",
      };
    }

    const { eligibilityInfo, serviceCategory } = service;

    // Check Eligibility Constraints
    if (eligibilityInfo === "ACCREDITED_INVESTORS_ONLY" && investorClassification !== "ACCREDITED_INVESTOR") {
      return {
        status: "NOT_ELIGIBLE",
        reason: `Service requires ACCREDITED_INVESTOR classification. User is ${investorClassification}.`,
        evaluatedAt: new Date().toISOString(),
        ruleVersion: "suitability-rules-v1",
      };
    }

    if (eligibilityInfo === "HNI_ONLY" && investorClassification === "RETAIL") {
      return {
        status: "NOT_ELIGIBLE",
        reason: `Service requires HNI or ACCREDITED_INVESTOR classification. User is RETAIL.`,
        evaluatedAt: new Date().toISOString(),
        ruleVersion: "suitability-rules-v1",
      };
    }

    // Check Risk Constraints
    const isHighRiskCategory = 
      serviceCategory.toLowerCase().includes("derivative") ||
      serviceCategory.toLowerCase().includes("f&o") ||
      serviceCategory.toLowerCase().includes("futures") ||
      serviceCategory.toLowerCase().includes("options") ||
      serviceCategory.toLowerCase().includes("leveraged");

    if (isHighRiskCategory && riskProfile === "LOW") {
      return {
        status: "REVIEW_REQUIRED",
        reason: "High-risk derivative services require a manual suitability review for low risk-profile investors.",
        evaluatedAt: new Date().toISOString(),
        ruleVersion: "suitability-rules-v1",
      };
    }

    if (riskProfile === "LOW" && eligibilityInfo === "HIGH_RISK_ONLY") {
      return {
        status: "NOT_ELIGIBLE",
        reason: "Investor risk profile (LOW) is incompatible with High Risk service requirements.",
        evaluatedAt: new Date().toISOString(),
        ruleVersion: "suitability-rules-v1",
      };
    }

    return {
      status: "ELIGIBLE",
      reason: "Investor satisfies all classification eligibility and risk profile parameters.",
      evaluatedAt: new Date().toISOString(),
      ruleVersion: "suitability-rules-v1",
    };
  }
}

export const suitabilityService = new SuitabilityService();
