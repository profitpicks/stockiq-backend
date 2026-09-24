import { db } from "../../database/connection.js";
import { RiskProfile, RiskProfiles } from "./types.js";

export interface RiskAssessmentInput {
  userId: string;
  questionnaireVersion: string;
  responses: Record<string, string | number>;
  reassessmentReason?: string;
}

export interface RiskAssessmentRecord {
  id: string;
  userId: string;
  questionnaireVersion: string;
  responses: Record<string, string | number>;
  calculatedRiskCategory: RiskProfile;
  calculationMethodologyVersion: string;
  status: "PENDING" | "COMPLETED" | "EXPIRED";
  assessedAt: string;
  expiresAt: string | null;
  reassessmentReason: string | null;
  createdAt: string;
}

export class RiskService {
  /**
   * Deterministically calculates the risk profile from responses.
   */
  public calculateRisk(
    questionnaireVersion: string,
    responses: Record<string, string | number>
  ): { riskCategory: RiskProfile; methodologyVersion: string } {
    let score = 0;
    for (const key of Object.keys(responses)) {
      const val = responses[key];
      const parsedVal = typeof val === "number" ? val : parseInt(String(val), 10);
      if (!isNaN(parsedVal)) {
        score += parsedVal;
      }
    }

    let riskCategory: RiskProfile = RiskProfiles.LOW;
    if (score <= 10) {
      riskCategory = RiskProfiles.LOW;
    } else if (score <= 20) {
      riskCategory = RiskProfiles.MODERATE;
    } else {
      riskCategory = RiskProfiles.HIGH;
    }

    return {
      riskCategory,
      methodologyVersion: `${questionnaireVersion}-det-v1`,
    };
  }

  /**
   * Submits a new risk assessment, preserving previous assessments in history.
   */
  public async submitAssessment(input: RiskAssessmentInput): Promise<RiskAssessmentRecord> {
    const { riskCategory, methodologyVersion } = this.calculateRisk(
      input.questionnaireVersion,
      input.responses
    );

    const pool = db.getPool();

    // Expire any existing completed assessments for the user
    await pool.query(
      "UPDATE risk_assessments SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'COMPLETED'",
      [input.userId]
    );

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Valid for 1 year

    const { rows } = await pool.query<RiskAssessmentRecord>(
      `INSERT INTO risk_assessments (
        user_id, questionnaire_version, responses, calculated_risk_category, 
        calculation_methodology_version, status, expires_at, reassessment_reason
      ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, $7)
      RETURNING 
        id, user_id as "userId", questionnaire_version as "questionnaireVersion", 
        responses, calculated_risk_category as "calculatedRiskCategory", 
        calculation_methodology_version as "calculationMethodologyVersion", 
        status, assessed_at as "assessedAt", expires_at as "expiresAt", 
        reassessment_reason as "reassessmentReason", created_at as "createdAt"`,
      [
        input.userId,
        input.questionnaireVersion,
        JSON.stringify(input.responses),
        riskCategory,
        methodologyVersion,
        expiresAt.toISOString(),
        input.reassessmentReason || null,
      ]
    );

    const record = rows[0];
    if (!record) {
      throw new Error("Failed to create risk assessment");
    }

    return record;
  }

  /**
   * Fetches latest active assessment for a user.
   */
  public async getLatestAssessment(userId: string): Promise<RiskAssessmentRecord | null> {
    const pool = db.getPool();
    const { rows } = await pool.query<RiskAssessmentRecord>(
      `SELECT 
        id, user_id as "userId", questionnaire_version as "questionnaireVersion", 
        responses, calculated_risk_category as "calculatedRiskCategory", 
        calculation_methodology_version as "calculationMethodologyVersion", 
        status, assessed_at as "assessedAt", expires_at as "expiresAt", 
        reassessment_reason as "reassessmentReason", created_at as "createdAt"
      FROM risk_assessments 
      WHERE user_id = $1 AND status = 'COMPLETED'
      ORDER BY assessed_at DESC 
      LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  /**
   * Fetches all assessment history for a user.
   */
  public async getAssessmentHistory(userId: string): Promise<RiskAssessmentRecord[]> {
    const pool = db.getPool();
    const { rows } = await pool.query<RiskAssessmentRecord>(
      `SELECT 
        id, user_id as "userId", questionnaire_version as "questionnaireVersion", 
        responses, calculated_risk_category as "calculatedRiskCategory", 
        calculation_methodology_version as "calculationMethodologyVersion", 
        status, assessed_at as "assessedAt", expires_at as "expiresAt", 
        reassessment_reason as "reassessmentReason", created_at as "createdAt"
      FROM risk_assessments 
      WHERE user_id = $1 
      ORDER BY assessed_at DESC`,
      [userId]
    );
    return rows;
  }
}

export const riskService = new RiskService();
