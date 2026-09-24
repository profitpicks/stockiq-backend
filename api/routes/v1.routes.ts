import { Router, Request, Response } from "express";
import { ROLE_REGISTRY, PlatformRoles } from "../../modules/auth/roles.js";
import { config } from "../../config/index.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { authRouter } from "./auth.routes.js";
import { providerRouter } from "./provider.routes.js";
import { verificationRouter } from "./verification.routes.js";
import { publicRouter } from "./public.routes.js";
import { servicesRouter } from "./services.routes.js";
import { recommendationsRouter } from "./recommendations.routes.ts";
import { trackRecordRouter } from "./track_record.routes.js";
import { onboardingRouter } from "./onboarding.routes.js";
import { agreementsRouter } from "./agreements.routes.js";
import { paymentsRouter } from "./payments.routes.js";
import { invoicesRouter } from "./invoices.routes.js";
import { taxRouter } from "./tax.routes.js";
import { reconciliationRouter } from "./reconciliation.routes.js";
import { subscriptionsRouter } from "./subscriptions.routes.js";
import { notificationsRouter } from "./notifications.routes.js";
import { complaintsRouter } from "./complaints.routes.js";
import { communityRouter } from "./community.routes.js";
import { educationRouter } from "./education.routes.js";
import { adminRouter } from "./admin.routes.js";
import { integrationsRouter } from "./integrations.routes.ts";

export const v1Router = Router();

// Mount Sub-Routers
v1Router.use("/auth", authRouter);
v1Router.use("/providers", providerRouter);
v1Router.use("/providers", servicesRouter);
v1Router.use("/verification", verificationRouter);
v1Router.use("/public", publicRouter);
v1Router.use("/catalog", publicRouter);
v1Router.use("/recommendations", recommendationsRouter);
v1Router.use("/track-record", trackRecordRouter);
v1Router.use("/onboarding", onboardingRouter);
v1Router.use("/agreements", agreementsRouter);
v1Router.use("/subscriptions", subscriptionsRouter);
v1Router.use("/payments", paymentsRouter);
v1Router.use("/invoices", invoicesRouter);
v1Router.use("/tax", taxRouter);
v1Router.use("/reconciliation", reconciliationRouter);
v1Router.use("/notifications", notificationsRouter);
v1Router.use("/complaints", complaintsRouter);
v1Router.use("/community", communityRouter);
v1Router.use("/education", educationRouter);
v1Router.use("/admin", adminRouter);
v1Router.use("/integrations", integrationsRouter);

/**
 * Root v1 Metadata Endpoint
 */
v1Router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    name: "stockiq API",
    version: "v1",
    architecture: "Modular Monolith",
    phase: "Phase 2: Authentication & Provider Credentialing Engine",
    description: "Compliance-governed marketplace and immutable track-record platform for verified Indian SEBI-registered RAs and IAs",
    status: "PHASE_2_ACTIVE",
    modules: [
      "auth",
      "providers",
      "services",
      "recommendations",
      "track-record",
      "parrva",
      "onboarding",
      "agreements",
      "subscriptions",
      "payments",
      "complaints",
      "community",
      "education",
      "compliance",
      "audit",
    ],
    rolesCount: Object.keys(ROLE_REGISTRY).length,
    timestamp: new Date().toISOString(),
  });
});

/**
 * List Platform Roles & Metadata
 */
v1Router.get("/roles", (_req: Request, res: Response) => {
  res.status(200).json({
    roles: Object.values(ROLE_REGISTRY),
    total: Object.keys(ROLE_REGISTRY).length,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Adapter Status Endpoint
 */
v1Router.get("/adapters/status", (_req: Request, res: Response) => {
  res.status(200).json({
    adapters: {
      otp: { mode: config.adapters.otpMode, isMock: config.adapters.otpMode === "mock" },
      payments: { mode: config.adapters.paymentMode, isMock: config.adapters.paymentMode === "mock" },
      marketData: { mode: config.adapters.marketDataMode, isMock: config.adapters.marketDataMode === "mock" },
      esign: { mode: config.adapters.esignMode, isMock: config.adapters.esignMode === "mock" },
      parrva: { mode: config.adapters.parrvaMode, isMock: config.adapters.parrvaMode === "mock" },
    },
    notice: "All mock adapters are marked DEVELOPMENT/TEST ONLY. Production adapters will be enabled in subsequent phases.",
  });
});

/**
 * RBAC Verification Endpoint (Requires Authenticated Admin Role)
 */
v1Router.get(
  "/admin-check",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  (req: Request, res: Response) => {
    res.status(200).json({
      authorized: true,
      message: "Admin role successfully validated",
      user: req.user,
      timestamp: new Date().toISOString(),
    });
  }
);
