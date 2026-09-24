import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../../api/app.js";
import { db } from "../../database/connection.js";
import { LedgerService } from "../../modules/recommendations/ledger.service.ts";
import { ProviderService } from "../../modules/providers/provider.service.ts";
import { OtpService } from "../../modules/auth/otp.service.ts";
import { SessionManager } from "../../modules/auth/sessions.ts";
import { DatabaseMigrator } from "../../database/migrator.js";
import { RecommendationEventTypes } from "../../modules/recommendations/types.ts";

describe("Unit & Integration: Phase 6 Immutable Recommendation Ledger Foundation", () => {
  let server: http.Server;
  let baseUrl: string;
  const providerService = new ProviderService();
  const otpService = new OtpService();

  let verifiedRaToken: string;
  let unverifiedProviderToken: string;
  let investorToken: string;

  before(async () => {
    // 0. Clean up any existing Phase 6 test records to ensure absolute idempotency
    ProviderService.clearMemoryState();
    const pool = db.getPool();

    await pool.query(`DELETE FROM recommendation_events WHERE recommendation_id IN (SELECT id FROM recommendations WHERE provider_id IN (SELECT id FROM provider_profiles WHERE sebi_registration_number IN ('INA100000001', 'INA100000002')))`);
    await pool.query(`DELETE FROM recommendation_targets WHERE recommendation_id IN (SELECT id FROM recommendations WHERE provider_id IN (SELECT id FROM provider_profiles WHERE sebi_registration_number IN ('INA100000001', 'INA100000002')))`);
    await pool.query(`DELETE FROM recommendation_stop_losses WHERE recommendation_id IN (SELECT id FROM recommendations WHERE provider_id IN (SELECT id FROM provider_profiles WHERE sebi_registration_number IN ('INA100000001', 'INA100000002')))`);
    await pool.query(`DELETE FROM recommendations WHERE provider_id IN (SELECT id FROM provider_profiles WHERE sebi_registration_number IN ('INA100000001', 'INA100000002'))`);
    await pool.query(`DELETE FROM provider_profiles WHERE sebi_registration_number IN ('INA100000001', 'INA100000002')`);

    const testEmails = [
      "user_ra-user-id-123@stockiq.local",
      "user_unv-user-id-456@stockiq.local",
      "user_inv-user-id-789@stockiq.local"
    ];
    await pool.query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`, [testEmails]);
    await pool.query(`DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`, [testEmails]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [testEmails]);

    // 1. Start HTTP server
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { address: string; port: number };
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
        resolve();
      });
    });

    // 2. Setup Verified RA User & Provider
    const raUser = await otpService.findOrCreateUser("ra-user-id-123");
    const raProv = await providerService.registerProvider({
      userId: raUser.id,
      providerType: "RESEARCH_ANALYST",
      entityType: "INDIVIDUAL",
      legalName: "Verified RA Capital",
      tradeName: "RA Alpha",
      sebiRegistrationNumber: "INA100000001",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    ProviderService.updateMemoryProviderStatus(raProv.id, "VERIFIED");
    const raSess = await SessionManager.createSession({ userId: raUser.id });
    verifiedRaToken = raSess.token;

    // 3. Setup Unverified IA User & Provider
    const unvUser = await otpService.findOrCreateUser("unv-user-id-456");
    await providerService.registerProvider({
      userId: unvUser.id,
      providerType: "INVESTMENT_ADVISER",
      entityType: "INDIVIDUAL",
      legalName: "Unverified IA Capital",
      tradeName: "IA Beta",
      sebiRegistrationNumber: "INA100000002",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Delhi",
      isNismCertified: true,
    });
    const unvSess = await SessionManager.createSession({ userId: unvUser.id });
    unverifiedProviderToken = unvSess.token;

    // 4. Setup Retail Investor User
    const invUser = await otpService.findOrCreateUser("inv-user-id-789");
    const invSess = await SessionManager.createSession({ userId: invUser.id });
    investorToken = invSess.token;
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

  it("1. Migration 004 file exists and passes structural validation", async () => {
    const migrator = new DatabaseMigrator();
    const validation = migrator.validateMigrations();
    assert.ok(validation.valid);
    assert.ok(validation.count >= 4);
  });

  it("2. Verified provider can create draft recommendation, preserving exact original_message", async () => {
    const rawSignal = "BUY RELIANCE CMP 2450 TGT 2550, 2650 SL 2380 SWING RATIONALE: STRONG Q3 BREAKOUT";
    const res = await jsonFetch(`${baseUrl}/recommendations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        originalMessage: rawSignal,
        symbol: "RELIANCE",
        direction: "BUY",
        instrumentType: "EQUITY",
        segment: "CASH",
        entryPrice: 2450,
        stopLossPrice: 2380,
        targets: [
          { targetPrice: 2550, label: "T1" },
          { targetPrice: 2650, label: "T2" },
        ],
        timeHorizon: "SWING",
        rationale: "Strong Q3 Breakout",
        disclosures: ["No personal position held in RELIANCE"],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.status, "SUCCESS");
    const rec = res.data.recommendation;
    assert.ok(rec.id);
    assert.equal(rec.originalMessage, rawSignal);
    assert.equal(rec.currentStatus, "DRAFT");
    assert.equal(rec.targets.length, 2);
    assert.equal(rec.stopLosses.length, 1);
    assert.equal(rec.events.length, 1);
    assert.equal(rec.events[0].eventType, "CREATED");
    assert.equal(rec.events[0].previousHash, null);
    assert.ok(rec.events[0].eventHash);
  });

  it("3. Unverified provider and retail investor cannot create or publish recommendations", async () => {
    // Unverified provider create attempt
    const unvRes = await jsonFetch(`${baseUrl}/recommendations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${unverifiedProviderToken}` },
      body: {
        originalMessage: "BUY INFYS CMP 1500 TGT 1550 SL 1480",
        symbol: "INFY",
        direction: "BUY",
        entryPrice: 1500,
        stopLossPrice: 1480,
        targets: [{ targetPrice: 1550 }],
      },
    });
    assert.equal(unvRes.status, 403);

    // Retail investor create attempt
    const invRes = await jsonFetch(`${baseUrl}/recommendations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
      body: {
        originalMessage: "BUY TCS CMP 3500 TGT 3600 SL 3450",
        symbol: "TCS",
        direction: "BUY",
        entryPrice: 3500,
        stopLossPrice: 3450,
        targets: [{ targetPrice: 3600 }],
      },
    });
    assert.equal(invRes.status, 403);
  });

  it("4. Explicit publication appends PUBLISHED event and verifies hash-chain linkage", async () => {
    // First create a draft
    const createRes = await jsonFetch(`${baseUrl}/recommendations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        originalMessage: "BUY TATAMOTORS CMP 900 TGT 950 SL 870",
        symbol: "TATAMOTORS",
        direction: "BUY",
        entryPrice: 900,
        stopLossPrice: 870,
        targets: [{ targetPrice: 950, label: "T1" }],
      },
    });
    assert.equal(createRes.status, 201);
    const recId = createRes.data.recommendation.id;
    const initialHash = createRes.data.recommendation.events[0].eventHash;

    // Publish
    const pubRes = await jsonFetch(`${baseUrl}/recommendations/${recId}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
    });

    assert.equal(pubRes.status, 200);
    const pubRec = pubRes.data.recommendation;
    assert.equal(pubRec.currentStatus, "PUBLISHED");
    assert.equal(pubRec.events.length, 2);

    const pubEvent = pubRec.events[1];
    assert.equal(pubEvent.eventType, "PUBLISHED");
    assert.equal(pubEvent.eventSequence, 2);
    assert.equal(pubEvent.previousHash, initialHash);

    // Verify hash chain
    const verifyRes = await jsonFetch(`${baseUrl}/recommendations/${recId}/verify`);
    assert.equal(verifyRes.status, 200);
    assert.ok(verifyRes.data.verification.isValid);
    assert.equal(verifyRes.data.verification.totalEvents, 2);
  });

  it("5. Appending lifecycle events (TARGET_HIT, STOP_LOSS_UPDATED) maintains sequence and hash continuity", async () => {
    // Create & publish
    const createRes = await jsonFetch(`${baseUrl}/recommendations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        originalMessage: "BUY ICICIBANK CMP 1000 TGT 1050, 1100 SL 970",
        symbol: "ICICIBANK",
        direction: "BUY",
        entryPrice: 1000,
        stopLossPrice: 970,
        targets: [
          { targetPrice: 1050, label: "T1" },
          { targetPrice: 1100, label: "T2" },
        ],
      },
    });
    assert.equal(createRes.status, 201);
    const recId = createRes.data.recommendation.id;
    await jsonFetch(`${baseUrl}/recommendations/${recId}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
    });

    // 1. Target 1 Hit
    const tgtHitRes = await jsonFetch(`${baseUrl}/recommendations/${recId}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        eventType: RecommendationEventTypes.TARGET_HIT,
        targetSequence: 1,
      },
    });
    assert.equal(tgtHitRes.status, 200);
    assert.equal(tgtHitRes.data.recommendation.events.length, 3);
    assert.equal(tgtHitRes.data.recommendation.targets[0].status, "HIT");

    // 2. Stop Loss Updated (trail to cost)
    const slUpdateRes = await jsonFetch(`${baseUrl}/recommendations/${recId}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: {
        eventType: RecommendationEventTypes.STOP_LOSS_UPDATED,
        newStopLossPrice: 1000,
        reason: "Trail SL to cost after T1 achieved",
      },
    });
    assert.equal(slUpdateRes.status, 200);
    assert.equal(slUpdateRes.data.recommendation.events.length, 4);
    assert.equal(slUpdateRes.data.recommendation.stopLosses.length, 2);

    // Verify complete chain
    const verifyRes = await jsonFetch(`${baseUrl}/recommendations/${recId}/verify`);
    assert.equal(verifyRes.status, 200);
    if (!verifyRes.data.verification.isValid) {
      console.error("[VERIFICATION_FAILURE_DETAILS]", JSON.stringify(verifyRes.data.verification, null, 2));
    }
    assert.ok(verifyRes.data.verification.isValid);
    assert.equal(verifyRes.data.verification.totalEvents, 4);
  });

  it("6. Parse helper utility extracts structured fields and requires explicit provider confirmation", async () => {
    const rawSignal = "INDEX OPTIONS : NIFTY 24300 CE BUY ABV 120 TGT 140, 160, 180 SL 100";
    const parseRes = await jsonFetch(`${baseUrl}/recommendations/parse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifiedRaToken}` },
      body: { rawText: rawSignal },
    });

    assert.equal(parseRes.status, 200);
    const draft = parseRes.data.draft;
    assert.equal(draft.isDraft, true);
    assert.equal(draft.requiresProviderConfirmation, true);
    assert.equal(draft.originalMessage, rawSignal);
    assert.equal(draft.direction, "BUY");
    assert.equal(draft.entryPrice, 120);
    assert.ok(draft.targets.length >= 2);
    assert.equal(draft.stopLossPrice, 100);
  });
});
