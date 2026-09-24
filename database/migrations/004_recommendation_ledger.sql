-- ==============================================================================
-- stockiq - Migration 004: Immutable Recommendation Ledger Foundation
-- PostgreSQL Forward-Only Schema Extension
-- ==============================================================================

-- 1. Recommendations Master Table
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    original_message TEXT NOT NULL,
    instrument_type VARCHAR(50) NOT NULL DEFAULT 'EQUITY',
    segment VARCHAR(50) NOT NULL DEFAULT 'CASH',
    symbol VARCHAR(100) NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('BUY', 'SELL', 'HOLD', 'ACCUMULATE', 'REDUCE')),
    entry_condition_type VARCHAR(50) NOT NULL DEFAULT 'DIRECT',
    entry_price NUMERIC(15, 4) NOT NULL,
    time_horizon VARCHAR(50) NOT NULL DEFAULT 'SWING',
    rationale TEXT,
    research_report_reference TEXT,
    disclosures JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' 
        CHECK (current_status IN ('DRAFT', 'PUBLISHED', 'ACTIVE', 'CLOSED', 'CANCELLED', 'EXPIRED')),
    published_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_recommendations_provider ON recommendations(provider_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_service ON recommendations(service_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(current_status);
CREATE INDEX IF NOT EXISTS idx_recommendations_symbol ON recommendations(symbol);

-- 2. Recommendation Targets Table (Supports N Targets)
CREATE TABLE IF NOT EXISTS recommendation_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    target_sequence INT NOT NULL,
    target_price NUMERIC(15, 4) NOT NULL,
    label VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'HIT', 'CANCELLED')),
    hit_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT unique_rec_target_seq UNIQUE (recommendation_id, target_sequence)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_targets_rec ON recommendation_targets(recommendation_id);

-- 3. Recommendation Stop-Losses Table (Preserves History)
CREATE TABLE IF NOT EXISTS recommendation_stop_losses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    stop_loss_sequence INT NOT NULL,
    stop_loss_price NUMERIC(15, 4) NOT NULL,
    stop_loss_type VARCHAR(50) NOT NULL DEFAULT 'INITIAL' CHECK (stop_loss_type IN ('INITIAL', 'REVISED', 'TRAILING')),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'TRIGGERED', 'SUPERSEDED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT unique_rec_stop_loss_seq UNIQUE (recommendation_id, stop_loss_sequence)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_stop_losses_rec ON recommendation_stop_losses(recommendation_id);

-- 4. Recommendation Events Ledger Table (Append-Only Hash-Chained Events)
CREATE TABLE IF NOT EXISTS recommendation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    event_sequence INT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id),
    author_role VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash VARCHAR(64),
    event_hash VARCHAR(64) NOT NULL,
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT unique_rec_event_seq UNIQUE (recommendation_id, event_sequence)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_events_rec ON recommendation_events(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_hash ON recommendation_events(event_hash);

-- 5. Recommendation Event Verifications Audit Table
CREATE TABLE IF NOT EXISTS recommendation_event_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    is_valid BOOLEAN NOT NULL,
    total_events INT NOT NULL,
    mismatch_event_id UUID,
    mismatch_reason TEXT,
    verified_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_verifications_rec ON recommendation_event_verifications(recommendation_id);
