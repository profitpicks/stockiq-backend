import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { seedTestData } from "../../database/seeds/seed_test_data.js";
import { OtpService } from "../../modules/auth/otp.service.js";
import { PasswordService } from "../../modules/auth/password.service.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { ProviderService } from "../../modules/providers/provider.service.js";
import { ServiceManagementService } from "../../modules/services/management.service.js";
import { AuditService } from "../../modules/audit/audit.service.js";

describe("Unit: Milestone 17 - Final Production Hardening & E2E Validation", () => {
  const otpService = new OtpService();
  const providerService = new ProviderService();
  const serviceManagementService = new ServiceManagementService(providerService);
  const auditService = AuditService.getInstance();

  test("Seed Data: Idempotently creates required test accounts with valid password hashes", async () => {
    await seedTestData();
    await seedTestData(); // Idempotency check

    const investor = await otpService.getUserById("User001") || await otpService.findOrCreateUser("User001");
    const providerUser = await otpService.getUserById("Tradenexusresearch") || await otpService.findOrCreateUser("Tradenexusresearch");
    const adminUser = await otpService.getUserById("stockiq_superadmin") || await otpService.findOrCreateUser("stockiq_superadmin");

    assert.ok(investor);
    assert.ok(providerUser);
    assert.ok(adminUser);

    // Verify Password verification for Trade@123
    const investorHash = await PasswordService.getPasswordHash("User001");
    assert.ok(investorHash);
    const isValid = await PasswordService.verifyPassword("Trade@123", investorHash!);
    assert.equal(isValid, true);
  });

  test("Role Isolation: Test accounts strictly retain expected single roles", async () => {
    const investor = await otpService.getUserById("User001") || await otpService.findOrCreateUser("User001");
    const providerUser = await otpService.getUserById("Tradenexusresearch") || await otpService.findOrCreateUser("Tradenexusresearch");

    assert.equal(investor.roles.includes(PlatformRoles.INVESTOR_RETAIL), true);
    assert.equal(investor.roles.includes(PlatformRoles.SUPER_ADMIN), false);
    assert.equal(investor.roles.includes(PlatformRoles.RESEARCH_ANALYST), false);

    assert.equal(providerUser.roles.includes(PlatformRoles.RESEARCH_ANALYST), true);
    assert.equal(providerUser.roles.includes(PlatformRoles.SUPER_ADMIN), false);
  });

  test("Test Services: Configured services have ₹11,800 final customer price (1180000 paise)", async () => {
    const providerUser = await otpService.getUserById("Tradenexusresearch") || await otpService.findOrCreateUser("Tradenexusresearch");
    const provider = await providerService.getProviderByUserId(providerUser.id);
    assert.ok(provider);

    const services = await serviceManagementService.getProviderServices(provider!.id);
    assert.ok(services.length >= 2);

    const indexOpt = services.find((s) => s.serviceName === "INDEX OPTIONS");
    const stockOpt = services.find((s) => s.serviceName === "STOCK OPTIONS");

    assert.ok(indexOpt);
    assert.ok(stockOpt);

    assert.equal(indexOpt?.feeInPaise, 1180000);
    assert.equal(stockOpt?.feeInPaise, 1180000);
  });

  test("Security & Audit: Masking sensitive fields prevents password/token exposure", () => {
    const log = auditService.logSecurityAction(
      "stockiq_superadmin",
      PlatformRoles.SUPER_ADMIN,
      "ADMIN_PASSWORD_RESET",
      "USER",
      "User001",
      {
        password: "Trade@123",
        secret: "super_secret_key_123",
        note: "Routine security refresh"
      }
    );

    assert.equal(log.newState?.password, "[MASKED]");
    assert.equal(log.newState?.secret, "[MASKED]");
    assert.equal(log.newState?.note, "Routine security refresh");
  });
});
