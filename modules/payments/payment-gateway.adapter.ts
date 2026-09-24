/**
 * stockiq - Payment Gateway Adaptation Layer
 *
 * Implements standard adapter contract and mock implementation for testing and development.
 */

export interface GatewayOrderResult {
  gatewayOrderId: string;
  status: "created" | "failed";
  rawResponse: any;
}

export interface GatewayVerifyResult {
  success: boolean;
  gatewayTransactionId?: string;
  gatewayPaymentId?: string;
  amountPaise?: number;
  rawResponse: any;
}

export interface GatewayRefundResult {
  success: boolean;
  gatewayRefundId?: string;
  rawResponse: any;
}

export interface GatewayWebhookEvent {
  eventId: string;
  eventType: "payment.captured" | "payment.failed" | "refund.processed" | "unknown";
  gatewayOrderId: string;
  amountPaise: number;
  gatewayTransactionId?: string;
  rawPayload: any;
}

export interface PaymentGatewayAdapter {
  createOrder(amountPaise: number, currency: string, receiptId: string): Promise<GatewayOrderResult>;
  verifyPaymentSignature(params: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature: string;
  }): Promise<boolean>;
  verifyAndParseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<GatewayWebhookEvent>;
  refund(gatewayOrderId: string, amountPaise: number, reason?: string): Promise<GatewayRefundResult>;
}

export class MockPaymentGatewayAdapter implements PaymentGatewayAdapter {
  public async createOrder(amountPaise: number, currency: string, receiptId: string): Promise<GatewayOrderResult> {
    const gatewayOrderId = `order_mock_${Math.random().toString(36).substring(2, 11)}`;
    return {
      gatewayOrderId,
      status: "created",
      rawResponse: { id: gatewayOrderId, amount: amountPaise, currency, receipt: receiptId, status: "created" }
    };
  }

  public async verifyPaymentSignature(params: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature: string;
  }): Promise<boolean> {
    if (params.gatewaySignature === "invalid_signature") {
      return false;
    }
    return (
      params.gatewaySignature.startsWith("sig_") ||
      params.gatewaySignature === "mock_signature_success" ||
      params.gatewaySignature === "valid_sig"
    );
  }

  public async verifyAndParseWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string
  ): Promise<GatewayWebhookEvent> {
    const signature = headers["x-razorpay-signature"] || headers["x-mock-signature"] || headers["signature"];
    if (signature === "invalid_signature") {
      throw new Error("Invalid webhook signature");
    }

    const payload = JSON.parse(rawBody);
    const eventId = payload.event_id || payload.id || `evt_${Math.random().toString(36).substring(2, 11)}`;
    const eventType = payload.event || "unknown";
    const gatewayOrderId = payload.order_id || payload.gateway_order_id || "";
    const amountPaise = payload.amount || payload.amount_paise || 0;
    const gatewayTransactionId = payload.payment_id || payload.gateway_transaction_id;

    return {
      eventId,
      eventType: eventType as any,
      gatewayOrderId,
      amountPaise,
      gatewayTransactionId,
      rawPayload: payload
    };
  }

  public async refund(gatewayOrderId: string, amountPaise: number, reason?: string): Promise<GatewayRefundResult> {
    const gatewayRefundId = `ref_mock_${Math.random().toString(36).substring(2, 11)}`;
    return {
      success: true,
      gatewayRefundId,
      rawResponse: { id: gatewayRefundId, order_id: gatewayOrderId, amount: amountPaise, reason, status: "processed" }
    };
  }
}
