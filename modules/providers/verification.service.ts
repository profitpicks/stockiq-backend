import crypto from "crypto";
import { db } from "../../database/connection.js";
import { PlatformRoles, PlatformRole } from "../auth/roles.js";
import {
  VerificationCase,
  VerificationCaseStatus,
  VerificationCaseStatuses,
  VerificationEvent,
  ProviderStatus,
  ProviderStatuses,
  ProviderTypes,
} from "./types.ts";
import { ProviderService } from "./provider.service.ts";
import { OtpService } from "../auth/otp.service.js";

export interface ReviewCaseParams {
  caseId: string;
  officerId: string;
  action: "APPROVE" | "REJECT" | "REQUEST_MORE_INFO" | "SUSPEND";
  notes?: string;
  ipAddress?: string;
  correlationId?: string;
}

export const ALLOWED_VERIFICATION_TRANSITIONS: Record<string, string[]> = {
  PENDING: [VerificationCaseStatuses.IN_REVIEW],
  IN_REVIEW: [
    VerificationCaseStatuses.MORE_INFO_REQUIRED,
    VerificationCaseStatuses.APPROVED,
    VerificationCaseStatuses.REJECTED,
  ],
  MORE_INFO_REQUIRED: [
    VerificationCaseStatuses.IN_REVIEW,
    VerificationCaseStatuses.REJECTED,
  ],
  APPROVED: [VerificationCaseStatuses.SUSPENDED],
  SUSPENDED: [
    VerificationCaseStatuses.IN_REVIEW,
    VerificationCaseStatuses.REJECTED,
  ],
  REJECTED: [],
};

export class VerificationService {
  private providerService: ProviderService;
  private static memoryCases = new Map<string, VerificationCase>();
  private static memoryEvents = new Map<string, VerificationEvent[]>();
  private static memoryUserRoles = new Map<string, Set<PlatformRole>>();

  constructor(providerService?: ProviderService) {
    this.providerService = providerService || new ProviderService();
  }

  /**
   * Lists verification cases with optional status filter.
   */
  public async getVerificationCases(status?: VerificationCaseStatus): Promise<VerificationCase[]> {
    try {
      const pool = db.getPool();
      let query = `SELECT id, provider_id AS "providerId", assigned_officer_id AS "assignedOfficerId",
                          status, review_notes AS "reviewNotes", created_at AS "createdAt", updated_at AS "updatedAt"
                   FROM verification_cases`;
      const params: string[] = [];
      if (status) {
        query += ` WHERE status = $1`;
        params.push(status);
      }
      query += ` ORDER BY created_at DESC`;

      const { rows } = await pool.query(query, params);
      return rows;
    } catch {
      const cases = Array.from(VerificationService.memoryCases.values());
      return status ? cases.filter((c) => c.status === status) : cases;
    }
  }

  public static saveMemoryCase(vCase: VerificationCase): void {
    VerificationService.memoryCases.set(vCase.id, vCase);
  }

  /**
   * Retrieves case details by ID.
   */
  public async getCaseById(caseId: string): Promise<VerificationCase | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, provider_id AS "providerId", assigned_officer_id AS "assignedOfficerId",
                status, review_notes AS "reviewNotes", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM verification_cases WHERE id = $1`,
        [caseId]
      );
      if (rows.length > 0) return rows[0];
      return VerificationService.memoryCases.get(caseId) || ProviderService.getMemoryCase(caseId) || null;
    } catch {
      return VerificationService.memoryCases.get(caseId) || ProviderService.getMemoryCase(caseId) || null;
    }
    return null;
  }

  /**
   * Retrieves verification case for a specific provider.
   */
  public async getCaseByProviderId(providerId: string): Promise<VerificationCase | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, provider_id AS "providerId", assigned_officer_id AS "assignedOfficerId",
                status, review_notes AS "reviewNotes", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM verification_cases WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [providerId]
      );
      if (rows.length > 0) return rows[0];
      for (const vCase of VerificationService.memoryCases.values()) {
        if (vCase.providerId === providerId) return vCase;
      }
    } catch {
      for (const vCase of VerificationService.memoryCases.values()) {
        if (vCase.providerId === providerId) return vCase;
      }
    }
    return null;
  }

  /**
   * Assigns a verification case to an officer.
   */
  public async assignCase(caseId: string, officerId: string): Promise<VerificationCase> {
    const vCase = await this.getCaseById(caseId);
    if (!vCase) {
      throw new Error("Verification case not found");
    }

    const updatedCase: VerificationCase = {
      ...vCase,
      assignedOfficerId: officerId,
      status: VerificationCaseStatuses.IN_REVIEW,
      updatedAt: new Date().toISOString(),
    };

    const event: VerificationEvent = {
      id: crypto.randomUUID(),
      verificationCaseId: caseId,
      actorId: officerId,
      action: "CASE_ASSIGNED",
      notes: `Assigned to Verification Officer ${officerId}`,
      createdAt: new Date().toISOString(),
    };

    try {
      const otpService = new OtpService();
      await otpService.findOrCreateUser(officerId);

      const pool = db.getPool();
      const res = await pool.query(
        `UPDATE verification_cases SET assigned_officer_id = $1, status = $2, updated_at = $3 WHERE id = $4`,
        [updatedCase.assignedOfficerId, updatedCase.status, updatedCase.updatedAt, caseId]
      );
      if ((res.rowCount ?? 0) === 0) {
        VerificationService.memoryCases.set(caseId, updatedCase);
      }

      await pool.query(
        `INSERT INTO verification_events (id, verification_case_id, actor_id, action, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [event.id, event.verificationCaseId, event.actorId, event.action, event.notes, event.createdAt]
      );
    } catch (err) {
      VerificationService.memoryCases.set(caseId, updatedCase);
      const list = VerificationService.memoryEvents.get(caseId) || [];
      list.push(event);
      VerificationService.memoryEvents.set(caseId, list);
    }

    return updatedCase;
  }

  /**
   * Reviews and decisions a provider verification case.
   */
  public async reviewCase(params: ReviewCaseParams): Promise<{ case: VerificationCase; event: VerificationEvent }> {
    const vCase = await this.getCaseById(params.caseId);
    if (!vCase) {
      throw new Error("Verification case not found");
    }

    // Get provider profile
    let provider = null;
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(`SELECT * FROM provider_profiles WHERE id = $1`, [vCase.providerId]);
      if (rows.length > 0) {
        const r = rows[0];
        provider = {
          id: r.id,
          userId: r.user_id,
          providerType: r.provider_type,
          entityType: r.entity_type,
          legalName: r.legal_name,
          tradeName: r.trade_name,
          sebiRegistrationNumber: r.sebi_registration_number,
          validFrom: r.valid_from,
          validTill: r.valid_till,
          isPerpetual: r.is_perpetual,
          status: r.status,
          complianceOfficerName: r.compliance_officer_name,
          complianceOfficerEmail: r.compliance_officer_email,
          registeredOfficeAddress: r.registered_office_address,
          isNismCertified: r.is_nism_certified,
          panNumber: r.pan_number,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      } else {
        provider = await this.providerService.getProviderById(vCase.providerId);
      }
    } catch {
      provider = await this.providerService.getProviderById(vCase.providerId);
    }

    // Rule 10: Provider cannot approve itself
    if (provider && provider.userId === params.officerId) {
      throw new Error("Self-approval is strictly forbidden. A provider cannot approve its own verification case.");
    }

    let newCaseStatus: VerificationCaseStatus = VerificationCaseStatuses.IN_REVIEW;
    let newProviderStatus: ProviderStatus = ProviderStatuses.UNDER_VERIFICATION;
    let targetRole: PlatformRole | null = null;

    if (params.action === "APPROVE") {
      newCaseStatus = VerificationCaseStatuses.APPROVED;
      newProviderStatus = ProviderStatuses.VERIFIED;
      if (provider) {
        // Rule 1 & 2 & 3: Provider type determines role (RA gets RA, IA gets IA strictly)
        targetRole =
          provider.providerType === ProviderTypes.RESEARCH_ANALYST
            ? PlatformRoles.RESEARCH_ANALYST
            : PlatformRoles.INVESTMENT_ADVISER;
      }
    } else if (params.action === "REJECT") {
      newCaseStatus = VerificationCaseStatuses.REJECTED;
      newProviderStatus = ProviderStatuses.REJECTED;
    } else if (params.action === "REQUEST_MORE_INFO") {
      newCaseStatus = VerificationCaseStatuses.MORE_INFO_REQUIRED;
      newProviderStatus = ProviderStatuses.UNDER_VERIFICATION;
    } else if (params.action === "SUSPEND") {
      newCaseStatus = VerificationCaseStatuses.SUSPENDED;
      newProviderStatus = ProviderStatuses.SUSPENDED;
    }

    // Rule 5: State Machine transition validation
    const allowedNextStates = ALLOWED_VERIFICATION_TRANSITIONS[vCase.status] || [];
    if (!allowedNextStates.includes(newCaseStatus)) {
      throw new Error(`Invalid verification state transition from ${vCase.status} to ${newCaseStatus}`);
    }

    const updatedCase: VerificationCase = {
      ...vCase,
      assignedOfficerId: params.officerId,
      status: newCaseStatus,
      reviewNotes: params.notes,
      updatedAt: new Date().toISOString(),
    };

    const event: VerificationEvent = {
      id: crypto.randomUUID(),
      verificationCaseId: params.caseId,
      providerId: vCase.providerId,
      actorId: params.officerId,
      action: params.action,
      previousState: vCase.status,
      newState: newCaseStatus,
      notes: params.notes,
      correlationId: params.correlationId,
      createdAt: new Date().toISOString(),
    };

    try {
      const otpService = new OtpService();
      await otpService.findOrCreateUser(params.officerId);

      const pool = db.getPool();

      // Update Case
      const caseRes = await pool.query(
        `UPDATE verification_cases SET assigned_officer_id = $1, status = $2, review_notes = $3, updated_at = $4 WHERE id = $5`,
        [updatedCase.assignedOfficerId, updatedCase.status, updatedCase.reviewNotes, updatedCase.updatedAt, params.caseId]
      );
      if ((caseRes.rowCount ?? 0) === 0) {
        VerificationService.memoryCases.set(params.caseId, updatedCase);
      }

      // Update Provider Status
      await pool.query(`UPDATE provider_profiles SET status = $1, updated_at = $2 WHERE id = $3`, [
        newProviderStatus,
        updatedCase.updatedAt,
        vCase.providerId,
      ]);

      // Record Event
      await pool.query(
        `INSERT INTO verification_events (id, verification_case_id, actor_id, action, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [event.id, event.verificationCaseId, event.actorId, event.action, event.notes, event.createdAt]
      );

      // Rule 8 & 9 & 11 & 12 & 13: Role grant handling with idempotency
      if (params.action === "APPROVE" && provider && targetRole) {
        // Check if user already has role to enforce idempotency
        const existingRoles = await pool.query(`SELECT role_id FROM user_roles WHERE user_id = $1 AND role_id = $2`, [
          provider.userId,
          targetRole,
        ]);

        if (existingRoles.rows.length === 0) {
          await pool.query(
            `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [provider.userId, targetRole, params.officerId]
          );

          await pool.query(
            `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, new_state, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              crypto.randomUUID(),
              params.officerId,
              PlatformRoles.VERIFICATION_OFFICER,
              "GRANT_PROVIDER_ROLE",
              "user_roles",
              provider.userId,
              JSON.stringify({ grantedRole: targetRole, providerId: provider.id }),
              params.ipAddress || null,
            ]
          );
        }
      } else if ((params.action === "REJECT" || params.action === "SUSPEND") && provider) {
        // Rule 6 & 7: Revoke operational provider roles on rejection or suspension
        const rolesToRemove = [PlatformRoles.RESEARCH_ANALYST, PlatformRoles.INVESTMENT_ADVISER];
        for (const roleToRemove of rolesToRemove) {
          await pool.query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [provider.userId, roleToRemove]);
        }

        await pool.query(
          `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, new_state, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(),
            params.officerId,
            PlatformRoles.VERIFICATION_OFFICER,
            "REVOKE_PROVIDER_ROLE",
            "user_roles",
            provider.userId,
            JSON.stringify({ action: params.action, providerId: provider.id }),
            params.ipAddress || null,
          ]
        );
      }
    } catch {
      VerificationService.memoryCases.set(params.caseId, updatedCase);
      ProviderService.updateMemoryProviderStatus(vCase.providerId, newProviderStatus);
      const list = VerificationService.memoryEvents.get(params.caseId) || [];
      list.push(event);
      VerificationService.memoryEvents.set(params.caseId, list);

      // Memory fallback for roles
      if (provider) {
        let userRoles = VerificationService.memoryUserRoles.get(provider.userId);
        if (!userRoles) {
          userRoles = new Set<PlatformRole>();
          VerificationService.memoryUserRoles.set(provider.userId, userRoles);
        }

        if (params.action === "APPROVE" && targetRole) {
          userRoles.add(targetRole);
        } else if (params.action === "REJECT" || params.action === "SUSPEND") {
          userRoles.delete(PlatformRoles.RESEARCH_ANALYST);
          userRoles.delete(PlatformRoles.INVESTMENT_ADVISER);
        }
      }
    }

    return { case: updatedCase, event };
  }

  /**
   * Gets verification events history for a case.
   */
  public async getVerificationEvents(caseId: string): Promise<VerificationEvent[]> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT id, verification_case_id AS "verificationCaseId", actor_id AS "actorId",
                action, notes, created_at AS "createdAt"
         FROM verification_events WHERE verification_case_id = $1 ORDER BY created_at ASC`,
        [caseId]
      );
      if (rows.length > 0) return rows;
      return VerificationService.memoryEvents.get(caseId) || [];
    } catch {
      return VerificationService.memoryEvents.get(caseId) || [];
    }
  }

  public static clearMemoryState(): void {
    this.memoryCases.clear();
    this.memoryEvents.clear();
  }
}
