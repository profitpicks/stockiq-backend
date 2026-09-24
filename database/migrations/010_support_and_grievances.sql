-- ==============================================================================
-- stockiq - Migration 010: Help Center, Support Tickets, and Grievances Schema
-- PostgreSQL Schema
-- ==============================================================================

-- 1. Help Center Articles Table
CREATE TABLE IF NOT EXISTS help_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category);
CREATE INDEX IF NOT EXISTS idx_help_articles_published ON help_articles(is_published);

-- 2. Support Tickets Table
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- 3. Support Replies Table
CREATE TABLE IF NOT EXISTS support_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_support_replies_ticket ON support_replies(ticket_id);

-- 4. Complaints / Grievance Tickets Table
CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complainant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    respondent_provider_id UUID REFERENCES provider_profiles(id) ON DELETE SET NULL,
    service_id UUID,
    category VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'LODGED',
    sla_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_summary TEXT,
    scores_reference_number VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_complaints_complainant ON complaints(complainant_user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_respondent ON complaints(respondent_provider_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- 5. Complaint Replies / Timeline Table
CREATE TABLE IF NOT EXISTS complaint_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_complaint_replies_complaint ON complaint_replies(complaint_id);


-- Seed some default help articles
INSERT INTO help_articles (title, category, content) VALUES
('Understanding Provider Verification & Onboarding', 'Provider Verification', 'To begin offering services on Stockiq, you must complete the multi-step SEBI verification officer workflow. This includes submitting your official legal name, trade name, and your active SEBI registration number (RA or IA). Our compliance verification team reviews all registration certificates, SEBI orders, and disclosure histories. Once verified, your status transitions to ACTIVE and you can list advisory services. Please refer to SEBI regulations and consult with your compliance advisor if you have questions regarding valid registration requirements.'),
('How to Structure and Schedule Advisory Service Channels', 'Services', 'Stockiq allows registered RAs and IAs to define customized, transparent service channels (such as monthly stock advice, long-term asset allocation, etc.). All pricing must be presented in paise (INR). Standard GST tax rules apply (usually 18% GST). Once a channel is active, investors can subscribe securely through the built-in integrated payments gateway.'),
('Recommendation Composers and the Immutable Ledger', 'Recommendations', 'Every recommendation or research report submitted by an RA/IA on Stockiq is recorded to our compliance-governed immutable ledger. This guarantees a verifiable, transparent track-record. Recommendations cannot be backdated, modified post-issue, or deleted. This preserves investor trust and satisfies regulatory requirements for recording advisory history.'),
('How We Compute Track-Record and PARRVA Metrics', 'Track Record', 'Stockiq automatically computes your Track Record metrics, including the SEBI-aligned PARRVA (Performance Adjusted Risk-Reward Volume Average) score. This metric evaluates the performance of your active and historical recommendations, accounting for risk and stop-loss breaches, ensuring accurate and objective platform performance representation.'),
('Subscription Payments, Taxes, and Invoice Management', 'Payments & Invoices', 'All subscription payments are processed securely. A detailed GST tax invoice is generated automatically for every successful subscription, with CGST and SGST broken down clearly based on the subscriber''s region. Providers can view all payment orders and download/export official PDF invoices for compliance and tax filings directly from their Financials tab.'),
('Investor Grievance Redressal and Compliance Timelines', 'Compliance', 'As a SEBI-registered provider, resolving investor grievances is of the highest regulatory importance. When an investor lodges a grievance on Stockiq, a strict 21-day SEBI grievance SLA timer starts. Providers can review complaints, submit formal responses, and work towards resolution. Any unresolved grievances may be escalated directly to SEBI SCORES. Always monitor your Compliance Center tab for active notifications regarding complaints.'),
('Managing Your Stockiq Provider Profile', 'Account & Login', 'Your Provider Profile contains your regulatory details, verified registration certificate, entity type, and public disclosures. You can update contact information and non-regulatory details at any time. Regulatory fields can only be modified with subsequent compliance review to maintain platform integrity.');
