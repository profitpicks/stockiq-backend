-- ==============================================================================
-- stockiq - Migration 013: Investor Knowledge & Education Schema
-- PostgreSQL Schema
-- ==============================================================================

-- 1. Educational Content Table
CREATE TABLE IF NOT EXISTS education_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(50) NOT NULL DEFAULT 'ARTICLE', -- ARTICLE, VIDEO, FAQ, WEBINAR, ANNOUNCEMENT
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    content_body TEXT NOT NULL,
    media_url TEXT,
    category VARCHAR(100) NOT NULL, -- MARKET_BASICS, OPTIONS_BASICS, RISK_MANAGEMENT, FUNDAMENTAL_ANALYSIS, TECHNICAL_ANALYSIS, REGULATORY_AWARENESS, INVESTOR_PROTECTION, PLATFORM_HOW_TO
    level VARCHAR(50) NOT NULL DEFAULT 'BEGINNER', -- BEGINNER, INTERMEDIATE, ADVANCED
    status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED', -- DRAFT, PUBLISHED, ARCHIVED, HIDDEN
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_sponsored BOOLEAN NOT NULL DEFAULT FALSE, -- Editorial independence: strictly false
    duration_or_read_time VARCHAR(50),
    author_source VARCHAR(255) NOT NULL DEFAULT 'StockIQ Regulatory & Education Team',
    disclaimer TEXT NOT NULL DEFAULT 'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    event_date VARCHAR(100),
    event_time VARCHAR(100),
    speaker VARCHAR(255),
    published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_education_content_type ON education_content(content_type);
CREATE INDEX IF NOT EXISTS idx_education_content_category ON education_content(category);
CREATE INDEX IF NOT EXISTS idx_education_content_level ON education_content(level);
CREATE INDEX IF NOT EXISTS idx_education_content_status ON education_content(status);
CREATE INDEX IF NOT EXISTS idx_education_content_featured ON education_content(is_featured);
CREATE INDEX IF NOT EXISTS idx_education_content_published_at ON education_content(published_at DESC);

-- 2. Investor Bookmarks Table (Optional save/favorite for authenticated investors)
CREATE TABLE IF NOT EXISTS education_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES education_content(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_user_education_bookmark UNIQUE (user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_education_bookmarks_user ON education_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_education_bookmarks_content ON education_bookmarks(content_id);

-- 3. Platform-Managed Seed Content (Editorial & Regulatory Awareness)
INSERT INTO education_content (
    id, content_type, title, slug, description, content_body, media_url,
    category, level, status, is_featured, is_sponsored, duration_or_read_time,
    author_source, disclaimer, event_date, event_time, speaker
) VALUES
(
    'e0000001-0000-0000-0000-000000000001',
    'VIDEO',
    'Understanding SEBI Guidelines for RAs & IAs',
    'understanding-sebi-guidelines-ra-ia',
    'A comprehensive overview of what SEBI registration means, regulatory disclosures, and investor rights.',
    'This educational masterclass breaks down the legal and operational differences between SEBI-registered Research Analysts (RAs) and Investment Advisers (IAs). Learn about mandatory disclosures, code of conduct compliance, qualification standards, and why unregistered social media tipsters carry significant financial and legal risk.',
    'https://stockiq.internal/education/videos/sebi-guidelines',
    'REGULATORY_AWARENESS',
    'BEGINNER',
    'PUBLISHED',
    TRUE,
    FALSE,
    '14 mins',
    'StockIQ Regulatory & Education Team',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000002',
    'VIDEO',
    'Risk Management in Options Trading & Capital Protection',
    'risk-management-in-options-trading',
    'Learn how stop-losses, position sizing, and capital protection safeguard your portfolio against market volatility.',
    'Derivative products such as equity index options involve non-linear risk and time decay. This video explores practical risk management frameworks including defining maximum risk per trade (typically 1-2% of total capital), using hard stop-losses, and avoiding leveraged overnight naked positions.',
    'https://stockiq.internal/education/videos/risk-management-options',
    'RISK_MANAGEMENT',
    'INTERMEDIATE',
    'PUBLISHED',
    FALSE,
    FALSE,
    '18 mins',
    'StockIQ Regulatory & Education Team',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000003',
    'VIDEO',
    'Fundamental Analysis Essentials for Long-Term Investors',
    'fundamental-analysis-essentials',
    'Learn how to read balance sheets, evaluate cash flows, and interpret return on capital ratios.',
    'This guide walks through the essential components of company valuation: understanding revenue vs EBITDA, debt-to-equity leverage thresholds, working capital cycles, and identifying sustainable competitive moats.',
    'https://stockiq.internal/education/videos/fundamental-analysis',
    'FUNDAMENTAL_ANALYSIS',
    'BEGINNER',
    'PUBLISHED',
    FALSE,
    FALSE,
    '12 mins',
    'StockIQ Research Education Team',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000004',
    'ARTICLE',
    'Investor Suitability & Risk Profiling Guide',
    'investor-suitability-risk-profiling-guide',
    'Why suitability matters and how Stockiq ensures recommendations align with your financial risk capacity.',
    'Suitability assessment is the cornerstone of responsible investing. Financial capacity encompasses your investment horizon, liquid emergency reserves, dependency ratio, and tolerance for interim drawdowns. On Stockiq, suitability profiling ensures that investors are never onboarded into high-risk derivative research plans if their profile indicates conservative capital preservation.',
    NULL,
    'INVESTOR_PROTECTION',
    'BEGINNER',
    'PUBLISHED',
    FALSE,
    FALSE,
    '6 min read',
    'StockIQ Investor Protection Desk',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000005',
    'ARTICLE',
    'Understanding the Differences Between SEBI Registered RA and IA',
    'differences-between-sebi-ra-and-ia',
    'A clear breakdown of Research Analysts vs Investment Advisers under Indian securities regulations.',
    'Under the SEBI (Research Analysts) Regulations, 2014, an RA prepares and publishes research reports or recommendations regarding securities to clients or the public, without managing client funds or executing trades. In contrast, under SEBI (Investment Advisers) Regulations, 2013, an IA provides personal investment advice tailored to individual risk profiles and financial goals, acting as a direct fiduciary. Both are prohibited from guaranteeing returns.',
    NULL,
    'REGULATORY_AWARENESS',
    'BEGINNER',
    'PUBLISHED',
    FALSE,
    FALSE,
    '8 min read',
    'StockIQ Legal & Regulatory Desk',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000006',
    'ARTICLE',
    'Fixed Stop-Loss Discipline & Position Sizing Rules',
    'fixed-stop-loss-discipline-position-sizing',
    'Safeguarding capital through rigorous position sizing and mechanical exit discipline.',
    'No trading strategy has a 100% win rate. Professional risk management is governed by the 1% risk rule: calculating trade quantity such that the maximum loss from entry to stop-loss does not exceed 1% of total portfolio value. This guide covers position sizing formulas, slippage buffers, and why emotional averaging down is a common pitfall.',
    NULL,
    'RISK_MANAGEMENT',
    'INTERMEDIATE',
    'PUBLISHED',
    FALSE,
    FALSE,
    '5 min read',
    'StockIQ Risk Desk',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000007',
    'FAQ',
    'How are track records verified on Stockiq?',
    'faq-how-track-records-are-verified',
    'Detailed breakdown of the TR-STD-V1 methodology, immutable ledger records, and verification framework.',
    'Stockiq uses the TR-STD-V1 standardized verification methodology. When a registered provider publishes a recommendation, an immutable cryptographic SHA-256 hash snapshot is timestamped on the ledger. Signal lifecycle events (Entry, Target 1, Target 2, Stop-Loss, Expiry) are verified against official exchange tick feeds. Neither providers nor administrators can alter or erase past recommendation outcomes.',
    NULL,
    'PLATFORM_HOW_TO',
    'BEGINNER',
    'PUBLISHED',
    FALSE,
    FALSE,
    '4 min read',
    'StockIQ Ledger Team',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000008',
    'FAQ',
    'What recourse does an investor have under SCORES and SMART ODR?',
    'faq-scores-and-smart-odr-recourse',
    'How SEBI Complaints Redress System and Online Dispute Resolution protect market participants.',
    'If an investor has an unresolved grievance with a SEBI-registered intermediary, they can lodge a complaint directly on SEBI SCORES (scores.sebi.gov.in) within prescribed timelines. Furthermore, the SMART ODR portal (smartodr.in) provides conciliation and arbitration mechanisms to resolve disputes online in an impartial, regulated environment.',
    NULL,
    'INVESTOR_PROTECTION',
    'BEGINNER',
    'PUBLISHED',
    FALSE,
    FALSE,
    '5 min read',
    'StockIQ Compliance Desk',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000009',
    'FAQ',
    'Are past performance statistics indicative of future returns?',
    'faq-past-performance-disclaimer',
    'Why historical track records reflect past compliance audits and cannot predict future market returns.',
    'Securities markets are subject to macroeconomic fluctuations, liquidity shifts, and systemic risks. Under SEBI regulations and Stockiq platform policies, past performance records published on the immutable ledger are factual historical audits only. They do not constitute a promise, guarantee, or projection of future profits.',
    NULL,
    'RISK_MANAGEMENT',
    'BEGINNER',
    'PUBLISHED',
    FALSE,
    FALSE,
    '3 min read',
    'StockIQ Risk Desk',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    NULL, NULL, NULL
),
(
    'e0000001-0000-0000-0000-000000000010',
    'WEBINAR',
    'Options Risk Controls & Fixed Stop-Loss Discipline',
    'webinar-options-risk-controls',
    'Join our upcoming interactive educational session on managing volatility and setting disciplined stop losses.',
    'In this live interactive investor education session, industry compliance experts and market educators discuss practical risk controls in options trading. Topics include position sizing formulas, recognizing theta decay, and setting strict exit parameters.',
    'https://stockiq.internal/education/webinars/options-risk-controls',
    'RISK_MANAGEMENT',
    'INTERMEDIATE',
    'PUBLISHED',
    FALSE,
    FALSE,
    '45 mins',
    'StockIQ Education Desk',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    'Thursday, 24 Oct',
    '06:00 PM IST',
    'Compliance & Education Panel'
),
(
    'e0000001-0000-0000-0000-000000000011',
    'WEBINAR',
    'Reading Financial Ledgers & Standardized Methodology',
    'webinar-financial-ledgers-methodology',
    'Learn how to audit verified track records and inspect recommendation lifecycle logs.',
    'This educational webinar explains how to interpret standardized performance indicators, win/loss ratios, average holding periods, and maximum drawdowns. Understand how cryptographic verification protects investors from survivorship bias.',
    'https://stockiq.internal/education/webinars/financial-ledgers',
    'PLATFORM_HOW_TO',
    'BEGINNER',
    'PUBLISHED',
    FALSE,
    FALSE,
    '40 mins',
    'StockIQ Education Desk',
    'Educational content is provided for general informational purposes and should not be treated as personalized investment advice.',
    'Saturday, 26 Oct',
    '11:00 AM IST',
    'Regulatory Research Team'
)
ON CONFLICT (slug) DO NOTHING;
