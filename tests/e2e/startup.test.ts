import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { createApp } from "../../api/app.js";
import { DatabaseMigrator } from "../../database/migrator.js";

describe("E2E: Application Startup & Lifecycle", () => {
  it("should boot HTTP server, respond to requests, and shut down cleanly", async () => {
    const app = createApp();
    const server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address() as { port: number };
    assert.ok(address.port > 0, "Server should be bound to a valid port");

    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as { status: string };
    assert.equal(body.status, "HEALTHY");

    // Close server cleanly
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it("Database Migrator: validates initial migration files on disk", () => {
    const migrator = new DatabaseMigrator();
    const files = migrator.getMigrationFiles();

    assert.ok(files.length >= 1, "Should have at least 1 migration file");
    assert.equal(files[0]?.version, "001");
    assert.ok(files[0]?.name.includes("initial_foundation"));

    const validation = migrator.validateMigrations();
    assert.equal(validation.valid, true, `Migration validation should pass: ${validation.errors.join("; ")}`);
    assert.equal(validation.count, files.length);
  });
});
