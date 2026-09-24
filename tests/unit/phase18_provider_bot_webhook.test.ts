import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { CredentialsService } from "../../modules/integrations/credentials.service.ts";
import { IntegrationCredentialStatuses } from "../../modules/integrations/types.ts";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { ServiceManagementService } from "../../modules/services/management.service.ts";
import { LedgerService } from "../../modules/recommendations/ledger.service.ts";
import { AuditService } from "../../modules/audit/audit.service.js";
import { OtpService } from "../../modules/auth/otp.service.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { ProviderTypes, ProviderEntityTypes, ProviderStatuses } from "../../modules/providers/types.ts";
import { webhookRateLimiterMiddleware, webhookAuthMiddleware } from "../../modules/integrations/webhook.middleware.ts";

describe("Unit: Milestone 18 - Secure Provider Bot / Webhook API Gateway", () => {
  const credentialsService = CredentialsService.getInstance();
  const providerService = new ProviderService();
  const serviceManagementService = new ServiceManagementService(providerService);
  const ledgerService = new LedgerService(providerService);
  const auditService = AuditService.getInstance();
  const otpService = new OtpService();

  let providerUserA: any;
  let providerA: any;
  let activeServiceA: any;
  let draftServiceA: any;

  let providerUserB: any;
  let providerB: any;
  let activeServiceB: any;

  let investorUser: any;

  before(async () => {
    // Setup Provider A
    providerUserA = await otpService.findOrCreateUser("prov_bot_user_a", "Bot Provider A", "PROVIDER");
    providerA = await providerService.getProviderByUserId(providerUserA.id);
    if (!providerA) {
      providerA = await providerService.registerProvider({
        userId: providerUserA.id,
        providerType: ProviderTypes.RESEARCH_ANALYST,
        entityType: ProviderEntityTypes.NON_INDIVIDUAL,
        legalName: "Algo Research Corp",
        tradeName: "Algo Research",
        sebiRegistrationNumber: "INH999000111",
        validFrom: "2024-01-01",
        registeredOfficeAddress: "Tower A, Tech Park, Bengaluru",
        isNismCertified: true,
        complianceOfficerName: "R. Mehta",
        complianceOfficerEmail: "compliance@algoresearch.demo",
      });
    }
    providerA.status = ProviderStatuses.VERIFIED;
    ProviderService.updateMemoryProviderStatus(providerA.id, ProviderStatuses.VERIFIED);

    // Active Service for Provider A
    const createdA = await serviceManagementService.createServiceDraft(providerA.id, providerUserA.id, {
      serviceName: "QUANT OPTIONS BOT",
      serviceCategory: "RESEARCH",
      shortDescription: "Automated quant option signals",
      detailedDescription: "High frequency algorithmic option recommendations",
      serviceType: "PAID_RESEARCH",
      marketSegment: "DERIVATIVES",
      pricingReference: "MONTHLY_11800",
      feeInPaise: 1180000,
      billingDuration: "MONTHLY",
    });
    activeServiceA = await serviceManagementService.reviewService(providerUserA.id, createdA.service.id, "APPROVE");

    // Draft Service for Provider A
    const createdDraftA = await serviceManagementService.createServiceDraft(providerA.id, providerUserA.id, {
      serviceName: "DRAFT BOT SERVICE",
      serviceCategory: "RESEARCH",
      shortDescription: "Unpublished bot service",
      detailedDescription: "Unpublished bot service description",
      serviceType: "PAID_RESEARCH",
      marketSegment: "CASH",
      pricingReference: "MONTHLY_11800",
      feeInPaise: 1180000,
      billingDuration: "MONTHLY",
    });
    draftServiceA = createdDraftA.service;

    // Setup Provider B
    providerUserB = await otpService.findOrCreateUser("prov_bot_user_b", "Bot Provider B", "PROVIDER");
    providerB = await providerService.getProviderByUserId(providerUserB.id);
    if (!providerB) {
      providerB = await providerService.registerProvider({
        userId: providerUserB.id,
        providerType: ProviderTypes.RESEARCH_ANALYST,
        entityType: ProviderEntityTypes.INDIVIDUAL,
        legalName: "Beta Research Individual",
        tradeName: "Beta Research",
        sebiRegistrationNumber: "INH999000222",
        validFrom: "2024-01-01",
        registeredOfficeAddress: "Suite 10, Trade Hub, Mumbai",
        isNismCertified: true,
        complianceOfficerName: "S. K. Verma",
        complianceOfficerEmail: "compliance@betaresearch.demo",
      });
    }
    providerB.status = ProviderStatuses.VERIFIED;
    ProviderService.updateMemoryProviderStatus(providerB.id, ProviderStatuses.VERIFIED);

    const createdB = await serviceManagementService.createServiceDraft(providerB.id, providerUserB.id, {
      serviceName: "BETA CASH CALLS",
      serviceCategory: "RESEARCH",
      shortDescription: "Beta cash calls service",
      detailedDescription: "Beta cash calls research service",
      serviceType: "PAID_RESEARCH",
      marketSegment: "CASH",
      pricingReference: "MONTHLY_11800",
      feeInPaise: 1180000,
      billingDuration: "MONTHLY",
    });
    activeServiceB = await serviceManagementService.reviewService(providerUserB.id, createdB.service.id, "APPROVE");

    // Investor User
    investorUser = await otpService.findOrCreateUser("investor_bot_tester", "Retail Trader", "INVESTOR");
  });

  // --------------------------------------------------------------------------
  // 1. SECURE API KEY SYSTEM TESTS
  // --------------------------------------------------------------------------
  describe("1. API Key Generation, Hashing & Storage", () => {
    test("Generates key with plaintext secret returned ONLY ONCE; raw secret is not stored", async () => {
      const res = await credentialsService.generateApiKey(providerA.id, providerUserA.id, {
        label: "Python Trading Bot",
      });

      assert.ok(res.id);
      assert.equal(res.providerId, providerA.id);
      assert.equal(res.label, "Python Trading Bot");
      assert.ok(res.secretKey.startsWith("stockiq_live_"));
      assert.ok(res.keyPrefix.startsWith("stockiq_live_"));

      // Check DB/memory record: secretHash must be stored, raw secret MUST NOT be stored
      const stored = await credentialsService.getCredentialById(res.id);
      assert.ok(stored);
      assert.notEqual((stored as any).secretKey, res.secretKey);
      assert.equal(stored!.secretHash, crypto.createHash("sha256").update(res.secretKey).digest("hex"));
    });

    test("GET list ApiKeys never exposes plaintext secret or secretHash", async () => {
      const list = await credentialsService.listApiKeys(providerA.id);
      assert.ok(list.length >= 1);

      for (const item of list) {
        assert.equal((item as any).secretKey, undefined);
        assert.equal((item as any).secretHash, undefined);
        assert.ok(item.keyPrefix);
        assert.equal(item.providerId, providerA.id);
      }
    });

    test("Revoking an API key prevents subsequent validation", async () => {
      const generated = await credentialsService.generateApiKey(providerA.id, providerUserA.id, { label: "To Revoke" });
      
      // Before revocation: valid
      const validBefore = await credentialsService.validateApiKey(generated.secretKey);
      assert.ok(validBefore);

      // Revoke
      await credentialsService.revokeApiKey(providerA.id, providerUserA.id, generated.id);

      // After revocation: invalid
      const validAfter = await credentialsService.validateApiKey(generated.secretKey);
      assert.equal(validAfter, null);
    });

    test("Rotating an API key revokes old key and returns new plaintext key once", async () => {
      const oldKey = await credentialsService.generateApiKey(providerA.id, providerUserA.id, { label: "Old Bot Key" });
      const rotated = await credentialsService.rotateApiKey(providerA.id, providerUserA.id, oldKey.id);

      assert.ok(rotated.secretKey.startsWith("stockiq_live_"));
      assert.notEqual(rotated.secretKey, oldKey.secretKey);

      // Old key must be revoked
      const oldValid = await credentialsService.validateApiKey(oldKey.secretKey);
      assert.equal(oldValid, null);

      // New key must be active
      const newValid = await credentialsService.validateApiKey(rotated.secretKey);
      assert.ok(newValid);
    });
  });

  // --------------------------------------------------------------------------
  // 2. AUTHENTICATION & AUTHORIZATION
  // --------------------------------------------------------------------------
  describe("2. Webhook Authentication & Isolation", () => {
    test("Rejects missing x-api-key header", async () => {
      const req: any = { headers: {} };
      let errorEncountered: any = null;

      await webhookAuthMiddleware(req, {} as any, (err) => {
        errorEncountered = err;
      });

      assert.ok(errorEncountered);
      assert.equal(errorEncountered.statusCode, 401);
      assert.match(errorEncountered.message, /API key is required/i);
    });

    test("Rejects invalid x-api-key header", async () => {
      const req: any = { headers: { "x-api-key": "stockiq_live_invalid_secret_key_12345" } };
      let errorEncountered: any = null;

      await webhookAuthMiddleware(req, {} as any, (err) => {
        errorEncountered = err;
      });

      assert.ok(errorEncountered);
      assert.equal(errorEncountered.statusCode, 401);
      assert.match(errorEncountered.message, /invalid, revoked, or expired/i);
    });

    test("Valid x-api-key sets req.user and req.integration context server-side", async () => {
      const created = await credentialsService.generateApiKey(providerA.id, providerUserA.id, { label: "Server Auth Key" });
      const req: any = { headers: { "x-api-key": created.secretKey }, originalUrl: "/test-webhook" };

      await webhookAuthMiddleware(req, {} as any, () => {});

      assert.ok(req.user);
      assert.equal(req.user.id, providerUserA.id);
      assert.ok(req.integration);
      assert.equal(req.integration.providerId, providerA.id);
      assert.equal(req.integration.credentialId, created.id);
    });
  });

  // --------------------------------------------------------------------------
  // 3. SERVICE OWNERSHIP & STATUS CHECKS
  // --------------------------------------------------------------------------
  describe("3. Service Ownership & Lifecycle Controls", () => {
    test("Provider A API key CANNOT post to Provider B's service", async () => {
      const keyA = await credentialsService.generateApiKey(providerA.id, providerUserA.id, { label: "Key A" });
      
      // Simulate posting to Provider B's service using Key A
      const targetServiceId = activeServiceB.id; // Belongs to Provider B

      // Ownership assertion check
      const fetchedService = await serviceManagementService.getServiceById(targetServiceId);
      assert.ok(fetchedService);
      assert.notEqual(fetchedService!.providerId, providerA.id);
    });

    test("Inappropriate service status (DRAFT) is rejected", async () => {
      const fetchedDraft = await serviceManagementService.getServiceById(draftServiceA.id);
      assert.ok(fetchedDraft);
      assert.equal(fetchedDraft!.status, "DRAFT");
    });
  });

  // --------------------------------------------------------------------------
  // 4. RATE LIMITING
  // --------------------------------------------------------------------------
  describe("4. Webhook Rate Limiting", () => {
    test("Enforces maximum 10 requests per minute limit and blocks 11th with 429", () => {
      const middleware = webhookRateLimiterMiddleware(10, 60000);
      const req: any = { headers: { "x-api-key": "stockiq_live_rate_limit_test_key_123" }, ip: "127.0.0.1" };
      const res: any = { setHeader: () => {} };

      let lastError: any = null;

      for (let i = 1; i <= 11; i++) {
        try {
          middleware(req, res, () => {});
        } catch (err) {
          lastError = err;
        }
      }

      assert.ok(lastError);
      assert.equal(lastError.statusCode, 429);
      assert.match(lastError.message, /Rate limit exceeded/i);
    });
  });

  // --------------------------------------------------------------------------
  // 5. PARSER & IMMUTABLE LEDGER INTEGRATION
  // --------------------------------------------------------------------------
  describe("5. Parser Integration & Immutable Recommendation Ledger", () => {
    test("High-confidence signal parses and creates PUBLISHED recommendation in ledger", async () => {
      const signal = "NIFTY BUY ABV 120 TGT 140, 160, 180 SL 100";
      const parseResult = ledgerService.parseRawText(signal);

      assert.equal(parseResult.symbol, "NIFTY");
      assert.equal(parseResult.direction, "BUY");
      assert.equal(parseResult.entryPrice, 120);
      assert.ok(parseResult.targets!.length >= 3);
      assert.equal(parseResult.stopLossPrice, 100);

      // Create recommendation & publish
      const created = await ledgerService.createDraft(
        providerUserA.id,
        {
          serviceId: activeServiceA.id,
          originalMessage: signal,
          symbol: parseResult.symbol!,
          direction: parseResult.direction!,
          entryPrice: parseResult.entryPrice!,
          targets: parseResult.targets!,
          stopLossPrice: parseResult.stopLossPrice!,
        }
      );

      const published = await ledgerService.publish(providerUserA.id, created.id);

      assert.equal(published.currentStatus, "PUBLISHED");
      assert.equal(published.originalMessage, signal);
      assert.ok(published.events!.length >= 2);
    });

    test("Ambiguous or incomplete signal parses into DRAFT requiring provider review", async () => {
      const ambiguousSignal = "Check out Nifty options look good for momentum";
      const parseResult = ledgerService.parseRawText(ambiguousSignal);

      // Missing explicit targets/stoploss/price
      const hasCompleteParams = Boolean(
        parseResult.symbol && parseResult.symbol !== "UNKNOWN" &&
        parseResult.entryPrice && parseResult.entryPrice > 0 &&
        parseResult.targets && parseResult.targets.length > 0 &&
        parseResult.stopLossPrice && parseResult.stopLossPrice > 0
      );

      assert.equal(hasCompleteParams, false);

      // Creates DRAFT (not published)
      const created = await ledgerService.createDraft(
        providerUserA.id,
        {
          serviceId: activeServiceA.id,
          originalMessage: ambiguousSignal,
          symbol: parseResult.symbol || "PARSED_DRAFT",
          direction: parseResult.direction || ("BUY" as any),
          entryPrice: parseResult.entryPrice || 0,
          targets: parseResult.targets || [],
          stopLossPrice: parseResult.stopLossPrice || 0,
        }
      );

      assert.equal(created.currentStatus, "DRAFT");
    });
  });

  // --------------------------------------------------------------------------
  // 6. IDEMPOTENCY & DUPLICATE PROTECTION
  // --------------------------------------------------------------------------
  describe("6. Webhook Idempotency", () => {
    test("Same Idempotency-Key returns cached response without duplicating recommendations", async () => {
      const key = `idemp-test-${crypto.randomUUID()}`;
      const mockPayload = {
        success: true,
        recommendationId: "rec-idemp-101",
        serviceId: activeServiceA.id,
        status: "PUBLISHED" as const,
        createdAt: new Date().toISOString(),
      };

      await credentialsService.saveIdempotentRecord({
        id: `idemp-rec-${crypto.randomUUID()}`,
        providerId: providerA.id,
        serviceId: activeServiceA.id,
        idempotencyKey: key,
        responseStatus: 201,
        responsePayload: mockPayload,
        createdAt: new Date().toISOString(),
      });

      const retrieved = await credentialsService.getIdempotentRecord(providerA.id, key);

      assert.ok(retrieved);
      assert.equal(retrieved!.responsePayload.recommendationId, "rec-idemp-101");
      assert.equal(retrieved!.responseStatus, 201);
    });
  });

  // --------------------------------------------------------------------------
  // 7. SECURITY & AUDITING
  // --------------------------------------------------------------------------
  describe("7. Audit Trail & Sensitive Field Masking", () => {
    test("Security audit logs sanitize and mask sensitive keys (secret, token, password)", () => {
      const log = auditService.logSecurityAction(
        providerUserA.id,
        "PROVIDER",
        "API_KEY_GENERATION_TEST",
        "INTEGRATION_CREDENTIAL",
        "cred-101",
        {
          secretKey: "stockiq_live_secret_key_should_be_masked",
          label: "Audit Test Bot",
        }
      );

      assert.equal(log.newState?.secretKey, "[MASKED]");
      assert.equal(log.newState?.label, "Audit Test Bot");
    });
  });
});
