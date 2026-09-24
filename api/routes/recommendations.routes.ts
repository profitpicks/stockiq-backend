/**
 * stockiq - Recommendation Ledger API Routes
 *
 * Exposes endpoints for parsing signals, creating drafts, publishing recommendations,
 * appending lifecycle events, fetching recommendations, and verifying hash-chain integrity.
 */

import { Router, Request, Response } from "express";
import { LedgerService } from "../../modules/recommendations/ledger.service.ts";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error-handler.middleware.js";

export const recommendationsRouter = Router();
const ledgerService = new LedgerService();

/**
 * GET /api/v1/recommendations
 * Retrieves all recommendations for the authenticated provider.
 */
recommendationsRouter.get("/", authMiddleware(true), async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const recommendations = await ledgerService.getProviderRecommendations(userId);
    res.json({
      status: "SUCCESS",
      recommendations,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/recommendations/parse
 * Parses raw text signal into structured draft parameters.
 */
recommendationsRouter.post("/parse", authMiddleware(true), (req: Request, res: Response, next) => {
  try {
    const { rawText } = req.body;
    if (!rawText || typeof rawText !== "string") {
      throw new AppError("rawText string is required for signal parsing", 400, "BAD_REQUEST");
    }

    const draft = ledgerService.parseRawText(rawText);
    res.json({
      status: "SUCCESS",
      draft,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/recommendations
 * Creates a new DRAFT recommendation with a CREATED genesis event.
 */
recommendationsRouter.post("/", authMiddleware(true), async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const {
      serviceId,
      originalMessage,
      instrumentType,
      segment,
      symbol,
      direction,
      entryConditionType,
      entryPrice,
      timeHorizon,
      rationale,
      researchReportReference,
      disclosures,
      targets,
      stopLossPrice,
    } = req.body;

    if (!originalMessage || !symbol || !direction || entryPrice === undefined || stopLossPrice === undefined || !Array.isArray(targets)) {
      throw new AppError(
        "Missing required fields: originalMessage, symbol, direction, entryPrice, stopLossPrice, targets",
        400,
        "BAD_REQUEST"
      );
    }

    const rec = await ledgerService.createDraft(userId, {
      serviceId,
      originalMessage,
      instrumentType,
      segment,
      symbol,
      direction,
      entryConditionType,
      entryPrice: Number(entryPrice),
      timeHorizon,
      rationale,
      researchReportReference,
      disclosures,
      targets,
      stopLossPrice: Number(stopLossPrice),
    });

    res.status(201).json({
      status: "SUCCESS",
      recommendation: rec,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/recommendations/:id/publish
 * Explicitly publishes a draft recommendation, adding a PUBLISHED event.
 */
recommendationsRouter.post("/:id/publish", authMiddleware(true), async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const recId = String(req.params.id);

    const rec = await ledgerService.publish(userId, recId);
    res.json({
      status: "SUCCESS",
      recommendation: rec,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/recommendations/:id/events
 * Appends a lifecycle event (e.g., TARGET_HIT, STOP_LOSS_UPDATED, CLOSED) to the ledger chain.
 */
recommendationsRouter.post("/:id/events", authMiddleware(true), async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const recId = String(req.params.id);
    const { eventType, targetSequence, newStopLossPrice, closingPrice, reason, metadata } = req.body;

    if (!eventType || typeof eventType !== "string") {
      throw new AppError("eventType is required", 400, "BAD_REQUEST");
    }

    const rec = await ledgerService.appendLifecycleEvent(userId, recId, {
      eventType,
      targetSequence: targetSequence !== undefined ? Number(targetSequence) : undefined,
      newStopLossPrice: newStopLossPrice !== undefined ? Number(newStopLossPrice) : undefined,
      closingPrice: closingPrice !== undefined ? Number(closingPrice) : undefined,
      reason,
      metadata,
    });

    res.json({
      status: "SUCCESS",
      recommendation: rec,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/recommendations/:id
 * Fetches recommendation details. Public for published recommendations; owner-only for drafts.
 */
recommendationsRouter.get("/:id", authMiddleware(false), async (req: Request, res: Response, next) => {
  try {
    const recId = String(req.params.id);
    const requesterUserId = req.user?.id;

    const rec = await ledgerService.getRecommendation(recId, requesterUserId);
    if (!rec) {
      throw new AppError("Recommendation not found", 404, "NOT_FOUND");
    }

    res.json({
      status: "SUCCESS",
      recommendation: rec,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/recommendations/:id/verify
 * Public endpoint to verify SHA-256 hash chain and sequence continuity.
 */
recommendationsRouter.get("/:id/verify", async (req: Request, res: Response, next) => {
  try {
    const recId = String(req.params.id);
    const verification = await ledgerService.verifyChain(recId);

    res.json({
      status: "SUCCESS",
      verification,
    });
  } catch (err) {
    next(err);
  }
});
