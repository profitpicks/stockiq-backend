import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { createApp } from "../../api/app.js";

describe("Integration: Health & Readiness Endpoints", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /health should return 200 and healthy service status", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      status: string;
      service: string;
      version: string;
      environment: string;
      uptimeSeconds: number;
    };

    assert.equal(data.status, "HEALTHY");
    assert.equal(data.service, "stockiq");
    assert.equal(data.version, "0.1.0");
    assert.ok(typeof data.uptimeSeconds === "number");
  });

  it("GET /ready should return readiness checks for database and adapters", async () => {
    const res = await fetch(`${baseUrl}/ready`);
    // In dev/test environment, readiness returns 200 with degraded or ready state
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      status: string;
      checks: {
        database: { configured: boolean };
        adapters: {
          otp: { mode: string; ready: boolean };
          payment: { mode: string; ready: boolean };
          marketData: { mode: string; ready: boolean };
          esign: { mode: string; ready: boolean };
          parrva: { mode: string; ready: boolean };
        };
      };
    };

    assert.ok(data.checks.database.configured);
    assert.equal(data.checks.adapters.otp.ready, true);
    assert.equal(data.checks.adapters.payment.ready, true);
    assert.equal(data.checks.adapters.marketData.ready, true);
    assert.equal(data.checks.adapters.esign.ready, true);
    assert.equal(data.checks.adapters.parrva.ready, true);
  });
});
