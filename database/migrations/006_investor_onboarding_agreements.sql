-- ==============================================================================
-- stockiq - Migration 006: Investor Onboarding, Suitability, & Client Agreements
-- PostgreSQL Forward-Only Schema Extension
-- ==============================================================================

-- 1. Investor Profiles Table (Onboarding status & key metadata)
CREATE TABLE IF NOT EXISTS investor_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    onboarding_status VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED' 
        CHECK (onboarding_status IN ('NOT_STARTED', 'PROFILE_PENDING', 'CLASSIFICATION_PENDING', 'RISK_ASSESSMENT_PENDING', 'SUITABILITY_REVIEW', 'AGREEMENTS_PENDING', 'COMPLETED', 'REQUIRES_REVIEW', 'SUSPENDED')),
    classification VARCHAR(50) NOT NULL DEFAULT 'RETAIL' 
        CHECK (classification IN ('RETAIL', 'HNI', 'ACCREDITED_INVESTOR')),
    annual_income_bracket VARCHAR(100),
    investment_experience_years INTEGER DEFAULT 0,
    onboarding_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_investor_profiles_status ON investor_profiles(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_investor_profiles_classification ON investor_profiles(classification);

-- 2. Classification Evidence Table (Private evidence records)
CREATE TABLE IF NOT EXISTS classification_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    classification VARCHAR(50) NOT NULL CHECK (classification IN ('RETAIL', 'HNI', 'ACCREDITED_INVESTOR')),
    evidence_type VARCHAR(100) NOT NULL, -- e.g., 'INCOME_TAX_RETURN', 'NET_WORTH_CERTIFICATE', 'DEMAT_STATEMENT'
    evidence_reference VARCHAR(255) NOT NULL,
    verification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' 
        CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT unique_user_classification_evidence UNIQUE (user_id, classification)
);

CREATE INDEX IF NOT EXISTS idx_class_evidence_user ON classification_evidence(user_id);
CREATE INDEX IF NOT EXISTS idx_class_evidence_status ON classification_evidence(verification_status);

-- 3. Risk Assessments Table (Immutable, preserving history)
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    questionnaire_version VARCHAR(50) NOT NULL,
    responses JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_risk_category VARCHAR(50) NOT NULL, -- e.g. LOW, MODERATE, HIGH
    calculation_methodology_version VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED')),
    assessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    expires_at TIMESTAMP WITH TIME ZONE,
    reassessment_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_user ON risk_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_category ON risk_assessments(calculated_risk_category);

-- 4. Versioned Agreement Templates Table (Immutable templates)
CREATE TABLE IF NOT EXISTS agreement_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_type VARCHAR(50) NOT NULL CHECK (agreement_type IN ('CLIENT_AGREEMENT', 'RISK_DISCLOSURE', 'SERVICE_DISCLOSURE', 'PRIVACY_NOTICE', 'TERMS_AND_CONDITIONS')),
    version VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL, -- SHA-256
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    effective_until TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT unique_agreement_type_version UNIQUE (agreement_type, version)
);

CREATE INDEX IF NOT EXISTS idx_agreement_templates_type_version ON agreement_templates(agreement_type, version);
CREATE INDEX IF NOT EXISTS idx_agreement_templates_active ON agreement_templates(is_active);

-- 5. Agreement Signatures & Consents Table (Immutable historical acceptance)
CREATE TABLE IF NOT EXISTS agreement_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES agreement_templates(id),
    signature_method VARCHAR(50) NOT NULL CHECK (signature_method IN ('CONSENT_CLICK', 'MOCK_ESIGN_CERTIFIED')),
    signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    agreement_content_hash VARCHAR(64) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'EXECUTED' CHECK (status IN ('PENDING', 'EXECUTED', 'REVOKED')),
    audit_event_reference VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_agreement_signatures_user ON agreement_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_agreement_signatures_template ON agreement_signatures(template_id);
