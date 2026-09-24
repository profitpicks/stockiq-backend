/**
 * stockiq - Market Data Verification Adapter Contract & Mock Implementation
 *
 * Provides an abstraction for validating recommendation triggers against market feeds.
 */

export interface MarketQuote {
  symbol: string;
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
  timestamp: string; // ISO UTC
  source: string;
}

export interface PriceVerificationParams {
  symbol: string;
  condition: "ABOVE" | "BELOW" | "TOUCHED";
  targetPrice: number;
  timeWindowStart: string; // ISO UTC
  timeWindowEnd: string; // ISO UTC
}

export interface PriceVerificationResult {
  verified: boolean;
  status: "VERIFIED" | "UNVERIFIED" | "SOURCE_UNCONFIGURED";
  actualPrice?: number;
  verifiedAt?: string;
  source: string;
  notes?: string;
}

export interface MarketDataAdapter {
  isConfigured(): boolean;
  getQuote(symbol: string): Promise<MarketQuote | null>;
  verifyPriceCondition(params: PriceVerificationParams): Promise<PriceVerificationResult>;
}

/**
 * DEVELOPMENT/TEST ONLY: Mock Market Data Adapter
 *
 * Returns simulated tick data for local testing.
 * NOT CONNECTED TO REGULATORY-APPROVED OR LICENSED EXCHANGE DATA FEEDS.
 */
export class MockMarketDataAdapter implements MarketDataAdapter {
  public static readonly IS_MOCK = true;
  private configured: boolean = true;

  constructor(configured: boolean = true) {
    this.configured = configured;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    if (!this.configured) return null;

    return {
      symbol: symbol.toUpperCase(),
      lastPrice: 24500.5,
      highPrice: 24600.0,
      lowPrice: 24450.0,
      timestamp: new Date().toISOString(),
      source: "MOCK_MARKET_FEED (DEV ONLY)",
    };
  }

  async verifyPriceCondition(params: PriceVerificationParams): Promise<PriceVerificationResult> {
    if (!this.configured) {
      return {
        verified: false,
        status: "SOURCE_UNCONFIGURED",
        source: "NONE",
        notes: "Outcome verification source not configured.",
      };
    }

    return {
      verified: true,
      status: "VERIFIED",
      actualPrice: params.targetPrice,
      verifiedAt: new Date().toISOString(),
      source: "MOCK_MARKET_FEED (DEV ONLY)",
      notes: "[DEVELOPMENT/TEST ONLY] Simulated verification for test execution.",
    };
  }
}
