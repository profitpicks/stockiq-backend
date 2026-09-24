import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { RbacEngine } from "../../modules/auth/rbac.js";
import { AuditService } from "../../modules/audit/audit.service.js";

describe("Unit: Milestone 15 - Platform Admin & Compliance Panel", () => {
  const auditService = AuditService.getInstance();

  test("RBAC: Super Admin has universal operational access across administrative scopes", () => {
    const superAdminUser = {
      userId: "usr-admin-001",
      roles: [PlatformRoles.SUPER_ADMIN],
    };

    assert.equal(RbacEngine.hasRole(superAdminUser, [PlatformRoles.SUPER_ADMIN]), true);
    assert.equal(RbacEngine.hasRole(superAdminUser, [PlatformRoles.COMPLIANCE_ADMIN]), true);
    assert.equal(RbacEngine.hasRole(superAdminUser, [PlatformRoles.VERIFICATION_OFFICER]), true);
    assert.equal(RbacEngine.hasRole(superAdminUser, [PlatformRoles.FINANCE_ADMIN]), true);
  });

  test("RBAC: Role separation strictly restricts non-authorized admin roles", () => {
    const contentModeratorUser = {
      userId: "usr-mod-001",
      roles: [PlatformRoles.CONTENT_MODERATOR],
    };

    const financeAdminUser = {
      userId: "usr-fin-001",
      roles: [PlatformRoles.FINANCE_ADMIN],
    };

    // Content moderator cannot execute financial administration
    assert.equal(RbacEngine.hasRole(contentModeratorUser, [PlatformRoles.FINANCE_ADMIN]), false);

    // Finance admin cannot execute content moderation
    assert.equal(RbacEngine.hasRole(financeAdminUser, [PlatformRoles.CONTENT_MODERATOR]), false);
  });

  test("RBAC: Non-admin investor and provider roles are denied access to admin functions", () => {
    const retailUser = {
      userId: "usr-inv-001",
      roles: [PlatformRoles.INVESTOR_RETAIL],
    };

    const providerUser = {
      userId: "usr-ra-001",
      roles: [PlatformRoles.RESEARCH_ANALYST],
    };

    const adminRoles = [
      PlatformRoles.SUPER_ADMIN,
      PlatformRoles.COMPLIANCE_ADMIN,
      PlatformRoles.VERIFICATION_OFFICER,
      PlatformRoles.CONTENT_MODERATOR,
      PlatformRoles.FINANCE_ADMIN,
      PlatformRoles.SUPPORT_ADMIN,
    ];

    assert.equal(RbacEngine.hasRole(retailUser, adminRoles), false);
    assert.equal(RbacEngine.hasRole(providerUser, adminRoles), false);
  });

  test("Audit: Administrative security logging preserves actor, action, and entity metadata", () => {
    const log = auditService.logSecurityAction(
      "usr-vo-001",
      PlatformRoles.VERIFICATION_OFFICER,
      "PROVIDER_VERIFICATION_APPROVED",
      "PROVIDER_VERIFICATION_CASE",
      "case-test-999",
      { status: "APPROVED" },
      { status: "UNDER_REVIEW" },
      "127.0.0.1"
    );

    assert.equal(log.actorId, "usr-vo-001");
    assert.equal(log.actorRole, PlatformRoles.VERIFICATION_OFFICER);
    assert.equal(log.action, "PROVIDER_VERIFICATION_APPROVED");
    assert.equal(log.entity, "PROVIDER_VERIFICATION_CASE");
    assert.equal(log.entityId, "case-test-999");
    assert.equal(log.newState?.status, "APPROVED");
  });

  test("Audit: Security logs can be queried by actorRole or entity for compliance inspection", () => {
    const logs = auditService.getSecurityLogs(PlatformRoles.VERIFICATION_OFFICER, "PROVIDER_VERIFICATION_CASE");
    assert.ok(logs.length > 0);
    assert.equal(logs[0].actorRole, PlatformRoles.VERIFICATION_OFFICER);
  });
});
