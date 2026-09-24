import { db } from "../../database/connection.js";
import { AppError } from "../../api/middleware/error-handler.middleware.js";
import { TrackRecordMethodology } from "./methodology.service.js";

export interface CalculationResult {
  totalRecommendations: number;
  eligibleRecommendations: number;
  excludedNotTriggered: number;
  wins: number;
  losses: number;
  closedOutcomes: number;
  openOutcomes: number;
  targetMilestonesHit: number;
  metrics: {
    winRate: number;
    successRate?: number; // Public-facing metric
  };
}

export class CalculationService {
  /**
   * Process and calculate track record for a provider within a period using a methodology.
   */
  public async runCalculation(
    providerId: string,
    methodologyId: string,
    periodStart: string, // YYYY-MM-DD
    periodEnd: string, // YYYY-MM-DD
    serviceId?: string
  ): Promise<{ calculationId: string; result: CalculationResult }> {
    const pool = db.getPool();

    // 1. Fetch methodology
    const methRes = await pool.query(
      `SELECT id, methodology_code AS "methodologyCode", version, name, description, methodology_definition AS "methodologyDefinition", active
       FROM track_record_methodologies WHERE id = $1`,
      [methodologyId]
    );

    if (methRes.rows.length === 0) {
      throw new AppError("Methodology not found", 404, "METHODOLOGY_NOT_FOUND");
    }

    const methodology = methRes.rows[0];
    const def = methodology.methodologyDefinition;

    // 2. Create track_record_calculations entry in PENDING status
    const calcRes = await pool.query(
      `INSERT INTO track_record_calculations (
        provider_id, methodology_id, source_type, period_start, period_end, calculation_status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [providerId, methodologyId, "PLATFORM_RECORDED", periodStart, periodEnd, "RUNNING"]
    );
    const calculationId = calcRes.rows[0].id;

    try {
      // 3. Query all recommendations for provider within period (matching published_at or created_at)
      let recQuery = `
        SELECT r.*
        FROM recommendations r
        WHERE r.provider_id = $1
          AND r.created_at >= $2::timestamp
          AND r.created_at <= $3::timestamp
      `;
      const queryParams: any[] = [providerId, `${periodStart} 00:00:00`, `${periodEnd} 23:59:59`];

      if (serviceId) {
        recQuery += ` AND r.service_id = $4`;
        queryParams.push(serviceId);
      }

      const recsRes = await pool.query(recQuery, queryParams);
      const recs = recsRes.rows;

      let totalRecommendations = recs.length;
      let eligibleRecommendations = 0;
      let excludedNotTriggered = 0;
      let wins = 0;
      let losses = 0;
      let closedOutcomes = 0;
      let openOutcomes = 0;
      let targetMilestonesHit = 0;

      for (const rec of recs) {
        // Fetch targets
        const targetsRes = await pool.query(
          `SELECT * FROM recommendation_targets WHERE recommendation_id = $1`,
          [rec.id]
        );
        const targets = targetsRes.rows;

        // Fetch stop losses
        const slsRes = await pool.query(
          `SELECT * FROM recommendation_stop_losses WHERE recommendation_id = $1`,
          [rec.id]
        );
        const sls = slsRes.rows;

        // Apply methodology rules
        const status = rec.current_status;

        // Rule A: Draft handling
        if (status === "DRAFT") {
          if (def.treatmentOfDrafts === "exclude") {
            continue; // Skip entirely
          }
        }

        // Rule B: Cancelled handling
        if (status === "CANCELLED") {
          if (def.treatmentOfCancelled === "exclude") {
            continue; // Skip entirely
          }
        }

        // Rule D: Untriggered check (especially for non-DIRECT entry, e.g. BUY_ABOVE that expired without moving to ACTIVE)
        const isUntriggered = rec.entry_condition_type !== "DIRECT" && status === "EXPIRED" && !targets.some(t => t.status === "HIT") && !sls.some(s => s.status === "TRIGGERED");
        if (isUntriggered) {
          excludedNotTriggered++;
          if (def.treatmentOfUntriggered === "exclude") {
            continue; // Exclude from eligible denominator
          } else if (def.treatmentOfUntriggered === "loss") {
            losses++;
            eligibleRecommendations++;
            closedOutcomes++;
            continue;
          } else {
            // Neutral / other treatment, count towards eligible but not as win/loss
            eligibleRecommendations++;
            closedOutcomes++;
            continue;
          }
        }

        // Rule C: Expired handling
        if (status === "EXPIRED") {
          if (def.treatmentOfExpired === "exclude") {
            continue; // Skip entirely
          }
        }

        // If it got here, it's an eligible recommendation!
        eligibleRecommendations++;

        // Count target milestones hit
        const hitTargets = targets.filter(t => t.status === "HIT");
        targetMilestonesHit += hitTargets.length;

        if (status === "ACTIVE") {
          if (def.treatmentOfOpen === "exclude") {
            eligibleRecommendations--; // don't count open recommendations
          } else {
            openOutcomes++;
          }
        } else if (status === "CLOSED" || status === "EXPIRED") {
          closedOutcomes++;
          // A recommendation is a win if at least one target is hit
          const isWin = hitTargets.length > 0;
          // Or is a loss if stop-loss is triggered or no targets hit
          const isLoss = !isWin && (sls.some(s => s.status === "TRIGGERED") || status === "EXPIRED" || rec.closed_at !== null);

          if (isWin) {
            wins++;
          } else if (isLoss) {
            losses++;
          } else {
            // Treat as loss by default if closed without target hit, or neutral
            losses++;
          }
        } else {
          // Fallback
          openOutcomes++;
        }
      }

      // Calculate precision/win rate
      const denominator = wins + losses;
      let winRate = 0;
      if (denominator > 0) {
        winRate = parseFloat(((wins / denominator) * 100).toFixed(def.precision || 2));
      }

      const result: CalculationResult = {
        totalRecommendations,
        eligibleRecommendations,
        excludedNotTriggered,
        wins,
        losses,
        closedOutcomes,
        openOutcomes,
        targetMilestonesHit,
        metrics: {
          winRate,
          successRate: winRate,
        },
      };

      // 4. Update track_record_calculations to COMPLETED
      await pool.query(
        `UPDATE track_record_calculations
         SET calculation_status = 'COMPLETED',
             calculation_parameters = $1
         WHERE id = $2`,
        [JSON.stringify(result), calculationId]
      );

      return {
        calculationId,
        result,
      };
    } catch (err) {
      // Update status to FAILED on error
      await pool.query(
        `UPDATE track_record_calculations
         SET calculation_status = 'FAILED'
         WHERE id = $1`,
        [calculationId]
      );
      throw err;
    }
  }
}
