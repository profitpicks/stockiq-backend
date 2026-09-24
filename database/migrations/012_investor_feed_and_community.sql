-- ==============================================================================
-- stockiq - Migration 012: Investor Feed & Community Schema
-- PostgreSQL Schema
-- ==============================================================================

-- 1. Community Posts Table
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL DEFAULT 'GENERAL_DISCUSSION',
    title VARCHAR(255),
    body TEXT NOT NULL,
    tagged_symbols TEXT[] DEFAULT '{}',
    media_url TEXT,
    moderation_status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED',
    moderation_reason TEXT,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_community_posts_author ON community_posts(author_user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_content_type ON community_posts(content_type);
CREATE INDEX IF NOT EXISTS idx_community_posts_status ON community_posts(moderation_status);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts(created_at DESC);

-- 2. Community Replies Table
CREATE TABLE IF NOT EXISTS community_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    moderation_status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_community_replies_post ON community_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_community_replies_author ON community_replies(author_user_id);

-- 3. Community Reactions Table (Toggle reaction per post per user)
CREATE TABLE IF NOT EXISTS community_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(50) NOT NULL DEFAULT 'LIKE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_post_user_reaction UNIQUE (post_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_community_reactions_post ON community_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_community_reactions_user ON community_reactions(user_id);

-- 4. Community Follows Table (Follow user/provider)
CREATE TABLE IF NOT EXISTS community_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_follower_following UNIQUE (follower_user_id, following_user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_follows_follower ON community_follows(follower_user_id);
CREATE INDEX IF NOT EXISTS idx_community_follows_following ON community_follows(following_user_id);

-- 5. Community Content Reports Table
CREATE TABLE IF NOT EXISTS community_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason_category VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_community_reports_post ON community_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_reporter ON community_reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_reports(status);
