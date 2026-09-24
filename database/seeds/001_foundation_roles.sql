-- ==============================================================================
-- stockiq - Seed Data 001: Foundation Roles & Default Settings
-- ==============================================================================

-- 1. Insert 12 Platform Roles
INSERT INTO roles (id, display_name, category, description, is_system_role)
VALUES 
    ('SUPER_ADMIN', 'Super Admin', 'ADMINISTRATIVE', 'Full platform management, system settings, break-glass security access.', TRUE),
    ('COMPLIANCE_ADMIN', 'Compliance Admin', 'ADMINISTRATIVE', 'Regulatory governance, disclosure templates, PaRRVA oversight, legal holds.', TRUE),
    ('VERIFICATION_OFFICER', 'Verification Officer', 'ADMINISTRATIVE', 'Verification of RA/IA registration dossiers, PAN, and SEBI certificates.', TRUE),
    ('CONTENT_MODERATOR', 'Content Moderator', 'ADMINISTRATIVE', 'Review of community posts, moderation of misleading claims.', TRUE),
    ('FINANCE_ADMIN', 'Finance Admin', 'ADMINISTRATIVE', 'Reconciliation of subscription orders, refunds, and provider settlements.', TRUE),
    ('SUPPORT_ADMIN', 'Support Admin', 'ADMINISTRATIVE', 'Grievance redressal ticketing, SLA tracking, dispute escalations.', TRUE),
    ('RESEARCH_ANALYST', 'Research Analyst (RA)', 'PROVIDER', 'SEBI-registered Research Analyst publishing research reports and recommendations.', FALSE),
    ('INVESTMENT_ADVISER', 'Investment Adviser (IA)', 'PROVIDER', 'SEBI-registered Investment Adviser offering fee-based financial advice.', FALSE),
    ('INVESTOR_RETAIL', 'Investor / Retail', 'INVESTOR', 'Retail investor viewing services, signing agreements, and subscribing.', FALSE),
    ('HNI', 'High Net-Worth Individual (HNI)', 'INVESTOR', 'High net-worth investor tier based on portfolio declarations.', FALSE),
    ('ACCREDITED_INVESTOR', 'Accredited Investor', 'INVESTOR', 'Statutorily accredited investor certified under applicable SEBI eligibility criteria.', FALSE),
    ('GUEST_PUBLIC', 'Guest / Public', 'PUBLIC', 'Unauthenticated visitor browsing factual directory and market education.', FALSE)
ON CONFLICT (id) DO UPDATE 
SET display_name = EXCLUDED.display_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

-- 2. Insert Default Foundation Settings
INSERT INTO system_settings (key, value, description, is_compliance_sensitive, legal_review_required)
VALUES 
    ('platform_phase', '"PHASE_1_FOUNDATION"', 'Current platform implementation phase', FALSE, FALSE),
    ('sebi_ra_framework_reference', '"Master Circular for Research Analysts (Feb 6, 2026)"', 'Applicable SEBI RA Master Circular', TRUE, TRUE),
    ('sebi_ia_framework_reference', '"Master Circular for Investment Advisers (Feb 6, 2026)"', 'Applicable SEBI IA Master Circular', TRUE, TRUE),
    ('parrva_operationalisation_reference', '"Circular on Operationalisation of PaRRVA (April 29, 2026)"', 'Applicable PaRRVA regulatory circular', TRUE, TRUE),
    ('track_record_methodology_version', '"v1.0"', 'Active track-record calculation methodology version', TRUE, TRUE)
ON CONFLICT (key) DO NOTHING;
