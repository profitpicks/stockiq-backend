import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { app } from "../../api/app.js";
import { db } from "../../database/connection.js";
import { DatabaseMigrator } from "../../database/migrator.js";
import { OtpService } from "../../modules/auth/otp.service.ts";
import { SessionManager } from "../../modules/auth/sessions.ts";
import { ProviderService } from "../../modules/providers/provider.service.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Unit & Integration: Phase 8 Investor Onboarding, Risk Suitability & Agreements", () => {
  let server: http.Server;
  let baseUrl: string;
  const otpService = new OtpService();
  const providerService = new ProviderService();

  let investorToken: string;
  let investorId: string;
  let otherInvestorToken: string;
  let otherInvestorId: string;
  let providerToken: string;
  let complianceToken: string;
  let complianceId: string;

  let retailServiceId: string;
  let accreditedServiceId: string;
  let hniServiceId: string;
  let highRiskServiceId: string;

  before(async () => {
    // 0. Ensure migrations applied
    const migrator = new DatabaseMigrator();
    await migrator.applyPendingMigrations();

    const pool = db.getPool();

    // Load roles seed if needed
    const seedPath = path.join(__dirname, "../../database/seeds/001_foundation_roles.sql");
    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, "utf-8");
      await pool.query(seedSql);
    }

    // Clean up test records
    await pool.query("DELETE FROM agreement_signatures");
    await pool.query("DELETE FROM agreement_templates");
    await pool.query(`DELETE FROM provider_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase8%')`);
    await pool.query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase8%')`);
    await pool.query(`DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase8%')`);
    await pool.query(`DELETE FROM users WHERE email LIKE '%phase8%'`);

    // 1. Start HTTP Server
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { address: string; port: number };
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
        resolve();
      });
    });

    // 2. Setup Users
    const investorUser = await otpService.findOrCreateUser("investor-phase8-1");
    investorId = investorUser.id;
    const invSess = await SessionManager.createSession({ userId: investorUser.id });
    investorToken = invSess.token;

    const otherInvestorUser = await otpService.findOrCreateUser("investor-phase8-2");
    otherInvestorId = otherInvestorUser.id;
    const otherInvSess = await SessionManager.createSession({ userId: otherInvestorUser.id });
    otherInvestorToken = otherInvSess.token;

    const complianceUser = await otpService.findOrCreateUser("comp-phase8");
    complianceId = complianceUser.id;
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'COMPLIANCE_ADMIN') ON CONFLICT DO NOTHING`,
      [complianceUser.id]
    );
    const compSess = await SessionManager.createSession({ userId: complianceUser.id });
    complianceToken = compSess.token;

    const providerUser = await otpService.findOrCreateUser("prov-phase8");
    const provProfile = await providerService.registerProvider({
      userId: providerUser.id,
      providerType: "INVESTMENT_ADVISER",
      entityType: "INDIVIDUAL",
      legalName: "Adviser Phase 8",
      tradeName: "Adviser P8",
      sebiRegistrationNumber: "INA800000001",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Delhi",
      isNismCertified: true,
    });
    const provSess = await SessionManager.createSession({ userId: providerUser.id });
    providerToken = provSess.token;

    // 3. Setup Mock Services in existing Service Catalog
    const retailRes = await pool.query(
      `INSERT INTO services (provider_id, service_name, service_category, short_description, detailed_description, service_type, market_segment, eligibility_info, pricing_reference, fee_in_paise, status)
       VALUES ($1, 'Retail Mutual Fund Portfolios', 'Mutual Funds', 'Short desc', 'Detailed desc', 'PORTFOLIO_SERVICE', 'RETAIL', 'RETAIL_INVESTORS', 'FLAT', 10000, 'PUBLISHED')
       RETURNING id`,
      [provProfile.id]
    );
    retailServiceId = retailRes.rows[0].id;

    const accRes = await pool.query(
      `INSERT INTO services (provider_id, service_name, service_category, short_description, detailed_description, service_type, market_segment, eligibility_info, pricing_reference, fee_in_paise, status)
       VALUES ($1, 'Accredited Wealth Advisory', 'AIF Portfolio', 'Short desc', 'Detailed desc', 'ADVISORY_SERVICE', 'ACCREDITED_INVESTOR', 'ACCREDITED_INVESTORS_ONLY', 'FLAT', 500000, 'PUBLISHED')
       RETURNING id`,
      [provProfile.id]
    );
    accreditedServiceId = accRes.rows[0].id;

    const hniRes = await pool.query(
      `INSERT INTO services (provider_id, service_name, service_category, short_description, detailed_description, service_type, market_segment, eligibility_info, pricing_reference, fee_in_paise, status)
       VALUES ($1, 'HNI PMS Portfolios', 'PMS Portfolio', 'Short desc', 'Detailed desc', 'PORTFOLIO_SERVICE', 'HNI', 'HNI_ONLY', 'PERCENTAGE', 200000, 'PUBLISHED')
       RETURNING id`,
      [provProfile.id]
    );
    hniServiceId = hniRes.rows[0].id;

    const hrRes = await pool.query(
      `INSERT INTO services (provider_id, service_name, service_category, short_description, detailed_description, service_type, market_segment, eligibility_info, pricing_reference, fee_in_paise, status)
       VALUES ($1, 'Options Speculator F&O', 'Futures & Options Speculation', 'Short desc', 'Detailed desc', 'PORTFOLIO_SERVICE', 'RETAIL', 'RETAIL_INVESTORS', 'PERCENTAGE', 15000, 'PUBLISHED')
       RETURNING id`,
      [provProfile.id]
    );
    highRiskServiceId = hrRes.rows[0].id;
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
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
    }
    return { status: res.status, data };
  }

  it("should initialize investor onboarding profile with default NOT_STARTED state", async () => {
    const { data } = await jsonFetch(`${baseUrl}/onboarding/profile`, {
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(data.status, "SUCCESS");
    assert.equal(data.profile.onboardingStatus, "NOT_STARTED");
    assert.equal(data.profile.classification, "RETAIL");
  });

  it("should block direct, unvalidated state completion attempt by client-side payload override", async () => {
    // Client trying to directly hit the completion endpoint when requirements are not met (state is NOT_STARTED)
    await assert.rejects(
      async () => {
        await jsonFetch(`${baseUrl}/onboarding/complete`, {
          method: "POST",
          headers: { Authorization: `Bearer ${investorToken}` },
        });
      },
      /Current state must be AGREEMENTS_PENDING/
    );
  });

  it("should support updating basic profile details and advancing state to PROFILE_PENDING", async () => {
    const { data } = await jsonFetch(`${baseUrl}/onboarding/profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
      body: {
        annualIncomeBracket: "15L - 25L",
        investmentExperienceYears: 5,
      },
    });
    assert.equal(data.status, "SUCCESS");
    assert.equal(data.profile.onboardingStatus, "PROFILE_PENDING");
    assert.equal(data.profile.annualIncomeBracket, "15L - 25L");
    assert.equal(data.profile.investmentExperienceYears, 5);
  });

  it("should allow submitting classification evidence, state transitions to CLASSIFICATION_PENDING, and client cannot self-verify", async () => {
    const { data } = await jsonFetch(`${baseUrl}/onboarding/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
      body: {
        classification: "HNI",
        evidenceType: "NET_WORTH_CERTIFICATE",
        evidenceReference: "s3://private-vault/networth-certificate-p8.pdf",
      },
    });
    assert.equal(data.status, "SUCCESS");
    assert.equal(data.evidence.verificationStatus, "PENDING");
    assert.equal(data.evidence.classification, "HNI");

    // Retrieve onboarding profile to confirm state is CLASSIFICATION_PENDING
    const { data: pData } = await jsonFetch(`${baseUrl}/onboarding/profile`, {
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(pData.profile.onboardingStatus, "CLASSIFICATION_PENDING");
    assert.equal(pData.profile.classification, "RETAIL"); // Remains Retail until compliance verifies/approves evidence

    // Security: investor cannot access self-verify endpoint (RBAC blocks this)
    await assert.rejects(
      async () => {
        await jsonFetch(`${baseUrl}/onboarding/verify-evidence`, {
          method: "POST",
          headers: { Authorization: `Bearer ${investorToken}` },
          body: {
            evidenceId: data.evidence.id,
            status: "APPROVED",
            notes: "Self-verification trick attempt",
          },
        });
      },
      /Access denied/
    );
  });

  it("should allow compliance admin to verify evidence, upgrading classification to HNI", async () => {
    const pool = db.getPool();
    const { rows } = await pool.query(`SELECT id FROM classification_evidence WHERE user_id = $1`, [investorId]);
    const evidenceId = rows[0].id;

    const { data } = await jsonFetch(`${baseUrl}/onboarding/verify-evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${complianceToken}` },
      body: {
        evidenceId,
        status: "APPROVED",
        notes: "Audited and verified. Highly qualified Net Worth.",
      },
    });

    assert.equal(data.status, "SUCCESS");
    assert.equal(data.verified.verificationStatus, "APPROVED");

    // Fetch profile to confirm updated classification is now HNI
    const { data: pData } = await jsonFetch(`${baseUrl}/onboarding/profile`, {
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(pData.profile.classification, "HNI");
  });

  it("should enforce distinct separation: HNI and Accredited Investor are NOT collapsed", async () => {
    // Investor classification is HNI, but NOT Accredited Investor
    const { data: pData } = await jsonFetch(`${baseUrl}/onboarding/profile`, {
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(pData.profile.classification, "HNI");
    assert.notEqual(pData.profile.classification, "ACCREDITED_INVESTOR");
  });

  it("should support versioned risk assessments, questionnaire version retention, and deterministic calculation", async () => {
    // Submit v1 responses with scores summing to 15 (MODERATE)
    const { data } = await jsonFetch(`${baseUrl}/onboarding/risk-assessment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
      body: {
        questionnaireVersion: "p8-q-v1",
        responses: {
          q1: 5,
          q2: 5,
          q3: 5,
        },
      },
    });

    assert.equal(data.status, "SUCCESS");
    assert.equal(data.assessment.questionnaireVersion, "p8-q-v1");
    assert.equal(data.assessment.calculatedRiskCategory, "MODERATE");
    assert.equal(data.assessment.status, "COMPLETED");

    // Verify profile state is now RISK_ASSESSMENT_PENDING
    const { data: pData } = await jsonFetch(`${baseUrl}/onboarding/profile`, {
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(pData.profile.onboardingStatus, "RISK_ASSESSMENT_PENDING");
  });

  it("should support reassessment: preserves historical risk assessments and creates new complete record", async () => {
    const pool = db.getPool();

    // Reassess with scores summing to 25 (HIGH)
    const { data } = await jsonFetch(`${baseUrl}/onboarding/risk-assessment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
      body: {
        questionnaireVersion: "p8-q-v1",
        responses: {
          q1: 10,
          q2: 10,
          q3: 5,
        },
        reassessmentReason: "Increased risk appetite due to asset accumulation",
      },
    });

    assert.equal(data.status, "SUCCESS");
    assert.equal(data.assessment.calculatedRiskCategory, "HIGH");

    // Query DB history to assert both records exist (the previous is EXPIRED, current is COMPLETED)
    const { rows } = await pool.query(
      `SELECT calculated_risk_category, status FROM risk_assessments WHERE user_id = $1 ORDER BY assessed_at DESC`,
      [investorId]
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0].calculated_risk_category, "HIGH");
    assert.equal(rows[0].status, "COMPLETED");
    assert.equal(rows[1].calculated_risk_category, "MODERATE");
    assert.equal(rows[1].status, "EXPIRED");
  });

  it("should evaluate suitability, return appropriate status, and advance state on ELIGIBLE, reject on NOT_ELIGIBLE", async () => {
    // 1. Evaluate HNI PMS Portfolio (HNI ONLY) -> Eligible because investor is HNI
    const { data: suitHni } = await jsonFetch(`${baseUrl}/onboarding/suitability`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
      body: { serviceId: hniServiceId },
    });
    assert.equal(suitHni.status, "SUCCESS");
    assert.equal(suitHni.evaluation.status, "ELIGIBLE");

    // Profile state should have advanced to AGREEMENTS_PENDING
    const { data: pData } = await jsonFetch(`${baseUrl}/onboarding/profile`, {
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(pData.profile.onboardingStatus, "AGREEMENTS_PENDING");

    // 2. Evaluate Accredited Wealth Advisory (ACCREDITED ONLY) -> NOT_ELIGIBLE because investor is HNI (not Accredited)
    const { data: suitAcc } = await jsonFetch(`${baseUrl}/onboarding/suitability`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
      body: { serviceId: accreditedServiceId },
    });
    assert.equal(suitAcc.status, "SUCCESS");
    assert.equal(suitAcc.evaluation.status, "NOT_ELIGIBLE");
  });

  it("should support manual SUITABILITY_REVIEW when evaluating a high-risk service for a LOW risk profile investor", async () => {
    // Setup another investor with LOW risk assessment profile
    await jsonFetch(`${baseUrl}/onboarding/profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${otherInvestorToken}` },
      body: {
        annualIncomeBracket: "5L - 10L",
        investmentExperienceYears: 1,
      },
    });

    await jsonFetch(`${baseUrl}/onboarding/risk-assessment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${otherInvestorToken}` },
      body: {
        questionnaireVersion: "p8-q-v1",
        responses: {
          q1: 2,
          q2: 2,
        },
      },
    });

    // Evaluate Option Speculator F&O (High-risk service category) for this LOW risk profile investor
    const { data } = await jsonFetch(`${baseUrl}/onboarding/suitability`, {
      method: "POST",
      headers: { Authorization: `Bearer ${otherInvestorToken}` },
      body: { serviceId: highRiskServiceId },
    });

    assert.equal(data.status, "SUCCESS");
    assert.equal(data.evaluation.status, "REVIEW_REQUIRED");

    // Confirm state has transitioned to REQUIRES_REVIEW for other investor
    const { data: otherProfile } = await jsonFetch(`${baseUrl}/onboarding/profile`, {
      headers: { Authorization: `Bearer ${otherInvestorToken}` },
    });
    assert.equal(otherProfile.profile.onboardingStatus, "REQUIRES_REVIEW");
  });

  it("should support immutable agreement templates, versioning, SHA-256 hash calculation, and consent vs certified signature record", async () => {
    // 1. Compliance registers Client Agreement Template Version v1.0
    const bodyContent = "These are terms for standard advisory services on stockiq platform.";
    const { data: templateRes } = await jsonFetch(`${baseUrl}/agreements/template`, {
      method: "POST",
      headers: { Authorization: `Bearer ${complianceToken}` },
      body: {
        agreementType: "CLIENT_AGREEMENT",
        version: "v1.0",
        title: "Standard Advisory Agreement",
        content: bodyContent,
      },
    });

    assert.equal(templateRes.status, "SUCCESS");
    assert.equal(templateRes.template.version, "v1.0");
    assert.ok(templateRes.template.contentHash);

    // 2. Fetch latest active template
    const { data: latestT } = await jsonFetch(`${baseUrl}/agreements/template/latest?type=CLIENT_AGREEMENT`, {
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(latestT.status, "SUCCESS");
    assert.equal(latestT.template.version, "v1.0");

    // 3. Investor signs agreement using certified eSign mock
    const { data: signRes } = await jsonFetch(`${baseUrl}/agreements/sign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
      body: {
        templateId: latestT.template.id,
        signatureMethod: "MOCK_ESIGN_CERTIFIED",
      },
    });

    assert.equal(signRes.status, "SUCCESS");
    assert.equal(signRes.signature.signatureMethod, "MOCK_ESIGN_CERTIFIED");
    assert.equal(signRes.signature.agreementContentHash, latestT.template.contentHash);

    // 4. Register new version v2.0 (Simulates a later template edit)
    const bodyContent2 = "Modified terms for standard advisory services.";
    const { data: templateRes2 } = await jsonFetch(`${baseUrl}/agreements/template`, {
      method: "POST",
      headers: { Authorization: `Bearer ${complianceToken}` },
      body: {
        agreementType: "CLIENT_AGREEMENT",
        version: "v2.0",
        title: "Standard Advisory Agreement V2",
        content: bodyContent2,
      },
    });
    assert.equal(templateRes2.status, "SUCCESS");

    // Assert that the historical signature's hash remains unchanged, ensuring complete immutability
    const { data: history } = await jsonFetch(`${baseUrl}/agreements/signatures`, {
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(history.signatures.length, 1);
    assert.equal(history.signatures[0].agreementContentHash, templateRes.template.contentHash);
    assert.notEqual(history.signatures[0].agreementContentHash, templateRes2.template.contentHash);
  });

  it("should allow completing onboarding successfully once all step requirements are met", async () => {
    const { data } = await jsonFetch(`${baseUrl}/onboarding/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investorToken}` },
    });
    assert.equal(data.status, "SUCCESS");
    assert.equal(data.profile.onboardingStatus, "COMPLETED");
  });

  it("should restrict private onboarding data accesses using rigid, compliance-governed authorization boundaries", async () => {
    // 1. Investor cannot view another investor's private signatures/onboarding profile
    const pool = db.getPool();
    const { rows } = await pool.query(`SELECT id FROM classification_evidence WHERE user_id = $1`, [investorId]);
    const evidenceId = rows[0].id;

    // Direct Object Reference: Investor trying to sign for another user, or fetch other records
    // endpoint signatures only returns req.user's own signatures, so otherInvestorToken cannot fetch investorId's data.
    const { data: otherSigs } = await jsonFetch(`${baseUrl}/agreements/signatures`, {
      headers: { Authorization: `Bearer ${otherInvestorToken}` },
    });
    // The list must be empty because other investor hasn't signed v1
    assert.equal(otherSigs.signatures.length, 0);

    // 2. Unrelated Provider cannot view investor's private classification evidence or risk profile
    // Provider does not have access to onboarding profile or private evidence reviews
    await assert.rejects(
      async () => {
        await jsonFetch(`${baseUrl}/onboarding/verify-evidence`, {
          method: "POST",
          headers: { Authorization: `Bearer ${providerToken}` },
          body: {
            evidenceId,
            status: "APPROVED",
          },
        });
      },
      /Access denied/
    );
  });
});
