-- ==============================================================================
-- stockiq - Migration 002: Authentication & Provider Credentialing Engine
-- PostgreSQL Forward-Only Schema Extension
-- ==============================================================================

-- 1. Extend Users Table with Account Status Enum Constraint
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS account_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'
CHECK (account_status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'LOCKED', 'DEACTIVATED'));

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

-- 2. Server-Side Active Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at);

-- 3. OTP Challenges & Security Tracking Table
CREATE TABLE IF NOT EXISTS otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL CHECK (purpose IN ('LOGIN', 'SIGNING', 'PASSWORD_RESET')),
    otp_hash VARCHAR(255) NOT NULL,
    attempts_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    reference_id VARCHAR(100) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_identifier ON otp_challenges(identifier, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_reference ON otp_challenges(reference_id);

-- 4. Provider Regulatory Profiles Table
CREATE TABLE IF NOT EXISTS provider_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('RESEARCH_ANALYST', 'INVESTMENT_ADVISER')),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('INDIVIDUAL', 'NON_INDIVIDUAL')),
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    sebi_registration_number VARCHAR(50) UNIQUE NOT NULL,
    valid_from DATE NOT NULL,
    valid_till DATE,
    is_perpetual BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' 
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
    compliance_officer_name VARCHAR(255),
    compliance_officer_email VARCHAR(255),
    registered_office_address TEXT NOT NULL,
    is_nism_certified BOOLEAN NOT NULL DEFAULT FALSE,
    pan_number VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_user ON provider_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_sebi ON provider_profiles(sebi_registration_number);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_status ON provider_profiles(status);

-- 5. Provider Compliance Declarations Table
CREATE TABLE IF NOT EXISTS provider_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    declaration_type VARCHAR(100) NOT NULL,
    is_declared BOOLEAN NOT NULL DEFAULT FALSE,
    declared_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_provider_declarations_provider ON provider_declarations(provider_id);

-- 6. Provider Document Metadata Table (Zero-PFI / Cryptographic Hash Storage)
CREATE TABLE IF NOT EXISTS provider_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_provider_documents_provider ON provider_documents(provider_id);

-- 7. Verification Cases Table (Verification Officer Work Queue)
CREATE TABLE IF NOT EXISTS verification_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    assigned_officer_id UUID REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'MORE_INFO_REQUIRED')),
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_verification_cases_provider ON verification_cases(provider_id);
CREATE INDEX IF NOT EXISTS idx_verification_cases_officer ON verification_cases(assigned_officer_id);
CREATE INDEX IF NOT EXISTS idx_verification_cases_status ON verification_cases(status);

-- 8. Verification Event History Table
CREATE TABLE IF NOT EXISTS verification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_case_id UUID NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_verification_events_case ON verification_events(verification_case_id);
