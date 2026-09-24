/**
 * stockiq - Recommendation Domain Boundary Contracts & Types
 *
 * Implements recommendation models, event types, canonical payloads, and hash-chain audit interfaces.
 */

export const InstrumentTypes = {
  EQUITY: "EQUITY",
  DERIVATIVE_FUTURES: "DERIVATIVE_FUTURES",
  DERIVATIVE_OPTIONS: "DERIVATIVE_OPTIONS",
  MUTUAL_FUND: "MUTUAL_FUND",
  BOND: "BOND",
  COMMODITY: "COMMODITY",
  FOREX: "FOREX",
} as const;

export type InstrumentType = (typeof InstrumentTypes)[keyof typeof InstrumentTypes];

export const SegmentTypes = {
  CASH: "CASH",
  FUTURES: "FUTURES",
  OPTIONS: "OPTIONS",
} as const;

export type SegmentType = (typeof SegmentTypes)[keyof typeof SegmentTypes];

export const RecommendationActions = {
  BUY: "BUY",
  SELL: "SELL",
  HOLD: "HOLD",
  ACCUMULATE: "ACCUMULATE",
  REDUCE: "REDUCE",
} as const;

export type RecommendationAction = (typeof RecommendationActions)[keyof typeof RecommendationActions];

export const EntryConditionTypes = {
  DIRECT: "DIRECT",
  BUY_ABOVE: "BUY_ABOVE",
  BUY_BELOW: "BUY_BELOW",
  SELL_BELOW: "SELL_BELOW",
  SELL_ABOVE: "SELL_ABOVE",
} as const;

export type EntryConditionType = (typeof EntryConditionTypes)[keyof typeof EntryConditionTypes];

export const RecommendationStatuses = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export type RecommendationStatus = (typeof RecommendationStatuses)[keyof typeof RecommendationStatuses];

export const RecommendationEventTypes = {
  CREATED: "CREATED",
  PUBLISHED: "PUBLISHED",
  TARGET_HIT: "TARGET_HIT",
  STOP_LOSS_UPDATED: "STOP_LOSS_UPDATED",
  STOP_LOSS_HIT: "STOP_LOSS_HIT",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
  CORRECTION: "CORRECTION",
} as const;

export type RecommendationEventType = (typeof RecommendationEventTypes)[keyof typeof RecommendationEventTypes];

export interface RecommendationTarget {
  id: string;
  recommendationId: string;
  targetSequence: number;
  targetPrice: number;
  label?: string;
  status: "PENDING" | "HIT" | "CANCELLED";
  hitTimestamp?: string;
  createdAt?: string;
}

export interface RecommendationStopLoss {
  id: string;
  recommendationId: string;
  stopLossSequence: number;
  stopLossPrice: number;
  stopLossType: "INITIAL" | "REVISED" | "TRAILING";
  status: "ACTIVE" | "TRIGGERED" | "SUPERSEDED";
  createdAt?: string;
}

export interface RecommendationEvent {
  id: string;
  recommendationId: string;
  eventSequence: number;
  eventType: RecommendationEventType | string;
  authorId: string;
  authorRole: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  previousHash: string | null;
  eventHash: string;
  eventTimestamp: string;
}

export interface Recommendation {
  id: string;
  providerId: string;
  serviceId?: string | null;
  originalMessage: string;
  instrumentType: InstrumentType | string;
  segment: SegmentType | string;
  symbol: string;
  direction: RecommendationAction;
  entryConditionType: EntryConditionType | string;
  entryPrice: number;
  timeHorizon: string;
  rationale?: string;
  researchReportReference?: string;
  disclosures: string[];
  currentStatus: RecommendationStatus;
  publishedAt?: string | null;
  closedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  targets: RecommendationTarget[];
  stopLosses: RecommendationStopLoss[];
  events?: RecommendationEvent[];
}

export interface CreateRecommendationInput {
  serviceId?: string;
  originalMessage: string;
  instrumentType?: InstrumentType | string;
  segment?: SegmentType | string;
  symbol: string;
  direction: RecommendationAction;
  entryConditionType?: EntryConditionType | string;
  entryPrice: number;
  timeHorizon?: string;
  rationale?: string;
  researchReportReference?: string;
  disclosures?: string[];
  targets: { targetPrice: number; label?: string }[];
  stopLossPrice: number;
}

export interface UpdateLifecycleInput {
  eventType: RecommendationEventType | string;
  targetSequence?: number;
  newStopLossPrice?: number;
  closingPrice?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ParseRecommendationInput {
  rawText: string;
}

export interface ParsedRecommendationDraft {
  isDraft: true;
  requiresProviderConfirmation: true;
  originalMessage: string;
  symbol?: string;
  direction?: RecommendationAction;
  instrumentType?: string;
  segment?: string;
  entryPrice?: number;
  targets?: { targetPrice: number; label?: string }[];
  stopLossPrice?: number;
  parsedFields: Record<string, unknown>;
}

export interface HashChainVerificationResult {
  recommendationId: string;
  isValid: boolean;
  totalEvents: number;
  mismatchReason?: string;
  mismatchEventId?: string;
  verifiedAt: string;
}
