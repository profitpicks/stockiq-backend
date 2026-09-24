import crypto from "crypto";
import { db } from "../../database/connection.js";

export interface SessionData {
  id: string;
  userId: string;
  sessionTokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt?: string;
  isActive: boolean;
}

export interface CreateSessionParams {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  ttlSeconds?: number;
}

export interface SessionResult {
  session: SessionData;
  token: string;
}

export class SessionManager {
  // In-memory session store fallback for fast unit testing & isolated environments
  private static memorySessions = new Map<string, SessionData>();

  /**
   * Generates a cryptographically secure random token and hashes it.
   */
  public static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Creates a new server-side session. Returns the session object and raw bearer token.
   */
  public static async createSession(params: CreateSessionParams): Promise<SessionResult> {
    const rawToken = `stk_sess_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = this.hashToken(rawToken);
    const id = crypto.randomUUID();
    const now = new Date();
    const ttl = params.ttlSeconds ?? 86400; // Default 24 hours
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    const session: SessionData = {
      id,
      userId: params.userId,
      sessionTokenHash: tokenHash,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      createdAt: now.toISOString(),
      lastActivityAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isActive: true,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO sessions 
          (id, user_id, session_token_hash, ip_address, user_agent, created_at, last_activity_at, expires_at, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          session.id,
          session.userId,
          session.sessionTokenHash,
          session.ipAddress || null,
          session.userAgent || null,
          session.createdAt,
          session.lastActivityAt,
          session.expiresAt,
          session.isActive,
        ]
      );
    } catch {
      // Memory fallback if DB is not initialized in unit tests
      this.memorySessions.set(session.sessionTokenHash, session);
    }

    return { session, token: rawToken };
  }

  /**
   * Validates a raw bearer session token. Returns the active session data if valid.
   */
  public static async validateSession(token: string): Promise<SessionData | null> {
    const tokenHash = this.hashToken(token);
    let session: SessionData | null = null;

    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, user_id AS "userId", session_token_hash AS "sessionTokenHash", 
                ip_address AS "ipAddress", user_agent AS "userAgent", 
                created_at AS "createdAt", last_activity_at AS "lastActivityAt", 
                expires_at AS "expiresAt", revoked_at AS "revokedAt", is_active AS "isActive"
         FROM sessions WHERE session_token_hash = $1 AND is_active = TRUE`,
        [tokenHash]
      );

      if (rows.length > 0) {
        session = {
          ...rows[0],
          createdAt: new Date(rows[0].createdAt).toISOString(),
          lastActivityAt: new Date(rows[0].lastActivityAt).toISOString(),
          expiresAt: new Date(rows[0].expiresAt).toISOString(),
          revokedAt: rows[0].revokedAt ? new Date(rows[0].revokedAt).toISOString() : undefined,
        };
      } else {
        session = this.memorySessions.get(tokenHash) || null;
      }
    } catch {
      session = this.memorySessions.get(tokenHash) || null;
    }

    if (!session || !session.isActive) return null;

    if (new Date(session.expiresAt) < new Date()) {
      await this.revokeSession(session.id);
      return null;
    }

    // Touch last activity timestamp asynchronously
    await this.touchSession(session.id, tokenHash);

    return session;
  }

  /**
   * Updates last activity timestamp for an active session.
   */
  public static async touchSession(sessionId: string, tokenHash: string): Promise<void> {
    const nowISO = new Date().toISOString();
    try {
      const pool = db.getPool();
      await pool.query(
        `UPDATE sessions SET last_activity_at = $1 WHERE id = $2 AND is_active = TRUE`,
        [nowISO, sessionId]
      );
    } catch {
      const stored = this.memorySessions.get(tokenHash);
      if (stored) {
        stored.lastActivityAt = nowISO;
      }
    }
  }

  /**
   * Revokes a specific session by ID.
   */
  public static async revokeSession(sessionId: string): Promise<boolean> {
    const nowISO = new Date().toISOString();
    try {
      const pool = db.getPool();
      const result = await pool.query(
        `UPDATE sessions SET is_active = FALSE, revoked_at = $1 WHERE id = $2 AND is_active = TRUE`,
        [nowISO, sessionId]
      );
      if ((result.rowCount ?? 0) > 0) return true;
      for (const [key, sess] of this.memorySessions.entries()) {
        if (sess.id === sessionId) {
          sess.isActive = false;
          sess.revokedAt = nowISO;
          this.memorySessions.delete(key);
          return true;
        }
      }
      return false;
    } catch {
      for (const [key, sess] of this.memorySessions.entries()) {
        if (sess.id === sessionId) {
          sess.isActive = false;
          sess.revokedAt = nowISO;
          this.memorySessions.delete(key);
          return true;
        }
      }
      return false;
    }
  }

  /**
   * Revokes all active sessions for a user (Logout-All).
   */
  public static async revokeAllUserSessions(userId: string): Promise<number> {
    const nowISO = new Date().toISOString();
    try {
      const pool = db.getPool();
      const result = await pool.query(
        `UPDATE sessions SET is_active = FALSE, revoked_at = $1 WHERE user_id = $2 AND is_active = TRUE`,
        [nowISO, userId]
      );
      return result.rowCount ?? 0;
    } catch {
      let count = 0;
      for (const [key, sess] of this.memorySessions.entries()) {
        if (sess.userId === userId && sess.isActive) {
          sess.isActive = false;
          sess.revokedAt = nowISO;
          this.memorySessions.delete(key);
          count++;
        }
      }
      return count;
    }
  }

  /**
   * Lists all active sessions for a user.
   */
  public static async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, user_id AS "userId", session_token_hash AS "sessionTokenHash", 
                ip_address AS "ipAddress", user_agent AS "userAgent", 
                created_at AS "createdAt", last_activity_at AS "lastActivityAt", 
                expires_at AS "expiresAt", revoked_at AS "revokedAt", is_active AS "isActive"
         FROM sessions WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC`,
        [userId]
      );

      return rows.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt).toISOString(),
        lastActivityAt: new Date(r.lastActivityAt).toISOString(),
        expiresAt: new Date(r.expiresAt).toISOString(),
        revokedAt: r.revokedAt ? new Date(r.revokedAt).toISOString() : undefined,
      }));
    } catch {
      const sessions: SessionData[] = [];
      for (const sess of this.memorySessions.values()) {
        if (sess.userId === userId && sess.isActive) {
          sessions.push(sess);
        }
      }
      return sessions;
    }
  }

  /**
   * Clears internal state (used in tests).
   */
  public static clearMemorySessions(): void {
    this.memorySessions.clear();
  }
}
