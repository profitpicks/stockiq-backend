/**
 * stockiq - Subscription Domain Boundary Contracts
 *
 * Enforces the CAN_ACCESS_SERVICE_CHANNEL policy rule requiring active subscription,
 * executed agreement, and suitability compliance.
 */

export const SubscriptionStatuses = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  EXPIRING: "EXPIRING",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  SUSPENDED: "SUSPENDED",
  REFUND_PENDING: "REFUND_PENDING",
  REFUNDED: "REFUNDED",
  PAYMENT_PENDING: "PENDING", // Backward compatibility alias
} as const;

export type SubscriptionStatus =
  | "PENDING"
  | "ACTIVE"
  | "EXPIRING"
  | "EXPIRED"
  | "CANCELLED"
  | "SUSPENDED"
  | "REFUND_PENDING"
  | "REFUNDED";

export interface Subscription {
  id: string;
  userId: string;
  serviceId: string;
  providerId: string;
  agreementId?: string | null;
  agreementSignatureId?: string | null;
  paymentOrderId?: string | null;
  status: SubscriptionStatus;
  startDate: string | null;
  endDate: string | null;
  autoRenew: boolean;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  suspendedAt?: string | null;
  suspensionReason?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SubscriptionEvent {
  id: string;
  subscriptionId: string;
  eventType: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  actorId: string | null;
  actorRole: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ServiceAccessCheckResult {
  allowed: boolean;
  reason?: string;
  subscriptionId?: string;
  agreementExecuted: boolean;
  suitabilityMatched: boolean;
  subscriptionStatus?: SubscriptionStatus;
}

export interface CreateSubscriptionInput {
  userId: string;
  serviceId: string;
  paymentOrderId?: string;
  agreementSignatureId?: string;
  autoRenew?: boolean;
  idempotencyKey?: string;
}

export interface ActivateSubscriptionInput {
  subscriptionId: string;
  actorId?: string;
  actorRole?: string;
  paymentOrderId?: string;
  agreementSignatureId?: string;
}

export interface CancelSubscriptionInput {
  subscriptionId: string;
  userId: string;
  actorRole?: string;
  reason: string;
}

export interface SuspendSubscriptionInput {
  subscriptionId: string;
  actorId: string;
  actorRole: string;
  reason: string;
}

export interface SubscriptionAuditFilter {
  userId?: string;
  providerId?: string;
  serviceId?: string;
  status?: SubscriptionStatus;
}

export interface PrePurchaseEligibilityResult {
  serviceId: string;
  serviceName: string;
  serviceStatus: string;
  isEligible: boolean;
  canSubscribe: boolean;
  hasActiveSubscription: boolean;
  activeSubscriptionId: string | null;
  suitability: {
    status: "ELIGIBLE" | "NOT_ELIGIBLE";
    reason?: string;
    userRisk?: string;
    userClassification?: string;
  };
  agreement: {
    isExecuted: boolean;
    signatureId: string | null;
    template: {
      id: string;
      title: string;
      version: string;
      content?: string;
    } | null;
  };
  pricing: {
    baseFeePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalAmountPaise: number;
    currency: string;
    billingDuration: string;
  };
  reasons: string[];
}

