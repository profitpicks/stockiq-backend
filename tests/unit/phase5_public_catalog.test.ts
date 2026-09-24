import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../../api/app.js";
import { CatalogService } from "../../modules/services/catalog.service.ts";
import { ServiceManagementService } from "../../modules/services/management.service.ts";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { VerificationService } from "../../modules/providers/verification.service.ts";
import { DatabaseMigrator } from "../../database/migrator.js";

describe("Unit & Integration: Phase 5 Public Directory & Service Catalog Foundation", () => {
  let server: http.Server;
  let baseUrl: string;
  const providerService = new ProviderService();
  const verificationService = new VerificationService(providerService);
  const managementService = new ServiceManagementService(providerService);
  const catalogService = new CatalogService();

  before(async () => {
    // Execute database migrations including 003_public_directory_service_catalog.sql
    const migrator = new DatabaseMigrator();
    await migrator.applyPendingMigrations();

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { address: string; port: number };
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  async function jsonFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  it("1. Public Directory lists verified providers with factual fields and SEBI disclaimer", async () => {
    const res = await jsonFetch(`${baseUrl}/public/directory`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.providers));
    assert.ok(res.data.sebiDisclaimer);
    assert.ok(res.data.sebiDisclaimer.includes("does not guarantee provider performance"));

    for (const provider of res.data.providers) {
      assert.ok(provider.legalName);
      assert.ok(provider.sebiRegistrationNumber);
      assert.ok(provider.providerType);
      // Ensure private fields are NEVER exposed
      assert.equal((provider as any).fileHash, undefined);
      assert.equal((provider as any).storageReference, undefined);
      assert.equal((provider as any).officerNotes, undefined);
      assert.equal((provider as any).password, undefined);
    }
  });

  it("2. Public Provider Profile clearly distinguishes registration, verification, and disclosures", async () => {
    // Create a mock provider profile
    const testUserId = "00000000-0000-4000-8000-000000000099";
    const reg = await providerService.registerProvider({
      userId: testUserId,
      providerType: "RESEARCH_ANALYST",
      entityType: "INDIVIDUAL",
      legalName: "Apex Equity Research",
      sebiRegistrationNumber: "INH000099887",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Financial Center, Nariman Point, Mumbai",
      isNismCertified: true,
    });

    const profileRes = await jsonFetch(`${baseUrl}/public/directory/${reg.id}`);
    assert.equal(profileRes.status, 200);
    const p = profileRes.data.provider;
    assert.ok(p);
    assert.equal(p.legalName, "Apex Equity Research");
    assert.equal(p.sebiRegistrationNumber, "INH000099887");
    assert.ok(p.verificationStatus.includes("pending") || p.verificationStatus.includes("Verified"));
    assert.ok(profileRes.data.sebiDisclaimer);
  });

  it("3. Provider can create, update, and submit a service draft for review", async () => {
    const providerUserId = "00000000-0000-4000-8000-000000000088";
    const provider = await providerService.registerProvider({
      userId: providerUserId,
      providerType: "INVESTMENT_ADVISER",
      entityType: "NON_INDIVIDUAL",
      legalName: "Zenith Wealth Management",
      sebiRegistrationNumber: "INA000077665",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Bandrakurla Complex, Mumbai",
      isNismCertified: true,
    });

    // Create Service Draft
    const draft = await managementService.createServiceDraft(provider.id, providerUserId, {
      serviceName: "Tactical Equity Portfolio",
      serviceCategory: "PORTFOLIO_ADVISORY",
      shortDescription: "Quantitative model portfolio focused on large-cap equity growth",
      detailedDescription: "Long-only quantitative rules-based portfolio allocation model focusing on NSE Nifty 100 constituents.",
      serviceType: "MODEL_PORTFOLIO",
      marketSegment: "INDIAN_EQUITIES",
      eligibilityInfo: "RETAIL_INVESTORS",
      pricingReference: "Rs 2,500 / month",
      feeInPaise: 250000,
      billingDuration: "MONTHLY",
      disclosures: {
        riskDisclosureText: "High risk equity portfolio subject to market volatility.",
        conflictsDisclosure: "Adviser may trade in underlying securities subject to compliance blackout periods.",
        regulatoryDisclosure: "INA000077665. Registration does not imply guaranteed returns.",
        performanceDisclaimer: "Past returns do not guarantee future returns.",
      },
    });

    assert.ok(draft.service.id);
    assert.equal(draft.service.status, "DRAFT");
    assert.equal(draft.version.versionNumber, 1);

    // Verify unapproved service is NOT visible publicly
    const publicDetailBefore = await catalogService.getPublicServiceDetail(draft.service.id);
    assert.equal(publicDetailBefore, null);

    // Submit for review
    const submitted = await managementService.submitServiceForReview(provider.id, providerUserId, draft.service.id);
    assert.equal(submitted.status, "PENDING_REVIEW");
  });

  it("4. Verification Officer can review and publish a service to the public catalog", async () => {
    const providerUserId = "00000000-0000-4000-8000-000000000077";
    const provider = await providerService.registerProvider({
      userId: providerUserId,
      providerType: "RESEARCH_ANALYST",
      entityType: "INDIVIDUAL",
      legalName: "Alpha Macro Research",
      sebiRegistrationNumber: "INH000066554",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Connaught Place, New Delhi",
      isNismCertified: true,
    });

    const draft = await managementService.createServiceDraft(provider.id, providerUserId, {
      serviceName: "India Macro & Earnings Insight",
      serviceCategory: "EQUITY_RESEARCH",
      shortDescription: "Monthly macro research report and sector earnings analysis",
      detailedDescription: "In-depth quarterly macroeconomic research reports covering Indian equity market cycles.",
      serviceType: "RESEARCH_REPORT",
      marketSegment: "INDIAN_EQUITIES",
      pricingReference: "Rs 1,000 / month",
      feeInPaise: 100000,
      billingDuration: "MONTHLY",
    });

    await managementService.submitServiceForReview(provider.id, providerUserId, draft.service.id);

    // Review & Approve service
    const published = await managementService.reviewService("officer_1", draft.service.id, "APPROVE", "Approved compliance review");
    assert.equal(published.status, "PUBLISHED");

    // Verify published service is now in Public Catalog
    const publicServices = await catalogService.getPublicServices({ keyword: "Macro" });
    assert.ok(publicServices.length >= 1);
    const item = publicServices.find((s) => s.id === draft.service.id);
    assert.ok(item);
    assert.equal(item.serviceName, "India Macro & Earnings Insight");
    assert.equal(item.providerType, "RESEARCH_ANALYST");
    assert.ok(item.disclosures?.riskDisclosureText);
    assert.ok(item.disclosures?.performanceDisclaimer);
  });

  it("5. Service Versioning blueprint preserves historical versions without silent overwrite", async () => {
    const providerUserId = "00000000-0000-4000-8000-000000000066";
    const provider = await providerService.registerProvider({
      userId: providerUserId,
      providerType: "INVESTMENT_ADVISER",
      entityType: "INDIVIDUAL",
      legalName: "Vanguard Advisory",
      sebiRegistrationNumber: "INA000055443",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "MG Road, Bengaluru, Karnataka",
      isNismCertified: true,
    });

    const draft = await managementService.createServiceDraft(provider.id, providerUserId, {
      serviceName: "Fixed Income Retirement Plan - Version 1",
      serviceCategory: "WEALTH_MANAGEMENT",
      shortDescription: "Debt and fixed income advisory scheme v1",
      detailedDescription: "Fixed income asset allocation model focusing on AAA corporate bonds and sovereign debt.",
      serviceType: "ADVISORY_RETAINER",
      marketSegment: "FIXED_INCOME",
      pricingReference: "Rs 1,500 / month",
    });

    await managementService.submitServiceForReview(provider.id, providerUserId, draft.service.id);
    await managementService.reviewService("officer_1", draft.service.id, "APPROVE");

    // Create Version 2 Blueprint
    const v2 = await managementService.createNewServiceVersion(provider.id, providerUserId, draft.service.id, {
      serviceName: "Fixed Income Retirement Plan - Version 2 Blueprint",
      serviceCategory: "WEALTH_MANAGEMENT",
      shortDescription: "Updated debt advisory scheme v2 with hybrid yield allocation",
      detailedDescription: "Expanded fixed income model incorporating sovereign green bonds.",
      serviceType: "ADVISORY_RETAINER",
      marketSegment: "FIXED_INCOME",
      pricingReference: "Rs 2,000 / month",
    });

    assert.equal(v2.versionNumber, 2);
    assert.equal(v2.status, "DRAFT");

    // Historical Version 1 remains intact
    const v1Detail = await catalogService.getPublicServiceVersionDetail(draft.service.id, 1);
    assert.ok(v1Detail);
    assert.equal(v1Detail.versionNumber, 1);
    assert.equal(v1Detail.status, "PUBLISHED");
  });

  it("6. Search and Filter endpoints operate factually and neutrally without ranking manipulation", async () => {
    const res = await jsonFetch(`${baseUrl}/public/catalog/search?serviceCategory=EQUITY_RESEARCH`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.services));
    assert.ok(res.data.sebiDisclaimer);

    // Verify response contains NO winner badges, ranking scores, or popularity metrics
    for (const item of res.data.services) {
      assert.equal((item as any).score, undefined);
      assert.equal((item as any).rank, undefined);
      assert.equal((item as any).winnerBadge, undefined);
      assert.equal((item as any).popularityIndex, undefined);
    }
  });
});
