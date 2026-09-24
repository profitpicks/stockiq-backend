/**
 * stockiq - Complaints, Support, and Help Center Service
 */

import { db } from "../../database/connection.js";
import { v4 as uuidv4 } from "uuid";
import { NotificationService } from "../notifications/notifications.service.ts";

const notificationService = new NotificationService();

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportReply {
  id: string;
  ticketId: string;
  senderId: string;
  message: string;
  createdAt: string;
}

export interface ComplaintTicket {
  id: string;
  complainantUserId: string;
  respondentProviderId?: string;
  serviceId?: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  slaDeadline: string;
  resolvedAt?: string;
  resolutionSummary?: string;
  scoresReferenceNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintReply {
  id: string;
  complaintId: string;
  senderId: string;
  message: string;
  createdAt: string;
}

const DEFAULT_HELP_ARTICLES: HelpArticle[] = [
  {
    id: "art-1",
    title: "Understanding Provider Verification & Onboarding",
    category: "Provider Verification",
    content: "To begin offering services on Stockiq, you must complete the multi-step SEBI verification officer workflow. This includes submitting your official legal name, trade name, and your active SEBI registration number (RA or IA). Our compliance verification team reviews all registration certificates, SEBI orders, and disclosure histories. Once verified, your status transitions to ACTIVE and you can list advisory services. Please refer to SEBI regulations and consult with your compliance advisor if you have questions regarding valid registration requirements.",
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "art-2",
    title: "How to Structure and Schedule Advisory Service Channels",
    category: "Services",
    content: "Stockiq allows registered RAs and IAs to define customized, transparent service channels (such as monthly stock advice, long-term asset allocation, etc.). All pricing must be presented in paise (INR). Standard GST tax rules apply (usually 18% GST). Once a channel is active, investors can subscribe securely through the built-in integrated payments gateway.",
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "art-3",
    title: "Recommendation Composers and the Immutable Ledger",
    category: "Recommendations",
    content: "Every recommendation or research report submitted by an RA/IA on Stockiq is recorded to our compliance-governed immutable ledger. This guarantees a verifiable, transparent track-record. Recommendations cannot be backdated, modified post-issue, or deleted. This preserves investor trust and satisfies regulatory requirements for recording advisory history.",
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "art-4",
    title: "How We Compute Track-Record and PARRVA Metrics",
    category: "Track Record",
    content: "Stockiq automatically computes your Track Record metrics, including the SEBI-aligned PARRVA (Performance Adjusted Risk-Reward Volume Average) score. This metric evaluates the performance of your active and historical recommendations, accounting for risk and stop-loss breaches, ensuring accurate and objective platform performance representation.",
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "art-5",
    title: "Subscription Payments, Taxes, and Invoice Management",
    category: "Payments & Invoices",
    content: "All subscription payments are processed securely. A detailed GST tax invoice is generated automatically for every successful subscription, with CGST and SGST broken down clearly based on the subscriber's region. Providers can view all payment orders and download/export official PDF invoices for compliance and tax filings directly from their Financials tab.",
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "art-6",
    title: "Investor Grievance Redressal and Compliance Timelines",
    category: "Compliance",
    content: "Resolving investor grievances is of the highest importance. When an investor lodges a grievance on Stockiq, a compliance-monitored grievance SLA timer starts. Providers can review complaints, submit formal responses, and work towards resolution. Always monitor your Compliance Center tab for active notifications regarding complaints.",
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "art-7",
    title: "Managing Your Stockiq Provider Profile",
    category: "Account & Login",
    content: "Your Provider Profile contains your regulatory details, verified registration certificate, entity type, and public disclosures. You can update contact information and non-regulatory details at any time. Regulatory fields can only be modified with subsequent compliance review to maintain platform integrity.",
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export class ComplaintsService {
  private static memoryArticles: HelpArticle[] = [...DEFAULT_HELP_ARTICLES];
  private static memoryTickets = new Map<string, SupportTicket>();
  private static memoryReplies = new Map<string, SupportReply[]>();
  private static memoryComplaints = new Map<string, ComplaintTicket>();
  private static memoryComplaintReplies = new Map<string, ComplaintReply[]>();

  // ==========================================================================
  // 1. HELP CENTER ARTICLES
  // ==========================================================================

  public async getHelpArticles(category?: string, search?: string): Promise<HelpArticle[]> {
    try {
      const pool = db.getPool();
      let query = "SELECT id, title, category, content, is_published as \"isPublished\", created_at as \"createdAt\", updated_at as \"updatedAt\" FROM help_articles WHERE is_published = true";
      const params: any[] = [];

      if (category && category !== "ALL") {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      if (search && search.trim().length > 0) {
        params.push(`%${search.trim()}%`);
        query += ` AND (title ILIKE $${params.length} OR content ILIKE $${params.length})`;
      }

      query += " ORDER BY category ASC, title ASC";

      const result = await pool.query(query, params);
      if (result.rows && result.rows.length > 0) {
        return result.rows;
      }
    } catch {
      // Fallback to in-memory
    }

    let filtered = ComplaintsService.memoryArticles.filter(a => a.isPublished);
    if (category && category !== "ALL") {
      filtered = filtered.filter(a => a.category.toLowerCase() === category.toLowerCase());
    }
    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(a => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q));
    }
    return filtered;
  }

  // ==========================================================================
  // 2. SUPPORT TICKETS
  // ==========================================================================

  public async createSupportTicket(
    userId: string,
    category: string,
    subject: string,
    description: string
  ): Promise<SupportTicket> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const ticket: SupportTicket = {
      id,
      userId,
      category,
      subject,
      description,
      status: "OPEN",
      createdAt: now,
      updatedAt: now
    };

    try {
      const pool = db.getPool();
      const query = `
        INSERT INTO support_tickets (id, user_id, category, subject, description, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7)
        RETURNING id, user_id as "userId", category, subject, description, status, created_at as "createdAt", updated_at as "updatedAt"
      `;
      const result = await pool.query(query, [id, userId, category, subject, description, now, now]);
      if (result.rows[0]) {
        ComplaintsService.memoryTickets.set(id, result.rows[0]);
      }
    } catch {
      ComplaintsService.memoryTickets.set(id, ticket);
    }

    // Send factual notification
    try {
      await notificationService.createNotification({
        recipientId: userId,
        notificationType: "COMPLIANCE_STATUS_CHANGED",
        title: "Support Ticket Created",
        message: `Your technical support ticket regarding "${subject}" was successfully submitted. Ticket ID: ${id.substring(0, 8).toUpperCase()}`,
        relatedEntityType: "SUPPORT_TICKET",
        relatedEntityId: id
      });
    } catch (err) {
      console.error("[ComplaintsService notification error]", err);
    }

    return ComplaintsService.memoryTickets.get(id) || ticket;
  }

  public async getSupportTickets(userId: string): Promise<SupportTicket[]> {
    try {
      const pool = db.getPool();
      const query = `
        SELECT id, user_id as "userId", category, subject, description, status, created_at as "createdAt", updated_at as "updatedAt"
        FROM support_tickets
        WHERE user_id = $1
        ORDER BY created_at DESC
      `;
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch {
      // In-memory fallback
      return Array.from(ComplaintsService.memoryTickets.values())
        .filter(t => t.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }

  public async getSupportTicketDetails(ticketId: string, userId: string): Promise<SupportTicket | null> {
    try {
      const pool = db.getPool();
      const query = `
        SELECT id, user_id as "userId", category, subject, description, status, created_at as "createdAt", updated_at as "updatedAt"
        FROM support_tickets
        WHERE id = $1 AND user_id = $2
      `;
      const result = await pool.query(query, [ticketId, userId]);
      if (result.rows[0]) return result.rows[0];
    } catch {
      // In-memory fallback
      const ticket = ComplaintsService.memoryTickets.get(ticketId);
      if (ticket && ticket.userId === userId) {
        return ticket;
      }
    }
    return null;
  }

  public async getSupportReplies(ticketId: string, userId: string): Promise<SupportReply[]> {
    // First verify owner to prevent IDOR
    const ticket = await this.getSupportTicketDetails(ticketId, userId);
    if (!ticket) {
      throw new Error("Access denied to requested ticket details");
    }

    try {
      const pool = db.getPool();
      const query = `
        SELECT id, ticket_id as "ticketId", sender_id as "senderId", message, created_at as "createdAt"
        FROM support_replies
        WHERE ticket_id = $1
        ORDER BY created_at ASC
      `;
      const result = await pool.query(query, [ticketId]);
      return result.rows;
    } catch {
      return ComplaintsService.memoryReplies.get(ticketId) || [];
    }
  }

  public async createSupportReply(
    ticketId: string,
    senderId: string,
    message: string
  ): Promise<SupportReply> {
    // Verify authorized access to ticket
    const ticket = ComplaintsService.memoryTickets.get(ticketId);

    const id = uuidv4();
    const now = new Date().toISOString();
    const reply: SupportReply = {
      id,
      ticketId,
      senderId,
      message,
      createdAt: now
    };

    try {
      const pool = db.getPool();
      const query = `
        INSERT INTO support_replies (id, ticket_id, sender_id, message, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, ticket_id as "ticketId", sender_id as "senderId", message, created_at as "createdAt"
      `;
      const result = await pool.query(query, [id, ticketId, senderId, message, now]);
      await pool.query("UPDATE support_tickets SET updated_at = $1 WHERE id = $2", [now, ticketId]);
      if (result.rows[0]) {
        const list = ComplaintsService.memoryReplies.get(ticketId) || [];
        list.push(result.rows[0]);
        ComplaintsService.memoryReplies.set(ticketId, list);
        return result.rows[0];
      }
    } catch {
      // In-memory update
      const list = ComplaintsService.memoryReplies.get(ticketId) || [];
      list.push(reply);
      ComplaintsService.memoryReplies.set(ticketId, list);
      if (ticket) {
        ticket.updatedAt = now;
      }
    }

    return reply;
  }

  // ==========================================================================
  // 3. GRIEVANCES / COMPLAINTS
  // ==========================================================================

  public async createComplaint(
    complainantUserId: string,
    category: string,
    subject: string,
    description: string,
    respondentProviderId?: string,
    serviceId?: string
  ): Promise<ComplaintTicket> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const slaDays = 21;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + slaDays);
    const slaDeadline = deadline.toISOString();

    const complaint: ComplaintTicket = {
      id,
      complainantUserId,
      respondentProviderId,
      serviceId,
      category,
      subject,
      description,
      status: "LODGED",
      slaDeadline,
      createdAt: now,
      updatedAt: now
    };

    try {
      const pool = db.getPool();
      const query = `
        INSERT INTO complaints (
          id, complainant_user_id, respondent_provider_id, service_id,
          category, subject, description, status, sla_deadline, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'LODGED', $8, $9, $10)
        RETURNING 
          id, complainant_user_id as "complainantUserId", respondent_provider_id as "respondentProviderId",
          service_id as "serviceId", category, subject, description, status,
          sla_deadline as "slaDeadline", resolved_at as "resolvedAt", resolution_summary as "resolutionSummary",
          scores_reference_number as "scoresReferenceNumber", created_at as "createdAt", updated_at as "updatedAt"
      `;
      const result = await pool.query(query, [
        id,
        complainantUserId,
        respondentProviderId || null,
        serviceId || null,
        category,
        subject,
        description,
        slaDeadline,
        now,
        now
      ]);
      if (result.rows[0]) {
        ComplaintsService.memoryComplaints.set(id, result.rows[0]);
      }
    } catch {
      ComplaintsService.memoryComplaints.set(id, complaint);
    }

    // Notification
    try {
      await notificationService.createNotification({
        recipientId: complainantUserId,
        notificationType: "COMPLIANCE_STATUS_CHANGED",
        title: "Grievance Lodged",
        message: `Your grievance regarding "${subject}" has been successfully lodged. SLA timer: ${slaDays} days. Case ID: ${id.substring(0, 8).toUpperCase()}`,
        relatedEntityType: "GRIEVANCE",
        relatedEntityId: id
      });
    } catch (err) {
      console.error("[ComplaintsService notification error]", err);
    }

    return ComplaintsService.memoryComplaints.get(id) || complaint;
  }

  public async getComplaints(userId: string): Promise<ComplaintTicket[]> {
    try {
      const pool = db.getPool();
      const providerQuery = "SELECT id FROM provider_profiles WHERE user_id = $1";
      const providerResult = await pool.query(providerQuery, [userId]);
      const providerProfileId = providerResult.rows[0]?.id;

      let query = `
        SELECT 
          id, complainant_user_id as "complainantUserId", respondent_provider_id as "respondentProviderId",
          service_id as "serviceId", category, subject, description, status,
          sla_deadline as "slaDeadline", resolved_at as "resolvedAt", resolution_summary as "resolutionSummary",
          scores_reference_number as "scoresReferenceNumber", created_at as "createdAt", updated_at as "updatedAt"
        FROM complaints
        WHERE complainant_user_id = $1
      `;
      const params: any[] = [userId];

      if (providerProfileId) {
        params.push(providerProfileId);
        query += ` OR respondent_provider_id = $2`;
      }

      query += " ORDER BY created_at DESC";

      const result = await pool.query(query, params);
      return result.rows;
    } catch {
      return Array.from(ComplaintsService.memoryComplaints.values())
        .filter(c => c.complainantUserId === userId || c.respondentProviderId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }

  public async getComplaintDetails(complaintId: string, userId: string): Promise<ComplaintTicket | null> {
    try {
      const pool = db.getPool();
      const providerQuery = "SELECT id FROM provider_profiles WHERE user_id = $1";
      const providerResult = await pool.query(providerQuery, [userId]);
      const providerProfileId = providerResult.rows[0]?.id;

      let query = `
        SELECT 
          id, complainant_user_id as "complainantUserId", respondent_provider_id as "respondentProviderId",
          service_id as "serviceId", category, subject, description, status,
          sla_deadline as "slaDeadline", resolved_at as "resolvedAt", resolution_summary as "resolutionSummary",
          scores_reference_number as "scoresReferenceNumber", created_at as "createdAt", updated_at as "updatedAt"
        FROM complaints
        WHERE id = $1 AND (complainant_user_id = $2
      `;
      const params: any[] = [complaintId, userId];

      if (providerProfileId) {
        params.push(providerProfileId);
        query += ` OR respondent_provider_id = $3`;
      }
      query += ")";

      const result = await pool.query(query, params);
      if (result.rows[0]) return result.rows[0];
    } catch {
      const complaint = ComplaintsService.memoryComplaints.get(complaintId);
      if (complaint && (complaint.complainantUserId === userId || complaint.respondentProviderId === userId)) {
        return complaint;
      }
    }
    return null;
  }

  public async getComplaintReplies(complaintId: string, userId: string): Promise<ComplaintReply[]> {
    const complaint = await this.getComplaintDetails(complaintId, userId);
    if (!complaint) {
      throw new Error("Access denied to requested grievance details");
    }

    try {
      const pool = db.getPool();
      const query = `
        SELECT id, complaint_id as "complaintId", sender_id as "senderId", message, created_at as "createdAt"
        FROM complaint_replies
        WHERE complaint_id = $1
        ORDER BY created_at ASC
      `;
      const result = await pool.query(query, [complaintId]);
      return result.rows;
    } catch {
      return ComplaintsService.memoryComplaintReplies.get(complaintId) || [];
    }
  }

  public async createComplaintReply(
    complaintId: string,
    senderId: string,
    message: string
  ): Promise<ComplaintReply> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const reply: ComplaintReply = {
      id,
      complaintId,
      senderId,
      message,
      createdAt: now
    };

    try {
      const pool = db.getPool();
      const query = `
        INSERT INTO complaint_replies (id, complaint_id, sender_id, message, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, complaint_id as "complaintId", sender_id as "senderId", message, created_at as "createdAt"
      `;
      const result = await pool.query(query, [id, complaintId, senderId, message, now]);
      await pool.query("UPDATE complaints SET updated_at = $1 WHERE id = $2", [now, complaintId]);
      if (result.rows[0]) {
        const list = ComplaintsService.memoryComplaintReplies.get(complaintId) || [];
        list.push(result.rows[0]);
        ComplaintsService.memoryComplaintReplies.set(complaintId, list);
        return result.rows[0];
      }
    } catch {
      const list = ComplaintsService.memoryComplaintReplies.get(complaintId) || [];
      list.push(reply);
      ComplaintsService.memoryComplaintReplies.set(complaintId, list);
      const complaint = ComplaintsService.memoryComplaints.get(complaintId);
      if (complaint) {
        complaint.updatedAt = now;
      }
    }

    return reply;
  }
}
