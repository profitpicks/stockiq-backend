/**
 * stockiq - Role Definitions
 *
 * Implements the 12 platform operational and regulatory roles.
 * Note: HNI and Accredited Investor are explicitly separate classifications.
 */

export const PlatformRoles = {
  SUPER_ADMIN: "SUPER_ADMIN",
  COMPLIANCE_ADMIN: "COMPLIANCE_ADMIN",
  VERIFICATION_OFFICER: "VERIFICATION_OFFICER",
  CONTENT_MODERATOR: "CONTENT_MODERATOR",
  FINANCE_ADMIN: "FINANCE_ADMIN",
  SUPPORT_ADMIN: "SUPPORT_ADMIN",
  RESEARCH_ANALYST: "RESEARCH_ANALYST", // RA
  INVESTMENT_ADVISER: "INVESTMENT_ADVISER", // IA
  INVESTOR_RETAIL: "INVESTOR_RETAIL",
  HNI: "HNI",
  ACCREDITED_INVESTOR: "ACCREDITED_INVESTOR",
  GUEST_PUBLIC: "GUEST_PUBLIC",
} as const;

export type PlatformRole = (typeof PlatformRoles)[keyof typeof PlatformRoles];

export interface RoleMetadata {
  id: PlatformRole;
  displayName: string;
  category: "ADMINISTRATIVE" | "PROVIDER" | "INVESTOR" | "PUBLIC";
  description: string;
  isSystemRole: boolean;
}

export const ROLE_REGISTRY: Record<PlatformRole, RoleMetadata> = {
  [PlatformRoles.SUPER_ADMIN]: {
    id: PlatformRoles.SUPER_ADMIN,
    displayName: "Super Admin",
    category: "ADMINISTRATIVE",
    description: "Full platform management, system settings, break-glass security access.",
    isSystemRole: true,
  },
  [PlatformRoles.COMPLIANCE_ADMIN]: {
    id: PlatformRoles.COMPLIANCE_ADMIN,
    displayName: "Compliance Admin",
    category: "ADMINISTRATIVE",
    description: "Regulatory governance, disclosure templates, PaRRVA oversight, legal holds.",
    isSystemRole: true,
  },
  [PlatformRoles.VERIFICATION_OFFICER]: {
    id: PlatformRoles.VERIFICATION_OFFICER,
    displayName: "Verification Officer",
    category: "ADMINISTRATIVE",
    description: "Verification of RA/IA registration dossiers, PAN, and SEBI certificates.",
    isSystemRole: true,
  },
  [PlatformRoles.CONTENT_MODERATOR]: {
    id: PlatformRoles.CONTENT_MODERATOR,
    displayName: "Content Moderator",
    category: "ADMINISTRATIVE",
    description: "Review of community posts, moderation of misleading claims.",
    isSystemRole: true,
  },
  [PlatformRoles.FINANCE_ADMIN]: {
    id: PlatformRoles.FINANCE_ADMIN,
    displayName: "Finance Admin",
    category: "ADMINISTRATIVE",
    description: "Reconciliation of subscription orders, refunds, and provider settlements.",
    isSystemRole: true,
  },
  [PlatformRoles.SUPPORT_ADMIN]: {
    id: PlatformRoles.SUPPORT_ADMIN,
    displayName: "Support Admin",
    category: "ADMINISTRATIVE",
    description: "Grievance redressal ticketing, SLA tracking, dispute escalations.",
    isSystemRole: true,
  },
  [PlatformRoles.RESEARCH_ANALYST]: {
    id: PlatformRoles.RESEARCH_ANALYST,
    displayName: "Research Analyst (RA)",
    category: "PROVIDER",
    description: "SEBI-registered Research Analyst publishing research reports and recommendations.",
    isSystemRole: false,
  },
  [PlatformRoles.INVESTMENT_ADVISER]: {
    id: PlatformRoles.INVESTMENT_ADVISER,
    displayName: "Investment Adviser (IA)",
    category: "PROVIDER",
    description: "SEBI-registered Investment Adviser offering fee-based financial advice.",
    isSystemRole: false,
  },
  [PlatformRoles.INVESTOR_RETAIL]: {
    id: PlatformRoles.INVESTOR_RETAIL,
    displayName: "Investor / Retail",
    category: "INVESTOR",
    description: "Retail investor viewing services, signing agreements, and subscribing.",
    isSystemRole: false,
  },
  [PlatformRoles.HNI]: {
    id: PlatformRoles.HNI,
    displayName: "High Net-Worth Individual (HNI)",
    category: "INVESTOR",
    description: "High net-worth investor tier based on portfolio declarations.",
    isSystemRole: false,
  },
  [PlatformRoles.ACCREDITED_INVESTOR]: {
    id: PlatformRoles.ACCREDITED_INVESTOR,
    displayName: "Accredited Investor",
    category: "INVESTOR",
    description: "Statutorily accredited investor certified under applicable SEBI eligibility criteria.",
    isSystemRole: false,
  },
  [PlatformRoles.GUEST_PUBLIC]: {
    id: PlatformRoles.GUEST_PUBLIC,
    displayName: "Guest / Public",
    category: "PUBLIC",
    description: "Unauthenticated visitor browsing factual directory and market education.",
    isSystemRole: false,
  },
};
