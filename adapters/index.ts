import { AppConfig, config } from "../config/index.js";
import { MockOtpAdapter, OtpAdapter } from "./otp/otp.adapter.js";
import { MockPaymentGatewayAdapter, PaymentGatewayAdapter } from "./payments/payment.adapter.js";
import { MarketDataAdapter, MockMarketDataAdapter } from "./market-data/market-data.adapter.js";
import { ESignAdapter, MockESignAdapter } from "./esign/esign.adapter.js";
import { MockParrvaAdapter, ParrvaAdapter } from "./parrva/parrva.adapter.js";

export interface Adapters {
  otp: OtpAdapter;
  payment: PaymentGatewayAdapter;
  marketData: MarketDataAdapter;
  esign: ESignAdapter;
  parrva: ParrvaAdapter;
}

export function createAdapters(appConfig: AppConfig = config): Adapters {
  // Currently supports Mock adapters with readiness for live implementations
  const otp = new MockOtpAdapter();
  const payment = new MockPaymentGatewayAdapter();
  const marketData = new MockMarketDataAdapter();
  const esign = new MockESignAdapter();
  const parrva = new MockParrvaAdapter();

  return {
    otp,
    payment,
    marketData,
    esign,
    parrva,
  };
}

export const defaultAdapters = createAdapters();
