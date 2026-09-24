/**
 * stockiq - Complaints & Grievance Domain Boundary Contracts
 *
 * Implements regulatory grievance tracking, SLA computation, and SCORES escalation hooks.
 */

export const ComplaintStatuses = {
  LODGED: "LODGED",
  IN_REVIEW: "IN_REVIEW",
  PROVIDER_RESPONSE_PENDING: "PROVIDER_RESPONSE_PENDING",
  RESOLVED: "RESOLVED",
  ESCALATED_TO_SCORES: "ESCALATED_TO_SCORES",
  CLOSED: "CLOSED",
} as const;

export type ComplaintStatus = (typeof ComplaintStatuses)[keyof typeof ComplaintStatuses];

export interface ComplaintTicket {
  id: string;
  complainantUserId: string;
  respondentProviderId: string;
  serviceId?: string;
  category: "SERVICE_DEFICIENCY" | "UNAUTHORIZED_PROMISES" | "FEE_DISPUTE" | "NON_DISCLOSURE" | "OTHER";
  subject: string;
  description: string;
  evidenceDocumentUrls: string[];
  status: ComplaintStatus;
  slaDeadline: string; // ISO UTC
  resolvedAt?: string;
  resolutionSummary?: string;
  scoresReferenceNumber?: string;
  createdAt: string;
}
