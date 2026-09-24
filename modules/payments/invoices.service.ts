import { db } from "../../database/connection.js";
import { AppError } from "../../api/middleware/error-handler.middleware.js";
import { logSecurityAudit, logBusinessEvent } from "./payments.service.js";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  userId: string;
  providerId: string;
  serviceId: string;
  baseAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalAmountPaise: number;
  currency: string;
  taxRuleId?: string;
  status: "PAID" | "REFUNDED" | "VOID";
  issuedAt: Date;
  createdAt: Date;
}

export class InvoicesService {
  public async getInvoiceByOrderId(orderId: string): Promise<Invoice | null> {
    const pool = db.getPool();
    const query = `SELECT * FROM invoices WHERE order_id = $1`;
    const { rows } = await pool.query(query, [orderId]);
    if (rows.length === 0) return null;
    return this.mapRowToInvoice(rows[0]);
  }

  public async getInvoiceById(id: string): Promise<Invoice | null> {
    const pool = db.getPool();
    const query = `SELECT * FROM invoices WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    if (rows.length === 0) return null;
    return this.mapRowToInvoice(rows[0]);
  }

  public async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null> {
    const pool = db.getPool();
    const query = `SELECT * FROM invoices WHERE invoice_number = $1`;
    const { rows } = await pool.query(query, [invoiceNumber]);
    if (rows.length === 0) return null;
    return this.mapRowToInvoice(rows[0]);
  }

  public async listInvoices(params: { userId?: string; providerId?: string }): Promise<Invoice[]> {
    const pool = db.getPool();
    let query = `SELECT * FROM invoices`;
    const conditions: string[] = [];
    const vals: any[] = [];

    if (params.userId) {
      conditions.push(`user_id = $${conditions.length + 1}`);
      vals.push(params.userId);
    }
    if (params.providerId) {
      conditions.push(`provider_id = $${conditions.length + 1}`);
      vals.push(params.providerId);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(" AND ");
    }

    query += ` ORDER BY issued_at DESC`;
    const { rows } = await pool.query(query, vals);
    return rows.map((r) => this.mapRowToInvoice(r));
  }

  public async generateInvoice(orderId: string): Promise<Invoice> {
    const pool = db.getPool();

    const existing = await this.getInvoiceByOrderId(orderId);
    if (existing) {
      return existing;
    }

    const orderQuery = `SELECT * FROM payment_orders WHERE id = $1`;
    const { rows: orderRows } = await pool.query(orderQuery, [orderId]);
    if (orderRows.length === 0) {
      throw new AppError("Payment order not found", 404, "NOT_FOUND");
    }

    const order = orderRows[0];
    if (order.status !== "COMPLETED") {
      throw new AppError("Cannot generate invoice for non-completed orders", 400, "BAD_REQUEST");
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const invoiceNumber = `INV-${dateStr}-${randomSuffix}`;

    const query = `
      INSERT INTO invoices (
        invoice_number, order_id, user_id, provider_id, service_id,
        base_amount_paise, cgst_paise, sgst_paise, igst_paise, total_amount_paise,
        currency, tax_rule_id, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      invoiceNumber,
      order.id,
      order.user_id,
      order.provider_id,
      order.service_id,
      order.base_amount_paise,
      order.cgst_paise,
      order.sgst_paise,
      order.igst_paise,
      order.total_amount_paise,
      order.currency,
      order.tax_rule_id,
      "PAID",
    ]);

    const invoice = this.mapRowToInvoice(rows[0]);

    await logSecurityAudit({
      action: "GENERATE_INVOICE",
      entity: "INVOICE",
      entityId: invoice.id,
      actorRole: "SYSTEM",
      newState: invoice,
    });

    await logBusinessEvent({
      streamId: invoice.id,
      streamType: "SUBSCRIPTION",
      eventType: "INVOICE_GENERATED",
      eventOrigin: "SYSTEM_EVENT",
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmountPaise: invoice.totalAmountPaise,
      },
    });

    return invoice;
  }

  private mapRowToInvoice(r: any): Invoice {
    return {
      id: r.id,
      invoiceNumber: r.invoice_number,
      orderId: r.order_id,
      userId: r.user_id,
      providerId: r.provider_id,
      serviceId: r.service_id,
      baseAmountPaise: r.base_amount_paise,
      cgstPaise: r.cgst_paise,
      sgstPaise: r.sgst_paise,
      igstPaise: r.igst_paise,
      totalAmountPaise: r.total_amount_paise,
      currency: r.currency,
      taxRuleId: r.tax_rule_id,
      status: r.status,
      issuedAt: new Date(r.issued_at),
      createdAt: new Date(r.created_at),
    };
  }
}
export const invoicesService = new InvoicesService();
