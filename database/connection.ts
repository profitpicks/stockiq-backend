import pg from "pg";
import { AppConfig, config } from "../config/index.js";

const { Pool } = pg;

export class DatabaseService {
  private pool: pg.Pool;

  constructor(appConfig: AppConfig = config) {
    this.pool = new Pool({
      host: appConfig.database.host,
      port: appConfig.database.port,
      database: appConfig.database.database,
      user: appConfig.database.user,
      password: appConfig.database.password,
      min: appConfig.database.poolMin,
      max: appConfig.database.poolMax,
      ssl: appConfig.database.ssl ? { rejectUnauthorized: false } : false,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  public getPool(): pg.Pool {
    return this.pool;
  }

  /**
   * Performs a connectivity verification check.
   */
  public async checkHealth(): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      const client = await this.pool.connect();
      try {
        await client.query("SELECT 1 AS health_check");
        return {
          healthy: true,
          latencyMs: Date.now() - start,
        };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        healthy: false,
        error: message,
      };
    }
  }

  /**
   * Graceful disconnect
   */
  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export const db = new DatabaseService();
