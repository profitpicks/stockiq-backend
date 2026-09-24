import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PasswordService } from "../../modules/auth/password.service.js";
import { OtpService } from "../../modules/auth/otp.service.js";
import { SessionManager } from "../../modules/auth/sessions.js";
import { MockOtpAdapter } from "../../adapters/otp/otp.adapter.js";
import { PlatformRoles } from "../../modules/auth/roles.js";

describe("Unit: Password Authentication & Security Engine", () => {
  beforeEach(() => {
    PasswordService.clearMemoryState();
    OtpService.clearMemoryState();
    SessionManager.clearMemorySessions();
  });

  it("Password Hashing: produces scrypt formatted hash and verifies correct password", async () => {
    const plaintext = "SecureP@ss123";
    const hash = await PasswordService.hashPassword(plaintext);

    assert.ok(hash.startsWith("scrypt:"));
    const isValid = await PasswordService.verifyPassword(plaintext, hash);
    assert.equal(isValid, true);

    const isWrongValid = await PasswordService.verifyPassword("WrongPassword123", hash);
    assert.equal(isWrongValid, false);
  });

  it("Password Policy: validates complexity rules", () => {
    // Too short
    const shortRes = PasswordService.validatePasswordPolicy("Short1!");
    assert.equal(shortRes.valid, false);
    assert.ok(shortRes.errors.some((e) => e.includes("at least 8 characters")));

    // No letters
    const noLettersRes = PasswordService.validatePasswordPolicy("123456789!");
    assert.equal(noLettersRes.valid, false);
    assert.ok(noLettersRes.errors.some((e) => e.includes("at least one letter")));

    // No numbers or special characters
    const noNumbersRes = PasswordService.validatePasswordPolicy("alllettersonly");
    assert.equal(noNumbersRes.valid, false);
    assert.ok(noNumbersRes.errors.some((e) => e.includes("number or special character")));

    // Valid passwords
    const valid1 = PasswordService.validatePasswordPolicy("Stockiq@2026");
    assert.equal(valid1.valid, true);

    const valid2 = PasswordService.validatePasswordPolicy("traderPass99");
    assert.equal(valid2.valid, true);
  });

  it("Failed Login Protection: tracks attempts and locks account after 5 failed attempts", async () => {
    const identifier = "test_user_lockout@stockiq.com";

    for (let i = 1; i <= 4; i++) {
      const attempt = await PasswordService.recordFailedAttempt(identifier);
      assert.equal(attempt.isLocked, false);
      assert.equal(attempt.attemptsLeft, 5 - i);
    }

    // 5th attempt locks the account
    const fifthAttempt = await PasswordService.recordFailedAttempt(identifier);
    assert.equal(fifthAttempt.isLocked, true);
    assert.equal(fifthAttempt.attemptsLeft, 0);

    const status = await PasswordService.checkLockout(identifier);
    assert.equal(status.isLocked, true);
    assert.ok(status.remainingSeconds && status.remainingSeconds > 0);

    // Reset failed attempts unlocks
    await PasswordService.resetFailedAttempts(identifier);
    const resetStatus = await PasswordService.checkLockout(identifier);
    assert.equal(resetStatus.isLocked, false);
  });

  it("Account Role Source of Truth: Server authoritative role is assigned based on verified backend state", async () => {
    const otpService = new OtpService(new MockOtpAdapter());

    // Investor registration
    const investorUser = await otpService.findOrCreateUser("investor_user@stockiq.com", "Retail Investor", "INVESTOR");
    assert.ok(investorUser.roles.includes(PlatformRoles.INVESTOR_RETAIL));
    assert.equal(investorUser.roles.includes(PlatformRoles.RESEARCH_ANALYST), false);

    // RA Company registration
    const providerUser = await otpService.findOrCreateUser("ra_company@stockiq.com", "Alpha Research Pvt Ltd", "PROVIDER");
    assert.ok(providerUser.roles.includes(PlatformRoles.RESEARCH_ANALYST));
  });

  it("Forgot Password Workflow: verifies OTP and updates password hash securely", async () => {
    const otpService = new OtpService(new MockOtpAdapter());
    const identifier = "forgot_user@stockiq.com";

    // Create user with old password
    const user = await otpService.findOrCreateUser(identifier, "Forgot Tester", "INVESTOR");
    const oldHash = await PasswordService.hashPassword("OldP@ssword123");
    await PasswordService.setPassword(user.id, identifier, oldHash);

    // Request reset OTP
    const reqRes = await otpService.requestOtp({ identifier, purpose: "PASSWORD_RESET" });
    assert.equal(reqRes.success, true);

    // Verify reset OTP
    const verifyRes = await otpService.verifyOtp({
      identifier,
      otp: MockOtpAdapter.DEFAULT_TEST_OTP,
      purpose: "PASSWORD_RESET",
    });
    assert.equal(verifyRes.valid, true);

    // Update password
    const newHash = await PasswordService.hashPassword("NewSecureP@ssword99");
    await PasswordService.setPassword(user.id, identifier, newHash);

    // Old password fails, new password succeeds
    assert.equal(await PasswordService.verifyPassword("OldP@ssword123", await PasswordService.getPasswordHash(identifier) as string), false);
    assert.equal(await PasswordService.verifyPassword("NewSecureP@ssword99", await PasswordService.getPasswordHash(identifier) as string), true);
  });
});
