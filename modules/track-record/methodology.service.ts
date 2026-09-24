import { db } from "../../database/connection.js";
import { AppError } from "../../api/middleware/error-handler.middleware.js";

export interface TrackRecordMethodology {
  id: string;
  methodologyCode: string;
  version: string;
  name: string;
  description?: string;
  methodologyDefinition: {
    eligiblePopulation: "ALL" | "CLOSED_ONLY" | "TRIGGERED_ONLY";
    treatmentOfDrafts: "exclude" | "include";
    treatmentOfCancelled: "exclude" | "include";
    treatmentOfExpired: "exclude" | "include";
    treatmentOfUntriggered: "exclude" | "loss" | "neutral";
    treatmentOfOpen: "exclude" | "include_current_price";
    treatmentOfTargetMilestones: "milestone_counts";
    treatmentOfStopLoss: "loss_at_sl_price";
    precision: number;
  };
  active: boolean;
  createdBy?: string;
  createdAt: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

export class MethodologyService {
  public async createMethodology(input: Omit<TrackRecordMethodology, "id" | "createdAt" | "active"> & { active?: boolean }): Promise<TrackRecordMethodology> {
    const pool = db.getPool();

    // Check if code/version combo already exists
    const existing = await this.getMethodologyByCodeAndVersion(input.methodologyCode, input.version);
    if (existing) {
      throw new AppError(
        `Methodology with code '${input.methodologyCode}' and version '${input.version}' already exists`,
        400,
        "DUPLICATE_METHODOLOGY"
      );
    }

    const res = await pool.query(
      `INSERT INTO track_record_methodologies (
        methodology_code, version, name, description, methodology_definition, active, created_by, effective_from, effective_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, methodology_code AS "methodologyCode", version, name, description, methodology_definition AS "methodologyDefinition", active, created_by AS "createdBy", created_at AS "createdAt", effective_from AS "effectiveFrom", effective_until AS "effectiveUntil"`,
      [
        input.methodologyCode,
        input.version,
        input.name,
        input.description || null,
        JSON.stringify(input.methodologyDefinition),
        input.active !== false,
        input.createdBy || null,
        input.effectiveFrom || null,
        input.effectiveUntil || null,
      ]
    );

    return res.rows[0];
  }

  public async getMethodology(id: string): Promise<TrackRecordMethodology | null> {
    const pool = db.getPool();
    const res = await pool.query(
      `SELECT id, methodology_code AS "methodologyCode", version, name, description, methodology_definition AS "methodologyDefinition", active, created_by AS "createdBy", created_at AS "createdAt", effective_from AS "effectiveFrom", effective_until AS "effectiveUntil"
       FROM track_record_methodologies WHERE id = $1`,
      [id]
    );

    return res.rows[0] || null;
  }

  public async getMethodologyByCodeAndVersion(code: string, version: string): Promise<TrackRecordMethodology | null> {
    const pool = db.getPool();
    const res = await pool.query(
      `SELECT id, methodology_code AS "methodologyCode", version, name, description, methodology_definition AS "methodologyDefinition", active, created_by AS "createdBy", created_at AS "createdAt", effective_from AS "effectiveFrom", effective_until AS "effectiveUntil"
       FROM track_record_methodologies WHERE methodology_code = $1 AND version = $2`,
      [code, version]
    );

    return res.rows[0] || null;
  }

  public async listMethodologies(): Promise<TrackRecordMethodology[]> {
    const pool = db.getPool();
    const res = await pool.query(
      `SELECT id, methodology_code AS "methodologyCode", version, name, description, methodology_definition AS "methodologyDefinition", active, created_by AS "createdBy", created_at AS "createdAt", effective_from AS "effectiveFrom", effective_until AS "effectiveUntil"
       FROM track_record_methodologies ORDER BY methodology_code ASC, version DESC`
    );

    return res.rows;
  }

  public async deactivateMethodology(id: string): Promise<void> {
    const pool = db.getPool();

    // Check if referenced in calculations (implying it has been used)
    const usageCheck = await pool.query(
      `SELECT COUNT(*) AS count FROM track_record_calculations WHERE methodology_id = $1`,
      [id]
    );
    const count = parseInt(usageCheck.rows[0].count, 10);
    if (count > 0) {
      throw new AppError(
        "Cannot modify or deactivate methodology that has already been used in calculations",
        400,
        "METHODOLOGY_IN_USE"
      );
    }

    await pool.query(
      `UPDATE track_record_methodologies SET active = false WHERE id = $1`,
      [id]
    );
  }
}
