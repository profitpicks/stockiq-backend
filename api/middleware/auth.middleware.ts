import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { AuthenticatedUser } from "../../modules/auth/rbac.js";
import { PlatformRole, PlatformRoles } from "../../modules/auth/roles.js";
import { SessionManager } from "../../modules/auth/sessions.js";
import { OtpService } from "../../modules/auth/otp.service.js";
import { config } from "../../config/index.js";
import { AppError } from "./error-handler.middleware.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}

/**
 * Authentication Middleware Foundation
 *
 * Validates server-side active session tokens. Rejects dev mock tokens in production.
 */
export function authMiddleware(requiredOrReq: any = true, res?: any, next?: any): any {
  // Check if called directly as Express middleware: (req, res, next)
  if (requiredOrReq && typeof requiredOrReq === "object" && typeof next === "function") {
    executeAuth(requiredOrReq as Request, res, next, true);
    return;
  }

  const required = requiredOrReq !== false;
  return (req: Request, response: Response, nextFn: NextFunction): void => {
    executeAuth(req, response, nextFn, required);
  };
}

async function executeAuth(req: Request, _res: Response, next: NextFunction, required: boolean): Promise<void> {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      if (required) {
        throw new AppError("Authentication token is required", 401, "UNAUTHORIZED");
      }
      return next();
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new AppError("Invalid authorization format. Bearer token expected", 401, "INVALID_TOKEN");
    }

    const token = authHeader.substring(7).trim();

    // Check Dev/Test Mock Token format: mock-user:<id>:<role>
    if (token.startsWith("mock-user:")) {
      if (config.nodeEnv === "production") {
        throw new AppError("Development mock tokens are strictly forbidden in production", 401, "INVALID_TOKEN");
      }

      const parts = token.split(":");
      const rawUserId = parts[1] || "mock-user-1";
      const role = (parts[2] as PlatformRole) || PlatformRoles.INVESTOR_RETAIL;

      let userId = rawUserId;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId)) {
        const hash = crypto.createHash("md5").update(rawUserId).digest("hex");
        userId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      }

      const otpService = new OtpService();
      const user = await otpService.findOrCreateUser(userId);

      req.user = {
        id: user.id,
        email: user.email || `${rawUserId}@stockiq.local`,
        mobile: user.mobile || "+919876543210",
        roles: [role],
        permissions: [],
      };
      return next();
    }

    // Production & Server-Side Session Token Validation
    const session = await SessionManager.validateSession(token);
    if (!session) {
      if (required) {
        throw new AppError("Session token is invalid, expired, or revoked", 401, "UNAUTHORIZED");
      }
      return next();
    }

    // Fetch user account details
    const otpService = new OtpService();
    const user = (await otpService.getUserById(session.userId)) || (await otpService.findOrCreateUser(session.userId));

    if (user.accountStatus !== "ACTIVE") {
      throw new AppError(`Account is currently ${user.accountStatus.toLowerCase()}`, 403, "ACCOUNT_LOCKED");
    }

    req.user = {
      id: user.id,
      email: user.email,
      mobile: user.mobile,
      roles: user.roles,
      permissions: [],
    };
    req.sessionId = session.id;

    return next();
  } catch (err) {
    next(err);
  }
}

