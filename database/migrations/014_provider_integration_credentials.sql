-- stockiq - Migration 014: Secure Provider Integration Credentials & Webhook Idempotency Ledger

CREATE TABLE IF NOT EXISTS provider_integration_credentials (
    id VARCHAR(64) PRIMARY KEY,
    provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(32) NOT NULL,
    secret_hash VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider_id ON provider_integration_credentials(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_key_prefix ON provider_integration_credentials(key_prefix);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_secret_hash ON provider_integration_credentials(secret_hash);

CREATE TABLE IF NOT EXISTS integration_idempotency_records (
    id VARCHAR(64) PRIMARY KEY,
    provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    service_id VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    response_status INTEGER NOT NULL DEFAULT 201,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_provider_idempotency UNIQUE(provider_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_integration_idempotency_key ON integration_idempotency_records(provider_id, idempotency_key);
