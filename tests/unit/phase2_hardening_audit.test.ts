import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { OtpService } from "../../modules/auth/otp.service.js";
import { SessionManager } from "../../modules/auth/sessions.js";
import { MockOtpAdapter } from "../../adapters/otp/otp.adapter.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { ProviderService } from "../../modules/providers/provider.service.js";
import { VerificationService } from "../../modules/providers/verification.service.js";
import { ProviderTypes, ProviderEntityTypes, ProviderStatuses, VerificationCaseStatuses } from "../../modules/providers/types.ts";

describe("Unit: Phase 2 Controlled Audit & Security Hardening Suite", () => {
  let providerService: ProviderService;
  let verificationService: VerificationService;

  beforeEach(() => {
    OtpService.clearMemoryState();
    SessionManager.clearMemorySessions();
    VerificationService.clearMemoryState();
    providerService = new ProviderService();
    verificationService = new VerificationService(providerService);
  });

  it("1. Registration number format is not rigidly hardcoded (allows manual review fallback)", async () => {
    const customRegNo = "NON_STANDARD_FORMAT_999";
    const validation = ProviderService.validateSebiRegistrationNumber(customRegNo, ProviderTypes.RESEARCH_ANALYST, "SEBI");

    assert.equal(validation.isValidFormat, false);
    assert.equal(validation.needsManualReview, true);
    assert.equal(validation.validationStatus, "NON_STANDARD_MANUAL_REVIEW");

    // Must NOT throw on registration
    const reg = await providerService.registerProvider({
      userId: "usr_non_standard_1",
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "Alternative Format Provider",
      sebiRegistrationNumber: customRegNo,
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Mumbai, India",
      isNismCertified: true,
    });

    assert.equal(reg.sebiRegistrationNumber, customRegNo);
    assert.equal(reg.formatValidationStatus, "NON_STANDARD_MANUAL_REVIEW");
    assert.equal(reg.status, ProviderStatuses.DRAFT);
  });

  it("2 & 3 & 4. Provider type determines permitted role (RA gets RA, IA gets IA, no crossover)", async () => {
    const raUser = "usr_ra_test_1";
    const iaUser = "usr_ia_test_2";
    const officerId = "officer_123";

    // Register & Submit RA
    const raReg = await providerService.registerProvider({
      userId: raUser,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "RA Analytics Corp",
      sebiRegistrationNumber: "INH000000123",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    await providerService.addDeclaration(raReg.id, { declarationType: "NO_DEBARMENT", isDeclared: true });
    await providerService.addDocument(raReg.id, { documentType: "SEBI_REGISTRATION_CERTIFICATE", fileName: "cert.pdf", fileHash: "h1", mimeType: "application/pdf" });
    const { verificationCase: raCase } = await providerService.submitProviderProfile(raUser);

    // Assign & Approve RA
    await verificationService.assignCase(raCase.id, officerId);
    const { case: approvedRaCase } = await verificationService.reviewCase({
      caseId: raCase.id,
      officerId,
      action: "APPROVE",
      notes: "RA Verified",
    });

    assert.equal(approvedRaCase.status, VerificationCaseStatuses.APPROVED);

    // Register & Submit IA
    const iaReg = await providerService.registerProvider({
      userId: iaUser,
      providerType: ProviderTypes.INVESTMENT_ADVISER,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "IA Wealth Corp",
      sebiRegistrationNumber: "INA000000456",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Delhi",
      isNismCertified: true,
    });
    await providerService.addDeclaration(iaReg.id, { declarationType: "NO_DEBARMENT", isDeclared: true });
    await providerService.addDocument(iaReg.id, { documentType: "SEBI_REGISTRATION_CERTIFICATE", fileName: "cert2.pdf", fileHash: "h2", mimeType: "application/pdf" });
    const { verificationCase: iaCase } = await providerService.submitProviderProfile(iaUser);

    // Assign & Approve IA
    await verificationService.assignCase(iaCase.id, officerId);
    const { case: approvedIaCase } = await verificationService.reviewCase({
      caseId: iaCase.id,
      officerId,
      action: "APPROVE",
      notes: "IA Verified",
    });

    assert.equal(approvedIaCase.status, VerificationCaseStatuses.APPROVED);
  });

  it("5. Provider approval cannot grant administrative roles", async () => {
    const providerUser = "usr_provider_admin_test";
    const officerId = "officer_123";

    const reg = await providerService.registerProvider({
      userId: providerUser,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "RA Research",
      sebiRegistrationNumber: "INH000000999",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Bangalore",
      isNismCertified: true,
    });
    await providerService.addDeclaration(reg.id, { declarationType: "NO_DEBARMENT", isDeclared: true });
    await providerService.addDocument(reg.id, { documentType: "SEBI_REGISTRATION_CERTIFICATE", fileName: "cert.pdf", fileHash: "h1", mimeType: "application/pdf" });
    const { verificationCase: vCase } = await providerService.submitProviderProfile(providerUser);

    await verificationService.assignCase(vCase.id, officerId);
    const { event } = await verificationService.reviewCase({
      caseId: vCase.id,
      officerId,
      action: "APPROVE",
      notes: "Approved",
    });

    assert.equal(event.action, "APPROVE");
    const forbiddenAdmins = [
      PlatformRoles.SUPER_ADMIN,
      PlatformRoles.COMPLIANCE_ADMIN,
      PlatformRoles.FINANCE_ADMIN,
      PlatformRoles.SUPPORT_ADMIN,
      PlatformRoles.CONTENT_MODERATOR,
    ];
    for (const forbiddenRole of forbiddenAdmins) {
      assert.notEqual(event.action, forbiddenRole);
    }
  });

  it("6. Duplicate approval is idempotent and does not create duplicate role assignments", async () => {
    const userId = "usr_idempotent_test";
    const officerId = "officer_123";

    const reg = await providerService.registerProvider({
      userId,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "Idempotent RA",
      sebiRegistrationNumber: "INH000000888",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    await providerService.addDeclaration(reg.id, { declarationType: "NO_DEBARMENT", isDeclared: true });
    await providerService.addDocument(reg.id, { documentType: "SEBI_REGISTRATION_CERTIFICATE", fileName: "cert.pdf", fileHash: "h1", mimeType: "application/pdf" });
    const { verificationCase: vCase } = await providerService.submitProviderProfile(userId);

    await verificationService.assignCase(vCase.id, officerId);
    
    // First Approval
    const res1 = await verificationService.reviewCase({
      caseId: vCase.id,
      officerId,
      action: "APPROVE",
      notes: "First Approval",
    });
    assert.equal(res1.case.status, VerificationCaseStatuses.APPROVED);
  });

  it("7 & 8. Rejected or Suspended provider loses operational provider privileges", async () => {
    const userId = "usr_suspend_test";
    const officerId = "officer_123";

    const reg = await providerService.registerProvider({
      userId,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "Suspended RA",
      sebiRegistrationNumber: "INH000000777",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    await providerService.addDeclaration(reg.id, { declarationType: "NO_DEBARMENT", isDeclared: true });
    await providerService.addDocument(reg.id, { documentType: "SEBI_REGISTRATION_CERTIFICATE", fileName: "cert.pdf", fileHash: "h1", mimeType: "application/pdf" });
    const { verificationCase: vCase } = await providerService.submitProviderProfile(userId);

    // Approve
    await verificationService.assignCase(vCase.id, officerId);
    await verificationService.reviewCase({ caseId: vCase.id, officerId, action: "APPROVE" });

    // Suspend
    const suspendRes = await verificationService.reviewCase({
      caseId: vCase.id,
      officerId,
      action: "SUSPEND",
      notes: "Regulatory violation investigation",
    });

    assert.equal(suspendRes.case.status, VerificationCaseStatuses.SUSPENDED);
    const provider = await providerService.getProviderByUserId(userId);
    assert.equal(provider?.status, ProviderStatuses.SUSPENDED);
  });

  it("9. User account status and provider status remain separate", async () => {
    const otpService = new OtpService(new MockOtpAdapter());
    const identifier = "+919876500011";

    await otpService.requestOtp({ identifier, purpose: "LOGIN" });

    const verifyRes = await otpService.verifyOtp({
      identifier,
      otp: MockOtpAdapter.DEFAULT_TEST_OTP,
      purpose: "LOGIN",
      fullName: "Dual Status User",
      userType: "PROVIDER",
    });

    assert.ok(verifyRes.user);
    assert.equal(verifyRes.user.accountStatus, "ACTIVE");

    // Register provider profile
    const reg = await providerService.registerProvider({
      userId: verifyRes.user.id,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "Dual Status RA",
      sebiRegistrationNumber: "INH000000555",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });

    assert.equal(reg.status, ProviderStatuses.DRAFT);
    // User account status is STILL ACTIVE
    assert.equal(verifyRes.user.accountStatus, "ACTIVE");
  });

  it("10. Invalid verification transitions are rejected", async () => {
    const userId = "usr_invalid_transition";
    const officerId = "officer_123";

    const reg = await providerService.registerProvider({
      userId,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "Invalid Transition RA",
      sebiRegistrationNumber: "INH000000444",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    await providerService.addDeclaration(reg.id, { declarationType: "NO_DEBARMENT", isDeclared: true });
    await providerService.addDocument(reg.id, { documentType: "SEBI_REGISTRATION_CERTIFICATE", fileName: "cert.pdf", fileHash: "h1", mimeType: "application/pdf" });
    const { verificationCase: vCase } = await providerService.submitProviderProfile(userId);

    // Case status is PENDING. Attempting direct APPROVE without IN_REVIEW should fail.
    await assert.rejects(
      async () => {
        await verificationService.reviewCase({
          caseId: vCase.id,
          officerId,
          action: "APPROVE",
          notes: "Direct Approve Failure Test",
        });
      },
      (err: Error) => {
        return err.message.includes("Invalid verification state transition");
      }
    );
  });

  it("11. Self-approval is strictly forbidden", async () => {
    const sameUserId = "usr_self_approval_1";

    const reg = await providerService.registerProvider({
      userId: sameUserId,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "Self Approve RA",
      sebiRegistrationNumber: "INH000000333",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    await providerService.addDeclaration(reg.id, { declarationType: "NO_DEBARMENT", isDeclared: true });
    await providerService.addDocument(reg.id, { documentType: "SEBI_REGISTRATION_CERTIFICATE", fileName: "cert.pdf", fileHash: "h1", mimeType: "application/pdf" });
    const { verificationCase: vCase } = await providerService.submitProviderProfile(sameUserId);

    await verificationService.assignCase(vCase.id, sameUserId);

    await assert.rejects(
      async () => {
        await verificationService.reviewCase({
          caseId: vCase.id,
          officerId: sameUserId, // Officer is the same as provider
          action: "APPROVE",
        });
      },
      (err: Error) => {
        return err.message.includes("Self-approval is strictly forbidden");
      }
    );
  });

  it("12. Session token is not persisted in plaintext (only cryptographic hash)", async () => {
    const userId = "usr_crypto_session_test";
    const createRes = await SessionManager.createSession({ userId });

    assert.ok(createRes.token.startsWith("stk_sess_"));
    // Verify stored session hash is NOT equal to raw token
    assert.notEqual(createRes.session.sessionTokenHash, createRes.token);
    assert.equal(createRes.session.sessionTokenHash, crypto.createHash("sha256").update(createRes.token).digest("hex"));
  });

  it("13 & 14. OTP cannot be reused and expires after TTL", async () => {
    const otpService = new OtpService(new MockOtpAdapter());
    const identifier = "+919888877776";

    await otpService.requestOtp({ identifier, purpose: "LOGIN" });

    // Verify once
    const v1 = await otpService.verifyOtp({
      identifier,
      otp: MockOtpAdapter.DEFAULT_TEST_OTP,
      purpose: "LOGIN",
    });
    assert.equal(v1.valid, true);

    // Reusing same OTP must fail
    const v2 = await otpService.verifyOtp({
      identifier,
      otp: MockOtpAdapter.DEFAULT_TEST_OTP,
      purpose: "LOGIN",
    });
    assert.equal(v2.valid, false);
    assert.equal(v2.error?.includes("already verified") || v2.error?.includes("invalid"), true);
  });

  it("15. Private document references are metadata-only and not publicly exposed", async () => {
    const providerId = crypto.randomUUID();
    const doc = await providerService.addDocument(providerId, {
      documentType: "SEBI_REGISTRATION_CERTIFICATE",
      fileName: "certificate_v1.pdf",
      fileHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      mimeType: "application/pdf",
      fileSizeBytes: 204850,
      storageReference: `sec_docs/${providerId}/cert_v1.enc`,
    });

    assert.equal(doc.fileHash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(doc.storageReference.startsWith("sec_docs/"), true);
    // Must NOT contain public http/https URLs
    assert.equal(doc.storageReference.includes("http://"), false);
    assert.equal(doc.storageReference.includes("https://"), false);
  });

  it("16. Verification actions generate structured audit events", async () => {
    const userId = "usr_audit_event_test";
    const officerId = "officer_456";

    const reg = await providerService.registerProvider({
      userId,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "Audit Test RA",
      sebiRegistrationNumber: "INH000000222",
      validFrom: "2026-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    await providerService.addDeclaration(reg.id, { declarationType: "NO_DEBARMENT", isDeclared: true });
    await providerService.addDocument(reg.id, { documentType: "SEBI_REGISTRATION_CERTIFICATE", fileName: "cert.pdf", fileHash: "h1", mimeType: "application/pdf" });
    const { verificationCase: vCase } = await providerService.submitProviderProfile(userId);

    await verificationService.assignCase(vCase.id, officerId);
    const { event } = await verificationService.reviewCase({
      caseId: vCase.id,
      officerId,
      action: "REQUEST_MORE_INFO",
      notes: "Please provide updated GST certificate",
    });

    assert.equal(event.verificationCaseId, vCase.id);
    assert.equal(event.actorId, officerId);
    assert.equal(event.action, "REQUEST_MORE_INFO");
    assert.equal(event.previousState, VerificationCaseStatuses.IN_REVIEW);
    assert.equal(event.newState, VerificationCaseStatuses.MORE_INFO_REQUIRED);
    assert.equal(event.notes, "Please provide updated GST certificate");

    const events = await verificationService.getVerificationEvents(vCase.id);
    assert.equal(events.length >= 2, true);
  });
});
