import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationFile {
  version: string;
  name: string;
  fullPath: string;
  sql: string;
}

export class DatabaseMigrator {
  private migrationsDir: string;
  private seedsDir: string;

  constructor(
    migrationsDir = path.join(__dirname, "migrations"),
    seedsDir = path.join(__dirname, "seeds")
  ) {
    this.migrationsDir = migrationsDir;
    this.seedsDir = seedsDir;
  }

  /**
   * Scans and parses available migration files in alphabetical/version order.
   */
  public getMigrationFiles(): MigrationFile[] {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    const files = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    return files.map((fileName) => {
      const fullPath = path.join(this.migrationsDir, fileName);
      const sql = fs.readFileSync(fullPath, "utf-8");
      const parts = fileName.split("_");
      const version = parts[0] || "000";
      const name = parts.slice(1).join("_").replace(".sql", "");

      return {
        version,
        name,
        fullPath,
        sql,
      };
    });
  }

  /**
   * Validates migration files structure and syntax expectations.
   */
  public validateMigrations(): { valid: boolean; count: number; errors: string[] } {
    const migrations = this.getMigrationFiles();
    const errors: string[] = [];

    if (migrations.length === 0) {
      errors.push("No migration files found in migrations directory");
    }

    for (const mig of migrations) {
      if (!mig.sql.includes("CREATE TABLE")) {
        errors.push(`Migration ${mig.version} does not contain CREATE TABLE statement`);
      }
      if (mig.sql.toLowerCase().includes("drop database")) {
        errors.push(`Migration ${mig.version} contains prohibited DROP DATABASE statement`);
      }
    }

    return {
      valid: errors.length === 0,
      count: migrations.length,
      errors,
    };
  }

  /**
   * Applies pending migrations to the PostgreSQL database in transactions.
   */
  public async applyPendingMigrations(): Promise<{ applied: string[]; status: string }> {
    const pool = db.getPool();
    const client = await pool.connect();
    const applied: string[] = [];

    try {
      await client.query("BEGIN");

      // Ensure migrations table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(100) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
        );
      `);

      const { rows: existingRows } = await client.query<{ version: string }>(
        "SELECT version FROM schema_migrations"
      );
      const appliedVersions = new Set(existingRows.map((r) => r.version));

      const migrations = this.getMigrationFiles();

      for (const mig of migrations) {
        if (!appliedVersions.has(mig.version)) {
          await client.query(mig.sql);
          await client.query(
            "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
            [mig.version, mig.name]
          );
          applied.push(mig.version);
        }
      }

      await client.query("COMMIT");
      return { applied, status: "SUCCESS" };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

// Allow CLI execution if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const migrator = new DatabaseMigrator();
  const validation = migrator.validateMigrations();
  console.log(`[stockiq Migrator] Found ${validation.count} migrations. Valid: ${validation.valid}`);
  if (!validation.valid) {
    console.error(`Validation errors:`, validation.errors);
    process.exit(1);
  }
  const res = await migrator.applyPendingMigrations();
  console.log(`[stockiq Migrator] Applied migrations:`, res.applied, `Status: ${res.status}`);
  await db.close();
}
