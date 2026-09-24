import crypto from "crypto";
import { promisify } from "util";
import { db } from "../../database/connection.js";

const scryptAsync = promisify(crypto.scrypt);

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LockoutStatus {
  isLocked: boolean;
  lockedUntil?: Date;
  remainingSeconds?: number;
}

export class PasswordService {
  private static readonly SALT_BYTES = 32;
  private static readonly KEY_LENGTH = 64;
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MINUTES = 15;

  // In-memory fallback tracking for unit testing & isolated environments
  private static memoryPasswordHashes = new Map<string, string>(); // identifier/userId -> hash
  private static memoryFailedAttempts = new Map<string, { count: number; lockedUntil?: Date }>();

  /**
   * Securely hashes a plaintext password using crypto.scrypt with a unique random salt.
   * Returns formatted string: scrypt:{saltHex}:{derivedKeyHex}
   */
  public static async hashPassword(password: string): Promise<string> {
    if (!password || password.length === 0) {
      throw new Error("Password cannot be empty");
    }
    const salt = crypto.randomBytes(this.SALT_BYTES);
    const derivedKey = (await scryptAsync(password, salt, this.KEY_LENGTH)) as Buffer;
    return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
  }

  /**
   * Verifies a password against a stored scrypt hash using timing-safe comparison.
   */
  public static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    try {
      if (!storedHash || !storedHash.startsWith("scrypt:")) {
        return false;
      }

      const parts = storedHash.split(":");
      if (parts.length !== 3) {
        return false;
      }

      const saltHex = parts[1];
      const expectedKeyHex = parts[2];

      const salt = Buffer.from(saltHex, "hex");
      const expectedKey = Buffer.from(expectedKeyHex, "hex");

      const derivedKey = (await scryptAsync(password, salt, expectedKey.length)) as Buffer;

      if (derivedKey.length !== expectedKey.length) {
        return false;
      }

      return crypto.timingSafeEqual(derivedKey, expectedKey);
    } catch {
      return false;
    }
  }

  /**
   * Validates password strength policy:
   * - Minimum 8 characters
   * - At least one letter
   * - At least one digit or special character
   */
  public static validatePasswordPolicy(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password || password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }
    if (!/[A-Za-z]/.test(password)) {
      errors.push("Password must contain at least one letter");
    }
    if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push("Password must contain at least one number or special character");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Helper to derive mobile and email for custom usernames
   */
  private static deriveIdentifierFields(identifier: string) {
    const isEmail = identifier.includes("@");
    const isPhone = /^\+?[0-9]{10,14}$/.test(identifier);
    const mobile = isPhone
      ? identifier
      : `+919${crypto.createHash("md5").update(identifier).digest("hex").slice(0, 9)}`;
    const email = isEmail ? identifier : `user_${identifier.replace(/\+/g, "")}@stockiq.local`;
    return { mobile, email };
  }

  /**
   * Checks if an account is currently locked due to too many failed attempts.
   */
  public static async checkLockout(identifier: string): Promise<LockoutStatus> {
    const now = new Date();
    const { mobile, email } = this.deriveIdentifierFields(identifier);

    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT locked_until, failed_login_attempts FROM users 
         WHERE id = $1 OR mobile = $1 OR email = $1 OR mobile = $2 OR email = $3`,
        [identifier, mobile, email]
      );

      if (rows.length > 0 && rows[0].locked_until) {
        const lockedUntil = new Date(rows[0].locked_until);
        if (lockedUntil > now) {
          const remainingSeconds = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
          return { isLocked: true, lockedUntil, remainingSeconds };
        }
      }
    } catch {
      // Memory fallback check
      const state = this.memoryFailedAttempts.get(identifier);
      if (state?.lockedUntil && state.lockedUntil > now) {
        const remainingSeconds = Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000);
        return { isLocked: true, lockedUntil: state.lockedUntil, remainingSeconds };
      }
    }

    return { isLocked: false };
  }

  /**
   * Records a failed login attempt and locks account if threshold exceeded.
   */
  public static async recordFailedAttempt(identifier: string): Promise<{ isLocked: boolean; attemptsLeft: number }> {
    const now = new Date();
    let currentAttempts = 0;
    const { mobile, email } = this.deriveIdentifierFields(identifier);

    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, failed_login_attempts FROM users WHERE id = $1 OR mobile = $1 OR email = $1 OR mobile = $2 OR email = $3`,
        [identifier, mobile, email]
      );

      if (rows.length > 0) {
        currentAttempts = (rows[0].failed_login_attempts || 0) + 1;
        let lockedUntil: Date | null = null;

        if (currentAttempts >= this.MAX_FAILED_ATTEMPTS) {
          lockedUntil = new Date(now.getTime() + this.LOCKOUT_DURATION_MINUTES * 60 * 1000);
          await pool.query(
            `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
            [currentAttempts, lockedUntil.toISOString(), rows[0].id]
          );
          return { isLocked: true, attemptsLeft: 0 };
        } else {
          await pool.query(
            `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`,
            [currentAttempts, rows[0].id]
          );
          return { isLocked: false, attemptsLeft: this.MAX_FAILED_ATTEMPTS - currentAttempts };
        }
      }
    } catch {
      // Memory fallback
      const state = this.memoryFailedAttempts.get(identifier) || { count: 0 };
      state.count += 1;

      if (state.count >= this.MAX_FAILED_ATTEMPTS) {
        state.lockedUntil = new Date(now.getTime() + this.LOCKOUT_DURATION_MINUTES * 60 * 1000);
        this.memoryFailedAttempts.set(identifier, state);
        return { isLocked: true, attemptsLeft: 0 };
      } else {
        this.memoryFailedAttempts.set(identifier, state);
        return { isLocked: false, attemptsLeft: this.MAX_FAILED_ATTEMPTS - state.count };
      }
    }

    return { isLocked: false, attemptsLeft: this.MAX_FAILED_ATTEMPTS - 1 };
  }

  /**
   * Resets failed attempts after successful authentication or admin unlock.
   */
  public static async resetFailedAttempts(identifier: string): Promise<void> {
    const { mobile, email } = this.deriveIdentifierFields(identifier);
    try {
      const pool = db.getPool();
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1 OR mobile = $1 OR email = $1 OR mobile = $2 OR email = $3`,
        [identifier, mobile, email]
      );
    } catch {
      this.memoryFailedAttempts.delete(identifier);
    }
    this.memoryFailedAttempts.delete(identifier);
  }

  /**
   * Explicitly unlocks an account.
   */
  public static async unlockAccount(identifier: string): Promise<void> {
    await this.resetFailedAttempts(identifier);
  }

  /**
   * Sets or updates password for a user.
   */
  public static async setPassword(userId: string, identifier: string, passwordHash: string): Promise<void> {
    const nowISO = new Date().toISOString();
    const { mobile, email } = this.deriveIdentifierFields(identifier);

    try {
      const pool = db.getPool();
      await pool.query(
        `UPDATE users SET password_hash = $1, password_updated_at = $2, failed_login_attempts = 0, locked_until = NULL 
         WHERE id = $3 OR mobile = $4 OR email = $4 OR mobile = $5 OR email = $6`,
        [passwordHash, nowISO, userId, identifier, mobile, email]
      );
    } catch {
      this.memoryPasswordHashes.set(userId, passwordHash);
      this.memoryPasswordHashes.set(identifier, passwordHash);
    }
    // Set memory map in all modes so memory fallback works if DB drops or falls back
    this.memoryPasswordHashes.set(userId, passwordHash);
    this.memoryPasswordHashes.set(identifier, passwordHash);
  }

  /**
   * Retrieves the stored password hash for an identifier or userId.
   */
  public static async getPasswordHash(identifier: string): Promise<string | null> {
    const { mobile, email } = this.deriveIdentifierFields(identifier);

    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT password_hash FROM users 
         WHERE (id = $1 OR mobile = $1 OR email = $1 OR mobile = $2 OR email = $3 OR LOWER(id) = LOWER($1) OR LOWER(mobile) = LOWER($1) OR LOWER(email) = LOWER($1))
           AND password_hash IS NOT NULL AND password_hash != ''
         ORDER BY password_updated_at DESC NULLS LAST`,
        [identifier, mobile, email]
      );
      if (rows.length > 0 && rows[0].password_hash) {
        return rows[0].password_hash;
      }
    } catch {
      return this.memoryPasswordHashes.get(identifier) || this.memoryPasswordHashes.get(identifier.toLowerCase()) || null;
    }
    return this.memoryPasswordHashes.get(identifier) || this.memoryPasswordHashes.get(identifier.toLowerCase()) || null;
  }

  /**
   * Clears memory state for testing isolation.
   */
  public static clearMemoryState(): void {
    this.memoryPasswordHashes.clear();
    this.memoryFailedAttempts.clear();
  }
}
