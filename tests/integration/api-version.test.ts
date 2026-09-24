import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { createApp } from "../../api/app.js";

describe("Integration: API v1 Foundation Endpoints", () => {
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

  it("GET /api/v1 should return API metadata and modular monolith details", async () => {
    const res = await fetch(`${baseUrl}/api/v1`);
    assert.equal(res.status, 200);

    // Verify correlation ID headers
    assert.ok(res.headers.get("x-correlation-id"));
    assert.ok(res.headers.get("x-request-id"));

    const data = (await res.json()) as {
      name: string;
      version: string;
      architecture: string;
      rolesCount: number;
      modules: string[];
    };

    assert.equal(data.name, "stockiq API");
    assert.equal(data.version, "v1");
    assert.equal(data.architecture, "Modular Monolith");
    assert.equal(data.rolesCount, 12);
    assert.ok(data.modules.includes("auth"));
    assert.ok(data.modules.includes("providers"));
    assert.ok(data.modules.includes("parrva"));
    assert.ok(data.modules.includes("track-record"));
  });

  it("GET /api/v1/roles should return all 12 platform roles", async () => {
    const res = await fetch(`${baseUrl}/api/v1/roles`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      total: number;
      roles: Array<{ id: string; displayName: string; category: string }>;
    };

    assert.equal(data.total, 12);
    assert.equal(data.roles.length, 12);

    const roleIds = data.roles.map((r) => r.id);
    assert.ok(roleIds.includes("SUPER_ADMIN"));
    assert.ok(roleIds.includes("RESEARCH_ANALYST"));
    assert.ok(roleIds.includes("INVESTMENT_ADVISER"));
    assert.ok(roleIds.includes("HNI"));
    assert.ok(roleIds.includes("ACCREDITED_INVESTOR"));
  });

  it("GET /api/v1/adapters/status should return mock statuses and notice", async () => {
    const res = await fetch(`${baseUrl}/api/v1/adapters/status`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      adapters: Record<string, { mode: string; isMock: boolean }>;
      notice: string;
    };

    assert.equal(data.adapters.otp.isMock, true);
    assert.equal(data.adapters.payments.isMock, true);
    assert.equal(data.adapters.marketData.isMock, true);
    assert.equal(data.adapters.esign.isMock, true);
    assert.equal(data.adapters.parrva.isMock, true);
    assert.ok(data.notice.includes("DEVELOPMENT/TEST ONLY"));
  });

  it("GET /api/v1/admin-check should enforce authentication and RBAC guards", async () => {
    // 1. Without Auth Token -> 401 Unauthorized
    const resUnauth = await fetch(`${baseUrl}/api/v1/admin-check`);
    assert.equal(resUnauth.status, 401);
    const unauthData = (await resUnauth.json()) as { error: { code: string } };
    assert.equal(unauthData.error.code, "UNAUTHORIZED");

    // 2. With Retail Investor Token -> 403 Forbidden
    const resForbidden = await fetch(`${baseUrl}/api/v1/admin-check`, {
      headers: {
        Authorization: "Bearer mock-user:u1:INVESTOR_RETAIL",
      },
    });
    assert.equal(resForbidden.status, 403);
    const forbiddenData = (await resForbidden.json()) as { error: { code: string } };
    assert.equal(forbiddenData.error.code, "FORBIDDEN_INSUFFICIENT_ROLE");

    // 3. With Super Admin Token -> 200 OK
    const resAllowed = await fetch(`${baseUrl}/api/v1/admin-check`, {
      headers: {
        Authorization: "Bearer mock-user:admin:SUPER_ADMIN",
      },
    });
    assert.equal(resAllowed.status, 200);
    const allowedData = (await resAllowed.json()) as { authorized: boolean; message: string };
    assert.equal(allowedData.authorized, true);
  });
});
