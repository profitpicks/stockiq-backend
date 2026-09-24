import { Router, Request, Response, NextFunction } from "express";
import { OtpService } from "../../modules/auth/otp.service.js";
import { SessionManager } from "../../modules/auth/sessions.js";
import { PasswordService } from "../../modules/auth/password.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { z } from "zod";

export const authRouter = Router();
const otpService = new OtpService();

const RequestOtpSchema = z.object({
  identifier: z.string().min(3, "Identifier (mobile/email) is required"),
  purpose: z.enum(["LOGIN", "SIGNING", "PASSWORD_RESET"]).default("LOGIN"),
});

const VerifyOtpSchema = z.object({
  identifier: z.string().min(3, "Identifier is required"),
  otp: z.string().min(4, "OTP must be at least 4 digits"),
  purpose: z.enum(["LOGIN", "SIGNING", "PASSWORD_RESET"]).default("LOGIN"),
  fullName: z.string().optional(),
  userType: z.enum(["INVESTOR", "PROVIDER", "ADMIN"]).optional(),
});

const LoginSchema = z.object({
  identifier: z.string().min(3, "Identifier is required"),
  password: z.string().min(1, "Password is required"),
});

const RegisterSchema = z.object({
  identifier: z.string().min(3, "Identifier (email or mobile) is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Confirm password is required"),
  fullName: z.string().min(2, "Full name is required"),
  accountType: z.enum(["INVESTOR", "PROVIDER"]).default("INVESTOR"),
});

const ForgotPasswordRequestSchema = z.object({
  identifier: z.string().min(3, "Identifier is required"),
});

const ForgotPasswordResetSchema = z.object({
  identifier: z.string().min(3, "Identifier is required"),
  otp: z.string().min(4, "OTP must be at least 4 digits"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Confirm password is required"),
});

/**
 * POST /api/v1/auth/otp/request
 * Triggers OTP generation & delivery via OTP adapter with rate-limiting and correlation ID.
 */
authRouter.post("/otp/request", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = RequestOtpSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const { identifier, purpose } = parse.data;
    const ipAddress = req.ip || req.socket.remoteAddress;

    const result = await otpService.requestOtp({
      identifier,
      purpose,
      ipAddress,
    });

    if (!result.success) {
      throw new AppError(result.message, 429, "RATE_LIMIT_EXCEEDED");
    }

    res.status(200).json({
      success: true,
      referenceId: result.referenceId,
      expiresInSeconds: result.expiresInSeconds,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/otp/verify
 * Verifies OTP challenge, finds/creates user, and issues server-side session token.
 */
authRouter.post("/otp/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = VerifyOtpSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const { identifier, otp, purpose, fullName, userType } = parse.data;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const verification = await otpService.verifyOtp({
      identifier,
      otp,
      purpose,
      fullName,
      userType,
      ipAddress,
    });

    if (!verification.valid || !verification.user) {
      throw new AppError(verification.error || "OTP verification failed", 401, "INVALID_OTP");
    }

    // Create Server-Side Session
    const sessionRes = await SessionManager.createSession({
      userId: verification.user.id,
      ipAddress,
      userAgent,
    });

    res.status(200).json({
      success: true,
      message: "Authentication successful",
      token: sessionRes.token,
      session: {
        id: sessionRes.session.id,
        expiresAt: sessionRes.session.expiresAt,
      },
      user: {
        id: verification.user.id,
        email: verification.user.email,
        mobile: verification.user.mobile,
        fullName: verification.user.fullName,
        roles: verification.user.roles,
        accountStatus: verification.user.accountStatus,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/logout
 * Revokes the current session.
 */
authRouter.post("/logout", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.sessionId) {
      await SessionManager.revokeSession(req.sessionId);
    }
    res.status(200).json({
      success: true,
      message: "Logged out successfully. Current session revoked.",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/logout-all
 * Revokes all active sessions for current user.
 */
authRouter.post("/logout-all", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const revokedCount = await SessionManager.revokeAllUserSessions(req.user!.id);
    res.status(200).json({
      success: true,
      revokedCount,
      message: `Logged out from all devices. Revoked ${revokedCount} active session(s).`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/auth/me
 * Retrieves current authenticated user identity and roles.
 */
authRouter.get("/me", authMiddleware(true), async (req: Request, res: Response) => {
  res.status(200).json({
    user: req.user,
    sessionId: req.sessionId,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/auth/sessions
 * Lists active sessions for current user.
 */
authRouter.get("/sessions", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await SessionManager.getUserSessions(req.user!.id);
    const sanitized = sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === req.sessionId,
    }));

    res.status(200).json({
      sessions: sanitized,
      total: sanitized.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/auth/sessions/:sessionId
 * Revokes a specific session by ID.
 */
authRouter.delete("/sessions/:sessionId", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const userSessions = await SessionManager.getUserSessions(req.user!.id);
    const targetSession = userSessions.find((s) => s.id === sessionId);

    if (!targetSession) {
      throw new AppError("Session not found or not owned by authenticated user", 404, "NOT_FOUND");
    }

    await SessionManager.revokeSession(sessionId);

    res.status(200).json({
      success: true,
      message: `Session ${sessionId} revoked successfully.`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/login
 * Authenticates user via server-side password verification and rate-limited lockout protection.
 */
authRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = LoginSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const { identifier, password } = parse.data;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = (req.headers["user-agent"] as string) || "Stockiq-Android";

    // 1. Check lockout status
    const lockout = await PasswordService.checkLockout(identifier);
    if (lockout.isLocked) {
      throw new AppError(
        `Account is temporarily locked due to excessive failed login attempts. Please try again in ${lockout.remainingSeconds} seconds, or reset your password.`,
        423,
        "ACCOUNT_LOCKED"
      );
    }

    // 2. Locate or resolve user
    const user = await otpService.findOrCreateUser(identifier);

    // 3. Verify password
    let storedHash = await PasswordService.getPasswordHash(identifier);
    if (!storedHash && user) {
      storedHash = await PasswordService.getPasswordHash(user.id);
    }

    let isValid = false;
    if (storedHash) {
      isValid = await PasswordService.verifyPassword(password, storedHash);
    }

    if (!isValid) {
      const { isLocked, attemptsLeft } = await PasswordService.recordFailedAttempt(identifier);
      if (isLocked) {
        throw new AppError(
          "Account has been temporarily locked for 15 minutes due to too many failed attempts.",
          423,
          "ACCOUNT_LOCKED"
        );
      }
      throw new AppError(
        `Invalid credentials. Please verify your identifier and password. (${attemptsLeft} attempt(s) remaining before temporary lockout)`,
        401,
        "INVALID_CREDENTIALS"
      );
    }

    // 4. Check account status
    if (user.accountStatus === "SUSPENDED" || user.accountStatus === "TERMINATED") {
      throw new AppError(`Account is ${user.accountStatus.toLowerCase()}. Access denied.`, 403, "ACCOUNT_RESTRICTED");
    }

    // 5. Reset failed attempts
    await PasswordService.resetFailedAttempts(identifier);

    // 6. Create server-side session
    const sessionRes = await SessionManager.createSession({
      userId: user.id,
      ipAddress,
      userAgent,
    });

    res.status(200).json({
      success: true,
      message: "Authentication successful",
      token: sessionRes.token,
      session: {
        id: sessionRes.session.id,
        expiresAt: sessionRes.session.expiresAt,
      },
      user: {
        id: user.id,
        email: user.email,
        mobile: user.mobile,
        fullName: user.fullName,
        userType: user.userType,
        roles: user.roles,
        accountStatus: user.accountStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/register
 * Creates a new user account with hashed password and initial role classification.
 */
authRouter.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = RegisterSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const { identifier, password, confirmPassword, fullName, accountType } = parse.data;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = (req.headers["user-agent"] as string) || "Stockiq-Android";

    if (password !== confirmPassword) {
      throw new AppError("Passwords do not match", 400, "PASSWORD_MISMATCH");
    }

    const policy = PasswordService.validatePasswordPolicy(password);
    if (!policy.valid) {
      throw new AppError(`Password policy violation: ${policy.errors.join("; ")}`, 400, "WEAK_PASSWORD");
    }

    const existingHash = await PasswordService.getPasswordHash(identifier);
    if (existingHash) {
      throw new AppError("An account with this mobile/email already exists. Please log in or reset your password.", 409, "ACCOUNT_EXISTS");
    }

    // Create user with explicit accountType
    const user = await otpService.findOrCreateUser(identifier, fullName, accountType);
    const passwordHash = await PasswordService.hashPassword(password);
    await PasswordService.setPassword(user.id, identifier, passwordHash);

    // Create session
    const sessionRes = await SessionManager.createSession({
      userId: user.id,
      ipAddress,
      userAgent,
    });

    res.status(201).json({
      success: true,
      message: "Account registered successfully",
      token: sessionRes.token,
      session: {
        id: sessionRes.session.id,
        expiresAt: sessionRes.session.expiresAt,
      },
      user: {
        id: user.id,
        email: user.email,
        mobile: user.mobile,
        fullName: user.fullName,
        userType: user.userType,
        roles: user.roles,
        accountStatus: user.accountStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/forgot-password/request
 * Initiates identity verification OTP challenge for password reset.
 */
authRouter.post("/forgot-password/request", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = ForgotPasswordRequestSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const { identifier } = parse.data;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = (req.headers["user-agent"] as string) || "Stockiq-Android";

    const result = await otpService.requestOtp({
      identifier,
      purpose: "PASSWORD_RESET",
      ipAddress,
    });

    res.status(200).json({
      success: true,
      message: "Password reset verification code dispatched to registered contact.",
      referenceId: result.referenceId,
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/forgot-password/reset
 * Verifies OTP challenge and updates password hash server-side.
 */
authRouter.post("/forgot-password/reset", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = ForgotPasswordResetSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(`Invalid request: ${parse.error.issues.map((i) => i.message).join(", ")}`, 400, "BAD_REQUEST");
    }

    const { identifier, otp, newPassword, confirmPassword } = parse.data;

    if (newPassword !== confirmPassword) {
      throw new AppError("Passwords do not match", 400, "PASSWORD_MISMATCH");
    }

    const policy = PasswordService.validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      throw new AppError(`Password policy violation: ${policy.errors.join("; ")}`, 400, "WEAK_PASSWORD");
    }

    const verifyResult = await otpService.verifyOtp({
      identifier,
      otp,
      purpose: "PASSWORD_RESET",
    });

    if (!verifyResult.valid || !verifyResult.user) {
      throw new AppError(verifyResult.error || "Invalid or expired OTP code", 401, "INVALID_OTP");
    }

    const passwordHash = await PasswordService.hashPassword(newPassword);
    await PasswordService.setPassword(verifyResult.user.id, identifier, passwordHash);

    // Revoke all existing sessions for security
    await SessionManager.revokeAllUserSessions(verifyResult.user.id);

    res.status(200).json({
      success: true,
      message: "Password reset successfully. Please log in with your new credentials.",
    });
  } catch (err) {
    next(err);
  }
});

