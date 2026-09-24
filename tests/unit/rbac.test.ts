import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PlatformRoles, ROLE_REGISTRY } from "../../modules/auth/roles.js";
import { RbacEngine, AuthenticatedUser } from "../../modules/auth/rbac.js";

describe("Unit: Role Model & RBAC Engine", () => {
  it("should contain exactly all 12 platform operational roles", () => {
    const roleKeys = Object.keys(PlatformRoles);
    assert.equal(roleKeys.length, 12);

    const expectedRoles = [
      "SUPER_ADMIN",
      "COMPLIANCE_ADMIN",
      "VERIFICATION_OFFICER",
      "CONTENT_MODERATOR",
      "FINANCE_ADMIN",
      "SUPPORT_ADMIN",
      "RESEARCH_ANALYST",
      "INVESTMENT_ADVISER",
      "INVESTOR_RETAIL",
      "HNI",
      "ACCREDITED_INVESTOR",
      "GUEST_PUBLIC",
    ];

    for (const role of expectedRoles) {
      assert.ok(role in PlatformRoles, `Role ${role} must be defined`);
      assert.ok(role in ROLE_REGISTRY, `Role ${role} must be in ROLE_REGISTRY`);
    }
  });

  it("should strictly separate HNI and Accredited Investor roles", () => {
    assert.notEqual(PlatformRoles.HNI, PlatformRoles.ACCREDITED_INVESTOR);
    assert.equal(ROLE_REGISTRY[PlatformRoles.HNI].id, "HNI");
    assert.equal(ROLE_REGISTRY[PlatformRoles.ACCREDITED_INVESTOR].id, "ACCREDITED_INVESTOR");
    assert.ok(ROLE_REGISTRY[PlatformRoles.ACCREDITED_INVESTOR].description.includes("accredited"));
  });

  it("should grant Super Admin universal operational role bypass", () => {
    const superAdminUser: AuthenticatedUser = {
      id: "admin-1",
      email: "admin@stockiq.com",
      mobile: "+919999999999",
      roles: [PlatformRoles.SUPER_ADMIN],
    };

    assert.equal(RbacEngine.hasRole(superAdminUser, [PlatformRoles.RESEARCH_ANALYST]), true);
    assert.equal(RbacEngine.hasRole(superAdminUser, [PlatformRoles.COMPLIANCE_ADMIN]), true);
  });

  it("should correctly evaluate matching and non-matching roles for regular users", () => {
    const retailUser: AuthenticatedUser = {
      id: "user-1",
      email: "user@stockiq.com",
      mobile: "+919876543210",
      roles: [PlatformRoles.INVESTOR_RETAIL],
    };

    assert.equal(RbacEngine.hasRole(retailUser, [PlatformRoles.INVESTOR_RETAIL]), true);
    assert.equal(RbacEngine.hasRole(retailUser, [PlatformRoles.COMPLIANCE_ADMIN]), false);
    assert.equal(RbacEngine.isAdmin(retailUser), false);
    assert.equal(RbacEngine.isProvider(retailUser), false);
  });

  it("should correctly identify providers and admins", () => {
    const raUser: AuthenticatedUser = {
      id: "ra-1",
      email: "ra@stockiq.com",
      mobile: "+919876543211",
      roles: [PlatformRoles.RESEARCH_ANALYST],
    };

    const complianceUser: AuthenticatedUser = {
      id: "comp-1",
      email: "comp@stockiq.com",
      mobile: "+919876543212",
      roles: [PlatformRoles.COMPLIANCE_ADMIN],
    };

    assert.equal(RbacEngine.isProvider(raUser), true);
    assert.equal(RbacEngine.isAdmin(raUser), false);

    assert.equal(RbacEngine.isProvider(complianceUser), false);
    assert.equal(RbacEngine.isAdmin(complianceUser), true);
  });
});
