import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { OtpService } from "../../modules/auth/otp.service.js";
import { SessionManager } from "../../modules/auth/sessions.js";
import { MockOtpAdapter } from "../../adapters/otp/otp.adapter.js";
import { PlatformRoles } from "../../modules/auth/roles.js";

describe("Unit: Auth & Session Management Engine", () => {
  beforeEach(() => {
    OtpService.clearMemoryState();
    SessionManager.clearMemorySessions();
  });

  it("OTP Service: requests and verifies OTP successfully", async () => {
    const otpService = new OtpService(new MockOtpAdapter());
    const identifier = "+919876543210";

    const requestRes = await otpService.requestOtp({
      identifier,
      purpose: "LOGIN",
    });

    assert.equal(requestRes.success, true);
    assert.ok(requestRes.referenceId);

    const verifyRes = await otpService.verifyOtp({
      identifier,
      otp: MockOtpAdapter.DEFAULT_TEST_OTP,
      purpose: "LOGIN",
      fullName: "Test Investor",
      userType: "INVESTOR",
    });

    assert.equal(verifyRes.valid, true);
    assert.ok(verifyRes.user);
    assert.equal(verifyRes.user.fullName, "Test Investor");
    assert.equal(verifyRes.user.roles.includes(PlatformRoles.INVESTOR_RETAIL), true);
  });

  it("OTP Security: enforces rate limit after 3 rapid requests", async () => {
    const otpService = new OtpService(new MockOtpAdapter());
    const identifier = "+919999888877";

    for (let i = 0; i < 3; i++) {
      const res = await otpService.requestOtp({ identifier, purpose: "LOGIN" });
      assert.equal(res.success, true);
    }

    // 4th request should be rate-limited
    const rateLimitedRes = await otpService.requestOtp({ identifier, purpose: "LOGIN" });
    assert.equal(rateLimitedRes.success, false);
    assert.equal(rateLimitedRes.message.includes("Too many OTP requests"), true);
  });

  it("OTP Security: rejects invalid OTP and enforces maximum 3 attempts", async () => {
    const otpService = new OtpService(new MockOtpAdapter());
    const identifier = "+919111122223";

    await otpService.requestOtp({ identifier, purpose: "LOGIN" });

    // Attempt 1: Invalid
    const fail1 = await otpService.verifyOtp({ identifier, otp: "000000", purpose: "LOGIN" });
    assert.equal(fail1.valid, false);

    // Attempt 2: Invalid
    const fail2 = await otpService.verifyOtp({ identifier, otp: "000000", purpose: "LOGIN" });
    assert.equal(fail2.valid, false);

    // Attempt 3: Invalid
    const fail3 = await otpService.verifyOtp({ identifier, otp: "000000", purpose: "LOGIN" });
    assert.equal(fail3.valid, false);

    // Attempt 4: Even with correct OTP, max attempts exceeded
    const fail4 = await otpService.verifyOtp({ identifier, otp: MockOtpAdapter.DEFAULT_TEST_OTP, purpose: "LOGIN" });
    assert.equal(fail4.valid, false);
    assert.equal(fail4.error?.includes("Maximum verification attempts exceeded"), true);
  });

  it("Session Manager: creates, validates, touches, and revokes sessions", async () => {
    const userId = "usr_test_123";
    const createRes = await SessionManager.createSession({
      userId,
      ipAddress: "127.0.0.1",
      userAgent: "TestAgent/1.0",
      ttlSeconds: 3600,
    });

    assert.ok(createRes.token.startsWith("stk_sess_"));
    assert.equal(createRes.session.userId, userId);

    // Validate active session
    const validSession = await SessionManager.validateSession(createRes.token);
    assert.ok(validSession);
    assert.equal(validSession.userId, userId);
    assert.equal(validSession.isActive, true);

    // List user active sessions
    const userSessions = await SessionManager.getUserSessions(userId);
    assert.equal(userSessions.length, 1);
    assert.equal(userSessions[0].id, createRes.session.id);

    // Revoke specific session
    const revoked = await SessionManager.revokeSession(createRes.session.id);
    assert.equal(revoked, true);

    // Validate revoked session fails
    const revalidate = await SessionManager.validateSession(createRes.token);
    assert.equal(revalidate, null);
  });

  it("Session Manager: logout-all revokes all user sessions", async () => {
    const userId = "usr_multi_device";

    const s1 = await SessionManager.createSession({ userId });
    const s2 = await SessionManager.createSession({ userId });

    const beforeSessions = await SessionManager.getUserSessions(userId);
    assert.equal(beforeSessions.length, 2);

    const count = await SessionManager.revokeAllUserSessions(userId);
    assert.equal(count, 2);

    const v1 = await SessionManager.validateSession(s1.token);
    const v2 = await SessionManager.validateSession(s2.token);
    assert.equal(v1, null);
    assert.equal(v2, null);
  });
});
