import { db } from "../../database/connection.js";
import { InvestorClassification, InvestorClassifications } from "./types.js";

export type OnboardingState =
  | "NOT_STARTED"
  | "PROFILE_PENDING"
  | "CLASSIFICATION_PENDING"
  | "RISK_ASSESSMENT_PENDING"
  | "SUITABILITY_REVIEW"
  | "AGREEMENTS_PENDING"
  | "COMPLETED"
  | "REQUIRES_REVIEW"
  | "SUSPENDED";

export interface OnboardingProfile {
  userId: string;
  onboardingStatus: OnboardingState;
  classification: InvestorClassification;
  annualIncomeBracket: string | null;
  investmentExperienceYears: number;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationEvidenceInput {
  userId: string;
  classification: InvestorClassification;
  evidenceType: string;
  evidenceReference: string;
}

export interface ClassificationEvidenceRecord {
  id: string;
  userId: string;
  classification: InvestorClassification;
  evidenceType: string;
  evidenceReference: string;
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
  verifiedBy: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

export class OnboardingService {
  private allowedTransitions: Record<OnboardingState, OnboardingState[]> = {
    NOT_STARTED: ["PROFILE_PENDING", "REQUIRES_REVIEW", "SUSPENDED"],
    PROFILE_PENDING: ["CLASSIFICATION_PENDING", "RISK_ASSESSMENT_PENDING", "REQUIRES_REVIEW", "SUSPENDED"],
    CLASSIFICATION_PENDING: ["RISK_ASSESSMENT_PENDING", "REQUIRES_REVIEW", "SUSPENDED"],
    RISK_ASSESSMENT_PENDING: ["SUITABILITY_REVIEW", "REQUIRES_REVIEW", "SUSPENDED"],
    SUITABILITY_REVIEW: ["AGREEMENTS_PENDING", "REQUIRES_REVIEW", "SUSPENDED"],
    AGREEMENTS_PENDING: ["COMPLETED", "REQUIRES_REVIEW", "SUSPENDED"],
    COMPLETED: ["PROFILE_PENDING", "RISK_ASSESSMENT_PENDING", "SUSPENDED"],
    REQUIRES_REVIEW: ["PROFILE_PENDING", "CLASSIFICATION_PENDING", "RISK_ASSESSMENT_PENDING", "AGREEMENTS_PENDING", "COMPLETED", "SUSPENDED"],
    SUSPENDED: ["REQUIRES_REVIEW", "NOT_STARTED"],
  };

  /**
   * Fetches or creates an onboarding profile for a user.
   */
  public async getOrCreateProfile(userId: string): Promise<OnboardingProfile> {
    const pool = db.getPool();

    // Check if profile exists
    const { rows } = await pool.query<OnboardingProfile>(
      `SELECT 
        user_id as "userId", onboarding_status as "onboardingStatus", 
        classification, annual_income_bracket as "annualIncomeBracket", 
        investment_experience_years as "investmentExperienceYears", 
        onboarding_completed_at as "onboardingCompletedAt", 
        created_at as "createdAt", updated_at as "updatedAt"
      FROM investor_profiles WHERE user_id = $1`,
      [userId]
    );

    if (rows[0]) {
      return rows[0];
    }

    // Insert new profile
    const { rows: insertRows } = await pool.query<OnboardingProfile>(
      `INSERT INTO investor_profiles (user_id, onboarding_status, classification)
       VALUES ($1, 'NOT_STARTED', 'RETAIL')
       RETURNING 
        user_id as "userId", onboarding_status as "onboardingStatus", 
        classification, annual_income_bracket as "annualIncomeBracket", 
        investment_experience_years as "investmentExperienceYears", 
        onboarding_completed_at as "onboardingCompletedAt", 
        created_at as "createdAt", updated_at as "updatedAt"`,
      [userId]
    );

    const newProfile = insertRows[0];
    if (!newProfile) {
      throw new Error("Failed to initialize onboarding profile");
    }

    return newProfile;
  }

  /**
   * Performs a transition of onboarding state.
   */
  public async transitionState(userId: string, targetState: OnboardingState): Promise<OnboardingProfile> {
    const profile = await this.getOrCreateProfile(userId);
    const currentState = profile.onboardingStatus;

    if (currentState === targetState) {
      return profile;
    }

    const allowed = this.allowedTransitions[currentState] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Invalid state transition: Cannot transition from ${currentState} to ${targetState}`);
    }

    const pool = db.getPool();
    const completedAt = targetState === "COMPLETED" ? new Date().toISOString() : null;

    const { rows } = await pool.query<OnboardingProfile>(
      `UPDATE investor_profiles 
       SET onboarding_status = $1, onboarding_completed_at = COALESCE($2, onboarding_completed_at), updated_at = NOW() AT TIME ZONE 'UTC'
       WHERE user_id = $3
       RETURNING 
        user_id as "userId", onboarding_status as "onboardingStatus", 
        classification, annual_income_bracket as "annualIncomeBracket", 
        investment_experience_years as "investmentExperienceYears", 
        onboarding_completed_at as "onboardingCompletedAt", 
        created_at as "createdAt", updated_at as "updatedAt"`,
      [targetState, completedAt, userId]
    );

    const updated = rows[0];
    if (!updated) {
      throw new Error("Failed to transition onboarding state");
    }

    return updated;
  }

  /**
   * Updates basic profile details.
   */
  public async updateProfileDetails(
    userId: string,
    details: { annualIncomeBracket?: string; investmentExperienceYears?: number }
  ): Promise<OnboardingProfile> {
    const pool = db.getPool();
    
    // Ensure profile is initialized
    await this.getOrCreateProfile(userId);

    const { rows } = await pool.query<OnboardingProfile>(
      `UPDATE investor_profiles 
       SET 
         annual_income_bracket = COALESCE($1, annual_income_bracket), 
         investment_experience_years = COALESCE($2, investment_experience_years),
         updated_at = NOW() AT TIME ZONE 'UTC'
       WHERE user_id = $3
       RETURNING 
        user_id as "userId", onboarding_status as "onboardingStatus", 
        classification, annual_income_bracket as "annualIncomeBracket", 
        investment_experience_years as "investmentExperienceYears", 
        onboarding_completed_at as "onboardingCompletedAt", 
        created_at as "createdAt", updated_at as "updatedAt"`,
      [details.annualIncomeBracket || null, details.investmentExperienceYears || null, userId]
    );

    const updated = rows[0];
    if (!updated) {
      throw new Error("Failed to update profile details");
    }

    return updated;
  }

  /**
   * Submits classification evidence.
   */
  public async submitEvidence(input: ClassificationEvidenceInput): Promise<ClassificationEvidenceRecord> {
    const pool = db.getPool();

    // Delete existing evidence for this user/classification to allow updates
    await pool.query(
      "DELETE FROM classification_evidence WHERE user_id = $1 AND classification = $2",
      [input.userId, input.classification]
    );

    const { rows } = await pool.query<ClassificationEvidenceRecord>(
      `INSERT INTO classification_evidence (user_id, classification, evidence_type, evidence_reference, verification_status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING 
         id, user_id as "userId", classification, evidence_type as "evidenceType", 
         evidence_reference as "evidenceReference", verification_status as "verificationStatus", 
         verified_by as "verifiedBy", verified_at as "verifiedAt", expires_at as "expiresAt", 
         notes, created_at as "createdAt"`,
      [input.userId, input.classification, input.evidenceType, input.evidenceReference]
    );

    const record = rows[0];
    if (!record) {
      throw new Error("Failed to submit classification evidence");
    }

    return record;
  }

  /**
   * Approves or rejects a classification evidence submission (Compliance officer role).
   */
  public async verifyEvidence(
    evidenceId: string,
    verifierId: string,
    status: "APPROVED" | "REJECTED",
    notes?: string
  ): Promise<ClassificationEvidenceRecord> {
    if (status !== "APPROVED" && status !== "REJECTED") {
      throw new Error("Invalid verification status");
    }

    const pool = db.getPool();

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Fetch evidence
      const { rows: evRows } = await client.query<ClassificationEvidenceRecord>(
        `SELECT id, user_id as "userId", classification, verification_status as "verificationStatus"
         FROM classification_evidence WHERE id = $1`,
        [evidenceId]
      );

      const ev = evRows[0];
      if (!ev) {
        throw new Error("Evidence record not found");
      }

      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 2); // Approved classification is valid for 2 years

      const { rows: updatedRows } = await client.query<ClassificationEvidenceRecord>(
        `UPDATE classification_evidence
         SET 
           verification_status = $1, 
           verified_by = $2, 
           verified_at = NOW() AT TIME ZONE 'UTC',
           expires_at = $3,
           notes = $4
         WHERE id = $5
         RETURNING 
           id, user_id as "userId", classification, evidence_type as "evidenceType", 
           evidence_reference as "evidenceReference", verification_status as "verificationStatus", 
           verified_by as "verifiedBy", verified_at as "verifiedAt", expires_at as "expiresAt", 
           notes, created_at as "createdAt"`,
        [status, verifierId, status === "APPROVED" ? expiresAt.toISOString() : null, notes || null, evidenceId]
      );

      const updatedEvidence = updatedRows[0];
      if (!updatedEvidence) {
        throw new Error("Failed to update evidence record");
      }

      if (status === "APPROVED") {
        // If approved, update the investor profile's classification
        await client.query(
          "UPDATE investor_profiles SET classification = $1, updated_at = NOW() AT TIME ZONE 'UTC' WHERE user_id = $2",
          [ev.classification, ev.userId]
        );
      }

      await client.query("COMMIT");
      return updatedEvidence;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Fetches all evidence records for a user.
   */
  public async getEvidenceForUser(userId: string): Promise<ClassificationEvidenceRecord[]> {
    const pool = db.getPool();
    const { rows } = await pool.query<ClassificationEvidenceRecord>(
      `SELECT 
         id, user_id as "userId", classification, evidence_type as "evidenceType", 
         evidence_reference as "evidenceReference", verification_status as "verificationStatus", 
         verified_by as "verifiedBy", verified_at as "verifiedAt", expires_at as "expiresAt", 
         notes, created_at as "createdAt"
       FROM classification_evidence 
       WHERE user_id = $1`,
      [userId]
    );
    return rows;
  }
}

export const onboardingService = new OnboardingService();
