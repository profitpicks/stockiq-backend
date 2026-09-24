/**
 * stockiq - Electronic Signature (eSign) Adapter Contract & Mock Implementation
 *
 * Provides abstraction for digital consent & certified e-Sign workflows.
 */

export interface InitiateSignatureParams {
  documentId: string;
  documentHash: string; // SHA-256 hash of agreement content
  documentTitle: string;
  signerEmail: string;
  signerMobile: string;
  signerName: string;
  method: "OTP_CONSENT_HASH" | "ELECTRONIC_SIGNATURE_ESP" | "DIGITAL_SIGNATURE_CERTIFICATE";
}

export interface SignatureRequestResult {
  signatureReferenceId: string;
  status: "INITIATED" | "SIGNED" | "PENDING_USER_ACTION";
  signingUrl?: string;
  message: string;
}

export interface SignatureStatusResult {
  signatureReferenceId: string;
  status: "SIGNED" | "PENDING" | "REJECTED" | "EXPIRED";
  signedAt?: string;
  certificateDetails?: {
    certFingerprint: string;
    signingAuthority: string;
  };
}

export interface ESignAdapter {
  initiateSignature(params: InitiateSignatureParams): Promise<SignatureRequestResult>;
  getSignatureStatus(referenceId: string): Promise<SignatureStatusResult>;
}

/**
 * DEVELOPMENT/TEST ONLY: Mock eSign Adapter
 *
 * Simulates document signature generation and verification.
 * NOT CONNECTED TO A LICENSED ELECTRONIC SIGNATURE SERVICE PROVIDER (ESP).
 */
export class MockESignAdapter implements ESignAdapter {
  public static readonly IS_MOCK = true;

  async initiateSignature(params: InitiateSignatureParams): Promise<SignatureRequestResult> {
    const referenceId = `esign_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      signatureReferenceId: referenceId,
      status: "SIGNED", // Auto-resolves for mock testing
      signingUrl: `https://example.com/mock-sign/${referenceId}`,
      message: "[MOCK ONLY] Electronic consent simulated successfully for test environment.",
    };
  }

  async getSignatureStatus(referenceId: string): Promise<SignatureStatusResult> {
    return {
      signatureReferenceId: referenceId,
      status: "SIGNED",
      signedAt: new Date().toISOString(),
      certificateDetails: {
        certFingerprint: "MOCK-CERT-SHA256-FINGERPRINT",
        signingAuthority: "MOCK_SIGNING_AUTHORITY (DEV ONLY)",
      },
    };
  }
}
