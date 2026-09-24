import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { app } from "../../api/app.js";
import { db } from "../../database/connection.js";
import { DatabaseMigrator } from "../../database/migrator.js";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { OtpService } from "../../modules/auth/otp.service.ts";
import { SessionManager } from "../../modules/auth/sessions.ts";
import { RecommendationEventTypes, RecommendationStatuses } from "../../modules/recommendations/types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Unit & Integration: Phase 7 Track Record & PaRRVA Verification Abstraction", () => {
  let server: http.Server;
  let baseUrl: string;
  const providerService = new ProviderService();
  const otpService = new OtpService();

  let verifiedRaToken: string;
  let verifiedRaId: string; // User ID
  let verifiedRaProviderId: string; // Provider ID
  let otherProviderToken: string;
  let complianceToken: string;
  let guestToken: string;

  before(async () => {
    // 0. Run migrations and seeds
    const migrator = new DatabaseMigrator();
    await migrator.applyPendingMigrations();

    const pool = db.getPool();
    const seedPath = path.join(__dirname, "../../database/seeds/001_foundation_roles.sql");
    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, "utf-8");
      await pool.query(seedSql);
    }

    // Clean up any existing Phase 7 test records to ensure absolute idempotency
    await pool.query(`DELETE FROM provider_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase7%')`);
    await pool.query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase7%')`);
    await pool.query(`DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase7%')`);
    await pool.query(`DELETE FROM users WHERE email LIKE '%phase7%'`);

    // 1. Start HTTP server
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { address: string; port: number };
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
        resolve();
      });
    });

    // 2. Setup Verified RA User & Provider
    const raUser = await otpService.findOrCreateUser("ra-user-phase7-1");
    verifiedRaId = raUser.id;
    const raProv = await providerService.registerProvider({
      userId: raUser.id,
      providerType: "RESEARCH_ANALYST",
      entityType: "INDIVIDUAL",
      legalName: "Verified RA Phase 7",
      tradeName: "RA Phase 7",
      sebiRegistrationNumber: "INH700000001",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    ProviderService.updateMemoryProviderStatus(raProv.id, "VERIFIED");
    verifiedRaProviderId = raProv.id;

    // Force verified status in postgres db as well
    await pool.query(
      `UPDATE provider_profiles SET status = 'VERIFIED' WHERE id = $1`,
      [raProv.id]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'RESEARCH_ANALYST') ON CONFLICT DO NOTHING`,
      [raUser.id]
    );

    const raSess = await SessionManager.createSession({ userId: raUser.id });
    verifiedRaToken = raSess.token;

    // 3. Setup Other Provider User
    const otherUser = await otpService.findOrCreateUser("other-provider-phase7");
    const otherProv = await providerService.registerProvider({
      userId: otherUser.id,
      providerType: "RESEARCH_ANALYST",
      entityType: "INDIVIDUAL",
      legalName: "Other RA",
      tradeName: "Other RA Trade",
      sebiRegistrationNumber: "INH700000002",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    ProviderService.updateMemoryProviderStatus(otherProv.id, "VERIFIED");
    await pool.query(
      `UPDATE provider_profiles SET status = 'VERIFIED' WHERE id = $1`,
      [otherProv.id]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'RESEARCH_ANALYST') ON CONFLICT DO NOTHING`,
      [otherUser.id]
    );
    const otherSess = await SessionManager.createSession({ userId: otherUser.id });
    otherProviderToken = otherSess.token;

    // 4. Setup Compliance Admin User
    const compUser = await otpService.findOrCreateUser("comp-user-phase7");
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'COMPLIANCE_ADMIN') ON CONFLICT DO NOTHING`,
      [compUser.id]
    );
    const compSess = await SessionManager.createSession({ userId: compUser.id });
    complianceToken = compSess.token;

    // 5. Setup Guest / Public Token
    const guestUser = await otpService.findOrCreateUser("guest-user-phase7");
    const guestSess = await SessionManager.createSession({ userId: guestUser.id });
    guestToken = guestSess.token;
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
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
    if (res.status >= 400) {
      console.warn(`[jsonFetch DEBUG] ${options.method || "GET"} ${url} returned ${res.status}:`, data);
    }
    return { status: res.status, data };
  }

  it("1. Can create and list track-record methodologies with versions", async () => {
    const methodologyCode = `METH-SEBI-${Date.now()}`;
    const res = await jsonFetch(`${baseUrl}/track-record/methodologies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${complianceToken}` },
      body: {
        methodologyCode,
        version: "v1.0",
        name: "SEBI Compliance Track Record Methodology",
        description: "Official SEBI performance tracking standard with excluded non-triggered",
        methodologyDefinition: {
          eligiblePopulation: "ALL",
          treatmentOfDrafts: "exclude",
          treatmentOfCancelled: "exclude",
          treatmentOfExpired: "exclude",
          treatmentOfUntriggered: "exclude", // Buy Above never triggered is excluded!
          treatmentOfOpen: "exclude",
          treatmentOfTargetMilestones: "milestone_counts",
          treatmentOfStopLoss: "loss_at_sl_price",
          precision: 2,
        },
        effectiveFrom: new Date().toISOString(),
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.methodology.methodologyCode, methodologyCode);
    assert.equal(res.data.methodology.version, "v1.0");

    // Retrieve methodologies public list
    const listRes = await jsonFetch(`${baseUrl}/track-record/methodologies`);
    assert.equal(listRes.status, 200);
    const found = listRes.data.methodologies.find((m: any) => m.methodologyCode === methodologyCode);
    assert.ok(found);
  });

  it("2. Deterministic calculations differentiate milestones and respect BUY ABOVE treatment of non-triggered", async () => {
    // A. Seed 1: WIN recommendation (Direct entry, targets achieve, closed)
    const rec1Res = await jsonFetch(`${baseUrl}/recommendations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        originalMessage: "BUY COALINDIA CMP 400 TGT 420, 440 SL 380",
        symbol: "COALINDIA",
        direction: "BUY",
        entryPrice: 400,
        stopLossPrice: 380,
        targets: [
          { targetPrice: 420, label: "T1" },
          { targetPrice: 440, label: "T2" },
        ],
      },
    });
    assert.equal(rec1Res.status, 201);
    const rec1Id = rec1Res.data.recommendation.id;

    // Publish Seed 1
    await jsonFetch(`${baseUrl}/recommendations/${rec1Id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
    });

    // Trigger Target 1 Hit (Milestone 1)
    await jsonFetch(`${baseUrl}/recommendations/${rec1Id}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: { eventType: RecommendationEventTypes.TARGET_HIT, targetSequence: 1 },
    });

    // Trigger Target 2 Hit (Milestone 2)
    await jsonFetch(`${baseUrl}/recommendations/${rec1Id}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: { eventType: RecommendationEventTypes.TARGET_HIT, targetSequence: 2 },
    });

    // Close Seed 1
    await jsonFetch(`${baseUrl}/recommendations/${rec1Id}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: { eventType: RecommendationEventTypes.CLOSED },
    });

    // B. Seed 2: LOSS recommendation (Direct entry, stop loss hit, closed)
    const rec2Res = await jsonFetch(`${baseUrl}/recommendations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        originalMessage: "BUY RELIANCE CMP 2400 TGT 2500 SL 2350",
        symbol: "RELIANCE",
        direction: "BUY",
        entryPrice: 2400,
        stopLossPrice: 2350,
        targets: [{ targetPrice: 2500, label: "T1" }],
      },
    });
    const rec2Id = rec2Res.data.recommendation.id;

    // Publish Seed 2
    await jsonFetch(`${baseUrl}/recommendations/${rec2Id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
    });

    // Trigger Stop Loss Hit (Loss)
    await jsonFetch(`${baseUrl}/recommendations/${rec2Id}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: { eventType: RecommendationEventTypes.STOP_LOSS_HIT },
    });

    // C. Seed 3: UNTRIGGERED EXPIRED (BUY_ABOVE entry, never moved to ACTIVE, expired)
    const pool = db.getPool();
    const rec3Id = "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d"; // Static UUID for mock insertion
    await pool.query(
      `INSERT INTO recommendations (
        id, provider_id, original_message, symbol, direction, entry_condition_type, entry_price, current_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [rec3Id, verifiedRaProviderId, "BUY COALINDIA ABOVE 450 TGT 480 SL 430", "COALINDIA", "BUY", "BUY_ABOVE", 450, "EXPIRED"]
    );

    // Create a methodology to test with
    const methodologyCode = `METH-CALC-${Date.now()}`;
    const methRes = await jsonFetch(`${baseUrl}/track-record/methodologies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${complianceToken}` },
      body: {
        methodologyCode,
        version: "v1.1",
        name: "Calculation Test Standard",
        description: "Test run",
        methodologyDefinition: {
          eligiblePopulation: "ALL",
          treatmentOfDrafts: "exclude",
          treatmentOfCancelled: "exclude",
          treatmentOfExpired: "exclude",
          treatmentOfUntriggered: "exclude", // Untriggered is excluded from eligible
          treatmentOfOpen: "exclude",
          treatmentOfTargetMilestones: "milestone_counts",
          treatmentOfStopLoss: "loss_at_sl_price",
          precision: 2,
        },
      },
    });
    const methodologyId = methRes.data.methodology.id;

    // Execute Track Record Calculation Run
    const calcRes = await jsonFetch(`${baseUrl}/track-record/calculations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        methodologyId,
        periodStart: "2024-01-01",
        periodEnd: "2028-12-31",
      },
    });

    assert.equal(calcRes.status, 200);
    assert.equal(calcRes.data.success, true);
    const resPayload = calcRes.data.result;

    // Assert absolute population counts and denominator transparency
    assert.ok(resPayload.totalRecommendations >= 2);
    // Seed 1 is WIN (1), Seed 2 is LOSS (1), Seed 3 is UNTRIGGERED (0 eligible)
    assert.equal(resPayload.wins, 1, "Only CoalIndia is a Win");
    assert.equal(resPayload.losses, 1, "Reliance is a Loss");
    assert.equal(resPayload.excludedNotTriggered, 1, "Seed 3 is excluded because it never triggered");
    assert.equal(resPayload.targetMilestonesHit, 2, "CoalIndia achieves T1 and T2 milestones (2 total milestones hit)");
    assert.equal(resPayload.metrics.winRate, 50.0, "1 win and 1 loss = 50% win rate");
  });

  it("3. Published snapshot contains required metrics and denominator details", async () => {
    // Create methodology
    const methodologyCode = `METH-SNAP-${Date.now()}`;
    const methRes = await jsonFetch(`${baseUrl}/track-record/methodologies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${complianceToken}` },
      body: {
        methodologyCode,
        version: "v1.2",
        name: "Snapshot Test Standard",
        description: "Test run",
        methodologyDefinition: {
          eligiblePopulation: "ALL",
          treatmentOfDrafts: "exclude",
          treatmentOfCancelled: "exclude",
          treatmentOfExpired: "exclude",
          treatmentOfUntriggered: "exclude",
          treatmentOfOpen: "exclude",
          treatmentOfTargetMilestones: "milestone_counts",
          treatmentOfStopLoss: "loss_at_sl_price",
          precision: 2,
        },
      },
    });
    const methodologyId = methRes.data.methodology.id;

    // Run calculation
    const calcRes = await jsonFetch(`${baseUrl}/track-record/calculations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        methodologyId,
        periodStart: "2024-01-01",
        periodEnd: "2028-12-31",
      },
    });
    assert.equal(calcRes.status, 200);

    // Create and Publish Snapshot
    const snapRes = await jsonFetch(`${baseUrl}/track-record/snapshots`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        calculationId: calcRes.data.calculationId,
        methodologyId,
        periodStart: "2024-01-01",
        periodEnd: "2028-12-31",
        sourceClassification: "PLATFORM_RECORDED",
        result: calcRes.data.result,
      },
    });

    assert.equal(snapRes.status, 201);
    assert.equal(snapRes.data.success, true);
    const snap = snapRes.data.snapshot;
    assert.equal(snap.wins, 1);
    assert.equal(snap.losses, 1);
    assert.equal(snap.excludedNotTriggered, 1);
    assert.equal(snap.sourceClassification, "PLATFORM_RECORDED");

    // Public snapshot access
    const pubRes = await jsonFetch(`${baseUrl}/track-record/snapshots/public`);
    assert.equal(pubRes.status, 200);
    assert.ok(pubRes.data.snapshots.length >= 1);
  });

  it("4. Historical verification record can be triggered with mock external PaRRVA status validation", async () => {
    // Create verification request record initially SUBMITTED
    const res = await jsonFetch(`${baseUrl}/track-record/verifications`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        sourceType: "PROVIDER_SUPPLIED_HISTORICAL",
        sourceName: "Historical SEBI RA Excel Logs 2023",
        evidenceDocumentReference: "https://stockiq.local/docs/ra-excel-2023.pdf",
        validityPeriodStart: "2023-01-01",
        validityPeriodEnd: "2023-12-31",
        notes: "Contains provider supplied historical records for the full year of 2023.",
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    const vId = res.data.verificationRecord.id;
    assert.equal(res.data.verificationRecord.verificationStatus, "SUBMITTED");

    // Try to trigger mock external PaRRVA adapter to automatically transition status to VERIFIED
    const triggerRes = await jsonFetch(`${baseUrl}/track-record/verifications/${vId}/trigger-parrva`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
    });

    assert.equal(triggerRes.status, 200);
    assert.equal(triggerRes.data.success, true);
    const record = triggerRes.data.verificationRecord;
    assert.equal(record.verificationStatus, "VERIFIED");
    assert.ok(record.referenceIdentifier.startsWith("PARRVA-MOCK-"));
    assert.equal(record.verifierName, "PaRRVA (MOCK ADAPTER - DEV ONLY)");

    // Retrieve provider's own verifications
    const meRes = await jsonFetch(`${baseUrl}/track-record/verifications/me`, {
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
    });
    assert.equal(meRes.status, 200);
    assert.ok(meRes.data.verificationRecords.length >= 1);
  });

  it("5. Authorization isolation enforces strict RBAC rules", async () => {
    // Provider cannot see calculations of other providers
    const methRes = await jsonFetch(`${baseUrl}/track-record/methodologies`);
    const methodologyId = methRes.data.methodologies[0].id;

    const calcRes = await jsonFetch(`${baseUrl}/track-record/calculations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        methodologyId,
        periodStart: "2024-01-01",
        periodEnd: "2028-12-31",
      },
    });
    const calcId = calcRes.data.calculationId;

    // Attempt access with other provider's token -> should be Forbidden
    const unauthRes = await jsonFetch(`${baseUrl}/track-record/calculations/${calcId}`, {
      headers: { Authorization: `Bearer ${otherProviderToken}` },
    });
    assert.equal(unauthRes.status, 403);

    // Guest cannot run calculations
    const guestRes = await jsonFetch(`${baseUrl}/track-record/calculations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${guestToken}` },
      body: {
        methodologyId,
        periodStart: "2024-01-01",
        periodEnd: "2028-12-31",
      },
    });
    assert.equal(guestRes.status, 403);
  });
});
