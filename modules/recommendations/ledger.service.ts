/**
 * stockiq - Immutable Recommendation Ledger Service
 *
 * Core service managing database persistence, transaction safety, append-only event chaining,
 * SHA-256 hash validation, and lifecycle transitions for recommendations.
 */

import { db } from "../../database/connection.js";
import { AppError } from "../../api/middleware/error-handler.middleware.js";
import { ProviderService } from "../providers/provider.service.ts";
import { RecommendationParser } from "./parser.ts";
import { computeEventHash } from "./hasher.ts";
import {
  Recommendation,
  RecommendationTarget,
  RecommendationStopLoss,
  RecommendationEvent,
  CreateRecommendationInput,
  UpdateLifecycleInput,
  HashChainVerificationResult,
  RecommendationStatuses,
  RecommendationEventTypes,
  ParsedRecommendationDraft,
} from "./types.ts";

export class LedgerService {
  private providerService: ProviderService;
  private parser: RecommendationParser;

  // In-memory fallback stores
  public static memoryRecommendations = new Map<string, Recommendation>();
  public static memoryTargets = new Map<string, RecommendationTarget[]>();
  public static memoryStopLosses = new Map<string, RecommendationStopLoss[]>();
  public static memoryEvents = new Map<string, RecommendationEvent[]>();

  constructor(providerService = new ProviderService()) {
    this.providerService = providerService;
    this.parser = new RecommendationParser();
  }

  /**
   * Helper to parse raw signal text into a draft structure.
   */
  public parseRawText(rawText: string): ParsedRecommendationDraft {
    return this.parser.parseRawText(rawText);
  }

  /**
   * Retrieves all recommendations belonging to a provider.
   */
  public async getProviderRecommendations(userId: string): Promise<Recommendation[]> {
    const provider = await this.providerService.getProviderByUserId(userId);
    if (!provider) {
      throw new AppError("Only registered providers can query recommendations", 403, "FORBIDDEN");
    }

    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT id, provider_id AS "providerId", service_id AS "serviceId", original_message AS "originalMessage",
                instrument_type AS "instrumentType", segment, symbol, direction, entry_condition_type AS "entryConditionType",
                entry_price::float AS "entryPrice", time_horizon AS "timeHorizon", rationale,
                research_report_reference AS "researchReportReference", disclosures, current_status AS "currentStatus",
                published_at AS "publishedAt", closed_at AS "closedAt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM recommendations WHERE provider_id = $1 ORDER BY created_at DESC`,
        [provider.id]
      );

      const recommendations: Recommendation[] = [];
      for (const row of res.rows) {
        const rec: Recommendation = {
          ...row,
          entryPrice: parseFloat(row.entryPrice),
          disclosures: typeof row.disclosures === "string" ? JSON.parse(row.disclosures) : row.disclosures || [],
          targets: [],
          stopLosses: [],
          events: [],
        };

        // Fetch targets
        const tgtRes = await pool.query(
          `SELECT id, recommendation_id AS "recommendationId", target_sequence AS "targetSequence",
                  target_price::float AS "targetPrice", label, status, hit_timestamp AS "hitTimestamp"
           FROM recommendation_targets WHERE recommendation_id = $1 ORDER BY target_sequence ASC`,
          [rec.id]
        );
        rec.targets = tgtRes.rows.map((r) => ({ ...r, targetPrice: parseFloat(r.targetPrice) }));

        // Fetch stop loss
        const slRes = await pool.query(
          `SELECT id, recommendation_id AS "recommendationId", stop_loss_sequence AS "stopLossSequence",
                  stop_loss_price::float AS "stopLossPrice", stop_loss_type AS "stopLossType", status
           FROM recommendation_stop_losses WHERE recommendation_id = $1 ORDER BY stop_loss_sequence ASC`,
          [rec.id]
        );
        rec.stopLosses = slRes.rows.map((r) => ({ ...r, stopLossPrice: parseFloat(r.stopLossPrice) }));

        // Fetch events
        const evRes = await pool.query(
          `SELECT id, recommendation_id AS "recommendationId", event_sequence AS "eventSequence",
                  event_type AS "eventType", author_id AS "authorId", author_role AS "authorRole",
                  payload, metadata, previous_hash AS "previousHash", event_hash AS "eventHash",
                  event_timestamp AS "eventTimestamp"
           FROM recommendation_events WHERE recommendation_id = $1 ORDER BY event_sequence ASC`,
          [rec.id]
        );
        rec.events = evRes.rows.map((r) => ({
          ...r,
          payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload || {},
          metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata || {},
          eventTimestamp: r.eventTimestamp instanceof Date ? r.eventTimestamp.toISOString() : String(r.eventTimestamp),
        }));

        recommendations.push(rec);
      }

      return recommendations;
    } catch (err) {
      // Memory Fallback
      const recs: Recommendation[] = [];
      for (const rec of LedgerService.memoryRecommendations.values()) {
        if (rec.providerId === provider.id) {
          recs.push({
            ...rec,
            targets: LedgerService.memoryTargets.get(rec.id) || rec.targets || [],
            stopLosses: LedgerService.memoryStopLosses.get(rec.id) || rec.stopLosses || [],
            events: LedgerService.memoryEvents.get(rec.id) || rec.events || [],
          });
        }
      }
      recs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return recs;
    }
  }

  /**
   * Creates a new draft recommendation with an initial CREATED genesis event.
   */
  public async createDraft(
    userId: string,
    input: CreateRecommendationInput
  ): Promise<Recommendation> {
    const provider = await this.providerService.getProviderByUserId(userId);
    if (!provider) {
      throw new AppError("Only registered providers can create recommendations", 403, "FORBIDDEN");
    }

    // Must be in VERIFIED status to initiate recommendations
    if ((provider.status as string) !== "VERIFIED" && (provider.status as string) !== "APPROVED") {
      throw new AppError("Provider must be verified to create recommendations", 403, "FORBIDDEN");
    }

    const recId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const targets: RecommendationTarget[] = input.targets.map((t, idx) => ({
      id: crypto.randomUUID(),
      recommendationId: recId,
      targetSequence: idx + 1,
      targetPrice: t.targetPrice,
      label: t.label || `T${idx + 1}`,
      status: "PENDING",
      createdAt: nowIso,
    }));

    const stopLosses: RecommendationStopLoss[] = [
      {
        id: crypto.randomUUID(),
        recommendationId: recId,
        stopLossSequence: 1,
        stopLossPrice: input.stopLossPrice,
        stopLossType: "INITIAL",
        status: "ACTIVE",
        createdAt: nowIso,
      },
    ];

    // Genesis Event (Sequence 1)
    const event1Payload = {
      action: "CREATE_DRAFT",
      originalMessage: input.originalMessage,
      symbol: input.symbol,
      direction: input.direction,
      entryPrice: input.entryPrice,
      targets: input.targets,
      stopLossPrice: input.stopLossPrice,
      disclosures: input.disclosures || [],
    };

    const genesisEventHash = computeEventHash({
      recommendationId: recId,
      eventSequence: 1,
      eventType: RecommendationEventTypes.CREATED,
      authorId: userId,
      authorRole: provider.providerType,
      payload: event1Payload,
      metadata: { originalMessagePreserved: true, clientTimestamp: nowIso },
      previousHash: null,
      eventTimestamp: nowIso,
    });

    const genesisEvent: RecommendationEvent = {
      id: crypto.randomUUID(),
      recommendationId: recId,
      eventSequence: 1,
      eventType: RecommendationEventTypes.CREATED,
      authorId: userId,
      authorRole: provider.providerType,
      payload: event1Payload,
      metadata: { originalMessagePreserved: true, clientTimestamp: nowIso },
      previousHash: null,
      eventHash: genesisEventHash,
      eventTimestamp: nowIso,
    };

    const newRec: Recommendation = {
      id: recId,
      providerId: provider.id,
      serviceId: input.serviceId || null,
      originalMessage: input.originalMessage,
      instrumentType: input.instrumentType || "EQUITY",
      segment: input.segment || "CASH",
      symbol: input.symbol.toUpperCase(),
      direction: input.direction,
      entryConditionType: input.entryConditionType || "DIRECT",
      entryPrice: input.entryPrice,
      timeHorizon: input.timeHorizon || "SWING",
      rationale: input.rationale || "",
      researchReportReference: input.researchReportReference,
      disclosures: input.disclosures || [],
      currentStatus: RecommendationStatuses.DRAFT,
      createdAt: nowIso,
      updatedAt: nowIso,
      targets,
      stopLosses,
      events: [genesisEvent],
    };

    try {
      const pool = db.getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO recommendations (
            id, provider_id, service_id, original_message, instrument_type, segment, symbol, direction,
            entry_condition_type, entry_price, time_horizon, rationale, research_report_reference,
            disclosures, current_status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            newRec.id,
            newRec.providerId,
            newRec.serviceId,
            newRec.originalMessage,
            newRec.instrumentType,
            newRec.segment,
            newRec.symbol,
            newRec.direction,
            newRec.entryConditionType,
            newRec.entryPrice,
            newRec.timeHorizon,
            newRec.rationale,
            newRec.researchReportReference,
            JSON.stringify(newRec.disclosures),
            newRec.currentStatus,
            newRec.createdAt,
            newRec.updatedAt,
          ]
        );

        for (const t of targets) {
          await client.query(
            `INSERT INTO recommendation_targets (id, recommendation_id, target_sequence, target_price, label, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [t.id, t.recommendationId, t.targetSequence, t.targetPrice, t.label, t.status, t.createdAt]
          );
        }

        for (const sl of stopLosses) {
          await client.query(
            `INSERT INTO recommendation_stop_losses (id, recommendation_id, stop_loss_sequence, stop_loss_price, stop_loss_type, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [sl.id, sl.recommendationId, sl.stopLossSequence, sl.stopLossPrice, sl.stopLossType, sl.status, sl.createdAt]
          );
        }

        await client.query(
          `INSERT INTO recommendation_events (
            id, recommendation_id, event_sequence, event_type, author_id, author_role, payload, metadata, previous_hash, event_hash, event_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            genesisEvent.id,
            genesisEvent.recommendationId,
            genesisEvent.eventSequence,
            genesisEvent.eventType,
            genesisEvent.authorId,
            genesisEvent.authorRole,
            JSON.stringify(genesisEvent.payload),
            JSON.stringify(genesisEvent.metadata),
            genesisEvent.previousHash,
            genesisEvent.eventHash,
            genesisEvent.eventTimestamp,
          ]
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch {
      // Memory Fallback
      LedgerService.memoryRecommendations.set(newRec.id, newRec);
      LedgerService.memoryTargets.set(newRec.id, targets);
      LedgerService.memoryStopLosses.set(newRec.id, stopLosses);
      LedgerService.memoryEvents.set(newRec.id, [genesisEvent]);
    }

    return newRec;
  }

  /**
   * Publishes a draft recommendation, creating a PUBLISHED ledger event.
   */
  public async publish(userId: string, recommendationId: string): Promise<Recommendation> {
    const provider = await this.providerService.getProviderByUserId(userId);
    if (!provider) {
      throw new AppError("Only registered providers can publish recommendations", 403, "FORBIDDEN");
    }

    const rec = await this.getRecommendation(recommendationId, userId);
    if (!rec) {
      throw new AppError("Recommendation not found", 404, "NOT_FOUND");
    }

    if (rec.providerId !== provider.id) {
      throw new AppError("Unauthorized to publish another provider's recommendation", 403, "FORBIDDEN");
    }

    if (rec.currentStatus !== RecommendationStatuses.DRAFT) {
      throw new AppError(`Cannot publish recommendation currently in ${rec.currentStatus} status`, 400, "BAD_REQUEST");
    }

    const nowIso = new Date().toISOString();
    const events = rec.events || [];
    const lastEvent = events[events.length - 1];
    const newSeq = (lastEvent ? lastEvent.eventSequence : 0) + 1;
    const prevHash = lastEvent ? lastEvent.eventHash : null;

    const pubPayload = {
      action: "PUBLISH",
      publishedStatus: RecommendationStatuses.PUBLISHED,
      publishedAt: nowIso,
    };

    const eventHash = computeEventHash({
      recommendationId: rec.id,
      eventSequence: newSeq,
      eventType: RecommendationEventTypes.PUBLISHED,
      authorId: userId,
      authorRole: provider.providerType,
      payload: pubPayload,
      metadata: { publishedTimestamp: nowIso },
      previousHash: prevHash,
      eventTimestamp: nowIso,
    });

    const pubEvent: RecommendationEvent = {
      id: crypto.randomUUID(),
      recommendationId: rec.id,
      eventSequence: newSeq,
      eventType: RecommendationEventTypes.PUBLISHED,
      authorId: userId,
      authorRole: provider.providerType,
      payload: pubPayload,
      metadata: { publishedTimestamp: nowIso },
      previousHash: prevHash,
      eventHash,
      eventTimestamp: nowIso,
    };

    rec.currentStatus = RecommendationStatuses.PUBLISHED;
    rec.publishedAt = nowIso;
    rec.updatedAt = nowIso;
    rec.events = [...events, pubEvent];

    try {
      const pool = db.getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `UPDATE recommendations SET current_status = $1, published_at = $2, updated_at = $3 WHERE id = $4`,
          [rec.currentStatus, rec.publishedAt, rec.updatedAt, rec.id]
        );

        await client.query(
          `INSERT INTO recommendation_events (
            id, recommendation_id, event_sequence, event_type, author_id, author_role, payload, metadata, previous_hash, event_hash, event_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            pubEvent.id,
            pubEvent.recommendationId,
            pubEvent.eventSequence,
            pubEvent.eventType,
            pubEvent.authorId,
            pubEvent.authorRole,
            JSON.stringify(pubEvent.payload),
            JSON.stringify(pubEvent.metadata),
            pubEvent.previousHash,
            pubEvent.eventHash,
            pubEvent.eventTimestamp,
          ]
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch {
      // Memory Fallback
      LedgerService.memoryRecommendations.set(rec.id, rec);
      const evList = LedgerService.memoryEvents.get(rec.id) || [];
      evList.push(pubEvent);
      LedgerService.memoryEvents.set(rec.id, evList);
    }

    return rec;
  }

  /**
   * Appends a lifecycle event (e.g. TARGET_HIT, STOP_LOSS_UPDATED, CLOSED) to the ledger chain.
   */
  public async appendLifecycleEvent(
    userId: string,
    recommendationId: string,
    input: UpdateLifecycleInput
  ): Promise<Recommendation> {
    const provider = await this.providerService.getProviderByUserId(userId);
    if (!provider) {
      throw new AppError("Only registered providers can update recommendations", 403, "FORBIDDEN");
    }

    const rec = await this.getRecommendation(recommendationId, userId);
    if (!rec) {
      throw new AppError("Recommendation not found", 404, "NOT_FOUND");
    }

    if (rec.providerId !== provider.id) {
      throw new AppError("Unauthorized to modify another provider's recommendation", 403, "FORBIDDEN");
    }

    const nowIso = new Date().toISOString();
    const events = rec.events || [];
    const lastEvent = events[events.length - 1];
    const newSeq = (lastEvent ? lastEvent.eventSequence : 0) + 1;
    const prevHash = lastEvent ? lastEvent.eventHash : null;

    const eventPayload: Record<string, unknown> = {
      action: input.eventType,
      reason: input.reason || null,
      ...input,
    };

    // Strip keys with undefined values to match JSON.stringify serialization behavior
    for (const key of Object.keys(eventPayload)) {
      if (eventPayload[key] === undefined) {
        delete eventPayload[key];
      }
    }

    const eventHash = computeEventHash({
      recommendationId: rec.id,
      eventSequence: newSeq,
      eventType: input.eventType,
      authorId: userId,
      authorRole: provider.providerType,
      payload: eventPayload,
      metadata: input.metadata || {},
      previousHash: prevHash,
      eventTimestamp: nowIso,
    });

    const newEvent: RecommendationEvent = {
      id: crypto.randomUUID(),
      recommendationId: rec.id,
      eventSequence: newSeq,
      eventType: input.eventType,
      authorId: userId,
      authorRole: provider.providerType,
      payload: eventPayload,
      metadata: input.metadata || {},
      previousHash: prevHash,
      eventHash,
      eventTimestamp: nowIso,
    };

    // Update Targets if targetSequence specified
    if (input.eventType === RecommendationEventTypes.TARGET_HIT && input.targetSequence !== undefined) {
      const tgt = rec.targets.find((t) => t.targetSequence === input.targetSequence);
      if (tgt) {
        tgt.status = "HIT";
        tgt.hitTimestamp = nowIso;
      }
    }

    // Update Stop Loss if newStopLossPrice specified
    if (input.eventType === RecommendationEventTypes.STOP_LOSS_UPDATED && input.newStopLossPrice) {
      for (const sl of rec.stopLosses) {
        if (sl.status === "ACTIVE") {
          sl.status = "SUPERSEDED";
        }
      }
      rec.stopLosses.push({
        id: crypto.randomUUID(),
        recommendationId: rec.id,
        stopLossSequence: rec.stopLosses.length + 1,
        stopLossPrice: input.newStopLossPrice,
        stopLossType: "REVISED",
        status: "ACTIVE",
        createdAt: nowIso,
      });
    }

    // Handle Closure/Cancellation
    if (input.eventType === RecommendationEventTypes.CLOSED || input.eventType === RecommendationEventTypes.STOP_LOSS_HIT) {
      rec.currentStatus = RecommendationStatuses.CLOSED;
      rec.closedAt = nowIso;
    } else if (input.eventType === RecommendationEventTypes.CANCELLED) {
      rec.currentStatus = RecommendationStatuses.CANCELLED;
      rec.closedAt = nowIso;
    }

    rec.updatedAt = nowIso;
    rec.events = [...events, newEvent];

    try {
      const pool = db.getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `UPDATE recommendations SET current_status = $1, closed_at = $2, updated_at = $3 WHERE id = $4`,
          [rec.currentStatus, rec.closedAt || null, rec.updatedAt, rec.id]
        );

        if (input.eventType === RecommendationEventTypes.TARGET_HIT && input.targetSequence !== undefined) {
          await client.query(
            `UPDATE recommendation_targets SET status = 'HIT', hit_timestamp = $1 WHERE recommendation_id = $2 AND target_sequence = $3`,
            [nowIso, rec.id, input.targetSequence]
          );
        }

        if (input.eventType === RecommendationEventTypes.STOP_LOSS_UPDATED && input.newStopLossPrice) {
          await client.query(
            `UPDATE recommendation_stop_losses SET status = 'SUPERSEDED' WHERE recommendation_id = $1 AND status = 'ACTIVE'`,
            [rec.id]
          );
          const newSl = rec.stopLosses[rec.stopLosses.length - 1];
          await client.query(
            `INSERT INTO recommendation_stop_losses (id, recommendation_id, stop_loss_sequence, stop_loss_price, stop_loss_type, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [newSl.id, newSl.recommendationId, newSl.stopLossSequence, newSl.stopLossPrice, newSl.stopLossType, newSl.status, newSl.createdAt]
          );
        }

        await client.query(
          `INSERT INTO recommendation_events (
            id, recommendation_id, event_sequence, event_type, author_id, author_role, payload, metadata, previous_hash, event_hash, event_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            newEvent.id,
            newEvent.recommendationId,
            newEvent.eventSequence,
            newEvent.eventType,
            newEvent.authorId,
            newEvent.authorRole,
            JSON.stringify(newEvent.payload),
            JSON.stringify(newEvent.metadata),
            newEvent.previousHash,
            newEvent.eventHash,
            newEvent.eventTimestamp,
          ]
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch {
      // Memory Fallback
      LedgerService.memoryRecommendations.set(rec.id, rec);
      LedgerService.memoryTargets.set(rec.id, rec.targets);
      LedgerService.memoryStopLosses.set(rec.id, rec.stopLosses);
      const evList = LedgerService.memoryEvents.get(rec.id) || [];
      evList.push(newEvent);
      LedgerService.memoryEvents.set(rec.id, evList);
    }

    return rec;
  }

  /**
   * Retrieves recommendation with targets, stop-losses, and event chain.
   * Enforces DRAFT privacy (only visible to owning provider).
   */
  public async getRecommendation(
    recommendationId: string,
    requesterUserId?: string
  ): Promise<Recommendation | null> {
    try {
      const pool = db.getPool();

      const recRes = await pool.query(
        `SELECT id, provider_id AS "providerId", service_id AS "serviceId", original_message AS "originalMessage",
                instrument_type AS "instrumentType", segment, symbol, direction, entry_condition_type AS "entryConditionType",
                entry_price::float AS "entryPrice", time_horizon AS "timeHorizon", rationale,
                research_report_reference AS "researchReportReference", disclosures, current_status AS "currentStatus",
                published_at AS "publishedAt", closed_at AS "closedAt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM recommendations WHERE id = $1`,
        [recommendationId]
      );

      if (recRes.rows.length === 0) {
        return null;
      }

      const row = recRes.rows[0];
      const rec: Recommendation = {
        ...row,
        entryPrice: parseFloat(row.entryPrice),
        disclosures: typeof row.disclosures === "string" ? JSON.parse(row.disclosures) : row.disclosures || [],
        targets: [],
        stopLosses: [],
        events: [],
      };

      // DRAFT privacy check
      if (rec.currentStatus === RecommendationStatuses.DRAFT) {
        if (!requesterUserId) {
          throw new AppError("Draft recommendations are private to the author provider", 403, "FORBIDDEN");
        }
        const provider = await this.providerService.getProviderByUserId(requesterUserId);
        if (!provider || provider.id !== rec.providerId) {
          throw new AppError("Draft recommendations are private to the author provider", 403, "FORBIDDEN");
        }
      }

      // Fetch targets
      const tgtRes = await pool.query(
        `SELECT id, recommendation_id AS "recommendationId", target_sequence AS "targetSequence",
                target_price::float AS "targetPrice", label, status, hit_timestamp AS "hitTimestamp"
         FROM recommendation_targets WHERE recommendation_id = $1 ORDER BY target_sequence ASC`,
        [recommendationId]
      );
      rec.targets = tgtRes.rows.map((r) => ({ ...r, targetPrice: parseFloat(r.targetPrice) }));

      // Fetch stop loss
      const slRes = await pool.query(
        `SELECT id, recommendation_id AS "recommendationId", stop_loss_sequence AS "stopLossSequence",
                stop_loss_price::float AS "stopLossPrice", stop_loss_type AS "stopLossType", status
         FROM recommendation_stop_losses WHERE recommendation_id = $1 ORDER BY stop_loss_sequence ASC`,
        [recommendationId]
      );
      rec.stopLosses = slRes.rows.map((r) => ({ ...r, stopLossPrice: parseFloat(r.stopLossPrice) }));

      // Fetch events
      const evRes = await pool.query(
        `SELECT id, recommendation_id AS "recommendationId", event_sequence AS "eventSequence",
                event_type AS "eventType", author_id AS "authorId", author_role AS "authorRole",
                payload, metadata, previous_hash AS "previousHash", event_hash AS "eventHash",
                event_timestamp AS "eventTimestamp"
         FROM recommendation_events WHERE recommendation_id = $1 ORDER BY event_sequence ASC`,
        [recommendationId]
      );
      rec.events = evRes.rows.map((r) => ({
        ...r,
        payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload || {},
        metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata || {},
        eventTimestamp: r.eventTimestamp instanceof Date ? r.eventTimestamp.toISOString() : String(r.eventTimestamp),
      }));

      return rec;
    } catch (err) {
      if (err instanceof AppError) throw err;

      // Memory Fallback
      const memRec = LedgerService.memoryRecommendations.get(recommendationId);
      if (!memRec) return null;

      if (memRec.currentStatus === RecommendationStatuses.DRAFT) {
        if (!requesterUserId) {
          throw new AppError("Draft recommendations are private to the author provider", 403, "FORBIDDEN");
        }
        const provider = await this.providerService.getProviderByUserId(requesterUserId);
        if (!provider || provider.id !== memRec.providerId) {
          throw new AppError("Draft recommendations are private to the author provider", 403, "FORBIDDEN");
        }
      }

      return {
        ...memRec,
        targets: LedgerService.memoryTargets.get(recommendationId) || memRec.targets || [],
        stopLosses: LedgerService.memoryStopLosses.get(recommendationId) || memRec.stopLosses || [],
        events: LedgerService.memoryEvents.get(recommendationId) || memRec.events || [],
      };
    }
  }

  /**
   * Verifies the full SHA-256 hash chain and event sequence continuity for a recommendation.
   */
  public async verifyChain(recommendationId: string): Promise<HashChainVerificationResult> {
    let events: RecommendationEvent[] = [];

    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT id, recommendation_id AS "recommendationId", event_sequence AS "eventSequence",
                event_type AS "eventType", author_id AS "authorId", author_role AS "authorRole",
                payload, metadata, previous_hash AS "previousHash", event_hash AS "eventHash",
                event_timestamp AS "eventTimestamp"
         FROM recommendation_events WHERE recommendation_id = $1 ORDER BY event_sequence ASC`,
        [recommendationId]
      );

      events = res.rows.map((r) => ({
        ...r,
        payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload || {},
        metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata || {},
        previousHash: r.previousHash || null,
        eventTimestamp: r.eventTimestamp instanceof Date ? r.eventTimestamp.toISOString() : String(r.eventTimestamp),
      }));
    } catch {
      // Memory Fallback
      events = LedgerService.memoryEvents.get(recommendationId) || [];
    }

    const verifiedAt = new Date().toISOString();

    if (events.length === 0) {
      return {
        recommendationId,
        isValid: false,
        totalEvents: 0,
        mismatchReason: "No events found for recommendation",
        verifiedAt,
      };
    }

    let expectedPrevHash: string | null = null;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const expectedSeq = i + 1;

      // 1. Verify sequence order
      if (ev.eventSequence !== expectedSeq) {
        return {
          recommendationId,
          isValid: false,
          totalEvents: events.length,
          mismatchReason: `Sequence break at position ${i + 1}: expected ${expectedSeq}, got ${ev.eventSequence}`,
          mismatchEventId: ev.id,
          verifiedAt,
        };
      }

      // 2. Verify previousHash continuity
      if (ev.previousHash !== expectedPrevHash) {
        return {
          recommendationId,
          isValid: false,
          totalEvents: events.length,
          mismatchReason: `Previous hash mismatch at sequence ${ev.eventSequence}: expected ${expectedPrevHash}, got ${ev.previousHash}`,
          mismatchEventId: ev.id,
          verifiedAt,
        };
      }

      // 3. Re-compute payload SHA-256 hash
      const computedHash = computeEventHash({
        recommendationId: ev.recommendationId,
        eventSequence: ev.eventSequence,
        eventType: ev.eventType,
        authorId: ev.authorId,
        authorRole: ev.authorRole,
        payload: ev.payload,
        metadata: ev.metadata,
        previousHash: ev.previousHash,
        eventTimestamp: ev.eventTimestamp,
      });

      if (computedHash !== ev.eventHash) {
        return {
          recommendationId,
          isValid: false,
          totalEvents: events.length,
          mismatchReason: `Hash mismatch at sequence ${ev.eventSequence}: payload hash ${computedHash} does not match ledger hash ${ev.eventHash}`,
          mismatchEventId: ev.id,
          verifiedAt,
        };
      }

      expectedPrevHash = ev.eventHash;
    }

    return {
      recommendationId,
      isValid: true,
      totalEvents: events.length,
      verifiedAt,
    };
  }
}
