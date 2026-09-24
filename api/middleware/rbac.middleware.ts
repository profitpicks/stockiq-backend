import { Request, Response, NextFunction } from "express";
import { PlatformRole, PlatformRoles } from "../../modules/auth/roles.js";
import { RbacEngine } from "../../modules/auth/rbac.js";
import { AppError } from "./error-handler.middleware.js";

/**
 * RBAC Authorization Middleware Guard
 *
 * Ensures the authenticated user possesses one of the allowed platform roles.
 */
export function requireRoles(...allowedRoles: PlatformRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError("Authentication required before authorization check", 401, "UNAUTHORIZED");
    }

    if (req.user.roles.includes(PlatformRoles.SUPER_ADMIN)) {
      return next(); // Super Admin has universal operational access
    }

    const hasRequiredRole = RbacEngine.hasRole(req.user, allowedRoles);

    if (!hasRequiredRole) {
      throw new AppError(
        `Access denied. Requires one of roles: [${allowedRoles.join(", ")}]`,
        403,
        "FORBIDDEN_INSUFFICIENT_ROLE",
        { userRoles: req.user.roles, requiredRoles: allowedRoles }
      );
    }

    next();
  };
}

/**
 * Permission-based Authorization Guard
 */
export function requirePermission(permissionId: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError("Authentication required before authorization check", 401, "UNAUTHORIZED");
    }

    const hasPermission = RbacEngine.hasPermission(req.user, permissionId);

    if (!hasPermission) {
      throw new AppError(
        `Access denied. Requires permission: ${permissionId}`,
        403,
        "FORBIDDEN_INSUFFICIENT_PERMISSION",
        { requiredPermission: permissionId }
      );
    }

    next();
  };
}
