-- ==============================================================================
-- stockiq - Migration 005: Track Record & PaRRVA Verification Abstraction
-- PostgreSQL Forward-Only Schema Extension
-- ==============================================================================

-- 1. Track Record Methodologies Table (Immutable once calculation references it)
CREATE TABLE IF NOT EXISTS track_record_methodologies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    methodology_code VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    methodology_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_until TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_methodology_code_version UNIQUE (methodology_code, version)
);

CREATE INDEX IF NOT EXISTS idx_tr_methodologies_code ON track_record_methodologies(methodology_code);
CREATE INDEX IF NOT EXISTS idx_tr_methodologies_active ON track_record_methodologies(active);

-- 2. Track Record Calculations Table
CREATE TABLE IF NOT EXISTS track_record_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    methodology_id UUID NOT NULL REFERENCES track_record_methodologies(id),
    source_type VARCHAR(100) NOT NULL, -- e.g. PLATFORM_RECORDED, PROVIDER_SUPPLIED_HISTORICAL
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    calculation_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (calculation_status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    calculation_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_tr_calculations_provider ON track_record_calculations(provider_id);
CREATE INDEX IF NOT EXISTS idx_tr_calculations_methodology ON track_record_calculations(methodology_id);

-- 3. Track Record Snapshots Table
CREATE TABLE IF NOT EXISTS track_record_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    methodology_id UUID NOT NULL REFERENCES track_record_methodologies(id),
    calculation_id UUID REFERENCES track_record_calculations(id) ON DELETE SET NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_recommendations INT NOT NULL,
    eligible_recommendations INT NOT NULL,
    excluded_not_triggered INT NOT NULL DEFAULT 0,
    wins INT NOT NULL DEFAULT 0,
    losses INT NOT NULL DEFAULT 0,
    closed_outcomes INT NOT NULL DEFAULT 0,
    open_outcomes INT NOT NULL DEFAULT 0,
    target_milestones_hit INT NOT NULL DEFAULT 0,
    performance_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_classification VARCHAR(100) NOT NULL, -- e.g. PLATFORM_RECORDED, PROVIDER_SUPPLIED_HISTORICAL, EXTERNAL_VERIFIED, REGULATORY_VERIFIED
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_tr_snapshots_provider ON track_record_snapshots(provider_id);
CREATE INDEX IF NOT EXISTS idx_tr_snapshots_service ON track_record_snapshots(service_id);
CREATE INDEX IF NOT EXISTS idx_tr_snapshots_methodology ON track_record_snapshots(methodology_id);

-- 4. Past Performance Verification Records Table (Tracks external/regulatory verifications)
CREATE TABLE IF NOT EXISTS past_performance_verification_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    source_type VARCHAR(100) NOT NULL, -- e.g. PROVIDER_SUPPLIED_HISTORICAL, PLATFORM_RECORDED, EXTERNAL_VERIFIED, REGULATORY_VERIFIED
    source_name VARCHAR(255) NOT NULL,
    verification_status VARCHAR(50) NOT NULL CHECK (verification_status IN ('NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'UNVERIFIED')),
    verifier_name VARCHAR(255),
    reference_identifier VARCHAR(255),
    evidence_document_reference TEXT,
    methodology_id UUID REFERENCES track_record_methodologies(id) ON DELETE SET NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    validity_period_start DATE,
    validity_period_end DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_pp_verification_provider ON past_performance_verification_records(provider_id);
CREATE INDEX IF NOT EXISTS idx_pp_verification_status ON past_performance_verification_records(verification_status);
