-- ==============================================================================
-- stockiq - Migration 003: Public Directory & Service Catalog Foundation
-- PostgreSQL Forward-Only Schema Extension
-- ==============================================================================

-- 1. Provider Public Profiles Table
CREATE TABLE IF NOT EXISTS provider_public_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID UNIQUE NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    profile_summary TEXT,
    permitted_business_info TEXT,
    jurisdiction VARCHAR(100) NOT NULL DEFAULT 'India',
    public_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (public_status IN ('ACTIVE', 'HIDDEN', 'SUSPENDED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_provider_public_profiles_provider ON provider_public_profiles(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_public_profiles_status ON provider_public_profiles(public_status);

-- 2. Services Table (Master Service Catalog)
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    service_name VARCHAR(255) NOT NULL,
    service_category VARCHAR(100) NOT NULL,
    short_description TEXT NOT NULL,
    detailed_description TEXT NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    market_segment VARCHAR(100) NOT NULL,
    eligibility_info VARCHAR(255) NOT NULL DEFAULT 'RETAIL_INVESTORS',
    pricing_reference VARCHAR(100) NOT NULL,
    fee_in_paise BIGINT NOT NULL DEFAULT 0,
    billing_duration VARCHAR(50) NOT NULL DEFAULT 'MONTHLY',
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' 
        CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'PAUSED', 'ARCHIVED')),
    current_published_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(service_category);
CREATE INDEX IF NOT EXISTS idx_services_market ON services(market_segment);

-- 3. Immutable Service Versions Table (Blueprint Concept)
CREATE TABLE IF NOT EXISTS service_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    disclosures JSONB NOT NULL DEFAULT '{}'::jsonb,
    pricing_reference VARCHAR(100) NOT NULL,
    terms_reference_text TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' 
        CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'PAUSED', 'ARCHIVED')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    published_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_service_version UNIQUE (service_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_service_versions_service ON service_versions(service_id);
CREATE INDEX IF NOT EXISTS idx_service_versions_status ON service_versions(status);

-- 4. Structured Service Disclosures Table
CREATE TABLE IF NOT EXISTS service_disclosures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    service_version_id UUID REFERENCES service_versions(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL,
    service_category VARCHAR(100) NOT NULL,
    market_segment VARCHAR(100) NOT NULL,
    risk_disclosure_text TEXT NOT NULL,
    methodology_reference TEXT,
    conflicts_disclosure TEXT NOT NULL,
    regulatory_disclosure TEXT NOT NULL,
    performance_disclaimer TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_service_disclosures_service ON service_disclosures(service_id);
CREATE INDEX IF NOT EXISTS idx_service_disclosures_version ON service_disclosures(service_version_id);
