/**
 * stockiq - Recommendation Ledger Event Hasher & Canonical Serializer
 *
 * Provides deterministic canonical JSON stringification with recursively sorted dictionary keys
 * and SHA-256 event hash computation for recommendation event hash-chain continuity.
 */

import crypto from "crypto";

export interface CanonicalEventPayload {
  recommendationId: string;
  eventSequence: number;
  eventType: string;
  authorId: string;
  authorRole: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  previousHash: string | null;
  eventTimestamp: string;
}

/**
 * Recursively stringifies any value with strictly sorted object keys.
 * Guarantees consistent hash outputs regardless of object insertion order.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalStringify(item));
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map((key) => {
      const val = obj[key];
      const serializedVal = val === undefined ? "null" : canonicalStringify(val);
      return `${JSON.stringify(key)}:${serializedVal}`;
    });
    return `{${pairs.join(",")}}`;
  }

  return JSON.stringify(String(value));
}

/**
 * Computes the deterministic SHA-256 hex hash for a recommendation event.
 */
export function computeEventHash(canonicalData: CanonicalEventPayload): string {
  const canonicalString = canonicalStringify({
    recommendationId: canonicalData.recommendationId,
    eventSequence: canonicalData.eventSequence,
    eventType: canonicalData.eventType,
    authorId: canonicalData.authorId,
    authorRole: canonicalData.authorRole,
    payload: canonicalData.payload,
    metadata: canonicalData.metadata,
    previousHash: canonicalData.previousHash,
    eventTimestamp: canonicalData.eventTimestamp,
  });

  return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
}
