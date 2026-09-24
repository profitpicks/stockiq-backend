/**
 * stockiq - Payment Gateway Adapter Contract & Mock Implementation
 */

export interface CreateOrderParams {
  amountInPaise: number; // Stored in smallest currency unit (paise)
  currency: string; // 'INR'
  receipt: string;
  notes?: Record<string, string>;
}

export interface PaymentOrderResult {
  orderId: string;
  amountInPaise: number;
  currency: string;
  gateway: string;
  status: "CREATED" | "FAILED";
}

export interface VerifyPaymentParams {
  orderId: string;
  paymentId: string;
  signature?: string;
}

export interface VerifyPaymentResult {
  verified: boolean;
  paymentId: string;
  orderId: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
  amountInPaise: number;
  error?: string;
}

export interface RefundParams {
  paymentId: string;
  amountInPaise: number;
  reason: string;
}

export interface RefundResult {
  refundId: string;
  paymentId: string;
  amountInPaise: number;
  status: "SUCCESS" | "PENDING" | "FAILED";
}

export interface PaymentGatewayAdapter {
  createOrder(params: CreateOrderParams): Promise<PaymentOrderResult>;
  verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult>;
  initiateRefund(params: RefundParams): Promise<RefundResult>;
}

/**
 * DEVELOPMENT/TEST ONLY: Mock Payment Gateway Adapter
 *
 * Simulates payment order creation, client signature verification, and refunds.
 * NOT CONNECTED TO REAL PAYMENT GATEWAYS (Razorpay, Cashfree, PayU).
 * Real transactions must not be processed with this adapter.
 */
export class MockPaymentGatewayAdapter implements PaymentGatewayAdapter {
  public static readonly IS_MOCK = true;

  async createOrder(params: CreateOrderParams): Promise<PaymentOrderResult> {
    return {
      orderId: `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amountInPaise: params.amountInPaise,
      currency: params.currency || "INR",
      gateway: "MOCK_PAYMENT_GATEWAY",
      status: "CREATED",
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    // In mock mode, if signature is 'mock_fail' it fails, otherwise succeeds
    if (params.signature === "mock_fail") {
      return {
        verified: false,
        paymentId: params.paymentId,
        orderId: params.orderId,
        status: "FAILED",
        amountInPaise: 0,
        error: "Mock verification failure triggered",
      };
    }

    return {
      verified: true,
      paymentId: params.paymentId || `pay_mock_${Date.now()}`,
      orderId: params.orderId,
      status: "SUCCESS",
      amountInPaise: 100000, // 1,000 INR default mock
    };
  }

  async initiateRefund(params: RefundParams): Promise<RefundResult> {
    return {
      refundId: `rfnd_mock_${Date.now()}`,
      paymentId: params.paymentId,
      amountInPaise: params.amountInPaise,
      status: "SUCCESS",
    };
  }
}
