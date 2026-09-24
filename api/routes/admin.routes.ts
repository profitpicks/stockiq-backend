import { Router, Request, Response } from "express";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/rbac.middleware.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { AuditService } from "../../modules/audit/audit.service.js";
import { ProviderService } from "../../modules/providers/provider.service.js";
import { VerificationService } from "../../modules/providers/verification.service.js";
import { ServiceManagementService } from "../../modules/services/management.service.js";
import { LedgerService } from "../../modules/recommendations/ledger.service.js";
import { SubscriptionsService } from "../../modules/subscriptions/subscriptions.service.js";
import { PaymentsService } from "../../modules/payments/payments.service.js";
import { ComplaintsService } from "../../modules/complaints/complaints.service.js";
import { CommunityService } from "../../modules/community/community.service.js";
import { OtpService } from "../../modules/auth/otp.service.js";

export const adminRouter = Router();

const auditService = AuditService.getInstance();
const providerService = new ProviderService();
const verificationService = new VerificationService(providerService);
const serviceManagementService = new ServiceManagementService(providerService);
const ledgerService = new LedgerService(providerService);
const recommendationService = ledgerService;
const subscriptionService = new SubscriptionsService();
const paymentService = new PaymentsService();
const supportService = new ComplaintsService();
const communityService = new CommunityService();
const otpService = new OtpService();

const ALL_ADMIN_ROLES = [
  PlatformRoles.SUPER_ADMIN,
  PlatformRoles.COMPLIANCE_ADMIN,
  PlatformRoles.VERIFICATION_OFFICER,
  PlatformRoles.CONTENT_MODERATOR,
  PlatformRoles.FINANCE_ADMIN,
  PlatformRoles.SUPPORT_ADMIN,
];

/**
 * 1. Admin Operational Dashboard Summary
 */
adminRouter.get(
  "/dashboard",
  authMiddleware(true),
  requireRoles(...ALL_ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const providers = await providerService.listAllProviders();
    const verifications = verificationService.listPendingCases();
    const services = await serviceManagementService.listAllServices();
    const recs = recommendationService.listAllRecommendations();
    const subs = subscriptionService.listAllSubscriptions();
    const payments = paymentService.listAllPaymentOrders();
    const tickets = supportService.listTickets();
    const reports = communityService.listReports();
    const securityAuditLogs = auditService.getSecurityLogs(undefined, undefined, 100);

    const pendingServices = services.filter((s) => s.status === "PENDING_REVIEW");
    const activeSubs = subs.filter((s) => s.status === "ACTIVE");

    res.status(200).json({
      success: true,
      data: {
        metrics: {
          totalProviders: providers.length,
          pendingVerifications: verifications.length,
          totalServices: services.length,
          pendingServiceReviews: pendingServices.length,
          totalRecommendations: recs.length,
          totalSubscriptions: subs.length,
          activeSubscriptions: activeSubs.length,
          totalPaymentOrders: payments.length,
          totalSupportTickets: tickets.length,
          totalCommunityReports: reports.length,
          securityAuditEventsCount: securityAuditLogs.length,
        },
        timestamp: new Date().toISOString(),
      },
    });
  }
);

/**
 * 2. User Account Management
 */
adminRouter.get(
  "/users",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response) => {
    const users = await otpService.listAllUsers();
    res.status(200).json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber ? u.phoneNumber.replace(/(\+\d{2}\d{2})\d{4}(\d{4})/, "$1****$2") : undefined,
        roles: u.roles,
        isActive: u.isActive,
        kycStatus: u.kycStatus,
        createdAt: u.createdAt,
      })),
      timestamp: new Date().toISOString(),
    });
  }
);

adminRouter.post(
  "/users/:id/status",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw new AppError("A valid administrative reason is required for account status changes", 400, "BAD_REQUEST");
    }

    const updatedUser = await otpService.setUserStatus(id, status === "ACTIVE", reason);
    if (!updatedUser) {
      throw new AppError("User account not found", 404, "NOT_FOUND");
    }

    auditService.logSecurityAction(
      req.user!.userId,
      req.user!.roles[0],
      "USER_STATUS_CHANGE",
      "USER",
      id,
      { isActive: status === "ACTIVE", reason },
      undefined,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `User status successfully set to ${status}`,
      user: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        isActive: updatedUser.isActive,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 3. Provider Management & Verification
 */
adminRouter.get(
  "/providers",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN, PlatformRoles.VERIFICATION_OFFICER),
  async (_req: Request, res: Response) => {
    const providers = await providerService.listAllProviders();
    res.status(200).json({
      success: true,
      data: providers,
      timestamp: new Date().toISOString(),
    });
  }
);

adminRouter.post(
  "/providers/:id/verification",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN, PlatformRoles.VERIFICATION_OFFICER),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, notes, reason } = req.body;

    if (!status || !["UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED", "REJECTED", "SUSPENDED"].includes(status)) {
      throw new AppError("Invalid verification status transition", 400, "BAD_REQUEST");
    }

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw new AppError("A reason is mandatory for verification status changes", 400, "BAD_REQUEST");
    }

    const updatedCase = await verificationService.updateCaseStatus(id, status, notes || reason, req.user!.userId);

    auditService.logSecurityAction(
      req.user!.userId,
      req.user!.roles[0],
      `PROVIDER_VERIFICATION_${status}`,
      "PROVIDER_VERIFICATION_CASE",
      id,
      { status, reason, notes },
      undefined,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Provider verification case updated to ${status}`,
      case: updatedCase,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 4. Service Review Management
 */
adminRouter.get(
  "/services",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (_req: Request, res: Response) => {
    const services = await serviceManagementService.listAllServices();
    res.status(200).json({
      success: true,
      data: services,
      timestamp: new Date().toISOString(),
    });
  }
);

adminRouter.post(
  "/services/:id/review",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    if (!status || !["ACTIVE", "REJECTED", "PAUSED"].includes(status)) {
      throw new AppError("Invalid service review status", 400, "BAD_REQUEST");
    }

    const updatedService = await serviceManagementService.updateServiceStatus(id, status, reviewNotes);

    auditService.logSecurityAction(
      req.user!.userId,
      req.user!.roles[0],
      `SERVICE_REVIEW_${status}`,
      "SERVICE_DEFINITION",
      id,
      { status, reviewNotes },
      undefined,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Service definition review status updated to ${status}`,
      service: updatedService,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 5. Recommendation Ledger Inspection (Immutable - Read Only)
 */
adminRouter.get(
  "/recommendations",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (_req: Request, res: Response) => {
    const recommendations = recommendationService.listAllRecommendations();
    res.status(200).json({
      success: true,
      data: recommendations,
      notice: "Recommendation ledger records are immutable and read-only.",
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 6. Subscription Management
 */
adminRouter.get(
  "/subscriptions",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN, PlatformRoles.FINANCE_ADMIN),
  async (_req: Request, res: Response) => {
    const subscriptions = subscriptionService.listAllSubscriptions();
    res.status(200).json({
      success: true,
      data: subscriptions,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 7. Payment & Invoice Finance Panel
 */
adminRouter.get(
  "/payments",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.FINANCE_ADMIN),
  async (_req: Request, res: Response) => {
    const payments = paymentService.listAllPaymentOrders();
    res.status(200).json({
      success: true,
      data: payments,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 8. Community Moderation
 */
adminRouter.get(
  "/moderation",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.CONTENT_MODERATOR),
  async (_req: Request, res: Response) => {
    const reports = communityService.listReports();
    const pendingPosts = communityService.getPendingPosts();
    res.status(200).json({
      success: true,
      data: {
        reports,
        pendingPosts,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

adminRouter.post(
  "/moderation/posts/:id/action",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.CONTENT_MODERATOR),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { action, reason } = req.body;

    if (!action || !["APPROVE", "REMOVE", "HIDE"].includes(action)) {
      throw new AppError("Invalid moderation action", 400, "BAD_REQUEST");
    }

    const updatedPost = communityService.updatePostStatus(id, action === "APPROVE" ? "APPROVED" : "REJECTED", reason);

    auditService.logSecurityAction(
      req.user!.userId,
      req.user!.roles[0],
      `MODERATION_POST_${action}`,
      "COMMUNITY_POST",
      id,
      { action, reason },
      undefined,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Community post moderation action completed: ${action}`,
      post: updatedPost,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 9. Support & Grievance Administration
 */
adminRouter.get(
  "/support",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.SUPPORT_ADMIN),
  async (_req: Request, res: Response) => {
    const tickets = supportService.listTickets();
    res.status(200).json({
      success: true,
      data: tickets,
      timestamp: new Date().toISOString(),
    });
  }
);

adminRouter.post(
  "/support/:id/status",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.SUPPORT_ADMIN),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!status || !["IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) {
      throw new AppError("Invalid support ticket status", 400, "BAD_REQUEST");
    }

    const ticket = supportService.updateTicketStatus(id, status, note, req.user!.userId);

    auditService.logSecurityAction(
      req.user!.userId,
      req.user!.roles[0],
      `SUPPORT_TICKET_${status}`,
      "SUPPORT_TICKET",
      id,
      { status, note },
      undefined,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Support ticket updated to ${status}`,
      ticket,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 10. Audit Log Viewer
 */
adminRouter.get(
  "/audit",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (req: Request, res: Response) => {
    const { role, entity } = req.query;
    const securityLogs = auditService.getSecurityLogs(role as string, entity as string, 100);
    const businessEvents = auditService.getBusinessEvents(undefined, 100);

    res.status(200).json({
      success: true,
      data: {
        securityLogs,
        businessEvents,
      },
      notice: "Audit records are immutable and read-only.",
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * 11. Configuration Settings Inspection
 */
adminRouter.get(
  "/configuration",
  authMiddleware(true),
  requireRoles(PlatformRoles.SUPER_ADMIN, PlatformRoles.COMPLIANCE_ADMIN),
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        complianceRules: {
          immutableRecommendationLedger: true,
          requireExplicitSuitabilityAgreement: true,
          trackRecordMethodologyVersion: "TR-STD-V1",
          gstRatePercent: 18.0,
          disclaimerRequirement: "SEBI Registered RA/IA Disclosures",
        },
        supportedRolesCount: Object.keys(PlatformRoles).length,
      },
      timestamp: new Date().toISOString(),
    });
  }
);
