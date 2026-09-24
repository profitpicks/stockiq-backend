import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { onboardingService, OnboardingState } from "../../modules/onboarding/onboarding.service.js";
import { riskService } from "../../modules/onboarding/risk.service.js";
import { suitabilityService } from "../../modules/onboarding/suitability.service.js";
import { agreementsService } from "../../modules/agreements/agreements.service.js";
import { AppError } from "../middleware/error-handler.middleware.js";

export const onboardingRouter = Router();

/**
 * GET /api/v1/onboarding/profile
 * Returns the investor onboarding profile
 */
onboardingRouter.get("/profile", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const profile = await onboardingService.getOrCreateProfile(userId);
    res.json({ status: "SUCCESS", profile });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/onboarding/profile
 * Updates basic onboarding profile parameters
 */
onboardingRouter.post("/profile", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { annualIncomeBracket, investmentExperienceYears } = req.body;

    const profile = await onboardingService.updateProfileDetails(userId, {
      annualIncomeBracket,
      investmentExperienceYears: investmentExperienceYears !== undefined ? Number(investmentExperienceYears) : undefined,
    });

    // Advance onboarding state machine
    const updated = await onboardingService.transitionState(userId, "PROFILE_PENDING");

    res.json({ status: "SUCCESS", profile: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/onboarding/evidence
 * Submits evidence for specialized classification (HNI or Accredited Investor)
 */
onboardingRouter.post("/evidence", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { classification, evidenceType, evidenceReference } = req.body;

    if (!classification || !evidenceType || !evidenceReference) {
      throw new AppError("classification, evidenceType, and evidenceReference are required", 400, "BAD_REQUEST");
    }

    const evidence = await onboardingService.submitEvidence({
      userId,
      classification,
      evidenceType,
      evidenceReference,
    });

    // Advance state
    await onboardingService.transitionState(userId, "CLASSIFICATION_PENDING");

    res.json({ status: "SUCCESS", evidence });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/onboarding/risk-assessment
 * Submits risk profile responses and returns calculated category
 */
onboardingRouter.post("/risk-assessment", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { questionnaireVersion, responses, reassessmentReason } = req.body;

    if (!questionnaireVersion || !responses) {
      throw new AppError("questionnaireVersion and responses are required", 400, "BAD_REQUEST");
    }

    const assessment = await riskService.submitAssessment({
      userId,
      questionnaireVersion,
      responses,
      reassessmentReason,
    });

    // Advance state
    await onboardingService.transitionState(userId, "RISK_ASSESSMENT_PENDING");

    res.json({ status: "SUCCESS", assessment });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/onboarding/suitability
 * Checks suitability for a given service catalog entry
 */
onboardingRouter.post("/suitability", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { serviceId } = req.body;

    if (!serviceId) {
      throw new AppError("serviceId is required", 400, "BAD_REQUEST");
    }

    const profile = await onboardingService.getOrCreateProfile(userId);
    const latestRisk = await riskService.getLatestAssessment(userId);

    if (!latestRisk) {
      throw new AppError("Please complete risk assessment first", 400, "BAD_REQUEST");
    }

    const evaluation = await suitabilityService.evaluateSuitability(
      profile.classification,
      latestRisk.calculatedRiskCategory,
      serviceId
    );

    // If evaluated, advance onboarding status
    if (evaluation.status === "ELIGIBLE") {
      await onboardingService.transitionState(userId, "SUITABILITY_REVIEW");
      await onboardingService.transitionState(userId, "AGREEMENTS_PENDING");
    } else if (evaluation.status === "REVIEW_REQUIRED") {
      await onboardingService.transitionState(userId, "REQUIRES_REVIEW");
    } else {
      if (profile.onboardingStatus !== "AGREEMENTS_PENDING" && profile.onboardingStatus !== "COMPLETED") {
        await onboardingService.transitionState(userId, "REQUIRES_REVIEW");
      }
    }

    res.json({ status: "SUCCESS", evaluation });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/onboarding/verify-evidence
 * Compliance route to verify classifications evidence
 */
onboardingRouter.post(
  "/verify-evidence",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const verifierId = req.user!.id;
      const { evidenceId, status, notes } = req.body;

      if (!evidenceId || !status) {
        throw new AppError("evidenceId and status are required", 400, "BAD_REQUEST");
      }

      const verified = await onboardingService.verifyEvidence(evidenceId, verifierId, status, notes);
      res.json({ status: "SUCCESS", verified });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/onboarding/complete
 * Mark onboarding workflow as completed
 */
onboardingRouter.post("/complete", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const profile = await onboardingService.getOrCreateProfile(userId);

    if (profile.onboardingStatus !== "AGREEMENTS_PENDING") {
      throw new AppError("Cannot complete onboarding. Current state must be AGREEMENTS_PENDING", 400, "BAD_REQUEST");
    }

    const signatures = await agreementsService.getSignaturesForUser(userId);
    if (signatures.length === 0) {
      throw new AppError("Onboarding requires at least one executed client agreement.", 400, "BAD_REQUEST");
    }

    const updated = await onboardingService.transitionState(userId, "COMPLETED");
    res.json({ status: "SUCCESS", profile: updated });
  } catch (err) {
    next(err);
  }
});
