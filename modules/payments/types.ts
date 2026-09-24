/**
 * stockiq - Payments Domain Boundary Contracts
 *
 * Implements paise-denominated financial records and dynamic GST calculation structures.
 */

export interface TaxBreakdown {
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalTaxInPaise: number;
  gstRatePercentage: number;
}

export interface PaymentInvoice {
  id: string;
  orderId: string;
  userId: string;
  providerId: string;
  serviceId: string;
  baseAmountInPaise: number;
  tax: TaxBreakdown;
  totalAmountInPaise: number;
  currency: string; // "INR"
  gatewayPaymentId?: string;
  invoiceNumber: string;
  status: "PAID" | "REFUNDED" | "VOID";
  issuedAt: string;
}
