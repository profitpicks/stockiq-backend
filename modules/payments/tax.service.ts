import { db } from "../../database/connection.js";
import { AppError } from "../../api/middleware/error-handler.middleware.js";

export interface TaxRule {
  id: string;
  jurisdiction: string;
  serviceCategory: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  version: string;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveUntil?: Date;
}

export interface TaxCalculationResult {
  baseAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalAmountPaise: number;
  taxRuleId: string;
  version: string;
}

export class TaxService {
  public async getActiveRule(jurisdiction: string, serviceCategory: string): Promise<TaxRule> {
    const pool = db.getPool();
    const query = `
      SELECT * FROM tax_rules
      WHERE jurisdiction = $1 AND service_category = $2 AND is_active = TRUE
      ORDER BY version DESC, created_at DESC
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [jurisdiction, serviceCategory]);
    if (rows.length === 0) {
      throw new AppError(`No active tax rule found for jurisdiction ${jurisdiction} and category ${serviceCategory}`, 404, "NOT_FOUND");
    }
    const r = rows[0];
    return {
      id: r.id,
      jurisdiction: r.jurisdiction,
      serviceCategory: r.service_category,
      cgstRate: parseFloat(r.cgst_rate),
      sgstRate: parseFloat(r.sgst_rate),
      igstRate: parseFloat(r.igst_rate),
      version: r.version,
      isActive: r.is_active,
      effectiveFrom: new Date(r.effective_from),
      effectiveUntil: r.effective_until ? new Date(r.effective_until) : undefined,
    };
  }

  public async createRule(params: {
    jurisdiction: string;
    serviceCategory: string;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    version: string;
    isActive?: boolean;
  }): Promise<TaxRule> {
    const pool = db.getPool();
    const isActive = params.isActive !== false;

    if (isActive) {
      await pool.query(
        `UPDATE tax_rules SET is_active = FALSE WHERE jurisdiction = $1 AND service_category = $2`,
        [params.jurisdiction, params.serviceCategory]
      );
    }

    const query = `
      INSERT INTO tax_rules (jurisdiction, service_category, cgst_rate, sgst_rate, igst_rate, version, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      params.jurisdiction,
      params.serviceCategory,
      params.cgstRate,
      params.sgstRate,
      params.igstRate,
      params.version,
      isActive,
    ]);

    const r = rows[0];
    return {
      id: r.id,
      jurisdiction: r.jurisdiction,
      serviceCategory: r.service_category,
      cgstRate: parseFloat(r.cgst_rate),
      sgstRate: parseFloat(r.sgst_rate),
      igstRate: parseFloat(r.igst_rate),
      version: r.version,
      isActive: r.is_active,
      effectiveFrom: new Date(r.effective_from),
      effectiveUntil: r.effective_until ? new Date(r.effective_until) : undefined,
    };
  }

  public async calculateTax(
    baseAmountPaise: number,
    jurisdiction: string,
    serviceCategory: string
  ): Promise<TaxCalculationResult> {
    const rule = await this.getActiveRule(jurisdiction, serviceCategory);

    const cgstPaise = Math.round((baseAmountPaise * rule.cgstRate) / 100);
    const sgstPaise = Math.round((baseAmountPaise * rule.sgstRate) / 100);
    const igstPaise = Math.round((baseAmountPaise * rule.igstRate) / 100);
    const totalAmountPaise = baseAmountPaise + cgstPaise + sgstPaise + igstPaise;

    return {
      baseAmountPaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      totalAmountPaise,
      taxRuleId: rule.id,
      version: rule.version,
    };
  }

  public async listRules(): Promise<TaxRule[]> {
    const pool = db.getPool();
    const { rows } = await pool.query("SELECT * FROM tax_rules ORDER BY created_at DESC");
    return rows.map((r) => ({
      id: r.id,
      jurisdiction: r.jurisdiction,
      serviceCategory: r.service_category,
      cgstRate: parseFloat(r.cgst_rate),
      sgstRate: parseFloat(r.sgst_rate),
      igstRate: parseFloat(r.igst_rate),
      version: r.version,
      isActive: r.is_active,
      effectiveFrom: new Date(r.effective_from),
      effectiveUntil: r.effective_until ? new Date(r.effective_until) : undefined,
    }));
  }
}
export const taxService = new TaxService();
