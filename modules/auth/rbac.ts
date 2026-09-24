import { PlatformRole, PlatformRoles } from "./roles.js";

export interface Permission {
  id: string;
  module: string;
  action: string;
  description: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  mobile: string;
  roles: PlatformRole[];
  permissions?: string[];
}

export class RbacEngine {
  /**
   * Checks if user possesses any of the required roles.
   */
  public static hasRole(user: AuthenticatedUser | undefined, requiredRoles: PlatformRole[]): boolean {
    if (!user || !user.roles) return false;
    if (user.roles.includes(PlatformRoles.SUPER_ADMIN)) return true; // Super Admin has access
    return requiredRoles.some((r) => user.roles.includes(r));
  }

  /**
   * Checks if user has a specific permission.
   */
  public static hasPermission(user: AuthenticatedUser | undefined, permissionId: string): boolean {
    if (!user) return false;
    if (user.roles?.includes(PlatformRoles.SUPER_ADMIN)) return true;
    return Boolean(user.permissions?.includes(permissionId));
  }

  /**
   * Determines if the user is a registered market professional (RA or IA).
   */
  public static isProvider(user: AuthenticatedUser | undefined): boolean {
    return this.hasRole(user, [PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER]);
  }

  /**
   * Determines if the user is in an administrative/compliance oversight role.
   */
  public static isAdmin(user: AuthenticatedUser | undefined): boolean {
    return this.hasRole(user, [
      PlatformRoles.SUPER_ADMIN,
      PlatformRoles.COMPLIANCE_ADMIN,
      PlatformRoles.VERIFICATION_OFFICER,
      PlatformRoles.FINANCE_ADMIN,
      PlatformRoles.SUPPORT_ADMIN,
    ]);
  }
}
