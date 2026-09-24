import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../../api/app.js";
import { MockOtpAdapter } from "../../adapters/otp/otp.adapter.js";
import { PlatformRoles } from "../../modules/auth/roles.js";

describe("Integration: Auth & Provider Credentialing End-to-End API Flow", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
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

  async function jsonFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: unknown }) {
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

  it("Full E2E Flow: OTP Request -> Verify -> Session -> Provider Register -> Submit -> Verification Officer Approval", async () => {
    const mobile = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;

    // 1. Request OTP
    const reqOtpRes = await jsonFetch(`${baseUrl}/auth/otp/request`, {
      method: "POST",
      body: { identifier: mobile, purpose: "LOGIN" },
    });
    assert.equal(reqOtpRes.status, 200);
    assert.equal(reqOtpRes.data.success, true);

    // 2. Verify OTP and get Session Bearer Token
    const verifyRes = await jsonFetch(`${baseUrl}/auth/otp/verify`, {
      method: "POST",
      body: {
        identifier: mobile,
        otp: MockOtpAdapter.DEFAULT_TEST_OTP,
        purpose: "LOGIN",
        fullName: "Dr. Vikram Seth",
        userType: "PROVIDER",
      },
    });

    assert.equal(verifyRes.status, 200);
    assert.ok(verifyRes.data.token);
    const sessionToken = verifyRes.data.token;
    const authHeaders = { Authorization: `Bearer ${sessionToken}` };

    // 3. GET /auth/me
    const meRes = await jsonFetch(`${baseUrl}/auth/me`, { headers: authHeaders });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.mobile, mobile);

    // 4. GET /auth/sessions
    const sessionsRes = await jsonFetch(`${baseUrl}/auth/sessions`, { headers: authHeaders });
    assert.equal(sessionsRes.status, 200);
    assert.equal(sessionsRes.data.sessions.length, 1);

    // 5. Register Provider Profile
    const regRes = await jsonFetch(`${baseUrl}/providers/register`, {
      method: "POST",
      headers: authHeaders,
      body: {
        providerType: "RESEARCH_ANALYST",
        entityType: "INDIVIDUAL",
        legalName: "Vikram Seth Research",
        sebiRegistrationNumber: "INH000055555",
        validFrom: "2024-01-01",
        registeredOfficeAddress: "Suite 101, Bandra Kurla Complex, Mumbai, Maharashtra",
        isNismCertified: true,
      },
    });
    assert.equal(regRes.status, 201);
    assert.equal(regRes.data.provider.status, "DRAFT");

    // 6. Submit Declaration & Document Metadata
    const declRes = await jsonFetch(`${baseUrl}/providers/me/declarations`, {
      method: "POST",
      headers: authHeaders,
      body: {
        declarationType: "NO_REGULATORY_DEBARMENT_AFFIDAVIT",
        isDeclared: true,
      },
    });
    assert.equal(declRes.status, 201);

    const docRes = await jsonFetch(`${baseUrl}/providers/me/documents`, {
      method: "POST",
      headers: authHeaders,
      body: {
        documentType: "SEBI_REGISTRATION_CERTIFICATE",
        fileName: "sebi_cert_vikram.pdf",
        fileHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        mimeType: "application/pdf",
      },
    });
    assert.equal(docRes.status, 201);

    // 7. Submit Profile for Officer Review
    const submitRes = await jsonFetch(`${baseUrl}/providers/me/submit`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.data.provider.status, "SUBMITTED");
    const caseId = submitRes.data.verificationCase.id;

    // 8. Verification Officer Workflow (Using Dev Mock Officer Role)
    const officerAuth = { Authorization: `Bearer mock-user:officer-1:${PlatformRoles.VERIFICATION_OFFICER}` };

    const casesRes = await jsonFetch(`${baseUrl}/verification/cases`, { headers: officerAuth });
    assert.equal(casesRes.status, 200);

    const assignRes = await jsonFetch(`${baseUrl}/verification/cases/${caseId}/assign`, {
      method: "POST",
      headers: officerAuth,
      body: { officerId: "officer-1" },
    });
    assert.equal(assignRes.status, 200);

    const reviewRes = await jsonFetch(`${baseUrl}/verification/cases/${caseId}/review`, {
      method: "POST",
      headers: officerAuth,
      body: {
        action: "APPROVE",
        notes: "Verified against SEBI online registration database.",
      },
    });
    assert.equal(reviewRes.status, 200);
    assert.equal(reviewRes.data.verificationCase.status, "APPROVED");

    // 9. Logout
    const logoutRes = await jsonFetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(logoutRes.status, 200);

    // 10. Attempt request after logout should fail
    const postLogoutMe = await jsonFetch(`${baseUrl}/auth/me`, { headers: authHeaders });
    assert.equal(postLogoutMe.status, 401);
  });
});
