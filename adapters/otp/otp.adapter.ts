/**
 * stockiq - OTP Adapter Contract & Mock Implementation
 */

export interface SendOtpParams {
  identifier: string; // Mobile or email
  purpose: "LOGIN" | "SIGNING" | "PASSWORD_RESET";
}

export interface SendOtpResult {
  success: boolean;
  referenceId: string;
  expiresInSeconds: number;
  message: string;
}

export interface VerifyOtpParams {
  identifier: string;
  otp: string;
  purpose: "LOGIN" | "SIGNING" | "PASSWORD_RESET";
}

export interface VerifyOtpResult {
  valid: boolean;
  referenceId?: string;
  error?: string;
}

export interface OtpAdapter {
  sendOtp(params: SendOtpParams): Promise<SendOtpResult>;
  verifyOtp(params: VerifyOtpParams): Promise<VerifyOtpResult>;
}

/**
 * DEVELOPMENT/TEST ONLY: Mock OTP Adapter
 *
 * Simulates SMS/Email OTP generation and verification for local development and testing.
 * NOT SUITABLE FOR PRODUCTION. Does not send real SMS or email messages.
 */
export class MockOtpAdapter implements OtpAdapter {
  public static readonly IS_MOCK = true;
  public static readonly DEFAULT_TEST_OTP = "123456";

  private otps = new Map<string, { otp: string; expiresAt: number }>();

  async sendOtp(params: SendOtpParams): Promise<SendOtpResult> {
    const otp = MockOtpAdapter.DEFAULT_TEST_OTP;
    const expiresInSeconds = 300;
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const key = `${params.identifier}:${params.purpose}`;

    this.otps.set(key, { otp, expiresAt });

    return {
      success: true,
      referenceId: `mock-otp-${Date.now()}`,
      expiresInSeconds,
      message: `[MOCK ONLY] OTP generated for ${params.identifier}. Use test OTP: ${MockOtpAdapter.DEFAULT_TEST_OTP}`,
    };
  }

  async verifyOtp(params: VerifyOtpParams): Promise<VerifyOtpResult> {
    const key = `${params.identifier}:${params.purpose}`;
    const stored = this.otps.get(key);

    // Accept default test OTP in mock mode or stored OTP
    if (params.otp === MockOtpAdapter.DEFAULT_TEST_OTP) {
      this.otps.delete(key);
      return { valid: true, referenceId: `mock-verified-${Date.now()}` };
    }

    if (!stored) {
      return { valid: false, error: "OTP not found or expired" };
    }

    if (Date.now() > stored.expiresAt) {
      this.otps.delete(key);
      return { valid: false, error: "OTP expired" };
    }

    if (stored.otp !== params.otp) {
      return { valid: false, error: "Invalid OTP" };
    }

    this.otps.delete(key);
    return { valid: true, referenceId: `mock-verified-${Date.now()}` };
  }
}
