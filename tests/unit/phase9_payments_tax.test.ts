import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { app } from "../../api/app.js";
import { db } from "../../database/connection.js";
import { DatabaseMigrator } from "../../database/migrator.js";
import { OtpService } from "../../modules/auth/otp.service.ts";
import { SessionManager } from "../../modules/auth/sessions.ts";
import { ProviderService } from "../../modules/providers/provider.service.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Unit & Integration: Phase 9 Payments & Tax Ledger", () => {
  let server: http.Server;
  let baseUrl: string;
  const otpService = new OtpService();
  const providerService = new ProviderService();

  let investorId: string;
  let investorToken: string;

  let otherInvestorId: string;
  let otherInvestorToken: string;

  let providerUserId: string;
  let providerProfileId: string;
  let providerToken: string;

  let financeAdminId: string;
  let financeAdminToken: string;

  let complianceToken: string;

  let testServiceId: string;
  let firstOrderId: string;
  let firstOrderGatewayId: string;

  before(async () => {
    // 1. Ensure migrations applied (including migration 007)
    const migrator = new DatabaseMigrator();
    await migrator.applyPendingMigrations();

    const pool = db.getPool();

    // Load roles seeds
    const seedPath = path.join(__dirname, "../../database/seeds/001_foundation_roles.sql");
    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, "utf-8");
      await pool.query(seedSql);
    }

    // Clean up Phase 9 test records
    await pool.query("DELETE FROM reconciliation_records");
    await pool.query("DELETE FROM invoices");
    await pool.query("DELETE FROM refund_records");
    await pool.query("DELETE FROM payment_transactions");
    await pool.query("DELETE FROM payment_orders");
    await pool.query("DELETE FROM tax_rules");
    await pool.query("DELETE FROM webhook_events");

    await pool.query("DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%phase9%')");
    await pool.query("DELETE FROM business_events WHERE author_id IN (SELECT id FROM users WHERE email LIKE '%phase9%')");
    await pool.query(`DELETE FROM provider_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase9%')`);
    await pool.query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase9%')`);
    await pool.query(`DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%phase9%')`);
    await pool.query(`DELETE FROM users WHERE email LIKE '%phase9%'`);

    // 2. Setup Users
    const investorUser = await otpService.findOrCreateUser("investor-phase9-1");
    investorId = investorUser.id;
    const invSess = await SessionManager.createSession({ userId: investorUser.id });
    investorToken = invSess.token;

    const otherInvestorUser = await otpService.findOrCreateUser("investor-phase9-2");
    otherInvestorId = otherInvestorUser.id;
    const otherInvSess = await SessionManager.createSession({ userId: otherInvestorUser.id });
    otherInvestorToken = otherInvSess.token;

    const provUser = await otpService.findOrCreateUser("prov-phase9");
    providerUserId = provUser.id;
    const provProfile = await providerService.registerProvider({
      userId: provUser.id,
      providerType: "INVESTMENT_ADVISER",
      entityType: "INDIVIDUAL",
      legalName: "Adviser Phase 9",
      tradeName: "Adviser P9",
      sebiRegistrationNumber: "INA900000001",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Mumbai",
      isNismCertified: true,
    });
    providerProfileId = provProfile.id;
    const provSess = await SessionManager.createSession({ userId: provUser.id });
    providerToken = provSess.token;

    const financeUser = await otpService.findOrCreateUser("finance-phase9");
    financeAdminId = financeUser.id;
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'FINANCE_ADMIN') ON CONFLICT DO NOTHING`,
      [financeUser.id]
    );
    const financeSess = await SessionManager.createSession({ userId: financeUser.id });
    financeAdminToken = financeSess.token;

    const complianceUser = await otpService.findOrCreateUser("comp-phase9");
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'COMPLIANCE_ADMIN') ON CONFLICT DO NOTHING`,
      [complianceUser.id]
    );
    const compSess = await SessionManager.createSession({ userId: complianceUser.id });
    complianceToken = compSess.token;

    // 3. Setup Mock Service (PMS Portfolio)
    const serviceRes = await pool.query(
      `INSERT INTO services (provider_id, service_name, service_category, short_description, detailed_description, service_type, market_segment, eligibility_info, pricing_reference, fee_in_paise, status)
       VALUES ($1, 'Elite Advisory P9', 'ADVISORY', 'Short desc', 'Detailed desc', 'ADVISORY_SERVICE', 'RETAIL', 'RETAIL_INVESTORS', 'FLAT', 100000, 'PUBLISHED')
       RETURNING id`,
      [providerProfileId]
    );
    testServiceId = serviceRes.rows[0].id;

    // 4. Start HTTP Server
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { address: string; port: number };
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ==============================================================================
  // 1. CONFIGURABLE TAX RULES & DETERMINISTIC CALCULATIONS
  // ==============================================================================

  it("1. Should configure dynamic tax rules with custom rates (Admins/Compliance only)", async () => {
    const res = await fetch(`${baseUrl}/tax/rules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${complianceToken}`,
      },
      body: JSON.stringify({
        jurisdiction: "IN",
        serviceCategory: "ADVISORY",
        cgstRate: 9.0,
        sgstRate: 9.0,
        igstRate: 18.0,
        version: "v9.1.0",
        isActive: true,
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.status, "SUCCESS");
    assert.equal(data.rule.jurisdiction, "IN");
    assert.equal(data.rule.cgstRate, 9.0);
    assert.equal(data.rule.version, "v9.1.0");
  });

  it("2. Should prevent standard investors from writing tax rules", async () => {
    const res = await fetch(`${baseUrl}/tax/rules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        jurisdiction: "IN",
        serviceCategory: "ADVISORY",
        cgstRate: 5.0,
        sgstRate: 5.0,
        igstRate: 10.0,
        version: "v9.2.0",
        isActive: true,
      }),
    });

    assert.equal(res.status, 403);
  });

  // ==============================================================================
  // 2. PAYMENT ORDERS LIFECYCLE
  // ==============================================================================

  it("3. Should create a payment order with correct computed taxes and gateway integration", async () => {
    const res = await fetch(`${baseUrl}/payments/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        serviceId: testServiceId,
        jurisdiction: "IN",
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.status, "SUCCESS");
    assert.ok(data.order.id);
    assert.equal(data.order.baseAmountPaise, 100000);

    // Tax calculation assertions (9% CGST = 9000 paise, 9% SGST = 9000 paise, 18% IGST = 18000 paise)
    assert.equal(data.order.cgstPaise, 9000);
    assert.equal(data.order.sgstPaise, 9000);
    assert.equal(data.order.igstPaise, 18000);
    assert.equal(data.order.totalAmountPaise, 136000); // 100k + 9k + 9k + 18k
    assert.equal(data.order.status, "PENDING");
    assert.ok(data.order.gatewayOrderId);

    firstOrderId = data.order.id;
    firstOrderGatewayId = data.order.gatewayOrderId;
  });

  // ==============================================================================
  // 3. SUCCESSFUL PAYMENT FLOW & INVOICE GENERATION
  // ==============================================================================

  it("4. Should verify payment signature, transition order, and auto-generate invoice", async () => {
    const res = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        gatewayOrderId: firstOrderGatewayId,
        gatewayPaymentId: "pay_mock_12345",
        gatewaySignature: "sig_mock_success_hash_value",
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "SUCCESS");
    assert.equal(data.order.status, "COMPLETED");

    // Check that invoice was successfully generated in DB
    const pool = db.getPool();
    const invoiceRes = await pool.query(`SELECT * FROM invoices WHERE order_id = $1`, [firstOrderId]);
    assert.equal(invoiceRes.rows.length, 1);
    assert.equal(invoiceRes.rows[0].status, "PAID");
    assert.equal(parseInt(invoiceRes.rows[0].total_amount_paise), 136000);
  });

  // ==============================================================================
  // 4. FAILED PAYMENT FLOW (CLIENT CANNOT FORGE SUCCESS)
  // ==============================================================================

  it("5. Should reject invalid signatures and prevent client from forging payment success", async () => {
    // Create a new order first
    const orderRes = await fetch(`${baseUrl}/payments/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        serviceId: testServiceId,
        jurisdiction: "IN",
      }),
    });
    const orderData = await orderRes.json();
    const pendingOrderId = orderData.order.id;
    const pendingGatewayId = orderData.order.gatewayOrderId;

    // Verify with bad signature
    const verifyRes = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        gatewayOrderId: pendingGatewayId,
        gatewayPaymentId: "pay_mock_bad",
        gatewaySignature: "invalid_signature",
      }),
    });

    assert.equal(verifyRes.status, 400);

    // Verify order status updated to FAILED in DB
    const pool = db.getPool();
    const dbOrder = await pool.query(`SELECT status FROM payment_orders WHERE id = $1`, [pendingOrderId]);
    assert.equal(dbOrder.rows[0].status, "FAILED");

    // Check that failed payment produced NO invoice
    const dbInvoice = await pool.query(`SELECT * FROM invoices WHERE order_id = $1`, [pendingOrderId]);
    assert.equal(dbInvoice.rows.length, 0);
  });

  // ==============================================================================
  // 5. WEBHOOK IDEMPOTENCY & REPLAY PROTECTION
  // ==============================================================================

  it("6. Should process payment.captured webhook, generate invoice, and enforce idempotency on repeated event", async () => {
    // Create a fresh order
    const orderRes = await fetch(`${baseUrl}/payments/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        serviceId: testServiceId,
        jurisdiction: "IN",
      }),
    });
    const orderData = await orderRes.json();
    const freshOrderId = orderData.order.id;
    const freshGatewayId = orderData.order.gatewayOrderId;

    const eventId = `evt_test_${Math.random().toString(36).substring(2, 9)}`;

    // Deliver Webhook - first time
    const webhookRes1 = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mock-signature": "valid_sig",
      },
      body: JSON.stringify({
        event_id: eventId,
        event: "payment.captured",
        order_id: freshGatewayId,
        amount_paise: 136000,
        payment_id: "pay_webhook_99999",
      }),
    });

    assert.equal(webhookRes1.status, 200);

    const pool = db.getPool();
    // Validate order COMPLETED & Invoice generated
    const orderRow = await pool.query(`SELECT status FROM payment_orders WHERE id = $1`, [freshOrderId]);
    assert.equal(orderRow.rows[0].status, "COMPLETED");

    const invoiceRow = await pool.query(`SELECT * FROM invoices WHERE order_id = $1`, [freshOrderId]);
    assert.equal(invoiceRow.rows.length, 1);

    // Deliver Webhook - second duplicate time
    const webhookRes2 = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mock-signature": "valid_sig",
      },
      body: JSON.stringify({
        event_id: eventId,
        event: "payment.captured",
        order_id: freshGatewayId,
        amount_paise: 136000,
        payment_id: "pay_webhook_99999",
      }),
    });

    assert.equal(webhookRes2.status, 200);

    // Double check that NO duplicate invoice is generated
    const invoiceCount = await pool.query(`SELECT COUNT(*) as count FROM invoices WHERE order_id = $1`, [freshOrderId]);
    assert.equal(parseInt(invoiceCount.rows[0].count), 1);
  });

  it("7. Should reject webhooks with malformed / invalid signature", async () => {
    const res = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mock-signature": "invalid_signature",
      },
      body: JSON.stringify({
        id: "evt_bad_sig",
        event: "payment.captured",
      }),
    });

    assert.equal(res.status, 500); // Standard internal error or middleware reject on invalid signature
  });

  // ==============================================================================
  // 6. REFUNDS
  // ==============================================================================

  it("8. Should block unauthorized users from executing refunds", async () => {
    const res = await fetch(`${baseUrl}/payments/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        orderId: firstOrderId,
        amountPaise: 50000,
      }),
    });

    assert.equal(res.status, 403);
  });

  it("9. Should allow Finance Admin to trigger partial refund and block overpayment", async () => {
    const res = await fetch(`${baseUrl}/payments/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${financeAdminToken}`,
      },
      body: JSON.stringify({
        orderId: firstOrderId,
        amountPaise: 50000,
        reason: "Partial fee waiver",
      }),
    });

    assert.equal(res.status, 200);

    // Try overpaying refund (remaining is 136k - 50k = 86k)
    const overpaymentRes = await fetch(`${baseUrl}/payments/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${financeAdminToken}`,
      },
      body: JSON.stringify({
        orderId: firstOrderId,
        amountPaise: 90000,
        reason: "Illegal over refund attempt",
      }),
    });

    assert.equal(overpaymentRes.status, 400);
  });

  it("10. Should successfully complete full refund and mark invoices as REFUNDED", async () => {
    // Process remaining 86000 paise refund
    const res = await fetch(`${baseUrl}/payments/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${financeAdminToken}`,
      },
      body: JSON.stringify({
        orderId: firstOrderId,
        amountPaise: 86000,
        reason: "Full fee refund complete",
      }),
    });

    assert.equal(res.status, 200);

    const pool = db.getPool();
    // Validate order status is updated to REFUNDED
    const dbOrder = await pool.query(`SELECT status FROM payment_orders WHERE id = $1`, [firstOrderId]);
    assert.equal(dbOrder.rows[0].status, "REFUNDED");

    // Validate matching invoice status is updated to REFUNDED
    const dbInvoice = await pool.query(`SELECT status FROM invoices WHERE order_id = $1`, [firstOrderId]);
    assert.equal(dbInvoice.rows[0].status, "REFUNDED");
  });

  // ==============================================================================
  // 7. RECONCILIATION FOUNDATION
  // ==============================================================================

  it("11. Should reconcile gateway reports matching scenarios accurately", async () => {
    // Create an order for PMS to match
    const orderRes = await fetch(`${baseUrl}/payments/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        serviceId: testServiceId,
        jurisdiction: "IN",
      }),
    });
    const orderData = await orderRes.json();
    const matchOrderId = orderData.order.id;
    const matchGatewayId = orderData.order.gatewayOrderId;

    // Complete PMS order first to test matched status
    await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        gatewayOrderId: matchGatewayId,
        gatewayPaymentId: "pay_recon_success",
        gatewaySignature: "sig_mock_success",
      }),
    });

    const reconRes = await fetch(`${baseUrl}/reconciliation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${financeAdminToken}`,
      },
      body: JSON.stringify({
        reports: [
          { gatewayOrderId: matchGatewayId, amountPaise: 136000, status: "captured" }, // MATCHED
          { gatewayOrderId: matchGatewayId, amountPaise: 120000, status: "captured" }, // MISMATCH
          { gatewayOrderId: "order_unregistered_id_9999", amountPaise: 100000, status: "captured" }, // MISSING_INTERNAL
        ],
      }),
    });

    assert.equal(reconRes.status, 200);
    const data = await reconRes.json();
    assert.equal(data.status, "SUCCESS");

    const matchReport = data.results.find((r: any) => r.gatewayOrderId === matchGatewayId && r.status === "MATCHED");
    assert.ok(matchReport);

    const mismatchReport = data.results.find((r: any) => r.gatewayOrderId === matchGatewayId && r.status === "MISMATCH");
    assert.ok(mismatchReport);

    const missingReport = data.results.find((r: any) => r.gatewayOrderId === "order_unregistered_id_9999");
    assert.equal(missingReport.status, "MISSING_INTERNAL");
  });

  // ==============================================================================
  // 8. PRIVACY & INVOICE IDOR PROTECTION
  // ==============================================================================

  it("12. Should prevent standard users from viewing other investors' invoices (IDOR Protection)", async () => {
    // Fetch investor's own invoice
    const ownRes = await fetch(`${baseUrl}/invoices`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${investorToken}`,
      },
    });
    assert.equal(ownRes.status, 200);
    const ownData = await ownRes.json();
    assert.ok(ownData.invoices.length > 0);
    const invoiceId = ownData.invoices[0].id;

    // Retrieve via explicit ID route
    const detailsRes = await fetch(`${baseUrl}/invoices/${invoiceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${investorToken}`,
      },
    });
    assert.equal(detailsRes.status, 200);

    // Attempt to access with other investor token
    const idorRes = await fetch(`${baseUrl}/invoices/${invoiceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${otherInvestorToken}`,
      },
    });

    assert.equal(idorRes.status, 403);
  });

  // ==============================================================================
  // 9. HISTORICAL TAX SNAPSHOT SECURITY
  // ==============================================================================

  it("13. Should protect old invoices from changing when active tax rules are updated", async () => {
    const pool = db.getPool();

    // 1. Check existing invoice tax version
    const invoiceRes1 = await pool.query(`SELECT * FROM invoices WHERE order_id = $1`, [firstOrderId]);
    const oldInvoiceTotal = parseInt(invoiceRes1.rows[0].total_amount_paise);

    // 2. Register a newer, active tax rule for ADVISORY (reducing rate)
    await fetch(`${baseUrl}/tax/rules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${complianceToken}`,
      },
      body: JSON.stringify({
        jurisdiction: "IN",
        serviceCategory: "ADVISORY",
        cgstRate: 5.0,
        sgstRate: 5.0,
        igstRate: 10.0,
        version: "v9.3.0",
        isActive: true,
      }),
    });

    // 3. Confirm that existing/past invoice remained totally unchanged
    const invoiceRes2 = await pool.query(`SELECT * FROM invoices WHERE order_id = $1`, [firstOrderId]);
    assert.equal(parseInt(invoiceRes2.rows[0].total_amount_paise), oldInvoiceTotal);
  });

  // ==============================================================================
  // 10. AUDIT LEDGER LOGGING INTEGRITY
  // ==============================================================================

  it("14. Should verify that security and business events generated compliant dual-ledger audit logs", async () => {
    const pool = db.getPool();

    // Verify refund security logs are generated
    const auditRes = await pool.query(
      `SELECT * FROM audit_logs WHERE action = 'PROCESS_REFUND' LIMIT 1`
    );
    assert.equal(auditRes.rows.length, 1);

    // Verify invoice business event generated with SHA-256 integrity hash
    const eventRes = await pool.query(
      `SELECT * FROM business_events WHERE event_type = 'INVOICE_GENERATED' LIMIT 1`
    );
    assert.equal(eventRes.rows.length, 1);
    assert.equal(eventRes.rows[0].event_hash.length, 64);
  });
});
