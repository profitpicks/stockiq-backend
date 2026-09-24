/**
 * stockiq - Secure Provider Bot / Webhook Integration Domain Contracts
 */

export const IntegrationCredentialStatuses = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
} as const;

export type IntegrationCredentialStatus =
  (typeof IntegrationCredentialStatuses)[keyof typeof IntegrationCredentialStatuses];

export interface IntegrationCredential {
  id: string;
  providerId: string;
  name: string;
  keyPrefix: string;
  secretHash: string;
  status: IntegrationCredentialStatus;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateApiKeyParams {
  label?: string;
  expiresInDays?: number;
}

export interface CreateApiKeyResult {
  id: string;
  providerId: string;
  label: string;
  keyPrefix: string;
  secretKey: string; // Shown ONLY ONCE upon creation/rotation
  status: IntegrationCredentialStatus;
  createdAt: string;
  expiresAt?: string | null;
}

export interface WebhookRecommendationInput {
  serviceId: string;
  rawMessage: string;
}

export interface WebhookRecommendationResponse {
  success: boolean;
  recommendationId: string;
  serviceId: string;
  status: "PUBLISHED" | "DRAFT";
  requiresProviderReview?: boolean;
  message?: string;
  symbol?: string;
  direction?: string;
  entryPrice?: number;
  targets?: Array<{ targetPrice: number; label?: string }>;
  stopLossPrice?: number;
  parsedFields?: Record<string, unknown>;
  eventHash?: string;
  createdAt: string;
}

export interface IdempotencyRecord {
  id: string;
  providerId: string;
  serviceId: string;
  idempotencyKey: string;
  responseStatus: number;
  responsePayload: WebhookRecommendationResponse;
  createdAt: string;
}
