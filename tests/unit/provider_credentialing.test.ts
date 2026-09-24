import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { VerificationService } from "../../modules/providers/verification.service.ts";
import {
  ProviderTypes,
  ProviderEntityTypes,
  ProviderStatuses,
  VerificationCaseStatuses,
} from "../../modules/providers/types.ts";
import { PlatformRoles } from "../../modules/auth/roles.js";

describe("Unit: Provider Credentialing & Verification Officer Workflow", () => {
  let providerService: ProviderService;
  let verificationService: VerificationService;

  beforeEach(() => {
    ProviderService.clearMemoryState();
    VerificationService.clearMemoryState();
    providerService = new ProviderService();
    verificationService = new VerificationService(providerService);
  });

  it("Provider Service: validates SEBI registration number formats", () => {
    // Valid RA
    assert.equal(ProviderService.validateSebiRegistrationNumber("INH000012345", ProviderTypes.RESEARCH_ANALYST).isValidFormat, true);
    // Non-standard format RA
    assert.equal(ProviderService.validateSebiRegistrationNumber("INA000012345", ProviderTypes.RESEARCH_ANALYST).isValidFormat, false);

    // Valid IA
    assert.equal(ProviderService.validateSebiRegistrationNumber("INA000099999", ProviderTypes.INVESTMENT_ADVISER).isValidFormat, true);
    // Non-standard format IA
    assert.equal(ProviderService.validateSebiRegistrationNumber("INH000099999", ProviderTypes.INVESTMENT_ADVISER).isValidFormat, false);
  });

  it("Provider Service: registers provider draft, adds declarations and documents, then submits", async () => {
    const userId = "usr_provider_1";

    // 1. Register Draft Profile
    const provider = await providerService.registerProvider({
      userId,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.INDIVIDUAL,
      legalName: "Apex Research Services",
      sebiRegistrationNumber: "INH000088888",
      validFrom: "2024-01-01",
      validTill: "2029-01-01",
      registeredOfficeAddress: "123 Financial District, Mumbai, India",
      isNismCertified: true,
      panNumber: "ABCDE1234F",
    });

    assert.equal(provider.status, ProviderStatuses.DRAFT);
    assert.equal(provider.providerType, ProviderTypes.RESEARCH_ANALYST);
    assert.equal(provider.entityType, ProviderEntityTypes.INDIVIDUAL);

    // 2. Add Compliance Declaration
    const decl = await providerService.addDeclaration(provider.id, {
      declarationType: "NO_SEBI_DEBARMENT_DECLARATION",
      isDeclared: true,
      ipAddress: "127.0.0.1",
    });
    assert.equal(decl.isDeclared, true);

    // 3. Add Document Metadata
    const doc = await providerService.addDocument(provider.id, {
      documentType: "SEBI_REGISTRATION_CERTIFICATE",
      fileName: "sebi_cert_ra.pdf",
      fileHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      mimeType: "application/pdf",
    });
    assert.equal(doc.fileName, "sebi_cert_ra.pdf");

    // 4. Submit for Verification
    const submitResult = await providerService.submitProviderProfile(userId);
    assert.equal(submitResult.provider.status, ProviderStatuses.SUBMITTED);
    assert.equal(submitResult.verificationCase.status, VerificationCaseStatuses.PENDING);
  });

  it("Verification Officer Workflow: assigns case, reviews, and approves provider granting RA role", async () => {
    const userId = "usr_provider_ra_approval";
    const officerId = "usr_verification_officer_1";

    // Create and submit provider profile
    const provider = await providerService.registerProvider({
      userId,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.NON_INDIVIDUAL,
      legalName: "Quant Analytics Private Limited",
      sebiRegistrationNumber: "INH000077777",
      validFrom: "2023-05-15",
      isPerpetual: true,
      registeredOfficeAddress: "456 Corporate Park, Bengaluru, India",
      complianceOfficerName: "Jane Doe",
      complianceOfficerEmail: "compliance@quantanalytics.in",
      isNismCertified: true,
    });

    await providerService.addDeclaration(provider.id, {
      declarationType: "CODE_OF_CONDUCT_ATTESTATION",
      isDeclared: true,
    });

    await providerService.addDocument(provider.id, {
      documentType: "CORPORATE_INCORPORATION_CERTIFICATE",
      fileName: "inc_cert.pdf",
      fileHash: "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
      mimeType: "application/pdf",
    });

    const submitRes = await providerService.submitProviderProfile(userId);
    const caseId = submitRes.verificationCase.id;

    // Officer assigns case
    const assignedCase = await verificationService.assignCase(caseId, officerId);
    assert.equal(assignedCase.assignedOfficerId, officerId);
    assert.equal(assignedCase.status, VerificationCaseStatuses.IN_REVIEW);

    // Officer reviews and approves case
    const reviewRes = await verificationService.reviewCase({
      caseId,
      officerId,
      action: "APPROVE",
      notes: "SEBI Certificate verified via official registry database.",
    });

    assert.equal(reviewRes.case.status, VerificationCaseStatuses.APPROVED);
    assert.equal(reviewRes.event.action, "APPROVE");

    // Check verification events log
    const events = await verificationService.getVerificationEvents(caseId);
    assert.equal(events.length, 2); // CASE_ASSIGNED and APPROVE
    assert.equal(events[0].action, "CASE_ASSIGNED");
    assert.equal(events[1].action, "APPROVE");
  });
});
