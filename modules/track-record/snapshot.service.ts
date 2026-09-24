import { db } from "../../database/connection.js";
import { AppError } from "../../api/middleware/error-handler.middleware.js";
import { CalculationResult } from "./calculation.service.js";

export interface TrackRecordSnapshot {
  id: string;
  providerId: string;
  serviceId?: string;
  methodologyId: string;
  calculationId?: string;
  periodStart: string;
  periodEnd: string;
  totalRecommendations: number;
  eligibleRecommendations: number;
  excludedNotTriggered: number;
  wins: number;
  losses: number;
  closedOutcomes: number;
  openOutcomes: number;
  targetMilestonesHit: number;
  performanceMetrics: {
    winRate: number;
    successRate?: number;
  };
  sourceClassification: "PLATFORM_RECORDED" | "PROVIDER_SUPPLIED_HISTORICAL" | "EXTERNAL_VERIFIED" | "REGULATORY_VERIFIED";
  createdAt: string;
}

export class SnapshotService {
  public async createSnapshotFromCalculation(
    providerId: string,
    methodologyId: string,
    calculationId: string,
    periodStart: string,
    periodEnd: string,
    result: CalculationResult,
    sourceClassification: TrackRecordSnapshot["sourceClassification"] = "PLATFORM_RECORDED",
    serviceId?: string
  ): Promise<TrackRecordSnapshot> {
    const pool = db.getPool();

    const res = await pool.query(
      `INSERT INTO track_record_snapshots (
        provider_id, service_id, methodology_id, calculation_id, period_start, period_end,
        total_recommendations, eligible_recommendations, excluded_not_triggered, wins, losses,
        closed_outcomes, open_outcomes, target_milestones_hit, performance_metrics, source_classification
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, provider_id AS "providerId", service_id AS "serviceId", methodology_id AS "methodologyId",
                calculation_id AS "calculationId", period_start AS "periodStart", period_end AS "periodEnd",
                total_recommendations AS "totalRecommendations", eligible_recommendations AS "eligibleRecommendations",
                excluded_not_triggered AS "excludedNotTriggered", wins, losses, closed_outcomes AS "closedOutcomes",
                open_outcomes AS "openOutcomes", target_milestones_hit AS "targetMilestonesHit",
                performance_metrics AS "performanceMetrics", source_classification AS "sourceClassification",
                created_at AS "createdAt"`,
      [
        providerId,
        serviceId || null,
        methodologyId,
        calculationId || null,
        periodStart,
        periodEnd,
        result.totalRecommendations,
        result.eligibleRecommendations,
        result.excludedNotTriggered,
        result.wins,
        result.losses,
        result.closedOutcomes,
        result.openOutcomes,
        result.targetMilestonesHit,
        JSON.stringify(result.metrics),
        sourceClassification,
      ]
    );

    return res.rows[0];
  }

  public async getSnapshot(id: string): Promise<TrackRecordSnapshot | null> {
    const pool = db.getPool();
    const res = await pool.query(
      `SELECT id, provider_id AS "providerId", service_id AS "serviceId", methodology_id AS "methodologyId",
              calculation_id AS "calculationId", period_start AS "periodStart", period_end AS "periodEnd",
              total_recommendations AS "totalRecommendations", eligible_recommendations AS "eligibleRecommendations",
              excluded_not_triggered AS "excludedNotTriggered", wins, losses, closed_outcomes AS "closedOutcomes",
              open_outcomes AS "openOutcomes", target_milestones_hit AS "targetMilestonesHit",
              performance_metrics AS "performanceMetrics", source_classification AS "sourceClassification",
              created_at AS "createdAt"
       FROM track_record_snapshots WHERE id = $1`,
      [id]
    );

    return res.rows[0] || null;
  }

  public async getProviderSnapshots(providerId: string): Promise<TrackRecordSnapshot[]> {
    const pool = db.getPool();
    const res = await pool.query(
      `SELECT id, provider_id AS "providerId", service_id AS "serviceId", methodology_id AS "methodologyId",
              calculation_id AS "calculationId", period_start AS "periodStart", period_end AS "periodEnd",
              total_recommendations AS "totalRecommendations", eligible_recommendations AS "eligibleRecommendations",
              excluded_not_triggered AS "excludedNotTriggered", wins, losses, closed_outcomes AS "closedOutcomes",
              open_outcomes AS "openOutcomes", target_milestones_hit AS "targetMilestonesHit",
              performance_metrics AS "performanceMetrics", source_classification AS "sourceClassification",
              created_at AS "createdAt"
       FROM track_record_snapshots WHERE provider_id = $1 ORDER BY period_end DESC`,
      [providerId]
    );

    return res.rows;
  }

  public async getPublicSnapshots(): Promise<TrackRecordSnapshot[]> {
    const pool = db.getPool();
    const res = await pool.query(
      `SELECT id, provider_id AS "providerId", service_id AS "serviceId", methodology_id AS "methodologyId",
              calculation_id AS "calculationId", period_start AS "periodStart", period_end AS "periodEnd",
              total_recommendations AS "totalRecommendations", eligible_recommendations AS "eligibleRecommendations",
              excluded_not_triggered AS "excludedNotTriggered", wins, losses, closed_outcomes AS "closedOutcomes",
              open_outcomes AS "openOutcomes", target_milestones_hit AS "targetMilestonesHit",
              performance_metrics AS "performanceMetrics", source_classification AS "sourceClassification",
              created_at AS "createdAt"
       FROM track_record_snapshots ORDER BY period_end DESC`
    );

    return res.rows;
  }
}
